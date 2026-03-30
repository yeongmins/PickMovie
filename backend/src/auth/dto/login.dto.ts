// src/auth/dto/login.dto.ts
import { IsString, Length } from 'class-validator';

export class LoginDto {
  @IsString()
  @Length(1, 50)
  username!: string;

  @IsString()
  @Length(1, 100)
  password!: string;
}
