// frontend/src/pages/MyPage.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, Heart, LogOut, UserRound } from "lucide-react";
import { apiPost } from "../lib/apiClient";
import { Button } from "../components/ui/button";
import { Header } from "../components/layout/Header";

type SafeUser = {
  id: number;
  username: string;
  email: string | null;
  nickname: string | null;
};

const AUTH_KEYS = {
  ACCESS: "pickmovie_access_token",
  USER: "pickmovie_user",
} as const;

const STORAGE_KEYS = {
  FAVORITES: "pickmovie_favorites",
  PREFERENCES: "pickmovie_preferences",
} as const;

function readStoredUser(): SafeUser | null {
  try {
    const raw = localStorage.getItem(AUTH_KEYS.USER);
    if (!raw) return null;
    return JSON.parse(raw) as SafeUser;
  } catch {
    return null;
  }
}

function readFavoritesRaw(): any[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.FAVORITES);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getFavoriteLabel(item: any): string {
  if (item == null) return "—";
  if (typeof item === "string" || typeof item === "number") return String(item);

  const title =
    item.title ||
    item.name ||
    item.original_title ||
    item.original_name ||
    null;

  if (title) return String(title);
  if (item.id != null) return String(item.id);
  return "—";
}

export function MyPage() {
  const navigate = useNavigate();

  const [me, setMe] = useState<SafeUser | null>(() => readStoredUser());
  const [favorites, setFavorites] = useState<any[]>(() => readFavoritesRaw());

  const favCount = favorites.length;

  const displayName = useMemo(() => {
    const u = me;
    if (!u) return "";
    return (u.nickname?.trim() || u.username || "").trim();
  }, [me]);

  const favoritesPreview = useMemo(() => {
    return favorites.slice(0, 8).map((x, idx) => ({
      key: `${idx}-${typeof x}-${(x && x.id) ?? x}`,
      label: getFavoriteLabel(x),
    }));
  }, [favorites]);

  useEffect(() => {
    const sync = () => {
      setMe(readStoredUser());
      setFavorites(readFavoritesRaw());
    };
    window.addEventListener("pickmovie-auth-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("pickmovie-auth-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    if (!me) navigate("/login", { replace: true });
  }, [me, navigate]);

  const onLogout = async () => {
    try {
      await apiPost("/auth/logout", {});
    } finally {
      localStorage.removeItem(AUTH_KEYS.ACCESS);
      localStorage.removeItem(AUTH_KEYS.USER);
      window.dispatchEvent(new Event("pickmovie-auth-changed"));
      navigate("/", { replace: true });
    }
  };

  if (!me) return null;

  return (
    <div className="min-h-screen bg-[#0b0b12]">
      <Header currentSection="mypage" />

      {/* 배경 */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-800/18 via-[#0b0b12]/75 to-pink-800/14" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_62%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_left,rgba(168,85,247,0.10),transparent_52%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_right,rgba(236,72,153,0.08),transparent_52%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0),rgba(0,0,0,0.72))]" />
      </div>

      <div className="pt-20 px-6 pb-12">
        <div className="mx-auto w-full max-w-[980px]">
          <h1 className="text-2xl font-extrabold text-white">마이페이지</h1>
          <p className="mt-2 text-sm text-white/55">
            내 계정 정보와 활동(찜/플레이리스트)을 관리하세요.
          </p>

          <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl shadow-[0_10px_50px_rgba(0,0,0,0.35)]">
              <div className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="h-12 w-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                      <UserRound className="h-6 w-6 text-white/75" />
                    </div>

                    <div className="min-w-0">
                      <div className="text-lg font-bold text-white truncate">
                        {displayName}
                      </div>

                      <div className="mt-1 text-sm text-white/55">
                        아이디:{" "}
                        <span className="text-white/85 font-semibold">
                          {me.username}
                        </span>
                      </div>

                      <div className="mt-1 text-sm text-white/55 flex items-center gap-2">
                        <Mail className="h-4 w-4 text-white/45" />
                        <span className="truncate">
                          {me.email ?? "이메일 미등록"}
                        </span>
                      </div>

                      <div className="mt-3 text-xs text-white/35">
                        계정 관련 설정은 추후 “설정” 메뉴로 확장될 예정입니다.
                      </div>
                    </div>
                  </div>

                  <Button
                    type="button"
                    onClick={onLogout}
                    className="pick-cta h-10 px-4 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-xl"
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    로그아웃
                  </Button>
                </div>

                <div className="mt-6 rounded-2xl border border-white/10 bg-black/25 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white">
                        최근 찜/플레이리스트
                      </div>
                      <div className="mt-1 text-xs text-white/55">
                        최근에 저장한 콘텐츠 일부를 보여줍니다.
                      </div>
                    </div>

                    <Button
                      type="button"
                      onClick={() => navigate("/favorites")}
                      className="pick-cta h-10 px-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 text-white border-none rounded-xl"
                    >
                      전체보기
                    </Button>
                  </div>

                  {favCount === 0 ? (
                    <div className="mt-4 text-sm text-white/45">
                      아직 찜한 콘텐츠가 없어요. 마음에 드는 작품을 찜해보세요!
                    </div>
                  ) : (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {favoritesPreview.map((x) => (
                        <span
                          key={x.key}
                          className="max-w-full truncate rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/75"
                          title={x.label}
                        >
                          {x.label}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-3 text-xs text-white/35">
                    * 현재 찜/플레이리스트는 로컬스토리지 기반입니다.
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl shadow-[0_10px_50px_rgba(0,0,0,0.35)]">
              <div className="p-6">
                <div className="text-sm font-semibold text-white">
                  내 활동 요약
                </div>

                <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-white/80">
                      <Heart className="h-4 w-4 text-pink-300" />
                      찜/플레이리스트
                    </div>
                    <div className="text-lg font-extrabold text-white">
                      {favCount}
                    </div>
                  </div>

                  <Button
                    type="button"
                    onClick={() => navigate("/favorites")}
                    className="pick-cta mt-4 w-full h-10 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-xl"
                  >
                    찜/플레이리스트로 이동
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-10 text-center text-xs text-white/25">
            © 2025 PickMovie. All rights reserved.
          </div>
        </div>
      </div>
    </div>
  );
}
