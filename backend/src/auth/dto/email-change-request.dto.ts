import { IsEmail, MaxLength } from 'class-validator';

export class EmailChangeRequestDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;
}

