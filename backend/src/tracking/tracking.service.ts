import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma.service.js';
import type { TrackEventDto } from './dto/track-event.dto.js';
import type { TrackingContext } from './tracking-identity.service.js';

@Injectable()
export class TrackingService {
  constructor(private readonly prisma: PrismaService) {}

  async track(dto: TrackEventDto, context: TrackingContext) {
    const eventId = `fe:${dto.eventId}`;

    // Chỉ nhận VIEW hoặc SEARCH từ Frontend.
    if (dto.eventType === 'view') {
      if (
        !dto.productId ||
        dto.queryLength !== undefined ||
        dto.resultCount !== undefined ||
        dto.categoryId !== undefined
      ) {
        throw new BadRequestException({
          code: 'INVALID_VIEW_EVENT',
        });
      }
    } else if (dto.productId !== undefined || dto.queryLength === undefined) {
      throw new BadRequestException({
        code: 'INVALID_SEARCH_EVENT',
      });
    }

    const productId = dto.productId ? BigInt(dto.productId) : null;

    if (productId !== null && productId > 9223372036854775807n) {
      throw new BadRequestException({
        code: 'INVALID_PRODUCT_ID',
      });
    }

    if (dto.categoryId) {
      const categoryId = BigInt(dto.categoryId);

      if (categoryId > 9223372036854775807n) {
        throw new BadRequestException({
          code: 'INVALID_CATEGORY_ID',
        });
      }
    }

    const metadata: Prisma.InputJsonObject =
      dto.eventType === 'search'
        ? {
            queryLength: dto.queryLength!,
            ...(dto.resultCount === undefined
              ? {}
              : { resultCount: dto.resultCount }),
            ...(dto.categoryId === undefined
              ? {}
              : { categoryId: dto.categoryId }),
          }
        : {};

    // Retry cùng event ID phải có cùng nội dung.
    const samePayload = (event: {
      eventType: string;
      visitorId: bigint | null;
      userId: bigint | null;
      productId: bigint | null;
      metadata: Prisma.JsonValue;
    }) =>
      event.eventType === dto.eventType &&
      event.visitorId === context.visitorId &&
      event.userId === (context.userId ? BigInt(context.userId) : null) &&
      event.productId === productId &&
      JSON.stringify(event.metadata) === JSON.stringify(metadata);

    const existing = await this.prisma.interactionEvent.findUnique({
      where: { eventId },
    });

    if (existing) {
      if (!samePayload(existing)) {
        throw new ConflictException({
          code: 'EVENT_ID_CONFLICT',
        });
      }

      return {
        eventId,
        recorded: true,
        duplicate: true,
      };
    }

    // VIEW phải trỏ đến sản phẩm công khai.
    if (productId !== null) {
      const product = await this.prisma.product.findFirst({
        where: {
          id: productId,
          status: 'ACTIVE',
        },
        select: { id: true },
      });

      if (!product) {
        throw new NotFoundException({
          code: 'PRODUCT_NOT_FOUND',
        });
      }
    }

    try {
      await this.prisma.interactionEvent.create({
        data: {
          eventId,
          eventType: dto.eventType,
          eventSource: 'FRONTEND',
          dataOrigin: 'LIVE',
          schemaVersion: 1,
          visitorId: context.visitorId,
          trackingSessionId: context.trackingSessionId,
          userId: context.userId ? BigInt(context.userId) : null,
          productId,
          metadata,
          occurredAt: new Date(),
        },
      });
    } catch (error) {
      // Hai request đồng thời có thể cùng gửi một event ID.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const saved = await this.prisma.interactionEvent.findUnique({
          where: { eventId },
        });

        if (saved && samePayload(saved)) {
          return {
            eventId,
            recorded: true,
            duplicate: true,
          };
        }

        throw new ConflictException({
          code: 'EVENT_ID_CONFLICT',
        });
      }

      throw error;
    }

    return {
      eventId,
      recorded: true,
      duplicate: false,
    };
  }
}
