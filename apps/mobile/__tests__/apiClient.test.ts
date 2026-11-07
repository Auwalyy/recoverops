import { api, ApiError, configureApiClient } from '@/services/api/client';
import { tokenStorage } from '@/services/tokenStorage';

type FetchArgs = [string, RequestInit];
const json = (status: number, body: unknown) => Promise.resolve({ ok: status < 400, status, json: async () => body } as Response);

describe('API client', () => {
  let calls: FetchArgs[];
  let expired: jest.Mock;

  beforeEach(async () => {
    calls = [];
    expired = jest.fn();
    configureApiClient({ contextHeaders: () => ({ 'x-hospital-id': 'h1' }), onSessionExpired: expired });
    await tokenStorage.setTokens('access-1', 'refresh-token-aaaaaaaaaaaaaaaaaaaa');
  });

  it('sends auth and context headers and unwraps the envelope', async () => {
    global.fetch = jest.fn((url: string, init: RequestInit) => {
      calls.push([url, init]);
      return json(200, { success: true, data: { hello: 'world' } });
    }) as unknown as typeof fetch;
    await expect(api<{ hello: string }>('/x')).resolves.toEqual({ hello: 'world' });
    const headers = calls[0]![1].headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer access-1');
    expect(headers['x-hospital-id']).toBe('h1');
  });

  it('refreshes once on 401 (single-flight) and retries the request', async () => {
    let first = true;
    global.fetch = jest.fn((url: string, init: RequestInit) => {
      calls.push([url, init]);
      if (url.endsWith('/auth/refresh')) return json(200, { success: true, data: { tokens: { accessToken: 'access-2', refreshToken: 'refresh-token-bbbbbbbbbbbbbbbbbbbb' } } });
      if (first) {
        first = false;
        return json(401, { success: false, error: { code: 'TOKEN_EXPIRED', message: 'expired' } });
      }
      return json(200, { success: true, data: 'ok' });
    }) as unknown as typeof fetch;
    await expect(api('/protected')).resolves.toBe('ok');
    expect(calls.filter(([u]) => u.endsWith('/auth/refresh'))).toHaveLength(1);
    expect((calls.at(-1)![1].headers as Record<string, string>).authorization).toBe('Bearer access-2');
  });

  it('signals session expiry when refresh fails', async () => {
    global.fetch = jest.fn((url: string) => (url.endsWith('/auth/refresh') ? json(401, { success: false, error: { code: 'UNAUTHENTICATED', message: 'no' } }) : json(401, { success: false, error: { code: 'UNAUTHENTICATED', message: 'Session expired' } }))) as unknown as typeof fetch;
    await expect(api('/protected', { retry: false })).rejects.toBeInstanceOf(ApiError);
    expect(expired).toHaveBeenCalled();
  });

  it('maps server errors to typed ApiError with field errors', async () => {
    global.fetch = jest.fn(() => json(400, { success: false, error: { code: 'VALIDATION_ERROR', message: 'Some answers are invalid', details: [{ path: 'pain_score', message: 'Must be between 0 and 10' }] } })) as unknown as typeof fetch;
    const err = (await api('/check-ins', { method: 'POST', body: {} }).catch((e) => e)) as ApiError;
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.fieldErrors()).toEqual({ pain_score: 'Must be between 0 and 10' });
  });

  it('reports network failures as offline errors', async () => {
    global.fetch = jest.fn(() => Promise.reject(new TypeError('Network request failed'))) as unknown as typeof fetch;
    const err = (await api('/x', { retry: false }).catch((e) => e)) as ApiError;
    expect(err.isNetwork).toBe(true);
  });
});
