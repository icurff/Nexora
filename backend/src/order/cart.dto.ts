import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class AddCartItemDto {
  @IsOptional()
  @IsString()
  @Matches(/^[1-9]\d*$/)
  variantId?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[1-9]\d*$/)
  productId?: string;

  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  quantity!: number;
}

export class UpdateCartItemDto {
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  quantity!: number;
}
