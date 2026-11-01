import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CheckoutLineDto {
  @IsString() @Matches(/^[1-9]\d*$/) cartItemId!: string;
  @IsInt() @Min(1) @Max(2_147_483_647) quantity!: number;
  @IsString() @Matches(/^(0|[1-9]\d*)$/) unitPrice!: string;
}

export class PlaceOrderDto {
  @IsUUID() idempotencyKey!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CheckoutLineDto)
  items!: CheckoutLineDto[];
  @IsString() @Matches(/^[1-9]\d*$/) addressId!: string;
  @IsString() @Matches(/^\d{4}-\d\d-\d\dT.*Z$/) addressUpdatedAt!: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  customerNote?: string;
}

export class OrderListQueryDto {
  @IsOptional() @IsInt() @Type(() => Number) @Min(1) page = 1;
  @IsOptional() @IsInt() @Type(() => Number) @Min(1) @Max(100) pageSize = 20;
  @IsOptional() @IsIn(['PENDING', 'CONFIRMED', 'CANCELLED']) status?: string;
}

export class CancelOrderDto {
  @IsUUID() idempotencyKey!: string;
  @IsString() @Matches(/^(0|[1-9]\d*)$/) expectedVersion!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) reason?: string;
}

export class ConfirmOrderDto {
  @IsUUID() idempotencyKey!: string;
  @IsString() @Matches(/^(0|[1-9]\d*)$/) expectedVersion!: string;
}
