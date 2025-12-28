// src/auth/dto/reset-password.dto.ts
import { IsString, Length } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @Length(20, 300)
  token!: string;

  @IsString()
  @Length(8, 16)
  newPassword!: string;
}
