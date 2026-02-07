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

type KobisMovieInfo = {
  movieNm?: string;
  movieNmEn?: string;
  openDt?: string;
  prdtYear?: string;
};

type KobisMovieInfoResponse = {
  movieInfoResult?: { movieInfo?: KobisMovieInfo };
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

type FrontBoxOfficeItem = {
  mediaType: 'movie';
  tmdbId: number;
  rank: number;
};

type FrontBoxOfficeRawItem = {
  rank: number;
  movieCd: string;
  movieNm: string;
};

type FrontBoxOfficeResponse = {
  targetDt: string; // YYYYMMDD
  generatedAt: string; // ISO
  displayDateLabel: string; // "YYYY년 M월 D일(요일)"
  items: FrontBoxOfficeItem[];
  rawItems: FrontBoxOfficeRawItem[];
};

// ✅ TMDB search/movie 응답 타입
type TmdbSearchMovieResult = {
  id?: number;
  title?: string;
  original_title?: string;
  release_date?: string;
};

type TmdbSearchMovieResponse = {
  results?: TmdbSearchMovieResult[];
};

type ResolveContext = {
  movieCd?: string;
  movieNm?: string;
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

/**
 * ✅ KST 기준 "YYYYMMDD" 생성
 */
function toYmdKST(date: Date): string {
  const KST_OFFSET_MIN = 9 * 60;
  const utc = date.getTime() + date.getTimezoneOffset() * 60_000;
  const kst = new Date(utc + KST_OFFSET_MIN * 60_000);

  const y = String(kst.getFullYear()).padStart(4, '0');
  const m = String(kst.getMonth() + 1).padStart(2, '0');
  const d = String(kst.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function shiftYmd(yyyymmdd: string, days: number): string {
  const s = String(yyyymmdd || '').trim();
  if (!/^\d{8}$/.test(s)) return s;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(4, 6));
  const d = Number(s.slice(6, 8));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = String(dt.getUTCFullYear()).padStart(4, '0');
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
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

/* ===========================
   ✅ (추가) 박스오피스 표시용 날짜 라벨
   - 프론트 계산 금지 규칙 대응
   =========================== */

function weekdayKoreanFromYmd(targetDt: string): string {
  const s = String(targetDt || '').trim();
  if (!/^\d{8}$/.test(s)) return '';
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(4, 6));
  const d = Number(s.slice(6, 8));

  // ✅ KST 기준으로 날짜 고정
  const dt = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) + 9 * 60 * 60 * 1000);
  const w = dt.getUTCDay(); // 0=일
  const map = ['일', '월', '화', '수', '목', '금', '토'];
  return map[w] ?? '';
}

function formatKoreanYmdLabel(targetDt: string): string {
  const s = String(targetDt || '').trim();
  if (!/^\d{8}$/.test(s)) return s;
  const y = s.slice(0, 4);
  const m = String(Number(s.slice(4, 6)));
  const d = String(Number(s.slice(6, 8)));
  const w = weekdayKoreanFromYmd(s);
  return `${y}년 ${m}월 ${d}일(${w})`;
}

@Injectable()
export class KobisService {
  private readonly logger = new Logger(KobisService.name);
  private readonly base =
    'https://www.kobis.or.kr/kobisopenapi/webservice/rest';
  private readonly key: string;

  // ✅ TMDB 검색용
  private readonly tmdbKey: string;
  private readonly tmdbBase = 'https://api.themoviedb.org/3';

  private nowPlayingCache: {
    fetchedAt: number;
    days: number;
    set: Set<string>;
  } | null = null;

  // ✅ 박스오피스(TMDB 매핑) 캐시
  private boxOfficeTop10Cache: {
    fetchedAt: number;
    targetDt: string;
    items: FrontBoxOfficeItem[];
    rawItems: FrontBoxOfficeRawItem[];
  } | null = null;
  private readonly kobisMovieInfoCache = new Map<
    string,
    { fetchedAt: number; info: KobisMovieInfo | null }
  >();

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.key = String(this.config.get('KOBIS_API_KEY') ?? '').trim();
    this.tmdbKey = String(this.config.get('TMDB_API_KEY') ?? '').trim();
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

  private async getTmdbJson<T>(
    path: string,
    params: Record<string, string | number | undefined>,
  ): Promise<T> {
    if (!this.tmdbKey) throw new Error('Missing TMDB_API_KEY');

    const url = new URL(`${this.tmdbBase}${path}`);
    url.searchParams.set('api_key', this.tmdbKey);

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
      const targetDt = toYmdKST(d);

      try {
        const snap = await this.getDailyBoxOffice(targetDt);
        for (const it of snap.items) {
          const cd = toCleanStr(it.movieCd);
          if (cd) set.add(cd);
        }
      } catch {
        // ignore: 일시적인 KOBIS fetch/DB 스냅샷 실패는 nowPlaying 판정에서 무시
      }
    }

    this.nowPlayingCache = { fetchedAt: now, days, set };
    return set;
  }

  /**
   * ✅ 프론트 메인 "박스오피스 TOP 10" 용
   * - KOBIS: 오늘(KST) → 없으면 어제(KST)
   * - TMDB: movieNm로 검색해서 tmdbId 매핑
   * - ✅ displayDateLabel 추가(프론트 계산 금지)
   */
  async getBoxOfficeTop10ForFrontend(): Promise<FrontBoxOfficeResponse> {
    const now = Date.now();
    const OK_TTL = 10 * 60 * 1000; // 10분 캐시

    if (
      this.boxOfficeTop10Cache &&
      now - this.boxOfficeTop10Cache.fetchedAt < OK_TTL
    ) {
      const targetDt = this.boxOfficeTop10Cache.targetDt;
      return {
        targetDt,
        generatedAt: new Date(this.boxOfficeTop10Cache.fetchedAt).toISOString(),
        displayDateLabel: formatKoreanYmdLabel(targetDt),
        items: this.boxOfficeTop10Cache.items,
        rawItems: this.boxOfficeTop10Cache.rawItems,
      };
    }

    const todayKst = toYmdKST(new Date());
    const candidates = Array.from({ length: 8 }, (_, i) => shiftYmd(todayKst, -i));

    let targetDt = todayKst;
    let snap = { targetDt, items: [] as BoxOfficeSnapshotItem[] };

    for (const dt of candidates) {
      const r = await this.getDailyBoxOffice(dt);
      if (Array.isArray(r.items) && r.items.length > 0) {
        targetDt = dt;
        snap = r;
        break;
      }
    }

    const top10 = [...snap.items]
      .filter((x) => x && x.movieNm && x.movieCd)
      .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
      .slice(0, 10);

    const rawItems: FrontBoxOfficeRawItem[] = top10.map((it, idx) => ({
      rank: typeof it.rank === 'number' && it.rank > 0 ? it.rank : idx + 1,
      movieCd: it.movieCd,
      movieNm: it.movieNm,
    }));

    if (!top10.length) {
      this.boxOfficeTop10Cache = { fetchedAt: now, targetDt, items: [], rawItems };
      return {
        targetDt,
        generatedAt: new Date(now).toISOString(),
        displayDateLabel: formatKoreanYmdLabel(targetDt),
        items: [],
        rawItems,
      };
    }

    const resolved: FrontBoxOfficeItem[] = [];
    for (let i = 0; i < top10.length; i += 1) {
      const it = top10[i];
      const rank = typeof it.rank === 'number' && it.rank > 0 ? it.rank : i + 1;

      const tmdbId = await this.resolveTmdbIdByMovieName({
        movieCd: it.movieCd,
        movieNm: it.movieNm,
      });
      if (!tmdbId) continue;

      resolved.push({ mediaType: 'movie', tmdbId, rank });
    }

    resolved.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));

    this.boxOfficeTop10Cache = {
      fetchedAt: now,
      targetDt,
      items: resolved,
      rawItems,
    };

    return {
      targetDt,
      generatedAt: new Date(now).toISOString(),
      displayDateLabel: formatKoreanYmdLabel(targetDt),
      items: resolved,
      rawItems,
    };
  }

  private async fetchKobisMovieInfo(movieCd: string): Promise<KobisMovieInfo | null> {
    const cd = toCleanStr(movieCd);
    if (!cd) return null;

    const now = Date.now();
    const ttl = 12 * 60 * 60 * 1000;
    const cached = this.kobisMovieInfoCache.get(cd);
    if (cached && now - cached.fetchedAt < ttl) return cached.info;

    try {
      const json = await this.getJson<KobisMovieInfoResponse>(
        '/movie/searchMovieInfo.json',
        { movieCd: cd },
      );
      const info = json?.movieInfoResult?.movieInfo ?? null;
      this.kobisMovieInfoCache.set(cd, { fetchedAt: now, info });
      return info;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`[KOBIS] searchMovieInfo failed(${cd}): ${msg}`);
      this.kobisMovieInfoCache.set(cd, { fetchedAt: now, info: null });
      return null;
    }
  }

  private pickBestTmdbId(
    query: string,
    results: TmdbSearchMovieResult[],
    yearHint?: number | null,
  ): number | null {
    if (!results.length) return null;
    const targetNorm = normTitle(query);

    const score = (r: TmdbSearchMovieResult) => {
      const id = typeof r.id === 'number' ? r.id : NaN;
      if (!Number.isFinite(id) || id <= 0) return -1;

      const t1 = normTitle(toCleanStr(r.title));
      const t2 = normTitle(toCleanStr(r.original_title));
      const rd = toCleanStr(r.release_date);
      const y = /^\d{4}/.test(rd) ? Number(rd.slice(0, 4)) : null;

      let s = 0;
      if (t1 && t1 === targetNorm) s += 1000;
      if (t2 && t2 === targetNorm) s += 900;
      if (t1 && targetNorm && (t1.includes(targetNorm) || targetNorm.includes(t1))) {
        s += 350;
      }
      if (t2 && targetNorm && (t2.includes(targetNorm) || targetNorm.includes(t2))) {
        s += 250;
      }
      if (yearHint && y) {
        const dy = Math.abs(y - yearHint);
        if (dy === 0) s += 180;
        else if (dy === 1) s += 90;
        else if (dy === 2) s += 30;
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(rd)) s += 5;

      return s;
    };

    let best: TmdbSearchMovieResult | null = null;
    let bestScore = -1;
    for (const r of results.slice(0, 20)) {
      const sc = score(r);
      if (sc > bestScore) {
        bestScore = sc;
        best = r;
      }
    }

    const id = typeof best?.id === 'number' ? best.id : null;
    return id && id > 0 ? id : null;
  }

  private async resolveTmdbIdByMovieName(
    ctx: ResolveContext,
  ): Promise<number | null> {
    const q = toCleanStr(ctx.movieNm);
    if (!q) return null;

    if (!this.tmdbKey) {
      this.logger.warn('[TMDB] Missing TMDB_API_KEY (cannot map boxoffice)');
      return null;
    }

    const info = ctx.movieCd ? await this.fetchKobisMovieInfo(ctx.movieCd) : null;
    const infoKo = toCleanStr(info?.movieNm);
    const infoEn = toCleanStr(info?.movieNmEn);
    const openIso = ymdToIso(toCleanStr(info?.openDt)) ?? null;
    const yearHint = openIso
      ? Number(openIso.slice(0, 4))
      : /^\d{4}$/.test(toCleanStr(info?.prdtYear))
        ? Number(toCleanStr(info?.prdtYear))
        : null;

    const queries = Array.from(
      new Set(
        [q, infoKo, infoEn]
          .map((x) => toCleanStr(x))
          .filter((x) => x.length > 0),
      ),
    );

    const candidates: Array<Record<string, string | number | undefined>> = [];
    for (const query of queries) {
      candidates.push({
        query,
        language: 'ko-KR',
        region: 'KR',
        include_adult: 'false',
        page: 1,
        ...(yearHint ? { year: yearHint } : {}),
      });
      candidates.push({
        query,
        language: 'ko-KR',
        include_adult: 'false',
        page: 1,
        ...(yearHint ? { year: yearHint } : {}),
      });
      candidates.push({
        query,
        language: 'en-US',
        include_adult: 'false',
        page: 1,
        ...(yearHint ? { year: yearHint } : {}),
      });
    }

    try {
      for (const params of candidates) {
        const query = toCleanStr(params.query);
        if (!query) continue;

        const json = await this.getTmdbJson<TmdbSearchMovieResponse>(
          '/search/movie',
          params,
        );

        const results: TmdbSearchMovieResult[] = Array.isArray(json?.results)
          ? json.results
          : [];

        const id = this.pickBestTmdbId(query, results, yearHint);
        if (id) {
          return id;
        }
      }
      return null;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(
        `[TMDB] search/movie failed(${q}${ctx.movieCd ? `, ${ctx.movieCd}` : ''}): ${msg}`,
      );
      return null;
    }
  }

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
        ) {
          s += 350;
        }
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

    const hasMultiple =
      !!originalOpenIso &&
      !!rerunOpenIso &&
      originalOpenIso !== rerunOpenIso &&
      Number(isoToYear(rerunOpenIso) || 0) >= thisYear - 1;

    return {
      kobisMovieCd: originalCd || null,
      kobisOpenDt: originalOpenIso,
      rerunKobisMovieCd: hasMultiple ? rerunCd || null : null,
      rerunOpenDt: hasMultiple ? rerunOpenIso : null,
      hasMultipleTheatrical: hasMultiple,
    };
  }

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
      const parsed = parseBoxOfficeItems(existing.items);
      if (parsed.length > 0) return { targetDt: t, items: parsed };

      // 과거 일시 장애로 빈 스냅샷이 저장된 경우 재조회해서 복구
      const fetched = await this.fetchDailyBoxOffice(t);
      if (fetched.length > 0) {
        await this.prisma.kobisBoxOfficeSnapshot.update({
          where: { targetDt: t },
          data: { items: fetched, fetchedAt: new Date() },
        });
        return { targetDt: t, items: fetched };
      }

      return { targetDt: t, items: [] };
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
    const targetDt = toYmdKST(d);
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
