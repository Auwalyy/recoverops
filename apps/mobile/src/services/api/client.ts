import Constants from 'expo-constants';
import type { ApiFailure, ErrorCode, PaginationMeta } from '@recoveros/shared';
import { tokenStorage } from '../tokenStorage';

/** Base URL: EXPO_PUBLIC_API_URL at build time, else app.json extra (Android emulator default). */
export const API_URL: string =
  process.env.EXPO_PUBLIC_API_URL ?? (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ?? 'http://10.0.2.2:4000';

const DEFAULT_TIMEOUT_MS = 20_000;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: ErrorCode | 'NETWORK_ERROR' | 'TIMEOUT' | 'CANCELLED',
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
  get isNetwork(): boolean {
    return this.code === 'NETWORK_ERROR' || this.code === 'TIMEOUT';
  }
  /** Field errors from a VALIDATION_ERROR response, keyed by path. */
  fieldErrors(): Record<string, string> {
    if (!Array.isArray(this.details)) return {};
    return Object.fromEntries((this.details as Array<{ path: string; message: string }>).map((d) => [d.path, d.message]));
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  auth?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Retry once on network failure (safe only for idempotent requests). */
  retry?: boolean;
  formData?: FormData;
}

/** Context headers (active hospital / acting-as) supplied by the auth store. */
let contextHeaders: () => Record<string, string> = () => ({});
let onSessionExpired: () => void = () => undefined;
export function configureApiClient(opts: { contextHeaders: () => Record<string, string>; onSessionExpired: () => void }) {
  contextHeaders = opts.contextHeaders;
  onSessionExpired = opts.onSessionExpired;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = `${API_URL}/api/v1${path}`;
  if (!query) return url;
  const qs = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return qs ? `${url}?${qs}` : url;
}

let refreshing: Promise<boolean> | null = null;

/** Single-flight refresh-token rotation. */
export async function refreshSession(): Promise<boolean> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const refreshToken = await tokenStorage.getRefreshToken();
    if (!refreshToken) return false;
    try {
      const res = await fetch(buildUrl('/auth/refresh'), {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return false;
      const json = (await res.json()) as { data: { tokens: { accessToken: string; refreshToken: string } } };
      await tokenStorage.setTokens(json.data.tokens.accessToken, json.data.tokens.refreshToken);
      return true;
    } catch {
      return false;
    }
  })();
  try {
    return await refreshing;
  } finally {
    refreshing = null;
  }
}

async function rawRequest(path: string, opts: RequestOptions, attempt = 0): Promise<{ data: unknown; meta?: PaginationMeta & Record<string, unknown> }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const onAbort = () => controller.abort('cancelled');
  opts.signal?.addEventListener('abort', onAbort);

  const headers: Record<string, string> = { accept: 'application/json', ...contextHeaders() };
  if (!opts.formData) headers['content-type'] = 'application/json';
  if (opts.auth !== false) {
    const token = tokenStorage.getAccessToken();
    if (token) headers.authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? 'GET',
      headers,
      body: opts.formData ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
      signal: controller.signal,
    });
  } catch {
    if (opts.signal?.aborted) throw new ApiError('Request cancelled', 'CANCELLED', 0);
    const timedOut = controller.signal.aborted;
    if (opts.retry && attempt === 0) return rawRequest(path, opts, 1);
    throw new ApiError(timedOut ? 'The server took too long to respond.' : 'You appear to be offline. Check your connection and try again.', timedOut ? 'TIMEOUT' : 'NETWORK_ERROR', 0);
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
  }

  if (res.status === 401 && opts.auth !== false && attempt === 0) {
    if (await refreshSession()) return rawRequest(path, opts, 1);
    onSessionExpired();
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new ApiError('Unexpected response from server', 'INTERNAL_ERROR', res.status);
  }
  if (!res.ok || (json as { success?: boolean }).success === false) {
    const err = (json as ApiFailure).error ?? { code: 'INTERNAL_ERROR', message: 'Request failed' };
    throw new ApiError(err.message, err.code, res.status, err.details);
  }
  const envelope = json as { data: unknown; meta?: PaginationMeta & Record<string, unknown> };
  return { data: envelope.data, meta: envelope.meta };
}

/** Typed request returning the unwrapped `data`. */
export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const r = await rawRequest(path, { retry: (opts.method ?? 'GET') === 'GET', ...opts });
  return r.data as T;
}

/** Typed paginated request. */
export async function apiPage<T>(path: string, opts: RequestOptions = {}): Promise<{ items: T[]; meta: PaginationMeta & Record<string, unknown> }> {
  const r = await rawRequest(path, { retry: true, ...opts });
  return { items: r.data as T[], meta: (r.meta ?? { page: 1, limit: 0, total: 0, totalPages: 1 }) as PaginationMeta & Record<string, unknown> };
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return 'Something went wrong. Please try again.';
}
