import { IsEmail, IsString, Length, Validate } from 'class-validator';
import type { ValidatorConstraintInterface } from 'class-validator';
import { Transform } from 'class-transformer';

class PasswordByteLength implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= 72;
  }
  defaultMessage(): string {
    return 'password must be at most 72 UTF-8 bytes';
  }
}

function normalizeEmail(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : undefined;
}

function trimFullName(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class RegisterDto {
  @Transform(({ value }) => trimFullName(value))
  @IsString() @Length(1, 100) fullName!: string;
  @Transform(({ value }) => normalizeEmail(value))
  @IsEmail()
  @Length(1, 254)
  email!: string;
  @IsString() @Length(8, 72) @Validate(PasswordByteLength) password!: string;
  @IsString()
  @Length(8, 72)
  @Validate(PasswordByteLength)
  confirmPassword!: string;
}

export class LoginDto {
  @Transform(({ value }) => normalizeEmail(value))
  @IsEmail()
  @Length(1, 254)
  email!: string;
  @IsString() @Length(1, 72) @Validate(PasswordByteLength) password!: string;
}

export class ChangePasswordDto {
  @IsString()
  @Length(1, 72)
  @Validate(PasswordByteLength)
  currentPassword!: string;
  @IsString() @Length(8, 72) @Validate(PasswordByteLength) newPassword!: string;
  @IsString()
  @Length(8, 72)
  @Validate(PasswordByteLength)
  confirmPassword!: string;
}
