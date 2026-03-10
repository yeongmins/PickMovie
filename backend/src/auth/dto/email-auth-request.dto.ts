import { IsBoolean, IsEmail, IsOptional, MaxLength } from 'class-validator';

export class EmailAuthRequestDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsOptional()
  @IsBoolean()
  resend?: boolean;
}
