import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedActor } from '../../shared/decorators/current-actor.decorator.js';
import { PrismaService } from '../../database/prisma.service.js';
import { MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, StorageRequestError, SupabaseStorageAdapter, type MediaContentType } from './supabase-storage.adapter.js';

export type UploadedMediaFile = { buffer: Buffer; size: number; mimetype: string; originalname: string };
const extensionByMime: Record<MediaContentType, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };

function assetResponse(asset: { id: bigint; publicUrl: string; contentType: string; contentLength: number }) {
  return { imageAssetId: asset.id.toString(), url: asset.publicUrl, contentType: asset.contentType, size: asset.contentLength };
}

@Injectable()
export class ImageUploadService {
  constructor(private readonly prisma: PrismaService, private readonly storage: SupabaseStorageAdapter) {}

  async upload(file: UploadedMediaFile | undefined, actor: AuthenticatedActor) {
    if (!file?.buffer?.length) throw new BadRequestException({ code: 'MEDIA_FILE_REQUIRED' });
    const contentType = file.mimetype as MediaContentType;
    if (!(contentType in extensionByMime)) throw new BadRequestException({ code: 'MEDIA_TYPE_UNSUPPORTED' });
    const maxBytes = contentType.startsWith('video/') ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    if (file.size > maxBytes || file.buffer.length > maxBytes) throw new BadRequestException({ code: 'MEDIA_TOO_LARGE', maxBytes });
    const actorId = BigInt(actor.userId);
    const bucket = this.storage.bucketName();
    const objectPath = `products/${actorId}/${randomUUID()}.${extensionByMime[contentType]}`;
    try {
      await this.storage.upload(objectPath, file.buffer, contentType);
      const asset = await this.prisma.imageAsset.create({ data: {
        uploadedById: actorId, bucket, objectPath, contentType, contentLength: file.buffer.length,
        publicUrl: this.storage.publicUrl(objectPath),
      } });
      return assetResponse(asset);
    } catch (error) {
      if (error instanceof StorageRequestError) throw new ServiceUnavailableException({ code: error.status === 404 ? 'IMAGE_STORAGE_BUCKET_NOT_FOUND' : 'MEDIA_STORAGE_UPLOAD_FAILED' });
      if (error instanceof ServiceUnavailableException) throw error;
      throw error;
    }
  }
}
