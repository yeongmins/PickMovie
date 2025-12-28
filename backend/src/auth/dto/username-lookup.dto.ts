// src/auth/dto/username-lookup.dto.ts
import { IsEmail, MaxLength } from 'class-validator';

export class UsernameLookupDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;
}
