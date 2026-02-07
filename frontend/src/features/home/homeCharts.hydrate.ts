// frontend/src/features/home/homeCharts.hydrate.ts
import type {
  HomeChartsResponse,
  MediaType,
  ResolvedMeta,
  TmdbDetailLike,
} from "./homeCharts.api";
import { fetchMetaBatch, fetchTmdbDetailProxy } from "./homeCharts.api";

export type HomeCardItem = {
  id: number;
  media_type: MediaType;
  rank: number;

  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;

  poster_path: string | null;
  backdrop_path: string | null;
  vote_average?: number;

  release_date?: string;
  first_air_date?: string;

  // ✅ 필요하면 UI에서 meta값 사용
  __meta?: ResolvedMeta | null;
};

function keyOf(mt: MediaType, id: number) {
  return `${mt}:${id}`;
}

async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (x: T) => Promise<R>
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      for (;;) {
        const idx = cursor++;
        if (idx >= items.length) return;
        out[idx] = await mapper(items[idx]);
      }
    }
  );

  await Promise.all(workers);
  return out;
}

function toCardLike(
  detail: TmdbDetailLike,
  mt: MediaType,
  rank: number,
  meta: ResolvedMeta | null
): HomeCardItem {
  return {
    id: detail.id,
    media_type: mt,
    rank,
    title: detail.title,
    name: detail.name,
    original_title: detail.original_title,
    original_name: detail.original_name,
    overview: detail.overview,
    poster_path: detail.poster_path ?? null,
    backdrop_path: detail.backdrop_path ?? null,
    vote_average: detail.vote_average,
    release_date: detail.release_date,
    first_air_date: detail.first_air_date,
    __meta: meta,
  };
}

export async function hydrateHomeCharts(
  resp: HomeChartsResponse
): Promise<Record<string, HomeCardItem[]>> {
  const flat = resp.collections.flatMap((c) => c.items);
  const uniqReqs = new Map<string, { mediaType: MediaType; tmdbId: number }>();
  for (const x of flat) {
    const k = keyOf(x.mediaType, x.tmdbId);
    if (!uniqReqs.has(k)) uniqReqs.set(k, { mediaType: x.mediaType, tmdbId: x.tmdbId });
  }

  // 1) meta는 한 방에
  const metas = await fetchMetaBatch([...uniqReqs.values()]);
  const metaMap = new Map<string, ResolvedMeta>();
  for (const m of metas) metaMap.set(keyOf(m.mediaType, m.tmdbId), m);

  // 2) 디테일은 프록시로 여러 번 (동시성 제한)
  const details = await mapLimit(flat, 8, async (x) => {
    const hasPrebuiltDetail = typeof x.title === "string" || typeof x.name === "string";
    if (hasPrebuiltDetail) {
      const d: TmdbDetailLike = {
        id: x.tmdbId,
        title: x.title,
        name: x.name,
        original_title: x.original_title,
        original_name: x.original_name,
        overview: x.overview,
        poster_path: x.poster_path ?? null,
        backdrop_path: x.backdrop_path ?? null,
        vote_average: x.vote_average,
        release_date: x.release_date,
        first_air_date: x.first_air_date,
      };
      return { x, d };
    }

    const d = await fetchTmdbDetailProxy(x.mediaType, x.tmdbId);
    return { x, d };
  });

  const detailMap = new Map<string, TmdbDetailLike>();
  for (const { x, d } of details) {
    if (d) detailMap.set(keyOf(x.mediaType, x.tmdbId), d);
  }

  // 3) 컬렉션별 카드 리스트로 재구성
  const out: Record<string, HomeCardItem[]> = {};
  for (const c of resp.collections) {
    const cards: HomeCardItem[] = [];
    for (const it of c.items) {
      const d = detailMap.get(keyOf(it.mediaType, it.tmdbId));
      if (!d) continue;
      const meta = metaMap.get(keyOf(it.mediaType, it.tmdbId)) ?? null;
      cards.push(toCardLike(d, it.mediaType, it.rank, meta));
    }
    out[c.key] = cards.sort((a, b) => a.rank - b.rank);
  }
  return out;
}
