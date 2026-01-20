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

export type KobisTheatricalInfo = {
  kobisMovieCd: string | null;
  kobisOpenDt: string | null; // original YYYY-MM-DD
  rerunKobisMovieCd: string | null;
  rerunOpenDt: string | null; // rerun YYYY-MM-DD
  hasMultipleTheatrical: boolean;
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

function pickPrimaryTitle(titlePool: string[]): string {
  // 짧은 제목이 검색에 잘 걸리는 경우가 많아서 기존 로직 유지
  return [...titlePool].sort((a, b) => a.length - b.length)[0] ?? '';
}

function buildYmdRangeByYearSpan(
  startYear: number,
  endYear: number,
): { openStartDt: string; openEndDt: string } {
  const a = Math.min(startYear, endYear);
  const b = Math.max(startYear, endYear);
  return { openStartDt: `${a}0101`, openEndDt: `${b}1231` };
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

  /**
   * ✅ nowPlaying 판정용 movieCd set
   * - 기존: KOBIS API를 days만큼 직접 호출(최대 7회)
   * - 변경: DB 스냅샷(KobisBoxOfficeSnapshot)을 우선 사용하고,
   *         없을 때만 1회 fetch 후 저장(getDailyBoxOffice가 처리)
   */
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
        // ✅ DB 스냅샷 기반(없으면 내부에서 fetch 후 upsert)
        const snap = await this.getDailyBoxOffice(targetDt);
        for (const it of snap.items) {
          const cd = toCleanStr(it.movieCd);
          if (cd) set.add(cd);
        }
      } catch {
        // 하루 실패는 무시
      }
    }

    this.nowPlayingCache = { fetchedAt: now, days, set };
    return set;
  }

  /**
   * ✅ (신규) 원개봉/재개봉 openDt를 둘 다 뽑아줌
   * - 원개봉: TMDB release_year 주변(yr-1 ~ yr+1)
   * - 재개봉: 현재 연도 주변(thisYear-1 ~ thisYear+1)
   */
  async findTheatricalInfoByTmdbDetail(
    detail: TmdbDetailLike,
  ): Promise<KobisTheatricalInfo> {
    const titlePool = [
      toCleanStr(detail.title),
      toCleanStr(detail.original_title),
      toCleanStr(detail.name),
      toCleanStr(detail.original_name),
    ].filter(Boolean);

    const releaseIso = toCleanStr(detail.release_date);
    const releaseYearStr = isoToYear(releaseIso);
    const tmdbYear = /^\d{4}$/.test(releaseYearStr)
      ? Number(releaseYearStr)
      : null;

    if (!titlePool.length) {
      return {
        kobisMovieCd: null,
        kobisOpenDt: null,
        rerunKobisMovieCd: null,
        rerunOpenDt: null,
        hasMultipleTheatrical: false,
      };
    }

    const primaryTitle = pickPrimaryTitle(titlePool);
    const tmdbNorms = titlePool.map(normTitle).filter(Boolean);

    const score = (it: KobisMovieListItem, targetYear: number | null) => {
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

      if (targetYear && /^\d{4}$/.test(openYear)) {
        const dy = Math.abs(Number(openYear) - targetYear);
        if (dy === 0) s += 120;
        else if (dy === 1) s += 60;
        else if (dy === 2) s += 20;
      }

      if (openIso) s += 10;
      return s;
    };

    const pickBest = (
      candidates: KobisMovieListItem[],
      targetYear: number | null,
    ) => {
      let best: KobisMovieListItem | null = null;
      let bestScore = -1;
      for (const it of candidates) {
        const sc = score(it, targetYear);
        if (sc > bestScore) {
          bestScore = sc;
          best = it;
        }
      }
      return best;
    };

    const thisYear = new Date().getFullYear();

    // 1) 원개봉 후보(주로 TMDB release_year 근처)
    let originalCandidates: KobisMovieListItem[] = [];
    if (tmdbYear) {
      const { openStartDt, openEndDt } = buildYmdRangeByYearSpan(
        tmdbYear - 1,
        tmdbYear + 1,
      );
      originalCandidates = await this.searchMovieList({
        movieNm: primaryTitle,
        openStartDt,
        openEndDt,
        itemPerPage: 50,
      });
    } else {
      originalCandidates = await this.searchMovieList({
        movieNm: primaryTitle,
        itemPerPage: 50,
      });
    }

    // fallback (원개봉 후보가 너무 빈약할 때)
    if (!originalCandidates.length) {
      const fallback = await this.searchMovieList({
        movieNm: primaryTitle,
        itemPerPage: 50,
      });
      originalCandidates.push(...fallback);
    }

    const bestOriginal = pickBest(originalCandidates, tmdbYear);
    const originalCd = bestOriginal ? toCleanStr(bestOriginal.movieCd) : '';
    const originalOpenIso = bestOriginal
      ? ymdToIso(toCleanStr(bestOriginal.openDt))
      : null;

    // 2) 재개봉 후보(현재 연도 근처)
    const { openStartDt: rerunStart, openEndDt: rerunEnd } =
      buildYmdRangeByYearSpan(thisYear - 1, thisYear + 1);

    const rerunCandidates = await this.searchMovieList({
      movieNm: primaryTitle,
      openStartDt: rerunStart,
      openEndDt: rerunEnd,
      itemPerPage: 50,
    });

    const bestRerun = pickBest(rerunCandidates, thisYear);
    const rerunCd = bestRerun ? toCleanStr(bestRerun.movieCd) : '';
    const rerunOpenIso = bestRerun
      ? ymdToIso(toCleanStr(bestRerun.openDt))
      : null;

    // 재개봉 후보가 원개봉이랑 완전히 같으면 “재개봉 없음” 취급
    const hasMultiple =
      !!originalOpenIso &&
      !!rerunOpenIso &&
      originalOpenIso !== rerunOpenIso &&
      // 재개봉은 "최근"이어야 의미가 있음(현재연도-1 이상)
      Number(isoToYear(rerunOpenIso) || 0) >= thisYear - 1;

    return {
      kobisMovieCd: originalCd || null,
      kobisOpenDt: originalOpenIso,
      rerunKobisMovieCd: hasMultiple ? rerunCd || null : null,
      rerunOpenDt: hasMultiple ? rerunOpenIso : null,
      hasMultipleTheatrical: hasMultiple,
    };
  }

  /**
   * ✅ 기존 호환 유지: "원개봉" 기준으로만 반환
   * (기존 코드가 이 메서드에 의존)
   */
  async findOpenDtByTmdbDetail(detail: TmdbDetailLike): Promise<KobisMatch> {
    const info = await this.findTheatricalInfoByTmdbDetail(detail);
    return {
      kobisMovieCd: info.kobisMovieCd,
      kobisOpenDt: info.kobisOpenDt,
    };
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
