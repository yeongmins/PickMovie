// backend/src/kobis/kobis.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

type KobisMovieListItem = {
  movieCd?: string;
  movieNm?: string;
  movieNmEn?: string;
  openDt?: string; // "YYYYMMDD" or sometimes ""
  prdtYear?: string;
  typeNm?: string;
  prdtStatNm?: string;
};

type KobisSearchMovieListResponse = {
  movieListResult?: {
    movieList?: KobisMovieListItem[];
  };
};

type KobisDailyBoxOfficeItem = {
  movieCd?: string;
  movieNm?: string;
};

type KobisDailyBoxOfficeResponse = {
  boxOfficeResult?: {
    dailyBoxOfficeList?: KobisDailyBoxOfficeItem[];
  };
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
  release_date?: unknown; // "YYYY-MM-DD"
};

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
  // 불필요 escape/regex 경고 피하려고 unicode 기반으로 정리
  // 문자/숫자만 남기고 소문자
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

@Injectable()
export class KobisService {
  private readonly logger = new Logger(KobisService.name);

  private readonly base =
    'https://www.kobis.or.kr/kobisopenapi/webservice/rest';
  private readonly key: string;

  // ✅ 단순 캐시(상영중 판정용: 최근 박스오피스 movieCd set)
  private nowPlayingCache: {
    fetchedAt: number;
    days: number;
    set: Set<string>;
  } | null = null;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {
    this.key = String(this.config.get('KOBIS_API_KEY') ?? '').trim();
  }

  private async getJson<T>(
    path: string,
    params: Record<string, string | number | undefined>,
  ): Promise<T> {
    if (!this.key) {
      throw new Error('Missing KOBIS_API_KEY');
    }

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
    openStartDt?: string; // "YYYYMMDD"
    openEndDt?: string; // "YYYYMMDD"
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
      if (process.env.NODE_ENV !== 'production') {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.warn(`[KOBIS] searchMovieList failed: ${msg}`);
      }
      return [];
    }
  }

  /**
   * ✅ "상영중" 현실 판정용(합집합용):
   * - KOBIS는 '상영중' boolean을 직접 주진 않음
   * - 대신 "최근 N일 박스오피스에 등장" => 극장 상영중으로 판단 (현실적으로 가장 안전)
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

    const toYmd = (d: Date) => {
      const y = String(d.getFullYear()).padStart(4, '0');
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const da = String(d.getDate()).padStart(2, '0');
      return `${y}${m}${da}`;
    };

    for (let i = 0; i < days; i += 1) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const targetDt = toYmd(d);

      try {
        const json = await this.getJson<KobisDailyBoxOfficeResponse>(
          '/boxoffice/searchDailyBoxOfficeList.json',
          {
            targetDt,
          },
        );

        const list = json.boxOfficeResult?.dailyBoxOfficeList;
        if (!Array.isArray(list)) continue;

        for (const it of list) {
          const cd = toCleanStr(it?.movieCd);
          if (cd) set.add(cd);
        }
      } catch {
        // 하루 실패는 무시 (전체를 죽이면 오탐/누락이 커짐)
      }
    }

    this.nowPlayingCache = { fetchedAt: now, days, set };
    return set;
  }

  /**
   * ✅ TMDB detail(제목/개봉일) 기반으로 KOBIS movieCd/openDt 매칭
   * - 반환 openDt는 "YYYY-MM-DD"로 통일
   */
  async findOpenDtByTmdbDetail(detail: TmdbDetailLike): Promise<KobisMatch> {
    const titlePool = [
      toCleanStr(detail.title),
      toCleanStr(detail.original_title),
      toCleanStr(detail.name),
      toCleanStr(detail.original_name),
    ].filter(Boolean);

    const releaseIso = toCleanStr(detail.release_date); // "YYYY-MM-DD"
    const releaseYear = isoToYear(releaseIso);

    if (!titlePool.length) {
      return { kobisMovieCd: null, kobisOpenDt: null };
    }

    // 1) 가장 “짧고 일반적인” 제목부터 검색(오탐 줄이기)
    const primaryTitle =
      [...titlePool].sort((a, b) => a.length - b.length)[0] ?? '';

    // 2) 개봉연도 +-1 범위로 openStart/openEnd를 걸어주면 매칭률이 확 좋아짐
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
      // 연도 필터가 너무 빡셀 수 있어서 한 번 더(필터 없이)
      const fallback = await this.searchMovieList({
        movieNm: primaryTitle,
        itemPerPage: 50,
      });
      candidates.push(...fallback);
    }

    // 3) 타이틀 유사도(정규화) + 개봉연도 근접으로 best pick
    const tmdbNorms = titlePool.map(normTitle);
    const score = (it: KobisMovieListItem) => {
      const nm = normTitle(toCleanStr(it.movieNm));
      const en = normTitle(toCleanStr(it.movieNmEn));
      const openIso = ymdToIso(toCleanStr(it.openDt)) ?? '';
      const openYear = isoToYear(openIso);

      let s = 0;
      // 타이틀 포함/일치 점수
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

      // 연도 근접
      if (yr && /^\d{4}$/.test(openYear)) {
        const dy = Math.abs(Number(openYear) - yr);
        if (dy === 0) s += 120;
        else if (dy === 1) s += 60;
        else if (dy === 2) s += 20;
      }

      // openDt 존재 가산
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

    return {
      kobisMovieCd: kobisMovieCd || null,
      kobisOpenDt: kobisOpenDtIso,
    };
  }
}
