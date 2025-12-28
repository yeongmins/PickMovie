// src/auth/dto/register.dto.ts
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class RegisterDto {
  @IsOptional()
  @IsString()
  @Length(2, 12)
  @Matches(/^[가-힣a-zA-Z0-9_]+$/)
  nickname?: string;

  @IsString()
  @Length(5, 20)
  @Matches(/^[a-zA-Z0-9_]+$/)
  username!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @Length(8, 16)
  password!: string;
}
