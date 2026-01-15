// backend/src/meta/meta.resolver.ts
import { Injectable } from '@nestjs/common';

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

export function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

export function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

export function asNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function yearFromIsoDate(iso: string): number | null {
  const s = String(iso || '').trim();
  const m = s.match(/^(\d{4})/);
  if (!m) return null;
  const y = Number(m[1]);
  return Number.isFinite(y) ? y : null;
}

/** TMDB genres에 애니메이션(보통 id=16)이 포함되면 true */
export function hasAnimationGenre(genres: unknown): boolean {
  const arr = asArray(genres);
  for (const g of arr) {
    if (!isRecord(g)) continue;
    const id = asNumber(g['id']);
    const name = asString(g['name']).toLowerCase();
    if (id === 16) return true;
    if (name.includes('animation') || name.includes('애니')) return true;
  }
  return false;
}

/**
 * ✅ Module에서 provider로 쓰고 있으니 export 보장
 * - GraphQL을 실제로 쓰는 구조가 아니어도 Nest provider로는 문제 없음
 */
@Injectable()
export class MetaResolver {}
