// frontend/src/pages/person/PersonDetail.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { X, ChevronRight, Instagram, Globe } from "lucide-react";
import { motion } from "framer-motion";

import { apiGet } from "../../lib/apiClient";
import { getPosterUrl } from "../../lib/tmdb";

type TmdbPersonDetail = {
  id: number;
  name?: string;
  profile_path?: string | null;
  known_for_department?: string | null;
  birthday?: string | null;
  deathday?: string | null;
  place_of_birth?: string | null;
  biography?: string | null;
  also_known_as?: string[];
  gender?: number;
  popularity?: number;
  homepage?: string | null;
};

type TmdbExternalIds = {
  instagram_id?: string | null;
};

type TmdbCreditItem = {
  id: number;
  media_type?: "movie" | "tv";
  title?: string;
  name?: string;
  poster_path?: string | null;
  character?: string | null;
  release_date?: string | null;
  first_air_date?: string | null;
  vote_count?: number;
  popularity?: number;
};

type TmdbCombinedCredits = {
  cast?: TmdbCreditItem[];
};

function formatKoreanDate(ymd?: string | null) {
  const raw = String(ymd || "").trim();
  if (!raw) return "";
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) return raw;
  const d = new Date(t);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function genderText(g?: number) {
  if (g === 1) return "여성";
  if (g === 2) return "남성";
  return "정보 없음";
}

function locationToPath(loc: any): string | null {
  if (!loc) return null;
  const p = String(loc?.pathname ?? "").trim();
  if (!p) return null;
  const s = String(loc?.search ?? "");
  const h = String(loc?.hash ?? "");
  return `${p}${s}${h}`;
}

export default function PersonDetail() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();

  const personId = Number(params.id);

  const closeTargetPath = useMemo(() => {
    const st = location.state as any;
    const root = st?.rootLocation ?? st?.backgroundLocation ?? null;
    return locationToPath(root) ?? "/";
  }, [location.state]);

  const [person, setPerson] = useState<TmdbPersonDetail | null>(null);
  const [external, setExternal] = useState<TmdbExternalIds | null>(null);
  const [credits, setCredits] = useState<TmdbCreditItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const requestClose = useCallback(() => {
    setClosing(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [requestClose]);

  useEffect(() => {
    let alive = true;

    setPerson(null);
    setExternal(null);
    setCredits([]);
    setLoading(true);

    if (!Number.isFinite(personId) || personId <= 0) {
      setLoading(false);
      return () => {
        alive = false;
      };
    }

    void (async () => {
      try {
        const [p, ex, c] = await Promise.all([
          apiGet<TmdbPersonDetail>(`/tmdb/proxy/person/${personId}`, {
            language: "ko-KR",
          }),
          apiGet<TmdbExternalIds>(
            `/tmdb/proxy/person/${personId}/external_ids`
          ).catch(() => null),
          apiGet<TmdbCombinedCredits>(
            `/tmdb/proxy/person/${personId}/combined_credits`,
            { language: "ko-KR" }
          ).catch(() => ({ cast: [] } as TmdbCombinedCredits)),
        ]);

        if (!alive) return;

        setPerson(p);
        setExternal(ex);

        const cast = Array.isArray(c?.cast) ? c.cast : [];
        const top = cast
          .filter(
            (x) =>
              typeof x?.id === "number" &&
              (x.media_type === "movie" || x.media_type === "tv")
          )
          .sort((a, b) => {
            const av = (a.vote_count ?? 0) + (a.popularity ?? 0);
            const bv = (b.vote_count ?? 0) + (b.popularity ?? 0);
            return bv - av;
          })
          .slice(0, 24);

        setCredits(top);
      } catch {
        if (!alive) return;
        setPerson(null);
        setExternal(null);
        setCredits([]);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [personId]);

  const profileSrc = useMemo(() => {
    if (!person?.profile_path) return "";
    return getPosterUrl(person.profile_path, "w500") || "";
  }, [person?.profile_path]);

  const instagramUrl = useMemo(() => {
    const id = external?.instagram_id ? String(external.instagram_id) : "";
    return id ? `https://www.instagram.com/${id}/` : "";
  }, [external?.instagram_id]);

  const homepageUrl = useMemo(() => {
    const h = String(person?.homepage ?? "").trim();
    return h || "";
  }, [person?.homepage]);

  const rootLocation = useMemo(() => {
    const st = location.state as any;
    return st?.rootLocation ?? st?.backgroundLocation ?? null;
  }, [location.state]);

  const goToTitle = (item: TmdbCreditItem) => {
    const mt = item.media_type;
    if (mt !== "movie" && mt !== "tv") return;

    if (rootLocation) {
      navigate(`/title/${mt}/${item.id}`, {
        state: { backgroundLocation: rootLocation, rootLocation: rootLocation },
        replace: true,
      });
    } else {
      navigate(`/title/${mt}/${item.id}`, { replace: true });
    }
  };

  return (
    <div className="fixed inset-0 z-[1001]">
      <motion.div
        className="absolute inset-0 bg-black/70 backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: closing ? 0 : 1 }}
        transition={{ duration: 0.16, ease: "easeOut" }}
        onClick={requestClose}
      />

      <motion.div
        className={[
          "relative mx-auto",
          "w-[min(1120px,94vw)]",
          "h-[96svh] mt-[4svh] mb-0",
          "overflow-hidden",
          "bg-[#0b0b10]",
          "shadow-[0_30px_90px_rgba(0,0,0,0.65)]",
          "rounded-t-[10px] rounded-b-none",
        ].join(" ")}
        onClick={(e) => e.stopPropagation()}
        initial={{ y: 90, opacity: 0 }}
        animate={{ y: closing ? 60 : 0, opacity: closing ? 0 : 1 }}
        transition={
          closing
            ? { duration: 0.18, ease: "easeInOut" }
            : { type: "spring", stiffness: 240, damping: 22, mass: 0.9 }
        }
        onAnimationComplete={() => {
          if (!closing) return;
          navigate(closeTargetPath, { replace: true });
        }}
      >
        <button
          type="button"
          aria-label="닫기"
          onClick={requestClose}
          className="absolute right-4 top-4 z-40 w-10 h-10 rounded-full bg-black/35 hover:bg-black/50 text-white flex items-center justify-center backdrop-blur-md"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="h-full overflow-y-auto overscroll-contain">
          <div className="relative">
            <div className="absolute inset-0">
              <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/55 to-[#0b0b10]" />
              <div className="absolute inset-0 shadow-[inset_0_0_220px_rgba(0,0,0,0.75)]" />
            </div>

            <div className="relative px-4 sm:px-8 pt-16 pb-8">
              {loading ? (
                <div className="rounded-2xl bg-white/5 border border-white/10 h-[220px] animate-pulse" />
              ) : person ? (
                <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6 items-start">
                  <div className="w-[200px] max-w-full">
                    <div className="relative rounded-2xl overflow-hidden bg-white/5 border border-white/10">
                      <div className="aspect-[3/4] bg-black/30">
                        {profileSrc ? (
                          <img
                            src={profileSrc}
                            alt={person.name || "배우"}
                            className="w-full h-full object-cover"
                            loading="eager"
                            decoding="async"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-b from-white/10 to-transparent" />
                        )}
                      </div>

                      <div className="absolute bottom-3 right-3 flex gap-2">
                        {instagramUrl ? (
                          <a
                            href={instagramUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-black/55 border border-white/10 text-white hover:bg-black/70 backdrop-blur-md"
                            title="Instagram"
                          >
                            <Instagram className="w-4 h-4" />
                          </a>
                        ) : null}

                        {homepageUrl ? (
                          <a
                            href={homepageUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-black/55 border border-white/10 text-white hover:bg-black/70 backdrop-blur-md"
                            title="홈페이지"
                          >
                            <Globe className="w-4 h-4" />
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="min-w-0">
                    <div className="text-white/90 font-extrabold text-[28px] sm:text-[34px] leading-tight">
                      {person.name || "이름 정보 없음"}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      {person.known_for_department ? (
                        <span className="inline-flex items-center h-[22px] px-[10px] rounded-[6px] bg-black/45 text-white text-[11px] font-bold">
                          {person.known_for_department}
                        </span>
                      ) : null}

                      <span className="inline-flex items-center h-[22px] px-[10px] rounded-[6px] bg-black/45 text-white text-[11px] font-bold">
                        {genderText(person.gender)}
                      </span>
                    </div>

                    <div className="mt-5 space-y-3">
                      {person.birthday ? (
                        <div className="grid grid-cols-[92px_1fr] gap-3">
                          <div className="text-white/45 text-[12px] font-semibold">
                            생년월일
                          </div>
                          <div className="text-white/85 text-[13px] font-bold">
                            {formatKoreanDate(person.birthday)}
                          </div>
                        </div>
                      ) : null}

                      {person.place_of_birth ? (
                        <div className="grid grid-cols-[92px_1fr] gap-3">
                          <div className="text-white/45 text-[12px] font-semibold">
                            출생지
                          </div>
                          <div className="text-white/85 text-[13px] font-bold">
                            {person.place_of_birth}
                          </div>
                        </div>
                      ) : null}

                      {Array.isArray(person.also_known_as) &&
                      person.also_known_as.length ? (
                        <div className="grid grid-cols-[92px_1fr] gap-3">
                          <div className="text-white/45 text-[12px] font-semibold">
                            다른 이름
                          </div>
                          <div className="text-white/85 text-[13px] font-bold line-clamp-2">
                            {person.also_known_as.filter(Boolean).join(", ")}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    {person.biography ? (
                      <div className="mt-6">
                        <div className="text-white/90 font-extrabold text-[16px] mb-2">
                          소개
                        </div>
                        <p className="text-white/70 text-[13px] sm:text-[14px] leading-relaxed whitespace-pre-line">
                          {person.biography}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="text-white/70 font-semibold py-10">
                  배우 정보를 불러오지 못했습니다.
                </div>
              )}
            </div>
          </div>

          <div className="px-4 sm:px-8 pb-12">
            <div className="mt-6 flex items-center justify-between gap-3 mb-3">
              <h3 className="text-white/90 font-extrabold text-[16px]">
                대표작
              </h3>
              <span className="text-white/35 text-[12px] font-semibold">
                상세페이지 이동
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
              {credits.length ? (
                credits.map((it) => {
                  const title = it.title || it.name || "";
                  const poster = it.poster_path
                    ? getPosterUrl(it.poster_path, "w342")
                    : null;
                  const subDate =
                    it.media_type === "tv"
                      ? it.first_air_date
                      : it.release_date;

                  return (
                    <button
                      key={`${it.media_type}:${it.id}`}
                      type="button"
                      onClick={() => goToTitle(it)}
                      className="text-left group"
                      title={title}
                    >
                      <div className="rounded-2xl bg-black/15 border border-white/10 overflow-hidden">
                        <div className="aspect-[2/3] bg-black/30">
                          {poster ? (
                            <img
                              src={poster}
                              alt={title}
                              className="w-full h-full object-cover"
                              loading="lazy"
                              decoding="async"
                            />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-b from-white/10 to-transparent" />
                          )}
                        </div>

                        <div className="p-2.5">
                          <div className="h-[34px]">
                            <div className="text-white/90 font-extrabold text-[12px] leading-snug line-clamp-2">
                              {title || "제목 정보 없음"}
                            </div>
                          </div>

                          <div className="mt-1 flex items-center justify-between gap-2">
                            {subDate ? (
                              <div className="text-white/45 text-[11px] font-semibold">
                                {String(subDate).slice(0, 4)}
                              </div>
                            ) : (
                              <div className="text-white/45 text-[11px] font-semibold">
                                &nbsp;
                              </div>
                            )}
                            <ChevronRight className="w-4 h-4 text-white/35 group-hover:text-white/70" />
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="text-white/45 text-[13px] font-semibold py-2">
                  대표작 정보가 없습니다.
                </div>
              )}
            </div>
          </div>
        </div>

        <style>{`
          @media (max-width: 768px) {
            .fixed.inset-0.z-[1001] > div.relative.mx-auto {
              width: 100vw !important;
              height: 100svh !important;
              margin-top: 0 !important;
              border-radius: 0 !important;
            }
          }
        `}</style>
      </motion.div>
    </div>
  );
}
