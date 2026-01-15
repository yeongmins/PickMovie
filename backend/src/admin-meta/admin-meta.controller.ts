// backend/src/admin-meta/admin-meta.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { AdminTokenGuard } from './admin-token.guard';
import { MetaService } from '../meta/meta.service';
import type { MediaType } from '../meta/meta.types';

function parseMediaType(v: string): MediaType {
  const s = String(v ?? '')
    .trim()
    .toLowerCase();
  if (s === 'movie' || s === 'tv') return s as MediaType;
  throw new BadRequestException('mediaType must be "movie" or "tv"');
}

function parseTmdbId(v: string): number {
  const n = Number(String(v ?? '').trim());
  if (!Number.isFinite(n) || n <= 0)
    throw new BadRequestException('tmdbId must be a positive number');
  return Math.trunc(n);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

@Controller('admin/meta')
@UseGuards(AdminTokenGuard)
export class AdminMetaController {
  constructor(private readonly meta: MetaService) {}

  @Patch(':mediaType/:tmdbId')
  async patch(
    @Param('mediaType') mediaTypeRaw: string,
    @Param('tmdbId') tmdbIdRaw: string,
    @Body() body: unknown,
  ): Promise<{ ok: true }> {
    const mediaType = parseMediaType(mediaTypeRaw);
    const tmdbId = parseTmdbId(tmdbIdRaw);

    const patch = isRecord(body) ? body : {};

    await this.meta.upsertOverride({
      mediaType,
      tmdbId,
      patch: {
        contentKind:
          typeof patch['contentKind'] === 'string'
            ? patch['contentKind']
            : undefined,
        releaseStatus:
          typeof patch['releaseStatus'] === 'string'
            ? patch['releaseStatus']
            : undefined,
        ageRating:
          typeof patch['ageRating'] === 'string'
            ? patch['ageRating']
            : undefined,
        releaseYear:
          typeof patch['releaseYear'] === 'number'
            ? patch['releaseYear']
            : patch['releaseYear'] === null
              ? null
              : undefined,
        watchProviders: patch['watchProviders'],
      },
      updatedBy: 'admin-token',
    });

    return { ok: true };
  }
}
