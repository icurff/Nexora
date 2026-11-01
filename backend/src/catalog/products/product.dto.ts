import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.normalize('NFC').trim() : value;

export class VariantInputDto {
  @IsObject()
  options!: Record<string, string>;

  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  priceVnd!: number;
}

export class ProductOptionDto {
  @Transform(trim)
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{0,31}$/)
  code!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  label!: string;
}

export class ProductOptionConfigDto {
  @IsArray()
  @ArrayMaxSize(5)
  @ArrayUnique((option: ProductOptionDto) => option.code)
  @ValidateNested({ each: true })
  @Type(() => ProductOptionDto)
  options!: ProductOptionDto[];
}

export class ProductImageInputDto {
  @IsString()
  @IsNotEmpty()
  imageAssetId!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  altText?: string;

  @IsOptional()
  @IsString()
  variantId?: string;

  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder!: number;

  @IsBoolean()
  isPrimary!: boolean;
}

export class CreateProductDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  description!: string;

  @IsString()
  @IsNotEmpty()
  categoryId!: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => ProductOptionConfigDto)
  optionConfig!: ProductOptionConfigDto;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => VariantInputDto)
  variants!: VariantInputDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique((image: ProductImageInputDto) => image.imageAssetId)
  @ValidateNested({ each: true })
  @Type(() => ProductImageInputDto)
  images!: ProductImageInputDto[];
}

export class UpdateProductDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  categoryId?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';
}

export class UpdateVariantDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  priceVnd?: number;
}

export class UpdateProductImageDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  altText?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class AddProductImagesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique((image: ProductImageInputDto) => image.imageAssetId)
  @ValidateNested({ each: true })
  @Type(() => ProductImageInputDto)
  images!: ProductImageInputDto[];
}

export class ProductListQueryDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}
