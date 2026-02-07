// frontend/src/pages/favorites/FavoritesSection.tsx
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Pencil, RotateCcw, X } from "lucide-react";

import type { FavoriteItem } from "../../App";
import { getContentDetails } from "../../lib/tmdb";

import type {
  ContentCardItem,
  MediaType,
} from "../../components/content/ContentCard";
import type { FavoritesPlaylistSharedUI } from "./FavoritesPlaylistPage";

type PlaylistLite = { id: string; name: string };

type FavoritesGroupKey = "all" | "movie" | "tv" | "ani";
type CategoryGroupKey = Exclude<FavoritesGroupKey, "all">;

type FavoritesSectionProps = {
  ui: FavoritesPlaylistSharedUI;
  pad: string;

  favorites: FavoriteItem[];

  onToggleFavorite: (id: number, mt?: "movie" | "tv") => void;
  onResetFavorites: () => void;

  onOpenDetail: (item: ContentCardItem) => void;
  onFavoritesKeySetChange: (s: Set<string>) => void;

  onRequestCreatePlaylistFromItems: (items: ContentCardItem[]) => void;

  playlists?: PlaylistLite[];

  onAddToExistingPlaylist?: (
    playlistId: string,
    items: ContentCardItem[],
  ) => void;
};

function itemKey(item: ContentCardItem): string {
  const mt = String((item as any)?.media_type ?? "").toLowerCase();
  const id = Number((item as any)?.id);
  return `${mt}:${id}`;
}

function uniqueByKey(items: ContentCardItem[]) {
  return Array.from(new Map(items.map((m) => [itemKey(m), m])).values());
}

function hasAniGenre(item: ContentCardItem): boolean {
  const ids: number[] = [];

  const genreIds = (item as any)?.genre_ids;
  if (Array.isArray(genreIds)) {
    for (const g of genreIds) {
      const id = Number(g);
      if (Number.isFinite(id)) ids.push(id);
    }
  }

  const genres = (item as any)?.genres;
  if (Array.isArray(genres)) {
    for (const g of genres) {
      const id = Number((g as any)?.id);
      if (Number.isFinite(id)) ids.push(id);
    }
  }

  return ids.includes(16);
}

/**
 * ✅ Ani 캐러셀이 TV로 섞이는 원인:
 * - 일부 meta에서는 content_kind가 "animation" / "animated" 등으로 들어오거나,
 *   Ani 뱃지는 다른 필드로 나오는데 이 함수가 못 잡아서 tv로 분류됨.
 *
 * ✅ 해결:
 * - content_kind/contentKind/... 값에 ani/anime 뿐 아니라 animation/animated/cartoon까지 폭넓게 인식
 * - 문자열 정규화 후 포함 여부로 판별
 */
function detectCategoryKey(item: ContentCardItem): CategoryGroupKey {
  const raw = String(
    (item as any)?.content_kind ??
      (item as any)?.contentKind ??
      (item as any)?.content_kind_from_db ??
      (item as any)?.contentKindFromDb ??
      "",
  );

  const ck = raw.trim().toLowerCase();

  const isAni =
    ck.includes("ani") ||
    ck.includes("anime") ||
    ck.includes("animation") ||
    ck.includes("animated") ||
    ck.includes("cartoon");

  if (hasAniGenre(item)) return "ani";
  if (isAni) return "ani";

  const mt = String((item as any)?.media_type ?? "").toLowerCase();
  if (mt === "movie") return "movie";
  if (mt === "tv") return "tv";

  return "movie";
}

function categoryTitle(k: CategoryGroupKey) {
  if (k === "movie") return "Movie";
  if (k === "tv") return "TV";
  return "Ani";
}

// ✅ favorites 페이지용: tmdb 상세 캐시
const _favDetailCache = new Map<string, ContentCardItem | null>();
const _favDetailInFlight = new Map<string, Promise<ContentCardItem | null>>();

async function fetchDetailAsCardItem(
  mediaType: "movie" | "tv",
  id: number,
): Promise<ContentCardItem | null> {
  const key = `${mediaType}:${id}`;
  if (_favDetailCache.has(key)) return _favDetailCache.get(key) ?? null;

  const inflight = _favDetailInFlight.get(key);
  if (inflight) return inflight;

  const p = (async () => {
    try {
      const detail = await getContentDetails(id, mediaType);
      const patched: ContentCardItem = {
        ...(detail as any),
        id: Number((detail as any)?.id ?? id),
        media_type: mediaType,
      } as any;
      _favDetailCache.set(key, patched);
      return patched;
    } catch {
      _favDetailCache.set(key, null);
      return null;
    } finally {
      _favDetailInFlight.delete(key);
    }
  })();

  _favDetailInFlight.set(key, p);
  return p;
}

export function FavoritesSection({
  ui,
  pad,
  favorites,
  onToggleFavorite,
  onResetFavorites,
  onOpenDetail,
  onFavoritesKeySetChange,
  onRequestCreatePlaylistFromItems,
  playlists = [],
  onAddToExistingPlaylist,
}: FavoritesSectionProps) {
  const {
    SectionHeader,
    EditableCarouselRow,
    BottomConfirmSheet,
    PlaylistPickerPopover,
  } = ui;

  // ✅ favoritesKeySet은 "서버 favorites"를 기준으로 만든다 (카드 로딩 실패/지연과 무관)
  const favoritesKeySet = useMemo(() => {
    const s = new Set<string>();
    for (const f of Array.isArray(favorites) ? favorites : []) {
      const mt = f.mediaType === "tv" ? "tv" : "movie";
      const id = Number(f.id);
      if (!Number.isFinite(id) || id <= 0) continue;
      s.add(`${mt}:${id}`);
    }
    return s;
  }, [favorites]);

  useEffect(() => {
    onFavoritesKeySetChange(favoritesKeySet);
  }, [favoritesKeySet, onFavoritesKeySetChange]);

  // ✅ favorites(id/mediaType) → TMDB 상세로 카드 아이템 변환
  const [favItems, setFavItems] = useState<ContentCardItem[]>([]);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      const src = Array.isArray(favorites) ? favorites : [];
      if (src.length === 0) {
        if (!alive) return;
        setFavItems([]);
        return;
      }

      // 안정적으로 보여주기: 이전 결과 유지 + 새로 필요한 것만 채움
      const keys = src
        .map((f) => {
          const mt = f.mediaType === "tv" ? "tv" : "movie";
          const id = Number(f.id);
          return Number.isFinite(id) && id > 0 ? `${mt}:${id}` : null;
        })
        .filter(Boolean) as string[];

      // 이미 캐시된 것/기존 state 먼저 반영
      const cached: ContentCardItem[] = [];
      for (const k of keys) {
        const hit = _favDetailCache.get(k);
        if (hit) cached.push(hit);
      }

      if (alive && cached.length > 0) {
        // 캐시가 있으면 먼저 보여줌
        setFavItems((prev) => {
          const merged = uniqueByKey([...cached, ...prev]);
          // favorites에 없는 건 제거
          const allowed = new Set(keys);
          return merged.filter((m) => allowed.has(itemKey(m)));
        });
      }

      // 없는 것만 fetch
      const need = keys.filter((k) => !_favDetailCache.has(k));
      if (!need.length) {
        if (!alive) return;
        // favorites에 없는 카드 정리
        setFavItems((prev) => {
          const allowed = new Set(keys);
          return uniqueByKey(prev).filter((m) => allowed.has(itemKey(m)));
        });
        return;
      }

      const tasks = need.map(async (k) => {
        const [mt, sid] = k.split(":");
        const id = Number(sid);
        if ((mt !== "movie" && mt !== "tv") || !Number.isFinite(id))
          return null;
        return await fetchDetailAsCardItem(mt as any, id);
      });

      const results = (await Promise.all(tasks)).filter(
        Boolean,
      ) as ContentCardItem[];

      if (!alive) return;

      setFavItems((prev) => {
        const allowed = new Set(keys);
        const merged = uniqueByKey([...results, ...prev]);
        return merged.filter((m) => allowed.has(itemKey(m)));
      });
    };

    void load();

    return () => {
      alive = false;
    };
  }, [favorites]);

  const allUnique = useMemo(() => uniqueByKey(favItems), [favItems]);

  // ✅ 카테고리 그룹핑(Movie/TV/Ani)
  const grouped = useMemo(() => {
    const g: Record<CategoryGroupKey, ContentCardItem[]> = {
      movie: [],
      tv: [],
      ani: [],
    };
    for (const it of allUnique) {
      const key = detectCategoryKey(it);
      g[key].push(it);
    }
    return g;
  }, [allUnique]);

  // ✅ 찜이 많은 순서대로 섹션 배치 (없으면 섹션 생성 X)
  const orderedCategories = useMemo(() => {
    const keys: CategoryGroupKey[] = ["movie", "tv", "ani"];
    const nonEmpty = keys
      .map((k) => ({ k, n: grouped[k].length }))
      .filter((x) => x.n > 0);

    const tiePriority: Record<CategoryGroupKey, number> = {
      ani: 0,
      movie: 1,
      tv: 2,
    };

    nonEmpty.sort((a, b) => {
      if (b.n !== a.n) return b.n - a.n;
      return tiePriority[a.k] - tiePriority[b.k];
    });

    return nonEmpty.map((x) => x.k);
  }, [grouped]);

  /** =========================
   * ✅ 편집 상태: 한 번에 하나의 섹션만 편집(all / movie / tv / ani)
   * ========================= */
  const [editingGroup, setEditingGroup] = useState<FavoritesGroupKey | null>(
    null,
  );
  const editingOpen = !!editingGroup;

  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const selectedCount = selectedKeys.size;

  const currentItems = useMemo(() => {
    if (!editingGroup) return [];
    if (editingGroup === "all") return allUnique;
    return grouped[editingGroup];
  }, [allUnique, editingGroup, grouped]);

  const selectedItems = useMemo(() => {
    if (!editingGroup || selectedKeys.size === 0) return [];
    return currentItems.filter((m) => selectedKeys.has(itemKey(m)));
  }, [currentItems, editingGroup, selectedKeys]);

  const toggleSelect = (k: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const startEditGroup = (k: FavoritesGroupKey) => {
    setEditingGroup(k);
    setSelectedKeys(new Set());
    setPlaylistPickerOpen(false);
  };

  const stopEdit = () => {
    setEditingGroup(null);
    setSelectedKeys(new Set());
    setPlaylistPickerOpen(false);
  };

  // ✅ 섹션별 초기화
  const [resetTarget, setResetTarget] = useState<FavoritesGroupKey | null>(
    null,
  );

  const doResetGroup = (k: FavoritesGroupKey) => {
    if (k === "all") {
      onResetFavorites();
      stopEdit();
      setResetTarget(null);
      return;
    }

    const targets = (allUnique ?? []).filter((it) => detectCategoryKey(it) === k);
    const kill = new Set(targets.map((it) => itemKey(it)));

    for (const it of targets) {
      const mtRaw = String((it as any)?.media_type ?? "").toLowerCase();
      const id = Number((it as any)?.id);
      if (!Number.isFinite(id) || id <= 0) continue;
      const mt: MediaType = mtRaw === "tv" ? "tv" : "movie";
      onToggleFavorite(id, mt);
    }

    setFavItems((prev) => prev.filter((it) => !kill.has(itemKey(it))));

    if (editingGroup === k) stopEdit();
    setResetTarget(null);
  };

  // ✅ 전체선택/전체취소 (편집 중인 섹션 기준)
  const allSelected =
    editingOpen &&
    currentItems.length > 0 &&
    selectedCount === currentItems.length;

  const onSelectAllToggle = () => {
    if (!editingOpen) return;
    if (allSelected) {
      setSelectedKeys(new Set());
      return;
    }
    const all = new Set<string>();
    for (const it of currentItems) all.add(itemKey(it));
    setSelectedKeys(all);
  };

  /** =========================
   * ✅ 플레이리스트 추가 모달
   * ========================= */
  const [playlistPickerOpen, setPlaylistPickerOpen] = useState(false);

  const openPlaylistPicker = () => {
    if (!editingOpen) return;
    if (selectedItems.length === 0) return;
    setPlaylistPickerOpen(true);
  };

  const closePlaylistPicker = () => setPlaylistPickerOpen(false);

  const onCreateNewPlaylistFromSelected = () => {
    closePlaylistPicker();
    onRequestCreatePlaylistFromItems(selectedItems);
    stopEdit();
  };

  const onPickPlaylist = (playlistId: string) => {
    closePlaylistPicker();
    if (onAddToExistingPlaylist)
      onAddToExistingPlaylist(playlistId, selectedItems);
    stopEdit();
  };

  /** =========================
   * ✅ 편집 모드 배경 딤 (찜 스타일)
   * ========================= */
  const BackgroundDimmer = (
    <AnimatePresence>
      {editingOpen ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          className="fixed inset-0 z-[40] pointer-events-none"
          style={{
            background:
              "radial-gradient(120% 80% at 50% 0%, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.55) 55%, rgba(0,0,0,0.70) 100%)",
          }}
          aria-hidden="true"
        />
      ) : null}
    </AnimatePresence>
  );

  // ✅ ESC: 모달>편집 순으로 닫기
  useEffect(() => {
    if (!editingOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (playlistPickerOpen) closePlaylistPicker();
        else stopEdit();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingOpen, playlistPickerOpen]);

  return (
    <>
      {BackgroundDimmer}

      <div className="mt-2 relative" style={{ zIndex: editingOpen ? 45 : 1 }}>
        {/* ==================================================
            ✅ 가장 상단: 내 찜 목록
        ================================================== */}
        <motion.section
          layout
          className={
            editingOpen && editingGroup !== "all" ? "pointer-events-none" : ""
          }
          animate={{
            opacity: editingOpen ? (editingGroup === "all" ? 1 : 0.22) : 1,
          }}
          transition={{ duration: 0.28, ease: "easeOut" }}
        >
          <SectionHeader
            padClass={pad}
            title="내 찜 목록"
            titleClassName="text-xl font-bold"
            isActive={editingGroup === "all"}
            right={
              editingGroup !== "all" ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm text-white/80 hover:bg-white/15 hover:text-white transition-all duration-200"
                    onClick={() => startEditGroup("all")}
                  >
                    <Pencil className="h-4 w-4" />
                    편집
                  </button>

                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm text-white/85 hover:bg-white/15 hover:text-white transition-all duration-200"
                    onClick={() => setResetTarget("all")}
                    aria-label="내 찜 전체 초기화"
                  >
                    <RotateCcw className="h-4 w-4" />
                    초기화
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm text-white/80 hover:bg-white/15 hover:text-white transition-all duration-200"
                  onClick={stopEdit}
                >
                  완료
                </button>
              )
            }
          />

          {/* ✅ 찜이 없을 때 */}
          {favoritesKeySet.size === 0 ? (
            <div className={`${pad} py-16`}>
              <div className="w-full flex items-center justify-center text-sm text-white/60">
                현재 찜을 한 컨텐츠가 없습니다.
              </div>
            </div>
          ) : allUnique.length === 0 ? (
            <div className={`${pad} py-16`}>
              <div className="w-full flex items-center justify-center text-sm text-white/60">
                찜 목록을 불러오는 중입니다...
              </div>
            </div>
          ) : (
            <EditableCarouselRow
              padClass={pad}
              items={allUnique}
              favoritesKeySet={favoritesKeySet}
              isEditing={editingGroup === "all"}
              selectedKeys={selectedKeys}
              onToggleSelect={toggleSelect}
              onToggleFavorite={(id, mt) =>
                onToggleFavorite(id, mt as MediaType)
              }
              onOpenDetail={onOpenDetail}
            />
          )}
        </motion.section>

        {/* ==================================================
            ✅ 그 아래: Movie/TV/Ani
        ================================================== */}
        {orderedCategories.map((k) => {
          const items = grouped[k];
          if (items.length === 0) return null;

          const isEditingThis = editingGroup === k;
          const dimmed = editingOpen && !isEditingThis;

          return (
            <motion.section
              key={k}
              layout
              className={["mt-10", dimmed ? "pointer-events-none" : ""].join(
                " ",
              )}
              animate={{
                opacity: editingOpen ? (isEditingThis ? 1 : 0.22) : 1,
              }}
              transition={{ duration: 0.28, ease: "easeOut" }}
            >
              <SectionHeader
                padClass={pad}
                title={categoryTitle(k)}
                titleClassName="text-xl font-bold"
                isActive={isEditingThis}
                right={
                  !isEditingThis ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm text-white/80 hover:bg-white/15 hover:text-white transition-all duration-200"
                        onClick={() => startEditGroup(k)}
                      >
                        <Pencil className="h-4 w-4" />
                        편집
                      </button>

                      <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm text-white/85 hover:bg-white/15 hover:text-white transition-all duration-200"
                        onClick={() => setResetTarget(k)}
                        aria-label={`${categoryTitle(k)} 초기화`}
                      >
                        <RotateCcw className="h-4 w-4" />
                        초기화
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm text-white/80 hover:bg-white/15 hover:text-white transition-all duration-200"
                      onClick={stopEdit}
                    >
                      완료
                    </button>
                  )
                }
              />

              <EditableCarouselRow
                padClass={pad}
                items={items}
                favoritesKeySet={favoritesKeySet}
                isEditing={isEditingThis}
                selectedKeys={selectedKeys}
                onToggleSelect={toggleSelect}
                onToggleFavorite={(id, mt) =>
                  onToggleFavorite(id, mt as MediaType)
                }
                onOpenDetail={onOpenDetail}
              />
            </motion.section>
          );
        })}
      </div>

      <PlaylistPickerPopover
        open={editingOpen && playlistPickerOpen}
        padClass={pad}
        playlists={playlists}
        onClose={closePlaylistPicker}
        onCreateNew={onCreateNewPlaylistFromSelected}
        onPickPlaylist={onPickPlaylist}
      />

      <AnimatePresence>
        {editingOpen ? (
          <motion.div
            initial={{ y: 260, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 260, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 38 }}
            className={`fixed bottom-0 left-0 right-0 z-[70] ${pad} pb-4`}
          >
            <div className="rounded-2xl border border-white/10 bg-[#0b0b10]/95 p-4 shadow-2xl backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-white/90">
                  {selectedCount}개 선택
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-lg bg-white/10 px-3 py-2 text-sm text-white/85 hover:bg-white/15 transition-all duration-200"
                    onClick={onSelectAllToggle}
                  >
                    {allSelected ? "전체취소" : "전체선택"}
                  </button>

                  <button
                    type="button"
                    className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-white/90 transition-all duration-200 disabled:opacity-40"
                    onClick={openPlaylistPicker}
                    disabled={selectedCount === 0}
                  >
                    플레이리스트 추가
                  </button>

                  <button
                    type="button"
                    className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white transition-all duration-200"
                    onClick={stopEdit}
                    aria-label="편집 종료"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <motion.div
                layout
                className="mt-2 text-xs text-white/55"
                initial={false}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                {editingGroup === "all"
                  ? "내 찜 목록 편집 중이에요."
                  : editingGroup
                    ? `${categoryTitle(editingGroup)} 편집 중이에요.`
                    : "편집 중이에요."}
              </motion.div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <BottomConfirmSheet
        open={!!resetTarget}
        title={
          resetTarget === "all"
            ? "내 찜을 전부 초기화할까요?"
            : resetTarget
              ? `${categoryTitle(resetTarget)} 찜을 전부 초기화할까요?`
              : "초기화할까요?"
        }
        desc={
          resetTarget === "all"
            ? "초기화하면 현재 찜 목록이 모두 삭제됩니다. (되돌릴 수 없어요)"
            : "초기화하면 해당 카테고리의 찜 목록이 모두 삭제됩니다. (되돌릴 수 없어요)"
        }
        confirmText="초기화"
        cancelText="취소"
        danger
        onClose={() => setResetTarget(null)}
        onConfirm={() => {
          if (!resetTarget) return;
          doResetGroup(resetTarget);
        }}
      />
    </>
  );
}
