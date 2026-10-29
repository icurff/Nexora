import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength } from 'class-validator';

function normalizeEmail(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export class PasswordResetRequestDto {
  @Transform(({ value }) => normalizeEmail(value))
  @IsString()
  @IsEmail()
  @MaxLength(254)
  email!: string;
}
