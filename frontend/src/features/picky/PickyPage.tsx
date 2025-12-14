// frontend/src/features/picky/PickyPage.tsx

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  lazy,
  Suspense,
} from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUp, User, Star, X, Sparkles, RefreshCcw } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { apiGet } from "../../lib/apiClient";
import { getPosterUrl, discoverMovies, type TMDBMovie } from "../../lib/tmdb";
import type { FavoriteItem } from "../../App";
import type { UserPreferences } from "../onboarding/Onboarding";
import type { ModalMovie } from "../movies/components/MovieDetailModal";

const MovieDetailModal = lazy(() =>
  import("../movies/components/MovieDetailModal").then((m) => ({
    default: m.MovieDetailModal,
  }))
);

// ===== Storage =====
const PLAYLIST_STORAGE_KEY = "pickmovie_playlists_v1";
const PREF_STORAGE_KEY = "pickmovie_preferences";

// ===== Types =====
type MediaType = "movie" | "tv";

type ProviderBadge = {
  provider_name: string;
  logo_path?: string | null;
};

type PlaylistItem = { key: string; addedAt: number };

type Playlist = {
  id: string;
  name: string;
  items: PlaylistItem[];
  createdAt: number;
  updatedAt: number;
};

interface AiSearchResponse {
  genres?: number[];
  keywords?: string[];
  mood?: string;
  mediaTypes?: MediaType[];
  yearFrom?: number;
  yearTo?: number;
  originalLanguage?: string;
}

type ResultItem = TMDBMovie & {
  media_type: MediaType;
  matchScore: number;
  providers?: ProviderBadge[];
  isNowPlaying?: boolean;
  ageRating?: string; // ✅ 연령 등급
};

function safeNum(v: unknown, fallback = 0) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function readUserPreferences(): UserPreferences {
  try {
    const raw = localStorage.getItem(PREF_STORAGE_KEY);
    if (!raw) {
      return {
        genres: [],
        moods: [],
        runtime: "",
        releaseYear: "",
        country: "",
        excludes: [],
      };
    }
    const parsed = JSON.parse(raw);
    return {
      genres: Array.isArray(parsed.genres) ? parsed.genres : [],
      moods: Array.isArray(parsed.moods) ? parsed.moods : [],
      runtime: parsed.runtime || "",
      releaseYear: parsed.releaseYear || "",
      country: parsed.country || "",
      excludes: Array.isArray(parsed.excludes) ? parsed.excludes : [],
    };
  } catch {
    return {
      genres: [],
      moods: [],
      runtime: "",
      releaseYear: "",
      country: "",
      excludes: [],
    };
  }
}

function loadPlaylists(): Playlist[] {
  try {
    const raw = localStorage.getItem(PLAYLIST_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (p) => p && typeof p.id === "string" && typeof p.name === "string"
      )
      .map((p) => ({
        id: p.id,
        name: p.name,
        items: Array.isArray(p.items) ? p.items : [],
        createdAt: safeNum(p.createdAt, Date.now()),
        updatedAt: safeNum(p.updatedAt, Date.now()),
      })) as Playlist[];
  } catch {
    return [];
  }
}

function savePlaylists(list: Playlist[]) {
  localStorage.setItem(PLAYLIST_STORAGE_KEY, JSON.stringify(list));
}

function uniq(arr: string[]) {
  return Array.from(new Set(arr));
}

function extractTagsFromQuery(q: string) {
  const stop = new Set([
    "추천",
    "영화",
    "드라마",
    "애니",
    "애니메이션",
    "시리즈",
    "보고",
    "싶어",
    "싶은",
    "좀",
    "진짜",
    "그냥",
    "완전",
    "느낌",
    "감성",
    "최신",
    "요즘",
    "한국",
    "일본",
  ]);
  const cleaned = q
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean)
    .filter((w) => w.length >= 2 && !stop.has(w));
  return uniq(cleaned).slice(0, 8);
}

function inferMediaTypes(q: string): MediaType[] {
  const lower = q.toLowerCase();
  const wantsTv = /드라마|시리즈|tv|티비|예능/.test(lower);
  const wantsMovie = /영화|movie|극장|상영/.test(lower);
  if (wantsTv && wantsMovie) return ["movie", "tv"];
  if (wantsTv) return ["tv"];
  if (wantsMovie) return ["movie"];
  return ["movie", "tv"];
}

function inferYearRange(q: string): { from?: number; to?: number } {
  const decade = q.match(/(19|20)\d0년대/);
  if (decade) {
    const base = Number(decade[0].slice(0, 4));
    return { from: base, to: base + 9 };
  }
  const year = q.match(/(19|20)\d{2}년/);
  if (year) {
    const y = Number(year[0].slice(0, 4));
    return { from: y, to: y };
  }
  return {};
}

function isMostlyAscii(arr: string[]) {
  if (!arr.length) return false;
  const asciiCount = arr.reduce(
    (acc, s) => acc + (/^[\x00-\x7F]+$/.test(s) ? 1 : 0),
    0
  );
  return asciiCount / arr.length >= 0.8;
}

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ===== TMDB Meta (providers + age rating) =====
const TMDB_API_KEY = (import.meta as any)?.env?.VITE_TMDB_API_KEY as
  | string
  | undefined;
const TMDB_BASE = (import.meta as any)?.env?.VITE_TMDB_BASE_URL as
  | string
  | undefined;
const TMDB_API_BASE = TMDB_BASE || "https://api.themoviedb.org/3";
const TMDB_PROVIDER_LOGO = "https://image.tmdb.org/t/p/w45";

async function fetchWatchProviders(
  mediaType: MediaType,
  id: number
): Promise<ProviderBadge[]> {
  if (!TMDB_API_KEY) return [];
  const url = new URL(`${TMDB_API_BASE}/${mediaType}/${id}/watch/providers`);
  url.searchParams.set("api_key", TMDB_API_KEY);

  const res = await fetch(url.toString());
  if (!res.ok) return [];
  const json = await res.json();

  const kr = json?.results?.KR;
  if (!kr) return [];

  const list: ProviderBadge[] = [
    ...(kr.flatrate || []),
    ...(kr.rent || []),
    ...(kr.buy || []),
  ];

  const seen = new Set<string>();
  const uniqList = list.filter((p: ProviderBadge) => {
    const key = p.provider_name;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return uniqList.slice(0, 4);
}

// ✅ 연령등급 가져오기
async function fetchAgeRating(
  mediaType: MediaType,
  id: number
): Promise<string | undefined> {
  if (!TMDB_API_KEY) return undefined;

  try {
    if (mediaType === "movie") {
      const url = new URL(`${TMDB_API_BASE}/movie/${id}/release_dates`);
      url.searchParams.set("api_key", TMDB_API_KEY);
      const res = await fetch(url.toString());
      if (!res.ok) return undefined;
      const json = await res.json();

      const kr = (json?.results || []).find((r: any) => r?.iso_3166_1 === "KR");
      const releases = kr?.release_dates || [];
      const cert = releases
        .map((x: any) => (x?.certification || "").trim())
        .find((c: string) => c.length > 0);

      return normalizeAgeRating(cert);
    }

    // tv
    const url = new URL(`${TMDB_API_BASE}/tv/${id}/content_ratings`);
    url.searchParams.set("api_key", TMDB_API_KEY);
    const res = await fetch(url.toString());
    if (!res.ok) return undefined;
    const json = await res.json();

    const kr = (json?.results || []).find((r: any) => r?.iso_3166_1 === "KR");
    const rating = (kr?.rating || "").trim();
    return normalizeAgeRating(rating);
  } catch {
    return undefined;
  }
}

// ✅ "전체/12/15/18"만 남기기
function normalizeAgeRating(raw?: string): string | undefined {
  const r = (raw || "").toUpperCase().trim();
  if (!r) return undefined;

  // 숫자면 그대로 정규화
  const n = parseInt(r.replace(/[^\d]/g, ""), 10);
  if (Number.isFinite(n)) {
    if (n >= 18) return "18";
    if (n >= 15) return "15";
    if (n >= 12) return "12";
    return "ALL";
  }

  // 영미권 표기 대응(대충 안전측)
  if (r === "R" || r === "NC-17") return "18";
  if (r === "PG-13") return "12";
  if (r === "PG" || r === "G") return "ALL";

  return undefined;
}

function computeNowPlayingBadge(item: TMDBMovie, mediaType: MediaType) {
  if (mediaType !== "movie") return false;
  const d = item.release_date ? new Date(item.release_date) : null;
  if (!d || isNaN(d.getTime())) return false;
  const diff = Date.now() - d.getTime();
  const days = diff / (1000 * 60 * 60 * 24);
  return days >= 0 && days <= 60;
}

function yearFromItem(item: TMDBMovie) {
  const date = item.release_date || item.first_air_date || "";
  if (!date) return undefined;
  const y = new Date(date).getFullYear();
  return Number.isFinite(y) ? y : undefined;
}

// ===== Age SVG =====
function AgeBadgeSvg({ rating }: { rating?: string }) {
  const label = rating === "ALL" ? "ALL" : rating;
  if (!label) return null;

  return (
    <svg
      width="30"
      height="30"
      viewBox="0 0 36 36"
      className="drop-shadow"
      aria-label={`연령 등급 ${label}`}
    >
      <circle
        cx="18"
        cy="18"
        r="16"
        fill="rgba(0,0,0,0.55)"
        stroke="rgba(255,255,255,0.25)"
        strokeWidth="2"
      />
      <text
        x="18"
        y="21"
        textAnchor="middle"
        fontSize={label === "ALL" ? "11" : "13"}
        fontWeight="800"
        fill="white"
        fontFamily="ui-sans-serif, system-ui, -apple-system"
      >
        {label}
      </text>
    </svg>
  );
}

// ===== Card (디자인 개선 버전) =====
function ContentCard({
  item,
  isFavorite,
  onToggleFavorite,
  onClick,
}: {
  item: ResultItem;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onClick: () => void;
}) {
  const title =
    item.title ||
    item.name ||
    item.original_title ||
    item.original_name ||
    "제목 정보 없음";

  const posterUrl = item.poster_path
    ? getPosterUrl(item.poster_path, "w500")
    : "";
  const year = yearFromItem(item);
  const rating = safeNum((item as any).vote_average, 0);

  const isAni =
    Array.isArray((item as any).genre_ids) &&
    (item as any).genre_ids.includes(16);

  const typeLabel = isAni ? "ANI" : item.media_type === "tv" ? "TV" : "MOVIE";

  return (
    <div
      className="group cursor-pointer"
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`${title} 상세 보기`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
    >
      <div className="relative aspect-[2/3] rounded-2xl overflow-hidden mb-3 border border-white/10 bg-white/5 group-hover:border-purple-500/50 transition-all shadow-lg">
        {/* Poster */}
        {posterUrl ? (
          <img
            src={posterUrl}
            alt={title}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full bg-neutral-800 flex items-center justify-center text-neutral-400 text-xs">
            No Image
          </div>
        )}

        {/* overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent opacity-90" />

        {/* 좌상단: 상영중 + 타입 */}
        <div className="absolute top-2 left-2 flex flex-col gap-1.5 z-10">
          {item.isNowPlaying && (
            <div className="px-2 py-1 rounded-full bg-green-500/90 text-white text-[11px] font-extrabold backdrop-blur-sm shadow">
              상영중
            </div>
          )}
          <div className="px-2 py-1 rounded-full bg-black/55 text-white text-[11px] font-extrabold backdrop-blur-sm border border-white/10">
            {typeLabel}
          </div>
        </div>

        {/* 우상단: 매칭률 + 찜 */}
        <div className="absolute top-2 right-2 flex flex-col items-end gap-2 z-10">
          <div className="px-2 py-1 rounded-full bg-purple-600/90 text-white text-[11px] font-extrabold backdrop-blur-sm shadow">
            {Math.round(safeNum(item.matchScore, 0))}% 매칭
          </div>

          <button
            type="button"
            aria-label={isFavorite ? "찜 해제" : "찜 하기"}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            className="w-9 h-9 rounded-full bg-black/55 hover:bg-black/75 backdrop-blur-sm border border-white/10 flex items-center justify-center transition-all"
          >
            <span
              className={
                isFavorite ? "text-red-500 text-lg" : "text-white text-lg"
              }
            >
              {isFavorite ? "♥" : "♡"}
            </span>
          </button>
        </div>

        {/* 좌하단: 플랫폼 로고 */}
        {item.providers && item.providers.length > 0 && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1.5 z-10">
            {item.providers.slice(0, 3).map((p) => {
              const logo = p.logo_path
                ? `${TMDB_PROVIDER_LOGO}${p.logo_path}`
                : null;
              return (
                <div
                  key={p.provider_name}
                  className="w-8 h-8 rounded-xl bg-black/55 backdrop-blur-sm border border-white/10 flex items-center justify-center overflow-hidden shadow"
                  title={p.provider_name}
                  aria-label={p.provider_name}
                >
                  {logo ? (
                    <img
                      src={logo}
                      alt={p.provider_name}
                      className="w-full h-full object-contain"
                      loading="lazy"
                    />
                  ) : (
                    <span className="text-[10px] text-gray-200 px-1">
                      {p.provider_name.slice(0, 2)}
                    </span>
                  )}
                </div>
              );
            })}
            {item.providers.length > 3 && (
              <span className="text-[10px] text-gray-200 bg-black/55 border border-white/10 rounded-xl px-2 py-1 shadow">
                +{item.providers.length - 3}
              </span>
            )}
          </div>
        )}

        {/* 우하단: 연령 SVG */}
        <div className="absolute bottom-2 right-2 z-10">
          <AgeBadgeSvg rating={normalizeAgeRating(item.ageRating)} />
        </div>
      </div>

      {/* ✅ 이미지 바로 아래: 제목/평점/년도 */}
      <h3 className="text-sm font-semibold text-white truncate px-1">
        {title}
      </h3>
      <div className="flex items-center gap-2 text-xs text-gray-300 px-1 mt-1">
        <span className="inline-flex items-center gap-1">
          <Star className="w-3 h-3 text-yellow-400 fill-current" />
          {rating.toFixed(1)}
        </span>
        {year && (
          <>
            <span aria-hidden="true">·</span>
            <span className="text-gray-400">{year}</span>
          </>
        )}
      </div>
    </div>
  );
}

// ===== Main Component =====
const KEYWORD_POOL = [
  "2025년 상반기 화제작 🔥",
  "도파민 폭발 액션 💥",
  "현실 도피 판타지 🧚‍♀️",
  "새벽 2시 감성 🌙",
  "눈물 콧물 쏙 빼는 😭",
  "연애 세포 심폐소생 💘",
  "지브리 감성 🎨",
  "반전의 반전 스릴러 😱",
  "영상미 미친 영화 ✨",
  "OST가 좋은 영화 🎵",
  "하이틴 로맨스 🏫",
  "좀비 아포칼립스 🧟",
  "우주 SF 대서사시 🚀",
  "가족과 함께 보기 좋은 👨‍👩‍👧‍👦",
  "90년대 레트로 감성 📼",
  "스트레스 풀리는 코미디 😂",
];

export type PickyPageProps = {
  favorites: FavoriteItem[];
  onToggleFavorite: (movieId: number, mediaType?: MediaType) => void;
};

export function PickyPage({ favorites, onToggleFavorite }: PickyPageProps) {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);

  const [displayedKeywords, setDisplayedKeywords] = useState<string[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<AiSearchResponse | null>(null);
  const [results, setResults] = useState<ResultItem[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const [selectedMovie, setSelectedMovie] = useState<ModalMovie | null>(null);

  const [sessionPicked, setSessionPicked] = useState<Map<number, MediaType>>(
    () => new Map()
  );

  const [isPlaylistModalOpen, setIsPlaylistModalOpen] = useState(false);
  const [playlistName, setPlaylistName] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const playlistInputRef = useRef<HTMLInputElement>(null);

  const favoriteSet = useMemo(
    () => new Set(favorites.map((f) => f.id)),
    [favorites]
  );

  const refreshKeywords = () => {
    setDisplayedKeywords(shuffle(KEYWORD_POOL).slice(0, 8));
  };

  useEffect(() => {
    refreshKeywords();
  }, []);

  const userPrefs = useMemo(() => readUserPreferences(), []);

  const displayTitle = useMemo(() => {
    if (!hasSearched) return "";
    const base = (query || "").trim();
    return base.length > 0 ? base : "Picky 추천";
  }, [query, hasSearched]);

  const tags = useMemo(() => {
    const base = extractTagsFromQuery(query);
    const aiKw = (aiAnalysis?.keywords || []).filter(Boolean);
    const merged = isMostlyAscii(aiKw)
      ? base
      : uniq([...base, ...aiKw]).slice(0, 8);
    return merged;
  }, [query, aiAnalysis]);

  const togglePick = (id: number, mediaType: MediaType) => {
    onToggleFavorite(id, mediaType);

    setSessionPicked((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, mediaType);
      return next;
    });
  };

  const clearSessionPicks = () => {
    setSessionPicked((prev) => {
      prev.forEach((mt, id) => {
        if (favoriteSet.has(id)) onToggleFavorite(id, mt);
      });
      return new Map();
    });
  };

  const resetToStart = () => {
    setHasSearched(false);
    setAiAnalysis(null);
    setResults([]);
    setSelectedMovie(null);
    setSessionPicked(new Map());
    // query는 남겨두면 편해서 유지 (원하면 setQuery("")로 바꿔도 됨)
  };

  // ===== Search / Algorithm =====
  const executeSearch = async (targetQuery: string) => {
    const q = (targetQuery || "").trim();
    if (!q || loading) return;

    setLoading(true);
    setHasSearched(true);
    setQuery(q);
    setAiAnalysis(null);
    setResults([]);
    setSelectedMovie(null);
    setSessionPicked(new Map());

    const mediaTypes = inferMediaTypes(q);
    const yr = inferYearRange(q);
    const baseTags = extractTagsFromQuery(q);

    try {
      let aiRes: AiSearchResponse | null = null;
      try {
        aiRes = await apiGet<AiSearchResponse>("/ai/search", { q });
      } catch {
        aiRes = null;
      }

      const fixedAi: AiSearchResponse = {
        ...(aiRes || {}),
        mood: q,
        keywords:
          aiRes?.keywords && !isMostlyAscii(aiRes.keywords)
            ? uniq([...baseTags, ...aiRes.keywords]).slice(0, 8)
            : baseTags,
        mediaTypes: aiRes?.mediaTypes?.length ? aiRes.mediaTypes : mediaTypes,
        yearFrom: aiRes?.yearFrom ?? yr.from,
        yearTo: aiRes?.yearTo ?? yr.to,
      };

      setAiAnalysis(fixedAi);

      const planMedia = fixedAi.mediaTypes?.length
        ? fixedAi.mediaTypes
        : mediaTypes;

      const discoverMovieList = async () => {
        if (!planMedia.includes("movie")) return [] as ResultItem[];

        const genreIds = Array.isArray(fixedAi.genres) ? fixedAi.genres : [];
        const pages = await Promise.all([
          discoverMovies({ genres: genreIds, page: 1 }),
          discoverMovies({ genres: genreIds, page: 2 }),
        ]);
        const merged = [...pages[0], ...pages[1]];

        return merged.map((m) => ({
          ...(m as any),
          media_type: "movie" as const,
          matchScore: computeMatchScore(
            m,
            "movie",
            q,
            baseTags,
            fixedAi.yearFrom,
            fixedAi.yearTo
          ),
          isNowPlaying: computeNowPlayingBadge(m, "movie"),
        }));
      };

      const discoverTV = async (): Promise<ResultItem[]> => {
        if (!planMedia.includes("tv")) return [];
        if (!TMDB_API_KEY) return [];

        const url = new URL(`${TMDB_API_BASE}/discover/tv`);
        url.searchParams.set("api_key", TMDB_API_KEY);
        url.searchParams.set("language", "ko-KR");
        url.searchParams.set("page", "1");
        url.searchParams.set("sort_by", "popularity.desc");

        if (fixedAi.yearFrom)
          url.searchParams.set(
            "first_air_date.gte",
            `${fixedAi.yearFrom}-01-01`
          );
        if (fixedAi.yearTo)
          url.searchParams.set("first_air_date.lte", `${fixedAi.yearTo}-12-31`);

        const res = await fetch(url.toString());
        if (!res.ok) return [];
        const json = await res.json();
        const list: TMDBMovie[] = Array.isArray(json?.results)
          ? json.results
          : [];

        return list.map((t) => ({
          ...(t as any),
          media_type: "tv" as const,
          matchScore: computeMatchScore(
            t,
            "tv",
            q,
            baseTags,
            fixedAi.yearFrom,
            fixedAi.yearTo
          ),
          isNowPlaying: false,
        }));
      };

      const [movies, tv] = await Promise.all([
        discoverMovieList(),
        discoverTV(),
      ]);

      const merged = [...movies, ...tv]
        .filter((x) => safeNum(x.matchScore, 0) > 0)
        .sort((a, b) => safeNum(b.matchScore, 0) - safeNum(a.matchScore, 0))
        .slice(0, 24);

      const seen = new Set<string>();
      const unique = merged.filter((x) => {
        const key = `${x.media_type}:${x.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      setResults(unique);

      // ✅ OTT Providers + ✅ AgeRating 같이 채우기
      if (TMDB_API_KEY) {
        const providersMap = new Map<string, ProviderBadge[]>();
        const ageMap = new Map<string, string | undefined>();
        const top = unique.slice(0, 16);

        await Promise.allSettled(
          top.map(async (it) => {
            const key = `${it.media_type}:${it.id}`;
            const [prov, age] = await Promise.all([
              fetchWatchProviders(it.media_type, it.id),
              fetchAgeRating(it.media_type, it.id),
            ]);
            providersMap.set(key, prov);
            ageMap.set(key, age);
          })
        );

        setResults((prev) =>
          prev.map((it) => {
            const key = `${it.media_type}:${it.id}`;
            const prov = providersMap.get(key);
            const age = ageMap.get(key);
            return {
              ...it,
              providers: prov ?? it.providers,
              ageRating: age ?? it.ageRating,
            };
          })
        );
      }
    } catch (error) {
      console.error("검색 실패:", error);
      alert("잠시 후 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeSearch(query);
  };

  // ✅ 카드 클릭 -> 모달에 안전한 형태로만 전달
  const handleMovieClick = (item: ResultItem) => {
    const mediaType: MediaType = item.media_type || "movie";
    const title =
      item.title ||
      item.name ||
      item.original_title ||
      item.original_name ||
      "제목 없음";

    const poster =
      (item.poster_path && getPosterUrl(item.poster_path, "w500")) || "";
    const rating = safeNum((item as any).vote_average, 0);
    const year = yearFromItem(item);

    const modalMovie: ModalMovie = {
      id: item.id,
      tmdbId: item.id,
      title,
      poster,
      poster_path: item.poster_path,
      rating,
      vote_average: rating,
      year,
      genre: "",
      matchScore: safeNum(item.matchScore, 0),
      description: item.overview || "",
      mediaType,
      media_type: mediaType,
    };

    setSelectedMovie(modalMovie);
  };

  // ===== Playlist Create =====
  const openPlaylistModal = () => {
    if (sessionPicked.size === 0) return;
    setPlaylistName("");
    setIsPlaylistModalOpen(true);
    setTimeout(() => playlistInputRef.current?.focus(), 0);
  };

  const savePlaylist = () => {
    const name = playlistName.trim();
    if (!name) return;

    const now = Date.now();
    const pickedItems: PlaylistItem[] = Array.from(sessionPicked.entries()).map(
      ([id, mediaType]) => ({
        key: `${mediaType}:${id}`,
        addedAt: now,
      })
    );

    const next: Playlist = {
      id: `pl_${now}`,
      name,
      items: pickedItems,
      createdAt: now,
      updatedAt: now,
    };

    const all = loadPlaylists();
    savePlaylists([next, ...all]);

    setIsPlaylistModalOpen(false);
    setToast("저장되었습니다 ✨");

    setTimeout(() => {
      setToast(null);
      navigate("/");
    }, 900);
  };

  useEffect(() => {
    if (!isPlaylistModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsPlaylistModalOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isPlaylistModalOpen]);

  // ===== Render =====
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="min-h-screen bg-[#131314] text-white flex flex-col font-sans overflow-x-hidden relative"
    >
      {/* ✅ Header 고정: sticky 이슈 방지 위해 fixed로 강제 */}
      <header className="fixed top-0 left-0 right-0 z-50 px-6 py-5 flex items-center justify-between w-full backdrop-blur-xl bg-[#131314]/70 border-b border-white/5">
        <div className="flex items-center gap-6 max-w-7xl mx-auto w-full justify-between">
          <div className="flex items-center gap-6">
            <button
              onClick={() => window.location.reload()}
              className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent hover:opacity-80 transition-opacity"
              aria-label="Picky 새로고침"
            >
              Picky
            </button>
            <div className="h-5 w-[1px] bg-white/10" />
            <button
              onClick={() => navigate("/")}
              className="text-xl font-bold text-gray-300 hover:text-white transition-colors"
              aria-label="PickMovie 홈으로 이동"
            >
              PickMovie
            </button>
          </div>

          <button
            onClick={() => navigate("/login")}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 text-sm font-medium text-gray-300 hover:text-white transition-all border border-white/5 hover:border-white/20"
            aria-label="로그인"
          >
            <User className="w-4 h-4" />
            <span>로그인</span>
          </button>
        </div>
      </header>

      {/* fixed header spacer */}
      <div className="h-[84px] shrink-0" />

      <AnimatePresence mode="wait">
        {/* --- 메인 (검색 전) --- */}
        {!hasSearched && !loading && (
          <motion.main
            key="picky-start"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="flex-1 flex flex-col items-center justify-center px-4 w-full max-w-[800px] mx-auto pb-20"
          >
            <div className="mb-8 text-center">
              <h1 className="text-3xl font-bold mb-4 bg-gradient-to-b from-white to-white/60 bg-clip-text leading-tight">
                무엇을 보고 싶으신가요?
              </h1>
              <p className="text-gray-400 text-lg font-medium">
                기분, 상황, 장르 등 자유롭게 말해보세요.
              </p>
            </div>

            <div className="w-full relative group mb-8">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-500/30 to-pink-500/30 rounded-full blur opacity-0 group-focus-within:opacity-100 transition-opacity duration-500" />
              <form
                onSubmit={handleSubmit}
                className="relative bg-[#1e1e20] rounded-full border border-white/10 flex items-center shadow-2xl pr-2 transition-colors group-focus-within:bg-[#252529] group-focus-within:border-white/20"
              >
                <label className="sr-only" htmlFor="picky-query">
                  보고 싶은 콘텐츠 입력
                </label>
                <input
                  id="picky-query"
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="예: 2000년대 지브리 영화"
                  className="w-full bg-transparent border-none text-white placeholder-gray-500 text-base px-6 py-4 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!query.trim()}
                  className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="검색"
                >
                  <ArrowUp className="w-5 h-5" />
                </button>
              </form>
            </div>

            {/* 키워드 + 새로고침 */}
            <div className="flex flex-wrap justify-center gap-2.5 max-w-2xl relative items-center">
              {displayedKeywords.map((keyword, idx) => (
                <motion.button
                  key={`${keyword}-${idx}`}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  onClick={() => executeSearch(keyword)}
                  className="px-4 py-2 bg-[#2a2a2d] hover:bg-[#3f3f43] border border-white/10 hover:border-purple-500/50 rounded-full text-sm text-gray-300 hover:text-white transition-all active:scale-95 shadow-sm"
                  aria-label={`추천 키워드: ${keyword}`}
                >
                  {keyword}
                </motion.button>
              ))}

              <button
                type="button"
                onClick={refreshKeywords}
                className="w-10 h-10 rounded-full border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/15 text-purple-300 hover:text-white transition-all flex items-center justify-center active:scale-95"
                aria-label="키워드 새로고침"
                title="키워드 새로고침"
              >
                <Sparkles className="w-5 h-5" />
              </button>
            </div>
          </motion.main>
        )}

        {/* --- 로딩 --- */}
        {loading && (
          <motion.div
            key="picky-loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex-1 flex flex-col items-center justify-center relative"
            role="status"
            aria-live="polite"
          >
            <div className="relative">
              <motion.div
                className="absolute inset-0 bg-purple-500/20 blur-[120px] rounded-full"
                animate={
                  reduceMotion
                    ? { opacity: 0.45 }
                    : { opacity: [0.35, 0.6, 0.35] }
                }
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { duration: 1.6, repeat: Infinity }
                }
              />

              <motion.div
                animate={reduceMotion ? undefined : { rotate: 360 }}
                transition={
                  reduceMotion
                    ? undefined
                    : { repeat: Infinity, duration: 1.3, ease: "linear" }
                }
                className="relative z-10"
              >
                <div className="w-20 h-20 border-4 border-t-purple-500 border-r-purple-500/30 border-b-pink-500/20 border-l-purple-500/60 rounded-full" />
              </motion.div>
            </div>

            <div className="mt-10 text-center px-6">
              <h3 className="text-2xl font-bold text-white mb-2">
                취향 분석 중입니다
              </h3>
              <p className="text-gray-400 text-base">
                Picky가 지금 딱 맞는 콘텐츠만 고르는 중이에요…
              </p>

              <div
                className="flex items-center justify-center gap-2 mt-5"
                aria-hidden="true"
              >
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="w-2 h-2 rounded-full bg-white/50"
                    animate={
                      reduceMotion
                        ? { opacity: 0.7 }
                        : { opacity: [0.25, 1, 0.25], y: [0, -4, 0] }
                    }
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { duration: 0.9, repeat: Infinity, delay: i * 0.15 }
                    }
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* --- 결과 --- */}
        {hasSearched && !loading && (
          <motion.div
            key="picky-results"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="flex-1 w-full max-w-6xl mx-auto px-6 py-10"
          >
            {/* ✅ 상단 검색바 + 다시 분석하기 */}
            <div className="flex justify-center mb-10">
              <div className="w-full max-w-2xl flex items-center gap-2">
                <div className="relative group flex-1">
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-500/30 to-pink-500/30 rounded-full blur opacity-0 group-focus-within:opacity-100 transition-opacity" />
                  <form
                    onSubmit={handleSubmit}
                    className="relative bg-[#1e1e20] rounded-full border border-white/10 flex items-center shadow-lg pr-2"
                  >
                    <label className="sr-only" htmlFor="picky-query-2">
                      검색어 입력
                    </label>
                    <input
                      id="picky-query-2"
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      className="w-full bg-transparent border-none text-white px-6 py-3 focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
                      aria-label="검색"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                  </form>
                </div>

                {/* ✅ 다시 분석하기 버튼 */}
                <button
                  type="button"
                  onClick={resetToStart}
                  className="shrink-0 px-4 py-3 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-sm text-gray-200 flex items-center gap-2"
                  aria-label="다시 분석하기"
                >
                  <RefreshCcw className="w-4 h-4" />
                  다시 분석
                </button>
              </div>
            </div>

            {/* 타이틀/해시태그 */}
            <div className="mb-10 text-center">
              <div className="inline-block px-4 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-300 text-sm mb-4">
                ✨ Picky's Choice
              </div>
              <h2 className="text-3xl font-bold mb-2">"{displayTitle}" 추천</h2>

              {tags.length > 0 && (
                <div className="flex justify-center flex-wrap gap-2 mt-4">
                  {tags.map((k) => (
                    <span
                      key={k}
                      className="text-sm text-gray-400 bg-white/5 px-3 py-1 rounded-full border border-white/5"
                    >
                      #{k}
                    </span>
                  ))}
                </div>
              )}

              <p className="text-gray-500 text-sm mt-3">
                총 {results.length}개의 추천 결과
              </p>
            </div>

            {results.length === 0 ? (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-10 text-center">
                <div className="text-6xl mb-4">😅</div>
                <p className="text-white text-lg">추천 결과를 찾지 못했어요</p>
                <p className="text-gray-400 text-sm mt-2">
                  키워드를 조금 더 구체적으로 입력해보세요.
                </p>
                <div className="mt-6 flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={resetToStart}
                    className="px-5 py-2.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-sm text-gray-200"
                  >
                    다시 검색하기
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate("/")}
                    className="px-5 py-2.5 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 text-white text-sm font-medium"
                  >
                    메인으로 가기
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
                {results.map((item) => {
                  const isFav = favoriteSet.has(item.id);
                  return (
                    <div key={`${item.media_type}:${item.id}`}>
                      <ContentCard
                        item={item}
                        isFavorite={isFav}
                        onToggleFavorite={() =>
                          togglePick(item.id, item.media_type)
                        }
                        onClick={() => handleMovieClick(item)}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- 하단 액션바 --- */}
      <AnimatePresence>
        {!loading && hasSearched && sessionPicked.size > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-4 left-0 right-0 z-40 px-4"
          >
            <div className="max-w-4xl mx-auto bg-[#1e1e20]/95 backdrop-blur-xl border border-white/10 rounded-2xl px-4 py-3 flex items-center justify-between gap-3 shadow-2xl">
              <div className="text-sm text-gray-200">
                <span className="text-white font-semibold">
                  {sessionPicked.size}개
                </span>{" "}
                찜했어요
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={clearSessionPicks}
                  className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm text-gray-200"
                  aria-label="이번 찜 초기화"
                >
                  찜 초기화
                </button>

                <button
                  type="button"
                  onClick={openPlaylistModal}
                  className="px-3 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 text-white text-sm font-medium"
                  aria-label="플레이리스트 생성"
                >
                  플레이리스트 생성
                </button>

                <button
                  type="button"
                  onClick={() => navigate("/")}
                  className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm text-gray-200"
                  aria-label="메인 화면으로 이동"
                >
                  메인으로 가기
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- 플레이리스트 생성 모달 --- */}
      <AnimatePresence>
        {isPlaylistModalOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-label="플레이리스트 생성"
          >
            <div
              className="absolute inset-0 bg-black/60"
              onClick={() => setIsPlaylistModalOpen(false)}
              aria-hidden="true"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              className="relative w-full max-w-md bg-[#1e1e20] border border-white/10 rounded-2xl p-5 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white text-lg font-semibold">
                  플레이리스트 생성
                </h3>
                <button
                  type="button"
                  onClick={() => setIsPlaylistModalOpen(false)}
                  className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center"
                  aria-label="닫기"
                >
                  <X className="w-4 h-4 text-gray-200" />
                </button>
              </div>

              <p className="text-gray-400 text-sm mb-4">
                이번 추천에서 찜한 {sessionPicked.size}개 콘텐츠로
                플레이리스트를 만들어요.
              </p>

              <label className="sr-only" htmlFor="playlist-name">
                플레이리스트 이름
              </label>
              <input
                id="playlist-name"
                ref={playlistInputRef}
                value={playlistName}
                onChange={(e) => setPlaylistName(e.target.value)}
                placeholder="플레이리스트 이름을 입력하세요"
                className="w-full bg-[#131314] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/40"
                autoFocus
              />

              <div className="flex gap-2 mt-5">
                <button
                  type="button"
                  onClick={() => setIsPlaylistModalOpen(false)}
                  className="flex-1 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-200 text-sm"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={savePlaylist}
                  disabled={!playlistName.trim()}
                  className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  저장하기
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- 저장 완료 토스트 --- */}
      <AnimatePresence>
        {toast && (
          <motion.div
            className="fixed top-6 left-0 right-0 z-[60] px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="max-w-md mx-auto bg-[#1e1e20]/95 backdrop-blur-xl border border-white/10 rounded-full px-4 py-3 text-center text-sm text-white shadow-xl">
              {toast}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 상세 모달 */}
      <AnimatePresence>
        {selectedMovie && (
          <Suspense fallback={null}>
            <MovieDetailModal
              movie={selectedMovie}
              onClose={() => setSelectedMovie(null)}
              isFavorite={favorites.some((f) => f.id === selectedMovie.id)}
              onToggleFavorite={() =>
                onToggleFavorite(
                  selectedMovie.id,
                  (selectedMovie.mediaType || "movie") as MediaType
                )
              }
              userPreferences={userPrefs}
              onMovieChange={(m) => setSelectedMovie(m)}
            />
          </Suspense>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default PickyPage;

// ===== MatchScore =====
function computeMatchScore(
  item: TMDBMovie,
  mediaType: MediaType,
  query: string,
  tags: string[],
  yearFrom?: number,
  yearTo?: number
) {
  const title = (item.title || item.name || "").toLowerCase();
  const overview = (item.overview || "").toLowerCase();
  const q = query.toLowerCase();

  let score = 55;

  if (q && (title.includes(q) || overview.includes(q))) score += 12;

  let hit = 0;
  tags.forEach((t) => {
    const tt = t.toLowerCase();
    if (!tt) return;
    if (title.includes(tt)) hit += 2;
    else if (overview.includes(tt)) hit += 1;
  });
  score += Math.min(16, hit);

  const year = item.release_date
    ? new Date(item.release_date).getFullYear()
    : item.first_air_date
    ? new Date(item.first_air_date).getFullYear()
    : undefined;

  if (year && yearFrom && yearTo && year >= yearFrom && year <= yearTo)
    score += 10;

  score += Math.min(10, safeNum((item as any).vote_average, 0));

  if (/드라마|시리즈|tv/.test(q) && mediaType === "tv") score += 4;
  if (/영화|movie/.test(q) && mediaType === "movie") score += 4;

  return Math.max(0, Math.min(99, score));
}
