// frontend/src/pages/favorites/FavoritesPage.tsx
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  X,
  RotateCcw,
  Undo2,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import type { UserPreferences } from "../../features/onboarding/Onboarding";
import type { FavoriteItem } from "../../App";

import { Header } from "../../components/layout/Header";
import { Footer } from "../../components/layout/Footer";

import {
  ContentCard,
  type ContentCardItem,
  type MediaType,
} from "../../components/content/ContentCard";

type FavoritesPageProps = {
  userPreferences: UserPreferences;
  favorites: FavoriteItem[];
  onToggleFavorite: (id: number, mediaType?: "movie" | "tv") => void;
  onResetFavorites: () => void;
};

type Playlist = {
  id: string;
  name: string;
  movies: ContentCardItem[];
};

type EditScope =
  | { kind: "favorites" }
  | { kind: "playlist"; playlistId: string }
  | null;

function itemKey(item: ContentCardItem): string {
  const mt = String((item as any)?.media_type ?? "").toLowerCase();
  const id = Number((item as any)?.id);
  return `${mt}:${id}`;
}

function parseKey(k: string): { mt: "movie" | "tv"; id: number } | null {
  const [mt, idStr] = k.split(":");
  const id = Number(idStr);
  if ((mt !== "movie" && mt !== "tv") || !Number.isFinite(id)) return null;
  return { mt, id };
}

function uniqueByKey(items: ContentCardItem[]) {
  return Array.from(new Map(items.map((m) => [itemKey(m), m])).values());
}

/** =========================
 * ✅ 퍼블리싱용 더미 데이터
 * - poster_path null 가능 (meta 기반, No Image fallback)
 * - isKoreanTitle 통과 위해 title/name은 반드시 존재
 * ========================= */
const DUMMY_FAVS: ContentCardItem[] = [
  {
    id: 76600,
    media_type: "movie",
    title: "아바타: 물의 길",
    original_title: "Avatar: The Way of Water",
    vote_average: 7.6,
    poster_path: null,
  } as any,
  {
    id: 157336,
    media_type: "movie",
    title: "인터스텔라",
    original_title: "Interstellar",
    vote_average: 8.4,
    poster_path: null,
  } as any,
  {
    id: 27205,
    media_type: "movie",
    title: "인셉션",
    original_title: "Inception",
    vote_average: 8.4,
    poster_path: null,
  } as any,
  {
    id: 155,
    media_type: "movie",
    title: "다크 나이트",
    original_title: "The Dark Knight",
    vote_average: 8.5,
    poster_path: null,
  } as any,
  {
    id: 603,
    media_type: "movie",
    title: "매트릭스",
    original_title: "The Matrix",
    vote_average: 8.2,
    poster_path: null,
  } as any,
  {
    id: 299536,
    media_type: "movie",
    title: "어벤져스: 인피니티 워",
    original_title: "Avengers: Infinity War",
    vote_average: 8.3,
    poster_path: null,
  } as any,
  {
    id: 299534,
    media_type: "movie",
    title: "어벤져스: 엔드게임",
    original_title: "Avengers: Endgame",
    vote_average: 8.3,
    poster_path: null,
  } as any,
  {
    id: 24428,
    media_type: "movie",
    title: "어벤져스",
    original_title: "The Avengers",
    vote_average: 7.7,
    poster_path: null,
  } as any,
  {
    id: 550,
    media_type: "movie",
    title: "파이트 클럽",
    original_title: "Fight Club",
    vote_average: 8.4,
    poster_path: null,
  } as any,
  {
    id: 680,
    media_type: "movie",
    title: "펄프 픽션",
    original_title: "Pulp Fiction",
    vote_average: 8.5,
    poster_path: null,
  } as any,
  {
    id: 13,
    media_type: "movie",
    title: "포레스트 검프",
    original_title: "Forrest Gump",
    vote_average: 8.5,
    poster_path: null,
  } as any,
  {
    id: 278,
    media_type: "movie",
    title: "쇼생크 탈출",
    original_title: "The Shawshank Redemption",
    vote_average: 8.7,
    poster_path: null,
  } as any,
  {
    id: 240,
    media_type: "movie",
    title: "대부",
    original_title: "The Godfather",
    vote_average: 8.7,
    poster_path: null,
  } as any,
  {
    id: 424,
    media_type: "movie",
    title: "쉰들러 리스트",
    original_title: "Schindler's List",
    vote_average: 8.6,
    poster_path: null,
  } as any,
  {
    id: 122,
    media_type: "movie",
    title: "반지의 제왕: 반지 원정대",
    original_title: "The Lord of the Rings: The Fellowship of the Ring",
    vote_average: 8.4,
    poster_path: null,
  } as any,
  {
    id: 121,
    media_type: "movie",
    title: "반지의 제왕: 두 개의 탑",
    original_title: "The Lord of the Rings: The Two Towers",
    vote_average: 8.4,
    poster_path: null,
  } as any,
  {
    id: 120,
    media_type: "movie",
    title: "반지의 제왕: 왕의 귀환",
    original_title: "The Lord of the Rings: The Return of the King",
    vote_average: 8.5,
    poster_path: null,
  } as any,
  {
    id: 1399,
    media_type: "tv",
    name: "왕좌의 게임",
    original_name: "Game of Thrones",
    vote_average: 8.3,
    poster_path: null,
  } as any,
  {
    id: 1396,
    media_type: "tv",
    name: "브레이킹 배드",
    original_name: "Breaking Bad",
    vote_average: 8.9,
    poster_path: null,
  } as any,
  {
    id: 66732,
    media_type: "tv",
    name: "기묘한 이야기",
    original_name: "Stranger Things",
    vote_average: 8.6,
    poster_path: null,
  } as any,
];

function buildDummyPlaylists(items: ContentCardItem[]): Playlist[] {
  const xs = uniqueByKey(items);
  return [
    { id: "p1", name: "주말에 볼 것", movies: xs.slice(0, 12) },
    { id: "p2", name: "퇴근 후 가볍게", movies: xs.slice(3, 15) },
    { id: "p3", name: "명작 정주행", movies: xs.slice(5, 17) },
    { id: "p4", name: "가족과 함께", movies: xs.slice(2, 14) },
  ];
}

/** =========================
 * ✅ 섹션 헤더 (활성 편집 시: 해당 줄만 밝게)
 * ========================= */
function SectionHeader(props: {
  padClass: string;
  title: string;
  titleClassName?: string;
  right?: ReactNode;
  isActive?: boolean;
}) {
  const { padClass, title, right, titleClassName, isActive } = props;

  return (
    <div>
      <motion.div
        layout
        className={[
          padClass,
          "flex items-center justify-between",
          "rounded-xl",
          "transition-colors",
          isActive ? "bg-white/6" : "border border-transparent",
        ].join(" ")}
        style={{ paddingTop: 10, paddingBottom: 10 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
      >
        <div className={titleClassName ?? "text-2xl font-semibold"}>
          {title}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </motion.div>
    </div>
  );
}

/** =========================
 * ✅ FavoritesPage 내부 전용 캐러셀 Row
 * - ContentCard 재사용
 * - 편집 모드: 카드 선택 가능(✅ 카드 자체를 어둡게 하지 않음)
 * ========================= */
function EditableCarouselRow(props: {
  padClass: string;
  items: ContentCardItem[];
  favoritesKeySet: Set<string>;

  isEditing: boolean;
  selectedKeys: Set<string>;
  onToggleSelect: (k: string) => void;

  onToggleFavorite: (id: number, mt?: MediaType) => void;
  onOpenDetail: (item: ContentCardItem) => void;
}) {
  const {
    padClass,
    items,
    favoritesKeySet,
    isEditing,
    selectedKeys,
    onToggleSelect,
    onToggleFavorite,
    onOpenDetail,
  } = props;

  const [scrollPosition, setScrollPosition] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [hiddenKeys, setHiddenKeys] = useState<string[]>([]);

  const uniqueItems = useMemo(() => uniqueByKey(items), [items]);

  const scroll = (direction: "left" | "right") => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const scrollAmount = container.clientWidth * 0.85;
    const newPosition =
      direction === "left"
        ? Math.max(0, scrollPosition - scrollAmount)
        : scrollPosition + scrollAmount;

    container.scrollTo({ left: newPosition, behavior: "smooth" });
    setScrollPosition(newPosition);
  };

  if (uniqueItems.length === 0) return null;

  return (
    <div className="group/row relative">
      <AnimatePresence>
        {scrollPosition > 0 ? (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => scroll("left")}
            className={[
              "absolute left-0 top-0 bottom-0 z-20 w-12 sm:w-14",
              "bg-gradient-to-r from-[#1a1a24] to-transparent",
              "flex items-center justify-start pl-2",
              "opacity-0 group-hover/row:opacity-100 transition-opacity",
            ].join(" ")}
            aria-label="왼쪽으로 스크롤"
          >
            <ChevronLeft className="w-10 h-10 text-white drop-shadow-lg" />
          </motion.button>
        ) : null}
      </AnimatePresence>

      <div
        ref={scrollContainerRef}
        className={`flex gap-2 overflow-x-auto scrollbar-hide ${padClass} scroll-smooth py-2`}
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        onScroll={(e) => setScrollPosition(e.currentTarget.scrollLeft)}
      >
        {uniqueItems.map((item) => {
          const mt = String(
            (item as any)?.media_type ?? "",
          ).toLowerCase() as MediaType;
          const id = Number((item as any)?.id);
          const k = `${mt}:${id}`;

          if (hiddenKeys.includes(k)) return null;

          const isFav = favoritesKeySet.has(k);
          const isSelected = selectedKeys.has(k);

          const onCardClick = () => {
            if (isEditing) onToggleSelect(k);
            else onOpenDetail(item);
          };

          return (
            <motion.div
              key={k}
              layout
              className="flex-shrink-0 w-[200px] transition-transform duration-300 hover:scale-[1.03] relative"
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              <ContentCard
                item={item}
                isFavorite={isFav}
                onClick={onCardClick}
                canFavorite={!isEditing}
                onToggleFavorite={() => {
                  if (isEditing) return;
                  onToggleFavorite(id, mt);
                }}
                context="default"
                onPosterError={() => {
                  setHiddenKeys((prev) =>
                    prev.includes(k) ? prev : [...prev, k],
                  );
                }}
                // ✅ (5) 선택 테두리: 얇게 + 살짝 여백(꽉 차는 느낌 제거)
                className={
                  isEditing && isSelected
                    ? "outline outline-1 outline-white/65 outline-offset-[3px] rounded-[7px]"
                    : undefined
                }
              />

              {/* ✅ 편집 중 표시만(카드 어둡게 X) */}
              <AnimatePresence>
                {isEditing ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className="absolute right-2 top-2 z-30"
                    style={{ pointerEvents: "none" }}
                  >
                    <div
                      className={[
                        "flex h-7 w-7 items-center justify-center rounded-full border",
                        "shadow-[0_10px_30px_rgba(0,0,0,0.35)]",
                        isSelected
                          ? "bg-white text-black border-white"
                          : "bg-black/35 text-white border-white/45",
                      ].join(" ")}
                    >
                      {isSelected ? <Check className="h-4 w-4" /> : null}
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      <motion.button
        initial={{ opacity: 0.9 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        onClick={() => scroll("right")}
        className={[
          "absolute right-0 top-0 bottom-0 z-20 w-12 sm:w-14",
          "bg-gradient-to-l from-[#1a1a24] to-transparent",
          "flex items-center justify-end pr-2",
          "opacity-0 group-hover/row:opacity-100 transition-opacity",
        ].join(" ")}
        aria-label="오른쪽으로 스크롤"
      >
        <ChevronRight className="w-10 h-10 text-white drop-shadow-lg" />
      </motion.button>
    </div>
  );
}

/** =========================
 * ✅ 공용 Bottom Confirm Sheet
 * - 하단에서 올라오는 모달
 * ========================= */
function BottomConfirmSheet(props: {
  open: boolean;
  title: string;
  desc?: string;
  confirmText: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const {
    open,
    title,
    desc,
    confirmText,
    cancelText = "취소",
    danger,
    onConfirm,
    onClose,
  } = props;

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            className="fixed inset-0 z-[85] bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            onClick={onClose}
          />
          <motion.div
            initial={{ y: 260, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 260, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 38 }}
            className="fixed bottom-0 left-0 right-0 z-[90] px-6 pb-4"
          >
            <div className="rounded-2xl border border-white/10 bg-[#0b0b10]/95 p-5 shadow-2xl backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-lg font-bold text-white">{title}</div>
                  {desc ? (
                    <div className="mt-2 text-sm text-white/60">{desc}</div>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white transition-all duration-200"
                  onClick={onClose}
                  aria-label="닫기"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg bg-white/10 px-3 py-2 text-sm text-white/85 hover:bg-white/15 transition-all duration-200"
                  onClick={onClose}
                >
                  {cancelText}
                </button>
                <button
                  type="button"
                  className={[
                    "rounded-lg px-3 py-2 text-sm font-semibold transition-all duration-200",
                    danger
                      ? "bg-white text-black hover:bg-white/90"
                      : "bg-white text-black hover:bg-white/90",
                  ].join(" ")}
                  onClick={onConfirm}
                >
                  {confirmText}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}

export default function FavoritesPage({
  favorites,
  onToggleFavorite,
  onResetFavorites,
}: FavoritesPageProps) {
  const navigate = useNavigate();
  const location = useLocation();

  // ✅ 퍼블리싱: 더미를 "상태"로 관리(초기화 UI 반영 가능)
  const [favItems, setFavItems] = useState<ContentCardItem[]>(() => DUMMY_FAVS);

  useEffect(() => {
    void favorites;
  }, [favorites]);

  const [playlists, setPlaylists] = useState<Playlist[]>(() =>
    buildDummyPlaylists(DUMMY_FAVS),
  );

  useEffect(() => {
    setPlaylists(buildDummyPlaylists(DUMMY_FAVS));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const favoritesKeySet = useMemo(() => {
    const s = new Set<string>();
    for (const it of uniqueByKey(favItems)) s.add(itemKey(it));
    return s;
  }, [favItems]);

  const pad = "px-6";

  /** =========================
   * ✅ 편집 상태 + 선택
   * ========================= */
  const [editScope, setEditScope] = useState<EditScope>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  // (4) 삭제 "스테이징" + 되돌리기(이전)
  const [pendingDeletedKeys, setPendingDeletedKeys] = useState<Set<string>>(
    new Set(),
  );
  const [deleteHistory, setDeleteHistory] = useState<string[][]>([]);

  const selectedCount = selectedKeys.size;

  // ✅ draft
  const [draft, setDraft] = useState<{
    active: boolean;
    name: string;
    movies: ContentCardItem[];
  }>({ active: false, name: "", movies: [] });

  const creatingPlaylist = draft.active;

  // (2) 드래프트 생성 중엔 플레이리스트 영역을 "활성(밝게)"로 취급
  const editingOpen = !!editScope; // "편집 버튼" 기준
  const rawActiveIsFavorites = editScope?.kind === "favorites";
  const activeIsFavorites = rawActiveIsFavorites && !creatingPlaylist;

  const activePlaylistId =
    editScope?.kind === "playlist" ? editScope.playlistId : null;

  const currentScopeItems = useMemo(() => {
    if (!editScope) return [];

    if (editScope.kind === "favorites") {
      const base = uniqueByKey(favItems);
      return base.filter((m) => !pendingDeletedKeys.has(itemKey(m)));
    }

    const pl = playlists.find((p) => p.id === editScope.playlistId);
    const xs = pl ? uniqueByKey(pl.movies) : [];
    return xs.filter((m) => !pendingDeletedKeys.has(itemKey(m)));
  }, [editScope, favItems, playlists, pendingDeletedKeys]);

  const selectedItems = useMemo(() => {
    if (!editScope || selectedKeys.size === 0) return [];
    return currentScopeItems.filter((m) => selectedKeys.has(itemKey(m)));
  }, [currentScopeItems, editScope, selectedKeys]);

  const toggleSelect = (k: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const clearStaging = () => {
    setPendingDeletedKeys(new Set());
    setDeleteHistory([]);
  };

  const startEdit = (scope: EditScope) => {
    // 스코프 변경 시 스테이징 초기화 (기존 데이터는 유지)
    setDraft({ active: false, name: "", movies: [] });
    setSelectedKeys(new Set());
    clearStaging();
    setEditScope(scope);
  };

  // (4) "완료" 했을 때만 진짜 삭제 반영
  const commitAndStopEdit = () => {
    if (!editScope) {
      clearStaging();
      setSelectedKeys(new Set());
      setEditScope(null);
      return;
    }

    const kill = new Set(pendingDeletedKeys);

    if (kill.size > 0) {
      if (editScope.kind === "favorites") {
        setFavItems((prev) => prev.filter((m) => !kill.has(itemKey(m))));

        // 실제 찜 토글 반영은 완료 시점에만
        for (const k of Array.from(kill)) {
          const parsed = parseKey(k);
          if (!parsed) continue;
          onToggleFavorite(parsed.id, parsed.mt);
        }
      } else if (editScope.kind === "playlist") {
        const pid = editScope.playlistId;
        setPlaylists((prev) =>
          prev.map((p) => {
            if (p.id !== pid) return p;
            return {
              ...p,
              movies: p.movies.filter((m) => !kill.has(itemKey(m))),
            };
          }),
        );
      }
    }

    setDraft({ active: false, name: "", movies: [] });
    setSelectedKeys(new Set());
    clearStaging();
    setEditScope(null);
  };

  const cancelDraft = () => {
    setDraft({ active: false, name: "", movies: [] });
  };

  const closeEditor = () => {
    // X/ESC 종료는 "스테이징 취소" (진짜 삭제 X)
    cancelDraft();
    setSelectedKeys(new Set());
    clearStaging();
    setEditScope(null);
  };

  const openDetail = (item: ContentCardItem) => {
    const mt = String((item as any)?.media_type ?? "").toLowerCase();
    const id = Number((item as any)?.id);
    if ((mt !== "movie" && mt !== "tv") || !Number.isFinite(id)) return;

    navigate(`/title/${mt}/${id}`, { state: { backgroundLocation: location } });
  };

  /** =========================
   * ✅ BottomSheet 액션
   * ========================= */
  // (6) 전체선택 <-> 전체취소
  const allSelected =
    !!editScope &&
    currentScopeItems.length > 0 &&
    selectedCount === currentScopeItems.length;

  const onSelectAllToggle = () => {
    if (!editScope) return;
    if (allSelected) {
      setSelectedKeys(new Set());
      return;
    }
    const all = new Set<string>();
    for (const it of currentScopeItems) all.add(itemKey(it));
    setSelectedKeys(all);
  };

  // (4) 삭제는 스테이징만
  const onDeleteSelectedStage = () => {
    if (!editScope) return;
    if (selectedKeys.size === 0) return;

    const keys = Array.from(selectedKeys);
    setPendingDeletedKeys((prev) => {
      const next = new Set(prev);
      for (const k of keys) next.add(k);
      return next;
    });
    setDeleteHistory((prev) => [...prev, keys]);
    setSelectedKeys(new Set());
  };

  // (4) 이전(Undo): 삭제 후에만 활성
  const onUndoLastDelete = () => {
    setDeleteHistory((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setPendingDeletedKeys((pk) => {
        const next = new Set(pk);
        for (const k of last) next.delete(k);
        return next;
      });
      return prev.slice(0, -1);
    });
  };

  /** =========================
   * ✅ 플레이리스트 생성 플로우 + 자연스러운 화면 전환(스크롤)
   * ========================= */
  const draftRef = useRef<HTMLDivElement | null>(null);

  const beginCreatePlaylistFromSelection = () => {
    if (!editScope) return;
    if (selectedItems.length === 0) return;

    setDraft({
      active: true,
      name: "",
      movies: selectedItems,
    });

    // ✅ 편집은 유지, 선택만 초기화 (기존 요구사항 유지)
    setSelectedKeys(new Set());

    // (3) 생성 영역이 화면 "중앙"으로 오도록
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        draftRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      });
    });
  };

  const confirmCreatePlaylist = () => {
    const name = draft.name.trim();
    if (!draft.active) return;
    if (!name) return;

    const id = `p-${Date.now()}`;
    setPlaylists((prev) => [
      { id, name, movies: uniqueByKey(draft.movies) },
      ...prev,
    ]);

    // ✅ 생성되면서 편집 종료 (기존 로직 유지)
    setDraft({ active: false, name: "", movies: [] });

    // 스테이징이 있다면 "완료" 의미로 커밋하고 종료하는게 자연스러워서 그대로 완료 처리
    commitAndStopEdit();
  };

  /** =========================
   * ✅ 찜 "초기화" (하단 모달로 변경)
   * ========================= */
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  const doResetFavorites = () => {
    setFavItems([]);
    onResetFavorites();

    // 편집/선택/드래프트/스테이징 정리
    setSelectedKeys(new Set());
    clearStaging();
    setEditScope(null);
    setDraft({ active: false, name: "", movies: [] });
    setResetConfirmOpen(false);
  };

  /** =========================
   * ✅ 플레이리스트 삭제(편집 버튼 옆) + 하단 확인 모달
   * ========================= */
  const [playlistDeleteTarget, setPlaylistDeleteTarget] = useState<
    string | null
  >(null);

  const confirmDeletePlaylist = () => {
    const pid = playlistDeleteTarget;
    if (!pid) return;
    setPlaylists((prev) => prev.filter((p) => p.id !== pid));
    setPlaylistDeleteTarget(null);
  };

  /** =========================
   * ✅ 편집 잠금 규칙
   * 1) 편집 중엔 "활성 줄만" 밝고, 나머지는 어둡고 클릭 불가
   * 2) 편집 종료는: 바텀 모달 X / ESC / (섹션)완료 버튼만
   * ========================= */
  const closeEditorKey = closeEditor;

  useEffect(() => {
    if (!editingOpen && !draft.active) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeEditorKey();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingOpen, draft.active]);

  /** =========================
   * ✅ Footer 위 브릿지(메인페이지 느낌) + 여백 조금만
   * ========================= */
  const FooterBridge = (
    <div className="relative mt-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-8 left-0 right-0 h-8"
        style={{
          backgroundImage:
            "linear-gradient(to bottom, rgba(26,26,36,0) 0%, #0b0b10 100%)",
        }}
      />
    </div>
  );

  // 흰줄: 페이지 타이틀(찜/플레이리스트) 하단에만
  const TopDivider = (
    <div className={`${pad} mt-4`}>
      <div className="h-px w-full bg-white/10" />
    </div>
  );

  // ✅ 바텀시트: 편집 중엔 항상 유지
  const bottomSheetOpen = editingOpen;

  /** =========================
   * ✅ 편집 모드 배경 딤(시각적)
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
              "radial-gradient(120% 80% at 50% 0%, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.55) 55%, rgba(0,0,0,0.70) 100%)",
          }}
          aria-hidden="true"
        />
      ) : null}
    </AnimatePresence>
  );

  return (
    <div className="min-h-screen bg-[#1a1a24] text-white overflow-x-hidden flex flex-col">
      <Header />

      {/* ✅ 편집 모드 딤 */}
      {BackgroundDimmer}

      <main className="flex-1 pt-[84px] relative z-[45]">
        {/* =========================
            페이지 제목 (flex + 초기화 버튼)
        ========================= */}
        <motion.div
          layout
          className={pad}
          initial={false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        >
          <div className="flex justify-between items-end gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight">
                찜 / 플레이리스트
              </h1>
              <p className="mt-1 text-sm text-white/60">
                찜과 플레이리스트를 캐러셀로 한 번에 확인해요.
              </p>
            </div>

            <button
              type="button"
              className="shrink-0 inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm text-white/85 hover:bg-white/15 transition-all duration-200"
              onClick={() => setResetConfirmOpen(true)}
              aria-label="찜 전체 초기화"
            >
              <RotateCcw className="h-4 w-4" />
              초기화
            </button>
          </div>
        </motion.div>

        {TopDivider}

        {/* =========================
            내 찜 (편집 시 활성 영역)
            (2) 생성 중엔 내 찜은 비활성(어둡게), 플레이리스트 생성 영역이 밝게
        ========================= */}
        <motion.section
          layout
          className={[
            "mt-2 relative",
            editingOpen && !activeIsFavorites ? "pointer-events-none" : "",
          ].join(" ")}
          animate={{
            opacity: editingOpen ? (activeIsFavorites ? 1 : 0.22) : 1,
            filter: editingOpen
              ? activeIsFavorites
                ? "none"
                : "blur(0px)"
              : "none",
          }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          style={{ zIndex: editingOpen && activeIsFavorites ? 50 : 45 }}
        >
          <SectionHeader
            padClass={pad}
            title="내 찜 목록"
            titleClassName="text-xl font-bold"
            isActive={editingOpen && activeIsFavorites}
            right={
              !activeIsFavorites ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm text-white/80 hover:bg-white/15 hover:text-white transition-all duration-200"
                  onClick={() => startEdit({ kind: "favorites" })}
                >
                  <Pencil className="h-4 w-4" />
                  편집
                </button>
              ) : (
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm text-white/80 hover:bg-white/15 hover:text-white transition-all duration-200"
                  onClick={commitAndStopEdit}
                >
                  완료
                </button>
              )
            }
          />

          <EditableCarouselRow
            padClass={pad}
            items={
              editScope?.kind === "favorites"
                ? favItems.filter((m) => !pendingDeletedKeys.has(itemKey(m)))
                : favItems
            }
            favoritesKeySet={favoritesKeySet}
            isEditing={activeIsFavorites}
            selectedKeys={selectedKeys}
            onToggleSelect={toggleSelect}
            onToggleFavorite={onToggleFavorite}
            onOpenDetail={openDetail}
          />
        </motion.section>

        {/* =========================
            플레이리스트
            (2) draft.active면 플레이리스트 영역을 밝게(활성) 처리
        ========================= */}
        <motion.section
          layout
          className={[
            "mt-10 relative",
            editingOpen && activeIsFavorites ? "pointer-events-none" : "",
          ].join(" ")}
          animate={{
            opacity: editingOpen ? (activeIsFavorites ? 0.22 : 1) : 1,
          }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          style={{ zIndex: editingOpen && !activeIsFavorites ? 50 : 45 }}
        >
          <SectionHeader
            padClass={pad}
            title="플레이리스트"
            titleClassName="text-2xl font-semibold"
            isActive={editingOpen && !activeIsFavorites}
          />

          {/* ✅ draft 생성 영역 */}
          <AnimatePresence>
            {draft.active ? (
              <motion.div
                ref={draftRef}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                transition={{ duration: 0.32, ease: "easeOut" }}
                className="mb-10"
              >
                <div className={`${pad} flex items-center justify-between`}>
                  <div className="flex-1 min-w-0">
                    <input
                      autoFocus
                      value={draft.name}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, name: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          confirmCreatePlaylist();
                        }
                      }}
                      placeholder="제목을 입력하세요"
                      className={[
                        "w-full bg-transparent",
                        "text-xl font-semibold text-white/95",
                        "outline-none",
                        "placeholder:text-white/35",
                        "caret-white",
                        "animate-pulse",
                      ].join(" ")}
                    />
                  </div>

                  <button
                    type="button"
                    className={[
                      "ml-3 inline-flex items-center gap-2 rounded-lg",
                      "bg-white/10 px-3 py-2 text-sm text-white/85",
                      "hover:bg-white/15 transition-all duration-200",
                      "disabled:opacity-40 disabled:cursor-not-allowed",
                    ].join(" ")}
                    onClick={confirmCreatePlaylist}
                    disabled={!draft.name.trim()}
                  >
                    생성
                  </button>
                </div>

                <div className="mt-2">
                  <EditableCarouselRow
                    padClass={pad}
                    items={draft.movies}
                    favoritesKeySet={favoritesKeySet}
                    isEditing={false}
                    selectedKeys={new Set()}
                    onToggleSelect={() => {}}
                    onToggleFavorite={onToggleFavorite}
                    onOpenDetail={openDetail}
                  />
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* 기존 플레이리스트들 */}
          <div className="space-y-10">
            {playlists.map((pl) => {
              const isEditingThis =
                editScope?.kind === "playlist" &&
                editScope.playlistId === pl.id;

              const disabledByOtherPlaylist =
                editingOpen &&
                !activeIsFavorites &&
                !!activePlaylistId &&
                activePlaylistId !== pl.id;

              const visibleMovies = isEditingThis
                ? pl.movies.filter((m) => !pendingDeletedKeys.has(itemKey(m)))
                : pl.movies;

              return (
                <motion.div
                  key={pl.id}
                  layout
                  animate={{
                    opacity: editingOpen
                      ? activeIsFavorites
                        ? 0.22
                        : disabledByOtherPlaylist
                          ? 0.22
                          : 1
                      : 1,
                  }}
                  transition={{ duration: 0.28, ease: "easeOut" }}
                  className={[
                    disabledByOtherPlaylist ? "pointer-events-none" : "",
                  ].join(" ")}
                >
                  <div className={`${pad} flex items-center justify-between`}>
                    <div className="text-xl font-semibold text-white/95">
                      {pl.name}
                    </div>

                    {/* (1) 편집 전: 삭제 버튼 추가(편집 버튼 우측) */}
                    {!isEditingThis ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm text-white/80 hover:bg-white/15 hover:text-white transition-all duration-200"
                          onClick={() =>
                            startEdit({ kind: "playlist", playlistId: pl.id })
                          }
                        >
                          <Pencil className="h-4 w-4" />
                          편집
                        </button>

                        <button
                          type="button"
                          className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm text-white/80 hover:bg-white/15 hover:text-white transition-all duration-200"
                          onClick={() => setPlaylistDeleteTarget(pl.id)}
                          aria-label="플레이리스트 삭제"
                        >
                          <Trash2 className="h-4 w-4" />
                          삭제
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm text-white/80 hover:bg-white/15 hover:text-white transition-all duration-200"
                        onClick={commitAndStopEdit}
                      >
                        완료
                      </button>
                    )}
                  </div>

                  <div className="mt-2">
                    <EditableCarouselRow
                      padClass={pad}
                      items={visibleMovies}
                      favoritesKeySet={favoritesKeySet}
                      isEditing={isEditingThis}
                      selectedKeys={selectedKeys}
                      onToggleSelect={toggleSelect}
                      onToggleFavorite={onToggleFavorite}
                      onOpenDetail={openDetail}
                    />
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.section>

        {FooterBridge}
      </main>

      <Footer />

      {/* =========================
          ✅ 편집 Bottom Sheet
          - (4) "이전" 버튼 추가 + 스테이징 삭제
          - (6) 전체선택 ↔ 전체취소
      ========================= */}
      <AnimatePresence>
        {bottomSheetOpen ? (
          <motion.div
            initial={{ y: 260, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 260, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 38 }}
            className={`fixed bottom-0 left-0 right-0 z-[70] ${pad} pb-4`}
          >
            <div className="rounded-2xl border border-white/10 bg-[#0b0b10]/95 p-4 shadow-2xl backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                {/* 좌측 */}
                <div className="text-sm font-semibold text-white/90">
                  {draft.active
                    ? "플레이리스트 생성 중"
                    : `${selectedCount}개 선택`}
                </div>

                {/* 우측 액션 */}
                <div className="flex items-center gap-2">
                  {/* (4) 이전(Undo): 삭제 후에만 활성 */}
                  <button
                    type="button"
                    className="rounded-lg bg-white/10 px-3 py-2 text-sm text-white/85 hover:bg-white/15 transition-all duration-200 disabled:opacity-40 inline-flex items-center gap-2"
                    onClick={onUndoLastDelete}
                    disabled={draft.active || deleteHistory.length === 0}
                    aria-label="이전"
                  >
                    <Undo2 className="h-4 w-4" />
                    이전
                  </button>

                  <button
                    type="button"
                    className="rounded-lg bg-white/10 px-3 py-2 text-sm text-white/85 hover:bg-white/15 transition-all duration-200 disabled:opacity-40"
                    onClick={onSelectAllToggle}
                    disabled={draft.active}
                  >
                    {allSelected ? "전체취소" : "전체선택"}
                  </button>

                  <button
                    type="button"
                    className="rounded-lg bg-white/10 px-3 py-2 text-sm text-white/85 hover:bg-white/15 transition-all duration-200 inline-flex items-center gap-2 disabled:opacity-40"
                    onClick={onDeleteSelectedStage}
                    disabled={draft.active || selectedCount === 0}
                  >
                    <Trash2 className="h-4 w-4" />
                    삭제
                  </button>

                  <button
                    type="button"
                    className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-white/90 transition-all duration-200 disabled:opacity-40"
                    onClick={beginCreatePlaylistFromSelection}
                    disabled={draft.active || selectedCount === 0}
                  >
                    플레이리스트 생성
                  </button>

                  {draft.active ? (
                    <button
                      type="button"
                      className="rounded-lg bg-white/10 px-3 py-2 text-sm text-white/85 hover:bg-white/15 transition-all duration-200"
                      onClick={cancelDraft}
                    >
                      취소
                    </button>
                  ) : null}

                  {/* ✅ X: 편집 종료 (스테이징 취소) */}
                  <button
                    type="button"
                    className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white transition-all duration-200"
                    onClick={closeEditor}
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
                {draft.active
                  ? "제목을 입력하고 생성(Enter 가능)하면 새 플레이리스트가 추가되고 편집이 종료돼요."
                  : editScope?.kind === "favorites"
                    ? "내 찜 편집 중이에요."
                    : "플레이리스트 편집 중이에요."}
              </motion.div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* (1) 플레이리스트 삭제 확인: 하단 모달 */}
      <BottomConfirmSheet
        open={!!playlistDeleteTarget}
        title="삭제하시겠습니까?"
        confirmText="삭제"
        cancelText="취소"
        danger
        onClose={() => setPlaylistDeleteTarget(null)}
        onConfirm={confirmDeletePlaylist}
      />

      {/* (7) 초기화 모달: 중앙 -> 하단 모달 */}
      <BottomConfirmSheet
        open={resetConfirmOpen}
        title="내 찜을 전부 초기화할까요?"
        desc="초기화하면 현재 찜 목록이 모두 삭제됩니다. (되돌릴 수 없어요)"
        confirmText="초기화"
        cancelText="취소"
        danger
        onClose={() => setResetConfirmOpen(false)}
        onConfirm={doResetFavorites}
      />
    </div>
  );
}
