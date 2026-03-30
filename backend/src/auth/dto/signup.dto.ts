// src/auth/dto/signup.dto.ts
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export class SignupDto {
  @IsString()
  @Length(5, 20)
  @Matches(/^[a-zA-Z0-9_]+$/, { message: 'username은 영문/숫자/_만 허용' })
  username!: string;

  @IsString()
  @Length(8, 16)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  nickname?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;
}
