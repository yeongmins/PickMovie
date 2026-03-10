// frontend/src/pages/favorites/FavoritesPlaylistPage.tsx
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronLeft, ChevronRight, Plus, X } from "lucide-react";

import type { UserPreferences } from "../../features/analyze/Analyze";
import type { FavoriteItem, PlaylistDto } from "../../App";

import { Header } from "../../components/layout/Header";
import { PageFooter } from "../../components/layout/Footer";
import { openAuthModal } from "../../lib/auth";

import {
  ContentCard,
  type ContentCardItem,
  type MediaType,
} from "../../components/content/ContentCard";

import { FavoritesSection } from "./FavoritesSection";
import { PlaylistSection, type PlaylistSectionHandle } from "./PlaylistSection";

type FavoritesPlaylistPageProps = {
  userPreferences: UserPreferences;
  favorites: FavoriteItem[];
  playlists: PlaylistDto[];
  isAuthed?: boolean;

  onToggleFavorite: (id: number, mediaType?: "movie" | "tv") => void;
  onResetFavorites: () => void;

  // playlists db handlers
  onCreatePlaylist: (name: string, items: FavoriteItem[]) => void;
  onDeletePlaylist: (playlistId: number) => void;
  onRenamePlaylist: (playlistId: number, name: string) => void;
  onSetPlaylistItems: (playlistId: number, items: FavoriteItem[]) => void;
  onAddItemsToPlaylist: (playlistId: number, items: FavoriteItem[]) => void;
};

type ViewMode = "favorites" | "playlists";

function buildFavoritesKeySet(favorites: FavoriteItem[]): Set<string> {
  const set = new Set<string>();
  for (const f of Array.isArray(favorites) ? favorites : []) {
    const mt = f?.mediaType === "tv" ? "tv" : "movie";
    const id = Number(f?.id);
    if (!Number.isFinite(id) || id <= 0) continue;
    set.add(`${mt}:${id}`);
  }
  return set;
}

function itemKey(item: ContentCardItem): string {
  const mt = String((item as any)?.media_type ?? "").toLowerCase();
  const id = Number((item as any)?.id);
  return `${mt}:${id}`;
}

function uniqueByKey(items: ContentCardItem[]) {
  return Array.from(new Map(items.map((m) => [itemKey(m), m])).values());
}

function toFavoriteItemsFromCardItems(
  items: ContentCardItem[],
): FavoriteItem[] {
  const xs = uniqueByKey(items);
  const map = new Map<string, FavoriteItem>();
  for (const it of xs) {
    const mt = String((it as any)?.media_type ?? "").toLowerCase();
    const id = Number((it as any)?.id);
    if (!Number.isFinite(id) || id <= 0) continue;
    if (mt !== "movie" && mt !== "tv") continue;
    map.set(`${mt}:${id}`, { id, mediaType: mt });
  }
  return Array.from(map.values());
}

/** =========================
 * 공용 Bottom Confirm Sheet
 * - 찜/플레이리스트 공통 스타일로 사용
 * ========================= */
function SharedBottomConfirmSheet(props: {
  open: boolean;
  title: string;
  titleMeta?: ReactNode;
  desc?: string;
  confirmText: string;
  cancelText?: string;
  danger?: boolean;
  footerLeft?: ReactNode;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const {
    open,
    title,
    titleMeta,
    desc,
    confirmText,
    cancelText = "취소",
    danger,
    footerLeft,
    onConfirm,
    onClose,
  } = props;

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

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
            <div className="rounded-2xl bg-[#0b0b10]/95 p-5 shadow-2xl backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-lg font-bold text-white">{title}</div>
                  {titleMeta ? (
                    <div className="mt-2 text-sm text-white/80">
                      {titleMeta}
                    </div>
                  ) : null}
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

              <div className="mt-5 flex items-center justify-between gap-3">
                <div className="min-w-0 text-sm font-bold text-white/80">
                  {footerLeft ?? null}
                </div>

                <div className="flex items-center justify-end gap-2">
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
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}

/** =========================
 * 섹션 헤더 공통 (찜 스타일 기준)
 * =========================
 * FIX: title을 ReactNode로 변경 (input 같은 엘리먼트도 허용)
 */
function SharedSectionHeader(props: {
  padClass: string;
  title: ReactNode;
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
        style={{ paddingTop: 10, paddingBottom: 5 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
      >
        <div className={titleClassName ?? "text-xl font-bold"}>{title}</div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </motion.div>
    </div>
  );
}

/** =========================
 * 플레이리스트 목록 모달(팝오버) - 공통
 * ========================= */
function SharedPlaylistPickerPopover(props: {
  open: boolean;
  padClass: string;
  playlists: { id: string; name: string }[];
  onClose: () => void;
  onCreateNew: () => void;
  onPickPlaylist: (playlistId: string) => void;
}) {
  const { open, padClass, playlists, onClose, onCreateNew, onPickPlaylist } =
    props;

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            className="fixed inset-0 z-[78]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.995 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.995 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className={`fixed left-0 right-0 z-[80] ${padClass}`}
            style={{ bottom: 125 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-end">
              <div className="w-[420px] max-w-[92vw] rounded-2xl border border-white/10 bg-[#0b0b10]/95 shadow-2xl backdrop-blur overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                  <div className="text-sm font-semibold text-white/90">
                    플레이리스트 추가
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

                <div className="p-4">
                  <button
                    type="button"
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-white text-black px-3 py-2 text-sm font-semibold hover:bg-white/90 transition-all duration-200"
                    onClick={onCreateNew}
                  >
                    <Plus className="h-4 w-4" />
                    플레이리스트 생성
                  </button>

                  <div className="mt-3 max-h-[240px] overflow-y-auto">
                    {playlists.length === 0 ? (
                      <div className="text-sm text-white/55 py-6 text-center">
                        아직 플레이리스트가 없어요.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {playlists.map((pl) => (
                          <button
                            key={pl.id}
                            type="button"
                            className={[
                              "w-full text-left rounded-xl px-3 py-2",
                              "bg-white/5 hover:bg-white/10 transition-all duration-200",
                            ].join(" ")}
                            onClick={() => onPickPlaylist(pl.id)}
                          >
                            <div className="text-sm font-semibold text-white/90">
                              {pl.name}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="mt-3 text-xs text-white/55">
                    플레이리스트를 선택하면 해당 플레이리스트에 추가돼요.
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}

function SharedEditDimmer(props: { open: boolean; zIndex?: number }) {
  const { open, zIndex = 40 } = props;

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          className="fixed inset-0 pointer-events-none"
          style={{
            zIndex,
            background:
              "radial-gradient(120% 80% at 50% 0%, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.55) 55%, rgba(0,0,0,0.70) 100%)",
          }}
          aria-hidden="true"
        />
      ) : null}
    </AnimatePresence>
  );
}

/** =========================
 * Editable Carousel Row (공통)
 * - 좌/우 버튼 hover 때만 표시
 * - 편집 시 체크만 표시 (링/아웃라인 제거)
 * ========================= */
function SharedEditableCarouselRow(props: {
  padClass: string;
  items: ContentCardItem[];
  favoritesKeySet: Set<string>;
  isLastCarousel?: boolean;

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
    isLastCarousel = false,
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
  const canShowLeftButton = uniqueItems.length >= 5 && scrollPosition > 0;

  const scroll = (direction: "left" | "right") => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);
    if (maxScrollLeft <= 0) {
      setScrollPosition(0);
      return;
    }

    const scrollAmount = container.clientWidth * 0.85;
    const targetPosition =
      direction === "left"
        ? Math.max(0, scrollPosition - scrollAmount)
        : scrollPosition + scrollAmount;
    const newPosition = Math.max(0, Math.min(targetPosition, maxScrollLeft));

    container.scrollTo({ left: newPosition, behavior: "smooth" });
    setScrollPosition(newPosition);
  };

  if (uniqueItems.length === 0) return null;

  return (
    <div className={["group/row relative", isLastCarousel ? "mb-10" : ""].join(" ")}>
      {canShowLeftButton ? (
        <button
          type="button"
          onClick={() => scroll("left")}
          className={[
            "absolute left-0 top-0 bottom-0 z-20 w-12 sm:w-14",
            isEditing ? "" : "bg-gradient-to-r from-[#10131b] to-transparent",
            "flex items-center justify-start pl-2",
            "opacity-0 pointer-events-none",
            "group-hover/row:opacity-100 group-hover/row:pointer-events-auto",
            "transition-opacity duration-200",
          ].join(" ")}
          aria-label="왼쪽으로 스크롤"
        >
          <ChevronLeft className="w-10 h-10 text-white drop-shadow-lg" />
        </button>
      ) : null}

      <div
        ref={scrollContainerRef}
        className={`flex gap-2 overflow-x-auto scrollbar-hide ${padClass} scroll-smooth py-2`}
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        onScroll={(e) => setScrollPosition(e.currentTarget.scrollLeft)}
      >
        {uniqueItems.map((item) => {
          const mt = String((item as any)?.media_type ?? "").toLowerCase() as
            | "movie"
            | "tv";
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
                  if (mt === "movie" || mt === "tv") onToggleFavorite(id, mt);
                  else onToggleFavorite(id, "movie");
                }}
                context="default"
                onPosterError={() => {
                  setHiddenKeys((prev) =>
                    prev.includes(k) ? prev : [...prev, k],
                  );
                }}
                className={
                  isEditing
                    ? "outline-none focus:outline-none ring-0 focus:ring-0 focus:ring-offset-0"
                    : undefined
                }
              />

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

      <button
        type="button"
        onClick={() => scroll("right")}
        className={[
          "absolute right-0 top-0 bottom-0 z-20 w-12 sm:w-14",
          isEditing ? "" : "bg-gradient-to-l from-[#10131b] to-transparent",
          "flex items-center justify-end pr-2",
          "opacity-0 pointer-events-none",
          "group-hover/row:opacity-100 group-hover/row:pointer-events-auto",
          "transition-opacity duration-200",
        ].join(" ")}
        aria-label="오른쪽으로 스크롤"
      >
        <ChevronRight className="w-10 h-10 text-white drop-shadow-lg" />
      </button>
    </div>
  );
}

export type FavoritesPlaylistSharedUI = {
  SectionHeader: typeof SharedSectionHeader;
  EditableCarouselRow: typeof SharedEditableCarouselRow;
  BottomConfirmSheet: typeof SharedBottomConfirmSheet;
  PlaylistPickerPopover: typeof SharedPlaylistPickerPopover;
  EditDimmer: typeof SharedEditDimmer;
  styles: {
    sectionActionButton: string;
    sectionActionButtonSoft: string;
    bottomGhostButton: string;
    bottomGhostButtonWithIcon: string;
    iconOnlyButton: string;
  };
};

type PlaylistLite = { id: string; name: string };

export default function FavoritesPlaylistPage({
  userPreferences,
  favorites,
  playlists,
  isAuthed = false,
  onToggleFavorite,
  onResetFavorites,
  onCreatePlaylist,
  onDeletePlaylist,
  onRenamePlaylist,
  onSetPlaylistItems,
  onAddItemsToPlaylist,
}: FavoritesPlaylistPageProps) {
  void userPreferences;

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (isAuthed) return;
    openAuthModal("login");
    navigate("/", { replace: true });
  }, [isAuthed, navigate]);

  const initialViewMode = useMemo<ViewMode>(() => {
    const st = (location.state as any) ?? {};
    return st?.initialView === "playlists" ? "playlists" : "favorites";
  }, [location.state]);
  const shouldScrollTopOnEnterPlaylists = useMemo(() => {
    const st = (location.state as any) ?? {};
    return Boolean(st?.scrollToTop);
  }, [location.state]);

  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);

  useEffect(() => {
    if (initialViewMode === "playlists") {
      setViewMode("playlists");
    }
  }, [initialViewMode]);

  useEffect(() => {
    if (!shouldScrollTopOnEnterPlaylists) return;
    if (viewMode !== "playlists") return;
    const raf = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [shouldScrollTopOnEnterPlaylists, viewMode]);

  const [favoritesKeySet, setFavoritesKeySet] = useState<Set<string>>(() =>
    buildFavoritesKeySet(favorites),
  );

  useEffect(() => {
    setFavoritesKeySet(buildFavoritesKeySet(favorites));
  }, [favorites]);

  const playlistRef = useRef<PlaylistSectionHandle | null>(null);

  const openDetail = (item: ContentCardItem) => {
    const mt = String((item as any)?.media_type ?? "").toLowerCase();
    const id = Number((item as any)?.id);
    if ((mt !== "movie" && mt !== "tv") || !Number.isFinite(id)) return;

    navigate(`/title/${mt}/${id}`, { state: { backgroundLocation: location } });
  };

  const sharedUi = useMemo<FavoritesPlaylistSharedUI>(() => {
    return {
      SectionHeader: SharedSectionHeader,
      EditableCarouselRow: SharedEditableCarouselRow,
      BottomConfirmSheet: SharedBottomConfirmSheet,
      PlaylistPickerPopover: SharedPlaylistPickerPopover,
      EditDimmer: SharedEditDimmer,
      styles: {
        sectionActionButton:
          "inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm text-white/80 hover:bg-white/15 hover:text-white transition-all duration-200",
        sectionActionButtonSoft:
          "inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm text-white/85 hover:bg-white/15 hover:text-white transition-all duration-200",
        bottomGhostButton:
          "rounded-lg bg-white/10 px-3 py-2 text-sm text-white/85 hover:bg-white/15 transition-all duration-200",
        bottomGhostButtonWithIcon:
          "rounded-lg bg-white/10 px-3 py-2 text-sm text-white/85 hover:bg-white/15 transition-all duration-200 inline-flex items-center gap-2",
        iconOnlyButton:
          "rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white transition-all duration-200",
      },
    };
  }, []);

  const TopToggle = useMemo(() => {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={[
            "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
            viewMode === "favorites"
              ? "bg-white text-black"
              : "bg-white/10 text-white/80 hover:bg-white/15 hover:text-white",
          ].join(" ")}
          onClick={() => setViewMode("favorites")}
          aria-label="찜 보기"
        >
          찜
        </button>

        <button
          type="button"
          className={[
            "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
            viewMode === "playlists"
              ? "bg-white text-black"
              : "bg-white/10 text-white/80 hover:bg-white/15 hover:text-white",
          ].join(" ")}
          onClick={() => setViewMode("playlists")}
          aria-label="플레이리스트 보기"
        >
          플레이리스트
        </button>
      </div>
    );
  }, [viewMode]);

  const pad = "px-6";

  const TopDivider = (
    <div className={`${pad} mt-4`}>
      <div className="h-px w-full bg-white/10" />
    </div>
  );

  const playlistsLite: PlaylistLite[] = useMemo(() => {
    return (playlists ?? []).map((p) => ({ id: String(p.id), name: p.name }));
  }, [playlists]);

  return (
    <div className="min-h-screen bg-[#10131b] text-white overflow-x-hidden flex flex-col">
      <Header />

      <main id="main-content" className="flex-1 pt-[84px] relative">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className={pad}
        >
          <div className="flex justify-between items-end gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight">
                찜 / 플레이리스트
              </h1>
              <p className="mt-1 text-sm text-white/60">
                내가 찜 한 컨텐츠 목록과 플레이리스트 내역입니다.
              </p>
            </div>

            <div className="shrink-0">{TopToggle}</div>
          </div>
        </motion.div>

        {TopDivider}

        {viewMode === "favorites" ? (
          <FavoritesSection
            ui={sharedUi}
            pad={pad}
            favorites={favorites}
            playlists={playlistsLite}
            onToggleFavorite={onToggleFavorite}
            onResetFavorites={onResetFavorites}
            onOpenDetail={openDetail}
            onFavoritesKeySetChange={setFavoritesKeySet}
            onRequestCreatePlaylistFromItems={(items) => {
              // 선택 아이템으로 "생성 플로우" 진입은 그대로 유지
              setViewMode("playlists");
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  playlistRef.current?.beginCreateFromItems(items);
                });
              });
            }}
            onAddToExistingPlaylist={(playlistId, items) => {
              const pid = Number(playlistId);
              if (!Number.isFinite(pid) || pid <= 0) return;
              onAddItemsToPlaylist(pid, toFavoriteItemsFromCardItems(items));
            }}
          />
        ) : (
          <PlaylistSection
            ui={sharedUi}
            ref={playlistRef}
            pad={pad}
            favoritesKeySet={favoritesKeySet}
            playlists={playlists}
            onToggleFavorite={onToggleFavorite}
            onOpenDetail={openDetail}
            onCreatePlaylist={onCreatePlaylist}
            onDeletePlaylist={onDeletePlaylist}
            onRenamePlaylist={onRenamePlaylist}
            onSetPlaylistItems={onSetPlaylistItems}
            onAddItemsToPlaylist={onAddItemsToPlaylist}
          />
        )}

      </main>

      <PageFooter />
    </div>
  );
}
