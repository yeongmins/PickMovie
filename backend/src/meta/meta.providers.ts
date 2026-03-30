// backend/src/meta/meta.providers.ts
import axios from 'axios';
import { Prisma } from '../generated/prisma';
import type {
  WatchProviderItem,
  WatchProviders,
  MediaType,
} from './meta.types';
import { asArray, asNumber, asString, isRecord } from './meta.resolver';

export const WP_LIST_KEYS = ['flatrate', 'free', 'ads', 'rent', 'buy'] as const;

export function parseProviderList(
  arr: unknown,
): WatchProviderItem[] | undefined {
  const src = asArray(arr);
  const items: WatchProviderItem[] = [];

  for (const it of src) {
    if (!isRecord(it)) continue;
    const provider_id = asNumber(it['provider_id']);
    const provider_name = asString(it['provider_name']);
    const logo_path =
      it['logo_path'] === null || typeof it['logo_path'] === 'string'
        ? it['logo_path']
        : null;
    const display_priority = asNumber(it['display_priority']) ?? undefined;

    if (!provider_id || !provider_name) continue;
    items.push({ provider_id, provider_name, logo_path, display_priority });
  }

  return items.length ? items : undefined;
}

export function flattenProviders(
  wp: WatchProviders | null,
): WatchProviderItem[] {
  if (!wp) return [];
  const merged: WatchProviderItem[] = [];
  for (const k of WP_LIST_KEYS) {
    const list = wp[k];
    if (Array.isArray(list)) merged.push(...list);
  }

  const seen = new Set<number>();
  const uniq: WatchProviderItem[] = [];
  for (const p of merged) {
    if (!p || typeof p.provider_id !== 'number') continue;
    if (seen.has(p.provider_id)) continue;
    seen.add(p.provider_id);
    uniq.push(p);
  }

  uniq.sort((a, b) => {
    const pa =
      typeof a.display_priority === 'number' ? a.display_priority : 9999;
    const pb =
      typeof b.display_priority === 'number' ? b.display_priority : 9999;
    return pa - pb;
  });

  return uniq;
}

export function safeWatchProviders(v: unknown): WatchProviders | null {
  if (!isRecord(v)) return null;

  const out: WatchProviders = {};

  const link = v['link'];
  if (typeof link === 'string') out.link = link;

  for (const k of WP_LIST_KEYS) {
    const picked = parseProviderList(v[k]);
    if (picked) out[k] = picked;
  }

  return Object.keys(out).length ? out : null;
}

type NullableJson = Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;

export function toPrismaJson(v: unknown): Prisma.InputJsonValue {
  return v as Prisma.InputJsonValue;
}

export function toNullableJson(v: unknown): NullableJson {
  return v === null ? Prisma.DbNull : toPrismaJson(v);
}

export async function fetchWatchProvidersKR(args: {
  tmdbBase: string;
  mediaType: MediaType;
  tmdbId: number;
  apiKey: string;
}): Promise<WatchProviders | null> {
  const url = `${args.tmdbBase}/${args.mediaType}/${args.tmdbId}/watch/providers`;
  const resp = await axios.get<unknown>(url, {
    params: { api_key: args.apiKey },
    timeout: 10_000,
  });

  const data = resp.data;
  if (!isRecord(data)) return null;

  const results = data['results'];
  if (!isRecord(results)) return null;

  const kr = results['KR'];
  if (!isRecord(kr)) return null;

  const out: WatchProviders = {};

  const link = kr['link'];
  if (typeof link === 'string') out.link = link;

  for (const k of WP_LIST_KEYS) {
    const picked = parseProviderList(kr[k]);
    if (picked) out[k] = picked;
  }

  return Object.keys(out).length ? out : null;
}
