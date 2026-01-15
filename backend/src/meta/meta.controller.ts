// backend/src/meta/meta.controller.ts
import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { MetaService } from './meta.service';
import type { MediaType, ResolveRequest, ResolvedMeta } from './meta.types';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

// ✅ Array.isArray는 타입이 any[]로 좁혀질 수 있어서, 직접 unknown[] 타입가드 제공
function isUnknownArray(v: unknown): v is unknown[] {
  return Array.isArray(v);
}

function parseMediaType(v: unknown): MediaType | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  if (s === 'movie' || s === 'tv') return s as MediaType;
  return null;
}

function parseTmdbId(v: unknown): number | null {
  const n =
    typeof v === 'number'
      ? v
      : typeof v === 'string'
        ? Number(v.trim())
        : Number.NaN;

  if (!Number.isFinite(n)) return null;

  const i = Math.trunc(n);
  if (i <= 0) return null;
  return i;
}

/**
 * ✅ body가 다음 형태 모두 허용:
 * 1) [ { mediaType, tmdbId }, ... ]
 * 2) { items: [...] }
 * 3) { reqs: [...] }
 * 4) { requests: [...] }
 */
function extractArray(body: unknown): unknown[] | null {
  if (isUnknownArray(body)) return body;
  if (!isRecord(body)) return null;

  // ✅ Record<string, unknown>에서 안전하게 접근 (dot 접근 대신 bracket)
  const candidates: unknown[] = [body['items'], body['reqs'], body['requests']];

  for (const c of candidates) {
    if (isUnknownArray(c)) return c;
  }
  return null;
}

@Controller('meta')
export class MetaController {
  constructor(private readonly meta: MetaService) {}

  @Post('batch')
  async batch(@Body() body: unknown): Promise<{ items: ResolvedMeta[] }> {
    const arr = extractArray(body);
    if (!arr) {
      throw new BadRequestException(
        'Invalid body. Expected an array or { items: [...] }',
      );
    }

    const reqs: ResolveRequest[] = [];
    for (const it of arr) {
      if (!isRecord(it)) continue;

      const mediaType = parseMediaType(it['mediaType']);
      const tmdbId = parseTmdbId(it['tmdbId']);

      if (!mediaType || !tmdbId) continue;
      reqs.push({ mediaType, tmdbId });
    }

    // ✅ 빈 요청도 프론트 안전하게 200 처리
    if (reqs.length === 0) return { items: [] };

    const items = await this.meta.resolveBatch(reqs);
    return { items };
  }
}
