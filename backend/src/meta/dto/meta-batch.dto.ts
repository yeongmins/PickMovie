// backend/src/meta/dto/meta-batch.dto.ts
import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, Min, ValidateNested } from 'class-validator';

export class MetaBatchItemDto {
  @IsIn(['movie', 'tv'])
  mediaType!: 'movie' | 'tv';

  @IsInt()
  @Min(1)
  tmdbId!: number;
}

export class MetaBatchDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MetaBatchItemDto)
  items!: MetaBatchItemDto[];
}
