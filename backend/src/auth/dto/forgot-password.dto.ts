// src/auth/dto/forgot-password.dto.ts
import { IsString, Length } from 'class-validator';

export class ForgotPasswordDto {
  @IsString()
  @Length(3, 254)
  identifier!: string;
}
