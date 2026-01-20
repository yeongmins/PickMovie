// frontend/src/components/detail/DetailSections.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronRight, ExternalLink } from "lucide-react";

import { apiGet } from "../../lib/apiClient";
import { getPosterUrl } from "../../lib/tmdb";
import type {
  DetailBase,
  MediaType,
} from "../../pages/detail/contentDetail.data";

import cgvLogo from "../../assets/logo/cgv_logo.svg";
import lotteLogo from "../../assets/logo/lotte_logo.svg";
import megaboxLogo from "../../assets/logo/megabox_logo.svg";
import { SeriesSeasonCards } from "../../pages/detail/SeriesSeasonCards";

import {
  peekResolvedMeta,
  requestResolvedMeta,
  type ResolvedMeta,
} from "../../lib/metaClient";

type ReleaseStatusKind = "now" | "upcoming" | "rerun" | null;

type SeasonNavContext = {
  seasonNo: number;
  name?: string;
  poster_path?: string | null;
  air_date?: string | null;
  overview?: string | null;
  vote_average?: number | null;
  year?: number | null;
};

type TmdbCreditPerson = {
  id: number;
  name?: string;
  character?: string;
  profile_path?: string | null;
  order?: number;
};

type TmdbCreditsResponse = {
  cast?: TmdbCreditPerson[];
};

type TmdbReviewItem = {
  id: string;
  author?: string;
  content?: string;
  created_at?: string;
  updated_at?: string;
  url?: string;
  author_details?: { rating?: number | null };
};

type TmdbReviewsResponse = {
  results?: TmdbReviewItem[];
};

function safeText(v: unknown) {
  return typeof v === "string" ? v.trim() : String(v ?? "").trim();
}

function toStatusKind(v: unknown): ReleaseStatusKind {
  if (v === "now" || v === "upcoming" || v === "rerun") return v;
  return null;
}

function formatKoreanDate(ymd?: string) {
  const raw = String(ymd || "").trim();
  if (!raw) return "";
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) return raw;
  const d = new Date(t);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function providerOutboundUrl(provider: any, title: string) {
  const nameRaw = safeText(provider?.provider_name);
  const name = nameRaw.toLowerCase();
  const q = encodeURIComponent(title || "");

  if (name.includes("netflix")) return `https://www.netflix.com/search?q=${q}`;
  if (name.includes("disney")) return `https://www.disneyplus.com/search/${q}`;
  if (name.includes("prime"))
    return `https://www.primevideo.com/search?phrase=${q}`;
  if (name.includes("apple") || name.includes("itunes"))
    return `https://tv.apple.com/search?term=${q}`;
  if (name.includes("youtube"))
    return `https://www.youtube.com/results?search_query=${q}`;
  if (name.includes("google play"))
    return `https://play.google.com/store/search?q=${q}&c=movies`;
  if (name.includes("watcha")) return `https://watcha.com/search?query=${q}`;

  if (name.includes("wavve")) return "https://www.wavve.com/";
  if (name.includes("tving")) return "https://www.tving.com/";
  if (name.includes("coupang")) return "https://www.coupangplay.com/";
  if (name.includes("seezn")) return "https://www.seezn.com/";
  if (name.includes("u+")) return "https://www.uplusmobiletv.com/";

  return "";
}

function getSeasonNoFromSearch(search: string): number {
  try {
    const sp = new URLSearchParams(search);
    const raw = sp.get("season");
    const n = Number(raw);
    if (!Number.isFinite(n)) return 0;
    const v = Math.floor(n);
    return v > 0 ? v : 0;
  } catch {
    return 0;
  }
}

function Section({
  title,
  right,
  children,
  noTopMargin,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  noTopMargin?: boolean;
}) {
  return (
    <section className={noTopMargin ? "" : "mt-10"}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-white/90 font-extrabold text-[16px]">{title}</h3>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>

      <div className="border-t border-white/10 pt-4">{children}</div>
    </section>
  );
}

export function DetailSections({
  detail,
  mediaType,
  loading,
  statusKindOverride,
}: {
  detail: DetailBase | null;
  mediaType: MediaType;
  loading?: boolean;
  statusKindOverride?: ReleaseStatusKind | null;
}) {
  const navigate = useNavigate();
  const location = useLocation();

  const [cast, setCast] = useState<TmdbCreditPerson[]>([]);
  const [reviews, setReviews] = useState<TmdbReviewItem[]>([]);

  const detailId = Number((detail as any)?.id ?? 0);

  // ✅ 시즌 선택 정보(기존 UI 유지용: season cards 노출/내비게이션)
  const seasonNo = useMemo(() => {
    if (mediaType !== "tv") return 0;
    return getSeasonNoFromSearch(location.search);
  }, [mediaType, location.search]);

  const seasonContext = useMemo(() => {
    const st = location.state as any;
    return (st?.seasonContext as SeasonNavContext | undefined) ?? undefined;
  }, [location.state]);

  // ✅ TV/Ani: 시즌 선택으로 detail이 바뀌어도 "첫 방영일(최초)"은 고정(기존 UI 안정화)
  const originalDateRef = useRef<{
    id: number;
    tvFirstAir: string;
    movieRelease: string;
  }>({ id: 0, tvFirstAir: "", movieRelease: "" });

  useEffect(() => {
    if (!detailId || !detail) return;
    const d: any = detail;

    if (originalDateRef.current.id !== detailId) {
      originalDateRef.current = {
        id: detailId,
        tvFirstAir: safeText(d?.first_air_date),
        movieRelease: safeText(d?.release_date),
      };
    }
  }, [detailId, detail]);

  // ✅ meta 단일 소스(여기서만 fetch)
  const [meta, setMeta] = useState<ResolvedMeta | null>(() => {
    if (!detailId) return null;
    return peekResolvedMeta(mediaType as any, detailId) ?? null;
  });

  useEffect(() => {
    let alive = true;

    if (!detailId) {
      setMeta(null);
      return () => void (alive = false);
    }

    const cached = peekResolvedMeta(mediaType as any, detailId) ?? null;
    if (cached) setMeta(cached);

    requestResolvedMeta(mediaType as any, detailId)
      .then((m) => {
        if (!alive) return;
        setMeta(m ?? null);
      })
      .catch(() => {
        if (!alive) return;
        setMeta((prev) => prev ?? null);
      });

    return () => void (alive = false);
  }, [mediaType, detailId]);

  const contentTitle = useMemo(() => {
    const d: any = detail;
    return (
      safeText(d?.title) ||
      safeText(d?.name) ||
      safeText(d?.original_title) ||
      safeText(d?.original_name)
    );
  }, [detail]);

  const statusKind: ReleaseStatusKind = useMemo(() => {
    const o = toStatusKind(statusKindOverride);
    if (o) return o;
    const m = toStatusKind(meta?.statusKind);
    if (m) return m;
    return null;
  }, [statusKindOverride, meta?.statusKind]);

  const theatrical = meta?.theatrical ?? null;

  // ✅ providers는 meta.providers만 사용
  const providerItems = useMemo(() => {
    const list = meta?.providers;
    return Array.isArray(list) ? list.slice(0, 12) : [];
  }, [meta?.providers]);

  const hasProviders = providerItems.length > 0;

  useEffect(() => {
    let alive = true;

    setCast([]);
    setReviews([]);

    if (!detailId) return;

    void apiGet<TmdbCreditsResponse>(
      `/tmdb/proxy/${mediaType}/${detailId}/credits`,
      { language: "ko-KR" },
    )
      .then((r) => {
        if (!alive) return;
        const list = Array.isArray(r?.cast) ? r.cast : [];
        const top = list
          .filter((p) => typeof p?.id === "number")
          .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
          .slice(0, 18);
        setCast(top);
      })
      .catch(() => {
        if (!alive) return;
        setCast([]);
      });

    void apiGet<TmdbReviewsResponse>(
      `/tmdb/proxy/${mediaType}/${detailId}/reviews`,
      { language: "ko-KR", page: 1 },
    )
      .then((r) => {
        if (!alive) return;
        const list = Array.isArray(r?.results) ? r.results : [];
        setReviews(list.slice(0, 4));
      })
      .catch(() => {
        if (!alive) return;
        setReviews([]);
      });

    return () => void (alive = false);
  }, [detailId, mediaType]);

  // ✅ 재개봉이어도 providers가 있으면 OTT 섹션은 무조건 표시(요구사항)
  const showOttSection = hasProviders;

  // ✅ 영화관 섹션은 기존 유지(상영중/재개봉이면 표시)
  const showTheaterSection =
    mediaType === "movie" && (statusKind === "now" || statusKind === "rerun");

  // ✅ (핵심) 배우 모달을 "상세 위"로 올리기 위한 라우팅 state 구성
  const openPersonModal = (personId: number) => {
    const st = location.state as any;
    const root = st?.rootLocation ?? st?.backgroundLocation ?? null;

    navigate(`/person/${personId}`, {
      state: {
        // ✅ background는 항상 메인(루트)로 유지
        backgroundLocation: root,
        rootLocation: root,

        // ✅ 배우 모달 아래에 깔아둘 상세 모달 location(스택)
        titleStack: {
          pathname: location.pathname,
          search: location.search,
          hash: location.hash,
          state: {
            ...(st ?? {}),
            __underlay: "person", // ✅ ContentDetailModal이 underlay로 backdrop 투명 처리
          },
        },
      },
    });
  };

  const infoRows = useMemo(() => {
    if (!detail) return [];
    const d: any = detail;

    const original = safeText(
      mediaType === "tv" ? d?.original_name : d?.original_title,
    );

    // ✅ TV/Ani: 시즌 선택으로 first_air_date가 바뀌어도 최초값 유지(기존 UI 안정화)
    const tvBaseDateFixed =
      originalDateRef.current.id === detailId
        ? originalDateRef.current.tvFirstAir
        : "";
    const movieBaseDateFixed =
      originalDateRef.current.id === detailId
        ? originalDateRef.current.movieRelease
        : "";
    void movieBaseDateFixed;

    // ✅ (중요) 영화 개봉/재개봉일 표시는 meta.theatrical 값을 그대로 사용
    const movieOpenDate = safeText(theatrical?.originalTheatricalDate);
    const movieRerunDate = safeText(theatrical?.rerunTheatricalDate);

    // ✅ TV는 TMDB 원본(기존 유지)
    const tvOpenDate = tvBaseDateFixed || safeText(d?.first_air_date);

    const runtime =
      mediaType === "tv"
        ? (() => {
            const v = Array.isArray(d?.episode_run_time)
              ? d.episode_run_time[0]
              : undefined;
            return typeof v === "number" && v > 0 ? `${v}분` : "";
          })()
        : typeof d?.runtime === "number" && d.runtime > 0
          ? `${d.runtime}분`
          : "";

    // ✅ 출시년도: meta.unifiedYearLabel 그대로 (프론트 계산/시즌 오버라이드 금지)
    const yearLabel = safeText(meta?.unifiedYearLabel);
    const yearTextRow = yearLabel ? `${yearLabel}년` : "";

    const genres = Array.isArray(d?.genres)
      ? d.genres
          .map((g: any) => safeText(g?.name))
          .filter(Boolean)
          .join(", ")
      : "";

    const countries =
      mediaType === "tv"
        ? Array.isArray(d?.origin_country)
          ? d.origin_country.filter(Boolean).join(", ")
          : ""
        : Array.isArray(d?.production_countries)
          ? d.production_countries
              .map((c: any) => safeText(c?.name) || safeText(c?.iso_3166_1))
              .filter(Boolean)
              .join(", ")
          : "";

    const status = safeText(d?.status);

    const seasons =
      mediaType === "tv" && typeof d?.number_of_seasons === "number"
        ? `${d.number_of_seasons}시즌`
        : "";
    const episodes =
      mediaType === "tv" && typeof d?.number_of_episodes === "number"
        ? `${d.number_of_episodes}화`
        : "";

    const rows: Array<{ k: string; v: string } | null> = [
      original ? { k: "원제", v: original } : null,

      mediaType === "movie"
        ? movieOpenDate
          ? { k: "개봉일", v: formatKoreanDate(movieOpenDate) }
          : null
        : tvOpenDate
          ? { k: "개봉일", v: formatKoreanDate(tvOpenDate) }
          : null,

      mediaType === "movie" && movieRerunDate
        ? { k: "재개봉일", v: formatKoreanDate(movieRerunDate) }
        : null,

      runtime ? { k: "러닝타임", v: runtime } : null,
      yearTextRow ? { k: "출시년도", v: yearTextRow } : null,
      genres ? { k: "장르", v: genres } : null,
      countries ? { k: "제작국가", v: countries } : null,
      status ? { k: "상태", v: status } : null,
      seasons ? { k: "시즌", v: seasons } : null,
      episodes ? { k: "에피소드", v: episodes } : null,
    ];

    return rows.filter(Boolean) as Array<{ k: string; v: string }>;
  }, [detail, detailId, mediaType, meta?.unifiedYearLabel, theatrical]);

  if (loading && !detail) {
    return (
      <div className="px-4 sm:px-8 pb-10">
        <div className="mt-8 h-[160px] bg-white/5 animate-pulse rounded-2xl" />
        <div className="mt-8 h-[140px] bg-white/5 animate-pulse rounded-2xl" />
      </div>
    );
  }

  if (!detail) return null;

  return (
    <div className="px-4 sm:px-8 pb-12">
      <Section title="줄거리 / 컨텐츠 정보" noTopMargin>
        <div className="grid grid-cols-1 md:grid-cols-[1.2fr_0.8fr] gap-8">
          <div>
            <div className="text-white/90 font-extrabold text-[14px] mb-2">
              줄거리
            </div>
            <p className="text-[13px] sm:text-[14px] leading-relaxed text-white/70">
              {safeText((detail as any)?.overview) || "줄거리 정보가 없습니다."}
            </p>
          </div>

          <div className="md:pl-2">
            <div className="text-white/90 font-extrabold text-[14px] mb-2">
              컨텐츠 정보
            </div>

            <div className="space-y-3">
              {infoRows.map((row) => (
                <div
                  key={row.k}
                  className="grid grid-cols-[96px_1fr] gap-4 items-start"
                >
                  <div className="text-white/45 text-[12px] font-semibold">
                    {row.k}
                  </div>
                  <div className="text-white/85 text-[13px] font-bold">
                    {row.v}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section
        title="주요 출연진"
        right={
          <span className="text-white/35 text-[12px] font-semibold">
            배우페이지 이동
          </span>
        }
      >
        {cast.length ? (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {cast.map((p) => {
              const name = safeText(p?.name);
              const role = safeText(p?.character);
              const img = p?.profile_path
                ? getPosterUrl(p.profile_path, "w185")
                : null;

              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => openPersonModal(p.id)}
                  className="group shrink-0 text-left w-[118px] sm:w-[126px]"
                  title={name}
                >
                  <div className="rounded-xl bg-white/[0.03] overflow-hidden">
                    <div className="aspect-[3/4] bg-black/30">
                      {img ? (
                        <img
                          src={img}
                          alt={name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-b from-white/10 to-transparent" />
                      )}
                    </div>

                    <div className="p-2.5">
                      <div className="text-white/90 font-extrabold text-[12px] line-clamp-1">
                        {name || "이름 없음"}
                      </div>
                      <div className="mt-1 text-white/50 text-[11px] font-semibold line-clamp-1">
                        {role || "\u00A0"}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="text-white/45 text-[13px] font-semibold py-2">
            출연진 정보가 없습니다.
          </div>
        )}
      </Section>

      {mediaType === "tv" && (detail as any)?.seasons?.length ? (
        <SeriesSeasonCards
          tvId={(detail as any).id}
          tvTitle={(detail as any).name || ""}
          seasons={(detail as any).seasons}
        />
      ) : null}

      {showOttSection ? (
        <Section
          title="시청 가능 OTT"
          right={
            <span className="text-white/35 text-[12px] font-semibold">
              실제 정보와 다를 수 있습니다.
            </span>
          }
        >
          {providerItems.length ? (
            <div className="flex flex-wrap gap-2.5">
              {providerItems.map((p: any) => {
                const name = safeText(p?.provider_name);
                const logo = safeText(p?.logo_path);
                const src = logo ? `https://image.tmdb.org/t/p/w92${logo}` : "";

                const href = providerOutboundUrl(p, contentTitle);

                return href ? (
                  <a
                    key={String(p?.provider_id ?? name)}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-black/20 border border-white/10 hover:bg-black/30"
                    title={`${name}로 이동`}
                  >
                    <div className="w-7 h-7 rounded-lg bg-black/25 overflow-hidden flex items-center justify-center">
                      {src ? (
                        <img
                          src={src}
                          alt={name}
                          className="w-full h-full object-contain"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <div className="w-full h-full bg-white/10" />
                      )}
                    </div>
                    <div className="text-white/85 text-[13px] font-bold">
                      {name}
                    </div>
                    <ExternalLink className="w-4 h-4 text-white/35" />
                  </a>
                ) : (
                  <div
                    key={String(p?.provider_id ?? name)}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-black/20 border border-white/10"
                    title="이 OTT는 바로가기를 지원하지 않아요"
                  >
                    <div className="w-7 h-7 rounded-lg bg-black/25 overflow-hidden flex items-center justify-center">
                      {src ? (
                        <img
                          src={src}
                          alt={name}
                          className="w-full h-full object-contain"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <div className="w-full h-full bg-white/10" />
                      )}
                    </div>
                    <div className="text-white/85 text-[13px] font-bold">
                      {name}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-white/45 text-[13px] font-semibold py-2">
              현재 스트리밍 정보가 없습니다.
            </div>
          )}

          <div className="mt-2 text-white/35 text-[11px] font-semibold">
            출처: TMDB Watch Providers (KR)
          </div>
        </Section>
      ) : null}

      {showTheaterSection ? (
        <Section
          title="영화관 예매"
          right={
            <span className="text-white/35 text-[12px] font-semibold">
              아래 버튼을 눌러 예매가 가능한지 확인해보세요.
            </span>
          }
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              {
                label: "CGV",
                href: "https://cgv.co.kr/cnm/movieBook",
                logo: cgvLogo,
              },
              {
                label: "롯데시네마",
                href: "https://www.lottecinema.co.kr/NLCHS/Ticketing",
                logo: lotteLogo,
              },
              {
                label: "메가박스",
                href: "https://www.megabox.co.kr/booking",
                logo: megaboxLogo,
              },
            ].map((b) => (
              <a
                key={b.label}
                href={b.href}
                target="_blank"
                rel="noreferrer"
                aria-label={`${b.label} 예매`}
                title={`${b.label} 예매`}
                className="flex items-center justify-center rounded-2xl bg-white/5  px-4 py-4 hover:bg-white/[0.05]"
              >
                <img
                  src={b.logo}
                  alt=""
                  className="h-7 w-auto object-contain"
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                />
              </a>
            ))}
          </div>
        </Section>
      ) : null}

      <Section title="평점/리뷰">
        {reviews.length ? (
          <div className="space-y-3">
            {reviews.map((r) => {
              const author = safeText(r?.author) || "익명";
              const content = safeText(r?.content);
              const date = safeText(r?.updated_at || r?.created_at);
              const rating = r?.author_details?.rating;

              return (
                <div
                  key={r.id}
                  className="rounded-2xl bg-black/15 border border-white/10 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-white/85 font-extrabold text-[13px]">
                      {author}
                    </div>
                    <div className="flex items-center gap-2 text-[12px] font-bold text-white/45">
                      {typeof rating === "number" ? (
                        <span className="text-white/70">★ {rating}</span>
                      ) : null}
                      {date ? <span>{date.slice(0, 10)}</span> : null}
                    </div>
                  </div>
                  <p className="mt-2 text-white/70 text-[13px] leading-relaxed line-clamp-4">
                    {content || "리뷰 내용이 없습니다."}
                  </p>

                  {r?.url ? (
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-[12px] font-bold text-white/55 hover:text-white/85"
                    >
                      원문 보기 <ChevronRight className="w-4 h-4" />
                    </a>
                  ) : null}
                </div>
              );
            })}
            <div className="text-white/35 text-[11px] font-semibold">
              출처: TMDB
            </div>
          </div>
        ) : (
          <div className="text-white/45 text-[13px] font-semibold py-2">
            외부 평점/리뷰 정보가 없습니다. (출처: TMDB)
          </div>
        )}
      </Section>
    </div>
  );
}

export default DetailSections;
