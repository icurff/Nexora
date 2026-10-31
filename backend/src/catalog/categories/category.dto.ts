import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const trimText = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.normalize('NFC').trim() : value;

export class CategoryAttributeDto {
  @Transform(trimText)
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{0,31}$/)
  code!: string;

  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  label!: string;

  @IsIn(['string', 'number', 'boolean'])
  type!: 'string' | 'number' | 'boolean';

  @IsOptional()
  @Transform(trimText)
  @IsString()
  @MaxLength(40)
  unit?: string;
}

export class CategoryOptionDto {
  @Transform(trimText)
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{0,31}$/)
  code!: string;

  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  label!: string;
}

export class CategoryAttributeConfigDto {
  @IsArray()
  @ArrayMaxSize(30)
  @ArrayUnique((attribute: CategoryAttributeDto) => attribute.code)
  @ValidateNested({ each: true })
  @Type(() => CategoryAttributeDto)
  attributes!: CategoryAttributeDto[];

  @IsArray()
  @ArrayMaxSize(5)
  @ArrayUnique((option: CategoryOptionDto) => option.code)
  @ValidateNested({ each: true })
  @Type(() => CategoryOptionDto)
  options!: CategoryOptionDto[];
}

export class CreateCategoryDto {
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @MaxLength(150)
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  slug?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[1-9]\d*$/)
  parentId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => CategoryAttributeConfigDto)
  attributeConfig?: CategoryAttributeConfigDto;
}

export class UpdateCategoryDto {
  @IsOptional()
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @MaxLength(150)
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  slug?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[1-9]\d*$/)
  parentId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => CategoryAttributeConfigDto)
  attributeConfig?: CategoryAttributeConfigDto;
}
