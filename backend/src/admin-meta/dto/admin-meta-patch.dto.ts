// backend/src/admin-meta/dto/admin-meta-patch.dto.ts
import { IsIn, IsInt, IsOptional, Min, ValidateIf } from 'class-validator';

export class AdminMetaPatchDto {
  @IsOptional()
  @IsIn(['MOVIE', 'TV', 'ANI'])
  contentKind?: 'MOVIE' | 'TV' | 'ANI';

  @IsOptional()
  @IsIn(['NOW_SHOWING', 'UPCOMING', 'RE_RELEASE', 'NONE'])
  releaseStatus?: 'NOW_SHOWING' | 'UPCOMING' | 'RE_RELEASE' | 'NONE';

  /**
   * ✅ API 입력은 "12/15/19"로 받되
   * DB enum은 R12/R15/R19로 저장할 예정
   */
  @IsOptional()
  @IsIn(['ALL', '12', '15', '19', 'R12', 'R15', 'R19', 'UNKNOWN'])
  ageRating?: 'ALL' | '12' | '15' | '19' | 'R12' | 'R15' | 'R19' | 'UNKNOWN';

  @IsOptional()
  @ValidateIf(
    (o: AdminMetaPatchDto) =>
      o.releaseYear !== null && o.releaseYear !== undefined,
  )
  @IsInt()
  @Min(1800)
  releaseYear?: number | null;

  @IsOptional()
  watchProviders?: unknown;
}
