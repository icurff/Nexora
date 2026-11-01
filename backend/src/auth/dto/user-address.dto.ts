import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class UserAddressDto {
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  recipientName!: string;

  @Transform(trim)
  @IsString()
  @Length(8, 16)
  @Matches(/^\+?[0-9][0-9\s().-]{6,14}[0-9]$/, {
    message: 'Số điện thoại không hợp lệ',
  })
  recipientPhone!: string;

  @Transform(trim)
  @IsString()
  @Length(1, 150)
  provinceName!: string;

  @Transform(trim)
  @IsString()
  @Length(1, 150)
  wardName!: string;

  @Transform(trim)
  @IsString()
  @Length(1, 300)
  addressLine!: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateUserAddressDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  recipientName?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(8, 16)
  @Matches(/^\+?[0-9][0-9\s().-]{6,14}[0-9]$/, {
    message: 'Số điện thoại không hợp lệ',
  })
  recipientPhone?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 150)
  provinceName?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 150)
  wardName?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 300)
  addressLine?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
