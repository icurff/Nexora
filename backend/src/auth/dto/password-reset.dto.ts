import { IsString, MinLength } from 'class-validator';

export class PasswordResetDto {
  @IsString()
  @MinLength(1)
  token!: string;

  @IsString()
  @MinLength(6)
  newPassword!: string;

  @IsString()
  @MinLength(6)
  confirmPassword!: string;
}
