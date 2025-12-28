// src/auth/dto/recover-username.dto.ts
import { IsEmail } from 'class-validator';

export class RecoverUsernameDto {
  @IsEmail()
  email!: string;
}
