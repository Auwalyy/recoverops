import { promises as fs } from 'node:fs';
import path from 'node:path';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env, fileSigningSecret } from '../../config/env';
import { hmacSha256, safeEqual } from '../../utils/crypto';

/**
 * Private object storage abstraction. Objects are NEVER publicly readable; clients get
 * short-lived signed URLs only after a permission check.
 *  - s3: any S3-compatible store (AWS S3, MinIO, Cloudflare R2…) with SSE enabled.
 *  - local: filesystem for development only (refused in production by env validation).
 */
export interface StorageDriver {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  signedDownloadUrl(key: string, opts: { expiresInSeconds: number; fileName: string; contentType: string }): Promise<string>;
  read(key: string): Promise<Buffer>;
}

class S3Storage implements StorageDriver {
  private client = new S3Client({
    region: env.STORAGE_REGION,
    endpoint: env.STORAGE_ENDPOINT,
    forcePathStyle: env.STORAGE_FORCE_PATH_STYLE,
    credentials: env.STORAGE_ACCESS_KEY ? { accessKeyId: env.STORAGE_ACCESS_KEY, secretAccessKey: env.STORAGE_SECRET_KEY ?? '' } : undefined,
  });
  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(new PutObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key, Body: body, ContentType: contentType, ServerSideEncryption: 'AES256' }));
  }
  async signedDownloadUrl(key: string, opts: { expiresInSeconds: number; fileName: string; contentType: string }) {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key, ResponseContentDisposition: `attachment; filename="${opts.fileName}"`, ResponseContentType: opts.contentType }),
      { expiresIn: opts.expiresInSeconds },
    );
  }
  async read(key: string) {
    const res = await this.client.send(new GetObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key }));
    return Buffer.from(await res.Body!.transformToByteArray());
  }
}

class LocalStorage implements StorageDriver {
  private root = path.resolve(env.STORAGE_LOCAL_DIR);
  private resolve(key: string) {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error('Invalid storage key');
    return full;
  }
  async put(key: string, body: Buffer) {
    const full = this.resolve(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, body);
  }
  async signedDownloadUrl(key: string, opts: { expiresInSeconds: number }) {
    const exp = Math.floor(Date.now() / 1000) + opts.expiresInSeconds;
    const payload = Buffer.from(JSON.stringify({ k: key, e: exp })).toString('base64url');
    return `${env.API_BASE_URL}/api/v1/documents/files/${payload}.${hmacSha256(fileSigningSecret, payload)}`;
  }
  async read(key: string) {
    return fs.readFile(this.resolve(key));
  }
}

let driver: StorageDriver | undefined;
export function storage(): StorageDriver {
  driver ??= env.STORAGE_DRIVER === 's3' ? new S3Storage() : new LocalStorage();
  return driver;
}

/** Verify a local signed-download token; returns the storage key or null. */
export function verifyLocalDownloadToken(token: string): string | null {
  const [payload, sig] = token.split('.');
  if (!payload || !sig || !safeEqual(sig, hmacSha256(fileSigningSecret, payload))) return null;
  try {
    const { k, e } = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { k: string; e: number };
    return e > Date.now() / 1000 ? k : null;
  } catch {
    return null;
  }
}

/** Allow-list by content sniffing (magic bytes) — the client-declared type is not trusted. */
export function detectFileType(buf: Buffer): { mime: string; ext: string } | null {
  const hex = buf.subarray(0, 12).toString('hex');
  if (hex.startsWith('25504446')) return { mime: 'application/pdf', ext: 'pdf' };
  if (hex.startsWith('89504e470d0a1a0a')) return { mime: 'image/png', ext: 'png' };
  if (hex.startsWith('ffd8ff')) return { mime: 'image/jpeg', ext: 'jpg' };
  if (hex.startsWith('52494646') && buf.subarray(8, 12).toString() === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  if (buf.subarray(4, 8).toString() === 'ftyp') {
    const brand = buf.subarray(8, 12).toString();
    if (['M4A ', 'mp42', 'isom', 'M4B '].includes(brand)) return { mime: 'audio/mp4', ext: 'm4a' };
    if (['heic', 'heix', 'mif1'].includes(brand)) return { mime: 'image/heic', ext: 'heic' };
  }
  return null;
}
