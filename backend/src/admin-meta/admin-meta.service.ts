// backend/src/admin-meta/admin-meta.service.ts
import { Injectable } from '@nestjs/common';
import { MetaService } from '../meta/meta.service';
import type { MediaType } from '../meta/meta.types';
import { AdminMetaPatchDto } from './dto/admin-meta-patch.dto';

@Injectable()
export class AdminMetaService {
  constructor(private readonly meta: MetaService) {}

  async patchMeta(args: {
    mediaType: MediaType;
    tmdbId: number;
    patch: AdminMetaPatchDto;
    updatedBy?: string;
  }) {
    const { mediaType, tmdbId, patch, updatedBy } = args;

    await this.meta.upsertOverride({
      mediaType,
      tmdbId,
      patch: {
        contentKind: patch.contentKind,
        releaseStatus: patch.releaseStatus,
        ageRating: patch.ageRating,
        releaseYear: patch.releaseYear,
        watchProviders: patch.watchProviders,
      },
      updatedBy,
    });

    const [resolved] = await this.meta.resolveBatch([{ mediaType, tmdbId }]);
    return resolved;
  }
}
