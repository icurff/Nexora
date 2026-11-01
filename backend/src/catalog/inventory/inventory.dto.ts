import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class InventoryListQueryDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) q?: string;
  @IsOptional() @Matches(/^[1-9]\d*$/) categoryId?: string;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: 'ACTIVE' | 'INACTIVE';
  @IsOptional() @IsIn(['IN_STOCK', 'OUT_OF_STOCK']) availability?:
    'IN_STOCK' | 'OUT_OF_STOCK';
  @IsOptional() @Matches(/^[1-9]\d*$/) productId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
}

export class InventoryAdjustmentDto {
  @IsUUID() idempotencyKey!: string;
  @IsIn(['RESTOCK', 'ADJUSTMENT', 'STOCKTAKE']) type!:
    'RESTOCK' | 'ADJUSTMENT' | 'STOCKTAKE';
  @IsInt() @Min(-2_147_483_647) @Max(2_147_483_647) quantity!: number;
  @IsOptional() @Matches(/^(0|[1-9]\d*)$/) expectedVersion?: string;
  @Transform(trim) @IsString() @MaxLength(500) reason!: string;
}
