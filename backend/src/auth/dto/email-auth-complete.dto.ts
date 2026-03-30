import { IsString, Length } from 'class-validator';

export class EmailAuthCompleteDto {
  @IsString()
  @Length(10, 500)
  token!: string;
}
