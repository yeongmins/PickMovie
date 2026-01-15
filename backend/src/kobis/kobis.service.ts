// backend/src/kobis/kobis.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';

type KobisMovieListItem = {
  movieCd?: string;
  movieNm?: string;
  movieNmEn?: string;
  openDt?: string;
  prdtYear?: string;
  typeNm?: string;
  prdtStatNm?: string;
};

type KobisSearchMovieListResponse = {
  movieListResult?: { movieList?: KobisMovieListItem[] };
};

type KobisDailyBoxOfficeItem = {
  rank?: string;
  movieCd?: string;
  movieNm?: string;
};

type KobisDailyBoxOfficeResponse = {
  boxOfficeResult?: { dailyBoxOfficeList?: KobisDailyBoxOfficeItem[] };
};

export type KobisMatch = {
  kobisMovieCd: string | null;
  kobisOpenDt: string | null; // "YYYY-MM-DD"
};

type TmdbDetailLike = {
  title?: unknown;
  original_title?: unknown;
  name?: unknown;
  original_name?: unknown;
  release_date?: unknown;
};

type BoxOfficeSnapshotItem = {
  rank: number | null;
  movieCd: string;
  movieNm: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function toCleanStr(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  return '';
}

function ymdToIso(yyyymmdd: string): string | null {
  const s = String(yyyymmdd || '').trim();
  if (!/^\d{8}$/.test(s)) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

function isoToYear(iso: string): string {
  const s = String(iso || '').trim();
  const m = s.match(/^(\d{4})/);
  return m ? m[1] : '';
}

function normTitle(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function toYmdKR(d: Date): string {
  const y = String(d.getFullYear()).padStart(4, '0');
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${da}`;
}

function parseBoxOfficeItems(v: unknown): BoxOfficeSnapshotItem[] {
  if (!Array.isArray(v)) return [];
  const out: BoxOfficeSnapshotItem[] = [];
  for (const it of v) {
    if (!isRecord(it)) continue;
    const rankRaw = toCleanStr(it['rank']);
    const movieCd = toCleanStr(it['movieCd']);
    const movieNm = toCleanStr(it['movieNm']);
    if (!movieCd || !movieNm) continue;
    out.push({
      rank: rankRaw ? Number(rankRaw) || null : null,
      movieCd,
      movieNm,
    });
  }
  return out;
}

@Injectable()
export class KobisService {
  private readonly logger = new Logger(KobisService.name);
  private readonly base =
    'https://www.kobis.or.kr/kobisopenapi/webservice/rest';
  private readonly key: string;

  private nowPlayingCache: {
    fetchedAt: number;
    days: number;
    set: Set<string>;
  } | null = null;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.key = String(this.config.get('KOBIS_API_KEY') ?? '').trim();
  }

  private async getJson<T>(
    path: string,
    params: Record<string, string | number | undefined>,
  ): Promise<T> {
    if (!this.key) throw new Error('Missing KOBIS_API_KEY');

    const url = new URL(`${this.base}${path}`);
    url.searchParams.set('key', this.key);

    for (const [k, v] of Object.entries(params)) {
      if (v === undefined) continue;
      url.searchParams.set(k, String(v));
    }

    const res = await firstValueFrom(this.http.get<T>(url.toString()));
    return res.data;
  }

  async searchMovieList(params: {
    movieNm: string;
    openStartDt?: string;
    openEndDt?: string;
    curPage?: number;
    itemPerPage?: number;
  }): Promise<KobisMovieListItem[]> {
    const movieNm = toCleanStr(params.movieNm);
    if (!movieNm) return [];

    try {
      const json = await this.getJson<KobisSearchMovieListResponse>(
        '/movie/searchMovieList.json',
        {
          movieNm,
          openStartDt: params.openStartDt,
          openEndDt: params.openEndDt,
          curPage: params.curPage ?? 1,
          itemPerPage: params.itemPerPage ?? 50,
        },
      );

      const list = json.movieListResult?.movieList;
      return Array.isArray(list) ? list : [];
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`[KOBIS] searchMovieList failed: ${msg}`);
      return [];
    }
  }

  async getNowPlayingMovieCds(days = 7): Promise<Set<string>> {
    const now = Date.now();
    const OK_TTL = 6 * 60 * 60 * 1000;

    if (
      this.nowPlayingCache &&
      now - this.nowPlayingCache.fetchedAt < OK_TTL &&
      this.nowPlayingCache.days === days
    ) {
      return this.nowPlayingCache.set;
    }

    const set = new Set<string>();

    const today = new Date();
    for (let i = 0; i < days; i += 1) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const targetDt = toYmdKR(d);

      try {
        const json = await this.getJson<KobisDailyBoxOfficeResponse>(
          '/boxoffice/searchDailyBoxOfficeList.json',
          { targetDt },
        );

        const list = json.boxOfficeResult?.dailyBoxOfficeList;
        if (!Array.isArray(list)) continue;

        for (const it of list) {
          const cd = toCleanStr(it?.movieCd);
          if (cd) set.add(cd);
        }
      } catch {
        // 하루 실패는 무시
      }
    }

    this.nowPlayingCache = { fetchedAt: now, days, set };
    return set;
  }

  async findOpenDtByTmdbDetail(detail: TmdbDetailLike): Promise<KobisMatch> {
    const titlePool = [
      toCleanStr(detail.title),
      toCleanStr(detail.original_title),
      toCleanStr(detail.name),
      toCleanStr(detail.original_name),
    ].filter(Boolean);

    const releaseIso = toCleanStr(detail.release_date);
    const releaseYear = isoToYear(releaseIso);

    if (!titlePool.length) return { kobisMovieCd: null, kobisOpenDt: null };

    const primaryTitle =
      [...titlePool].sort((a, b) => a.length - b.length)[0] ?? '';

    const yr = /^\d{4}$/.test(releaseYear) ? Number(releaseYear) : null;
    const openStartDt = yr ? `${yr - 1}0101` : undefined;
    const openEndDt = yr ? `${yr + 1}1231` : undefined;

    const candidates = await this.searchMovieList({
      movieNm: primaryTitle,
      openStartDt,
      openEndDt,
      itemPerPage: 50,
    });

    if (!candidates.length) {
      const fallback = await this.searchMovieList({
        movieNm: primaryTitle,
        itemPerPage: 50,
      });
      candidates.push(...fallback);
    }

    const tmdbNorms = titlePool.map(normTitle);
    const score = (it: KobisMovieListItem) => {
      const nm = normTitle(toCleanStr(it.movieNm));
      const en = normTitle(toCleanStr(it.movieNmEn));
      const openIso = ymdToIso(toCleanStr(it.openDt)) ?? '';
      const openYear = isoToYear(openIso);

      let s = 0;
      for (const t of tmdbNorms) {
        if (!t) continue;
        if (nm === t || en === t) s += 1000;
        else if (
          nm.includes(t) ||
          en.includes(t) ||
          t.includes(nm) ||
          t.includes(en)
        )
          s += 350;
      }

      if (yr && /^\d{4}$/.test(openYear)) {
        const dy = Math.abs(Number(openYear) - yr);
        if (dy === 0) s += 120;
        else if (dy === 1) s += 60;
        else if (dy === 2) s += 20;
      }

      if (openIso) s += 10;
      return s;
    };

    let best: KobisMovieListItem | null = null;
    let bestScore = -1;

    for (const it of candidates) {
      const sc = score(it);
      if (sc > bestScore) {
        bestScore = sc;
        best = it;
      }
    }

    const kobisMovieCd = best ? toCleanStr(best.movieCd) : '';
    const kobisOpenDtIso = best ? ymdToIso(toCleanStr(best.openDt)) : null;

    return { kobisMovieCd: kobisMovieCd || null, kobisOpenDt: kobisOpenDtIso };
  }

  async getDailyBoxOffice(
    targetDt: string,
  ): Promise<{ targetDt: string; items: BoxOfficeSnapshotItem[] }> {
    const t = String(targetDt || '').trim();
    if (!/^\d{8}$/.test(t)) return { targetDt: t, items: [] };

    const existing = await this.prisma.kobisBoxOfficeSnapshot.findUnique({
      where: { targetDt: t },
    });

    if (existing) {
      return { targetDt: t, items: parseBoxOfficeItems(existing.items) };
    }

    const items = await this.fetchDailyBoxOffice(t);

    await this.prisma.kobisBoxOfficeSnapshot.upsert({
      where: { targetDt: t },
      update: { items, fetchedAt: new Date() },
      create: { targetDt: t, items, fetchedAt: new Date() },
    });

    return { targetDt: t, items };
  }

  async refreshYesterdayBoxOfficeSnapshot(): Promise<void> {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const targetDt = toYmdKR(d);
    await this.getDailyBoxOffice(targetDt);
  }

  private async fetchDailyBoxOffice(
    targetDt: string,
  ): Promise<BoxOfficeSnapshotItem[]> {
    try {
      const json = await this.getJson<KobisDailyBoxOfficeResponse>(
        '/boxoffice/searchDailyBoxOfficeList.json',
        { targetDt },
      );

      const list = json.boxOfficeResult?.dailyBoxOfficeList;
      if (!Array.isArray(list)) return [];

      return list
        .map((it) => {
          const movieCd = toCleanStr(it.movieCd);
          const movieNm = toCleanStr(it.movieNm);
          const rankStr = toCleanStr(it.rank);
          if (!movieCd || !movieNm) return null;
          return {
            rank: rankStr ? Number(rankStr) || null : null,
            movieCd,
            movieNm,
          };
        })
        .filter((x): x is BoxOfficeSnapshotItem => x !== null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(
        `[KOBIS] fetchDailyBoxOffice failed(${targetDt}): ${msg}`,
      );
      return [];
    }
  }
}
