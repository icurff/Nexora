import { Injectable, ServiceUnavailableException } from '@nestjs/common';

export type MediaContentType = 'image/jpeg' | 'image/png' | 'image/webp' | 'video/mp4' | 'video/webm' | 'video/quicktime';
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50_000_000;
export const MAX_MEDIA_BYTES = MAX_VIDEO_BYTES;

@Injectable()
export class SupabaseStorageAdapter {
  private readonly timeoutMs = 120_000;

  async upload(path: string, bytes: Buffer, contentType: MediaContentType) {
    const config = this.configuration();
    const response = await this.request(`${config.url}/storage/v1/object/${this.encodePath(config.bucket)}/${this.encodePath(path)}`, {
      method: 'POST',
      headers: {
        ...this.authHeaders(config.key),
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'x-upsert': 'false',
      },
      body: new Uint8Array(bytes),
    });
    if (!response.ok) throw new StorageRequestError(response.status);
  }

  publicUrl(path: string) {
    const config = this.configuration();
    return `${config.url}/storage/v1/object/public/${this.encodePath(config.bucket)}/${this.encodePath(path)}`;
  }

  bucketName() {
    return this.configuration().bucket;
  }

  private configuration() {
    const rawUrl = process.env.SUPABASE_URL?.trim();
    const key = process.env.SUPABASE_SECRET_KEY?.trim();
    const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim() || 'catalog-images';
    if (!rawUrl || !key) throw new ServiceUnavailableException({ code: 'IMAGE_STORAGE_NOT_CONFIGURED' });
    let url: URL;
    try { url = new URL(rawUrl); } catch { throw new ServiceUnavailableException({ code: 'IMAGE_STORAGE_NOT_CONFIGURED' }); }
    if (!['https:', 'http:'].includes(url.protocol) || url.pathname !== '/' || url.search || url.hash || !/^[a-z0-9][a-z0-9_-]{1,99}$/i.test(bucket)) {
      throw new ServiceUnavailableException({ code: 'IMAGE_STORAGE_NOT_CONFIGURED' });
    }
    return { url: url.origin, key, bucket };
  }

  private authHeaders(key: string): Record<string, string> {
    const headers: Record<string, string> = { apikey: key };
    // Legacy JWT service_role keys still require Authorization; new sb_secret keys must only use apikey.
    if (!key.startsWith('sb_secret_')) headers.Authorization = `Bearer ${key}`;
    return headers;
  }

  private encodePath(value: string) {
    return value.split('/').map(segment => encodeURIComponent(segment)).join('/');
  }

  private async request(url: string, init: RequestInit) {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(this.timeoutMs) });
    } catch {
      throw new ServiceUnavailableException({ code: 'IMAGE_STORAGE_UNAVAILABLE' });
    }
  }
}

export class StorageRequestError extends Error {
  constructor(readonly status: number) { super('Supabase Storage request failed'); }
}
