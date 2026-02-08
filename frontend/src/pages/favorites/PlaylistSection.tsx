// frontend/src/pages/favorites/PlaylistSection.tsx
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Pencil, Trash2, Undo2, X } from "lucide-react";

import type { FavoriteItem, PlaylistDto } from "../../App";
import { getContentDetails } from "../../lib/tmdb";

import type {
  ContentCardItem,
  MediaType,
} from "../../components/content/ContentCard";
import type { FavoritesPlaylistSharedUI } from "./FavoritesPlaylistPage";

export type PlaylistSectionHandle = {
  beginCreateFromItems: (items: ContentCardItem[]) => void;
};

type PlaylistNameEdit = { playlistId: number; name: string };

type PlaylistSectionProps = {
  ui: FavoritesPlaylistSharedUI;
  pad: string;
  favoritesKeySet: Set<string>;
  playlists: PlaylistDto[];

  onToggleFavorite: (id: number, mt?: "movie" | "tv") => void;
  onOpenDetail: (item: ContentCardItem) => void;

  onCreatePlaylist: (name: string, items: FavoriteItem[]) => void;
  onDeletePlaylist: (playlistId: number) => void;
  onRenamePlaylist: (playlistId: number, name: string) => void;
  onSetPlaylistItems: (playlistId: number, items: FavoriteItem[]) => void;
  onAddItemsToPlaylist: (playlistId: number, items: FavoriteItem[]) => void;
};

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

function toFavoriteItemsFromDtoItems(
  items: { id: number; mediaType: "movie" | "tv" }[],
): FavoriteItem[] {
  const map = new Map<string, FavoriteItem>();
  for (const it of Array.isArray(items) ? items : []) {
    const mt = it.mediaType === "tv" ? "tv" : "movie";
    const id = Number(it.id);
    if (!Number.isFinite(id) || id <= 0) continue;
    map.set(`${mt}:${id}`, { id, mediaType: mt });
  }
  return Array.from(map.values());
}

// ✅ playlist 페이지용: tmdb 상세 캐시
const _plDetailCache = new Map<string, ContentCardItem | null>();
const _plDetailInFlight = new Map<string, Promise<ContentCardItem | null>>();

async function fetchDetailAsCardItem(
  mediaType: "movie" | "tv",
  id: number,
): Promise<ContentCardItem | null> {
  const key = `${mediaType}:${id}`;
  if (_plDetailCache.has(key)) return _plDetailCache.get(key) ?? null;

  const inflight = _plDetailInFlight.get(key);
  if (inflight) return inflight;

  const p = (async () => {
    try {
      const detail = await getContentDetails(id, mediaType);
      const patched: ContentCardItem = {
        ...(detail as any),
        id: Number((detail as any)?.id ?? id),
        media_type: mediaType,
      } as any;
      _plDetailCache.set(key, patched);
      return patched;
    } catch {
      _plDetailCache.set(key, null);
      return null;
    } finally {
      _plDetailInFlight.delete(key);
    }
  })();

  _plDetailInFlight.set(key, p);
  return p;
}

export const PlaylistSection = forwardRef<
  PlaylistSectionHandle,
  PlaylistSectionProps
>(function PlaylistSection(
  {
    ui,
    pad,
    favoritesKeySet,
    playlists,
    onToggleFavorite,
    onOpenDetail,
    onCreatePlaylist,
    onDeletePlaylist,
    onRenamePlaylist,
    onSetPlaylistItems,
    onAddItemsToPlaylist,
  },
  ref,
) {
  const {
    SectionHeader,
    EditableCarouselRow,
    BottomConfirmSheet,
    PlaylistPickerPopover,
    EditDimmer,
    styles,
  } = ui;

  const serverPlaylists = Array.isArray(playlists) ? playlists : [];

  const [playlistCards, setPlaylistCards] = useState<
    Record<number, ContentCardItem[]>
  >({});

  useEffect(() => {
    let alive = true;

    const load = async () => {
      const next: Record<number, ContentCardItem[]> = {};

      for (const p of serverPlaylists) {
        const pid = Number(p.id);
        if (!Number.isFinite(pid) || pid <= 0) continue;

        const items = Array.isArray(p.items) ? p.items : [];
        const keys = items
          .map((it) => {
            const mt = it.mediaType === "tv" ? "tv" : "movie";
            const id = Number(it.id);
            return Number.isFinite(id) && id > 0 ? `${mt}:${id}` : null;
          })
          .filter(Boolean) as string[];

        const cached: ContentCardItem[] = [];
        for (const k of keys) {
          const hit = _plDetailCache.get(k);
          if (hit) cached.push(hit);
        }

        next[pid] = uniqueByKey(cached);

        const need = keys.filter((k) => !_plDetailCache.has(k));
        if (!need.length) continue;

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
        next[pid] = uniqueByKey([...next[pid], ...results]);
      }

      if (!alive) return;

      const allowedByPlaylist: Record<number, Set<string>> = {};
      for (const p of serverPlaylists) {
        const pid = Number(p.id);
        const items = Array.isArray(p.items) ? p.items : [];
        allowedByPlaylist[pid] = new Set(
          items.map((it) => `${it.mediaType}:${it.id}`),
        );
      }

      setPlaylistCards((prev) => {
        const merged: Record<number, ContentCardItem[]> = { ...prev };
        for (const pidStr of Object.keys(next)) {
          const pid = Number(pidStr);
          const allowed = allowedByPlaylist[pid] ?? new Set<string>();
          merged[pid] = uniqueByKey([
            ...(next[pid] ?? []),
            ...(prev[pid] ?? []),
          ]).filter((m) => allowed.has(itemKey(m)));
        }
        const serverIds = new Set(serverPlaylists.map((p) => Number(p.id)));
        for (const pidStr of Object.keys(merged)) {
          const pid = Number(pidStr);
          if (!serverIds.has(pid)) delete merged[pid];
        }
        return merged;
      });
    };

    void load();

    return () => {
      alive = false;
    };
  }, [serverPlaylists]);

  const [editingPlaylistId, setEditingPlaylistId] = useState<number | null>(
    null,
  );
  const isEditing = editingPlaylistId !== null;

  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [pendingDeletedKeys, setPendingDeletedKeys] = useState<Set<string>>(
    new Set(),
  );
  const [deleteHistory, setDeleteHistory] = useState<string[][]>([]);

  const [draft, setDraft] = useState<{
    active: boolean;
    name: string;
    movies: ContentCardItem[];
  }>({ active: false, name: "", movies: [] });

  const draftRef = useRef<HTMLDivElement | null>(null);

  const [playlistNameEdit, setPlaylistNameEdit] =
    useState<PlaylistNameEdit | null>(null);

  const clearStaging = () => {
    setPendingDeletedKeys(new Set());
    setDeleteHistory([]);
  };

  const [playlistPickerOpen, setPlaylistPickerOpen] = useState(false);

  const pickerPlaylists = useMemo(() => {
    return serverPlaylists.map((p) => ({ id: String(p.id), name: p.name }));
  }, [serverPlaylists]);

  const beginCreateFromItemsInternal = (items: ContentCardItem[]) => {
    const xs = uniqueByKey(items);
    if (xs.length === 0) return;

    setDraft({ active: true, name: "", movies: xs });
    setEditingPlaylistId(null);
    setSelectedKeys(new Set());
    setPendingDeletedKeys(new Set());
    setDeleteHistory([]);
    setPlaylistNameEdit(null);
    setPlaylistPickerOpen(false);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        draftRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      });
    });
  };

  useImperativeHandle(ref, () => ({
    beginCreateFromItems: (items) => beginCreateFromItemsInternal(items),
  }));

  useEffect(() => {
    if (!isEditing && !draft.active && !playlistPickerOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (playlistPickerOpen) setPlaylistPickerOpen(false);
        else closeEditor();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, draft.active, playlistPickerOpen]);

  const startEdit = (playlistId: number) => {
    const pid = Number(playlistId);
    if (!Number.isFinite(pid) || pid <= 0) return;

    setDraft({ active: false, name: "", movies: [] });
    setSelectedKeys(new Set());
    clearStaging();
    setEditingPlaylistId(pid);

    const pl = serverPlaylists.find((p) => p.id === pid);
    setPlaylistNameEdit({ playlistId: pid, name: pl?.name ?? "" });
    setPlaylistPickerOpen(false);
  };

  const closeEditor = () => {
    setDraft({ active: false, name: "", movies: [] });
    setSelectedKeys(new Set());
    clearStaging();
    setEditingPlaylistId(null);
    setPlaylistNameEdit(null);
    setPlaylistPickerOpen(false);
  };

  const commitAndStopEdit = () => {
    const pid = editingPlaylistId;
    if (!pid) {
      closeEditor();
      return;
    }

    if (playlistNameEdit?.playlistId === pid) {
      const trimmed = playlistNameEdit.name.trim();
      if (trimmed) onRenamePlaylist(pid, trimmed);
    }

    const kill = new Set(pendingDeletedKeys);
    if (kill.size > 0) {
      const pl = serverPlaylists.find((p) => p.id === pid);
      const existing = Array.isArray(pl?.items) ? pl!.items : [];
      const next = existing.filter(
        (it) => !kill.has(`${it.mediaType}:${it.id}`),
      );
      onSetPlaylistItems(pid, toFavoriteItemsFromDtoItems(next));
    }

    setSelectedKeys(new Set());
    clearStaging();
    setEditingPlaylistId(null);
    setPlaylistNameEdit(null);
    setPlaylistPickerOpen(false);
  };

  const toggleSelect = (k: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const currentScopeItems = useMemo(() => {
    const pid = editingPlaylistId;
    if (!pid) return [];

    const cards = playlistCards[pid] ?? [];
    const xs = uniqueByKey(cards);
    return xs.filter((m) => !pendingDeletedKeys.has(itemKey(m)));
  }, [editingPlaylistId, pendingDeletedKeys, playlistCards]);

  const selectedCount = selectedKeys.size;

  const selectedItems = useMemo(() => {
    if (!editingPlaylistId || selectedKeys.size === 0) return [];
    return currentScopeItems.filter((m) => selectedKeys.has(itemKey(m)));
  }, [currentScopeItems, editingPlaylistId, selectedKeys]);

  const allSelected =
    !!editingPlaylistId &&
    currentScopeItems.length > 0 &&
    selectedCount === currentScopeItems.length;

  const onSelectAllToggle = () => {
    if (!editingPlaylistId) return;
    if (allSelected) {
      setSelectedKeys(new Set());
      return;
    }
    const all = new Set<string>();
    for (const it of currentScopeItems) all.add(itemKey(it));
    setSelectedKeys(all);
  };

  const onDeleteSelectedStage = () => {
    if (!editingPlaylistId) return;
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

  const openPlaylistPicker = () => {
    if (!editingPlaylistId) return;
    if (draft.active) return;
    if (selectedItems.length === 0) return;
    setPlaylistPickerOpen(true);
  };

  const onCreateNewFromPicker = () => {
    const items = selectedItems;
    setPlaylistPickerOpen(false);
    commitAndStopEdit();
    beginCreateFromItemsInternal(items);
  };

  const onPickPlaylistFromPicker = (playlistId: string) => {
    const pid = Number(playlistId);
    if (!Number.isFinite(pid) || pid <= 0) return;

    const items = toFavoriteItemsFromCardItems(selectedItems);
    setPlaylistPickerOpen(false);
    commitAndStopEdit();
    onAddItemsToPlaylist(pid, items);
  };

  /**
   * ✅ 드래프트 생성 중복 클릭 방지(Enter/더블클릭)
   */
  const createLockRef = useRef(false);

  const confirmCreatePlaylist = () => {
    if (createLockRef.current) return;

    const name = draft.name.trim();
    if (!draft.active) return;
    if (!name) return;

    const items = toFavoriteItemsFromCardItems(draft.movies);
    if (items.length === 0) return;

    createLockRef.current = true;
    onCreatePlaylist(name, items);

    // 즉시 드래프트 종료(재클릭 방지)
    setDraft({ active: false, name: "", movies: [] });

    // 아주 짧게 락 유지(렌더 반영 전 연타 방지)
    window.setTimeout(() => {
      createLockRef.current = false;
    }, 800);
  };

  const cancelDraft = () => {
    createLockRef.current = false;
    setDraft({ active: false, name: "", movies: [] });
  };

  const [playlistDeleteTarget, setPlaylistDeleteTarget] = useState<
    number | null
  >(null);

  const playlistDeleteName = useMemo(() => {
    if (!playlistDeleteTarget) return "";
    return (
      serverPlaylists.find((p) => p.id === playlistDeleteTarget)?.name ?? ""
    );
  }, [playlistDeleteTarget, serverPlaylists]);

  const confirmDeletePlaylist = () => {
    const pid = playlistDeleteTarget;
    if (!pid) return;
    onDeletePlaylist(pid);
    setPlaylistDeleteTarget(null);
  };

  const bottomSheetOpen = isEditing || draft.active;

  /**
   * ✅ "편집-플레이리스트 추가-플레이리스트 생성" 흐름에서
   * 생성 중에는 다른 영역 클릭이 절대 되면 안됨.
   *
   * - 기존: BackgroundDimmer가 pointer-events-none이라 클릭이 다 통과했음
   * - 해결: draft.active일 때 클릭 차단용 Shield를 추가(전체 화면 가로채기)
   *   단, 드래프트 블록/바텀시트는 z를 위로 올려 정상 동작
   */
  const CreateFocusShield = (
    <AnimatePresence>
      {draft.active ? (
        <motion.div
          className="fixed inset-0 z-[60]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          style={{
            background:
              "radial-gradient(120% 80% at 50% 0%, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.70) 60%, rgba(0,0,0,0.85) 100%)",
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          aria-hidden="true"
        />
      ) : null}
    </AnimatePresence>
  );

  const BackgroundDimmer = <EditDimmer open={bottomSheetOpen} />;

  return (
    <>
      {BackgroundDimmer}
      {CreateFocusShield}

      <motion.section
        layout
        className="mt-2 relative"
        style={{ zIndex: draft.active ? 65 : bottomSheetOpen ? 45 : 1 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.28, ease: "easeOut" }}
      >
        <AnimatePresence>
          {draft.active ? (
            <motion.div
              ref={draftRef}
              layout
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ duration: 0.32, ease: "easeOut" }}
              className="mb-10 relative z-[65]" // ✅ Shield 위로 올려서 입력/생성만 가능
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
                  onToggleFavorite={(id, mt) =>
                    onToggleFavorite(id, mt as MediaType)
                  }
                  onOpenDetail={onOpenDetail}
                />
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div>
          {serverPlaylists.length === 0 ? (
            <div className={`${pad} py-16`}>
              <div className="w-full flex items-center justify-center text-sm text-white/60">
                플레이리스트가 없습니다.
              </div>
            </div>
          ) : (
            serverPlaylists.map((pl, idx) => {
              const isEditingThis = editingPlaylistId === pl.id;
              const isLastCarousel = idx === serverPlaylists.length - 1;

            // ✅ 생성(draft) 중에는 모든 기존 섹션을 딤+비활성
            const dimmed = draft.active
              ? true
              : bottomSheetOpen && !isEditingThis && !draft.active;

            const cards = playlistCards[pl.id] ?? [];
            const visibleMovies = isEditingThis
              ? cards.filter((m) => !pendingDeletedKeys.has(itemKey(m)))
              : cards;

            const nameValue =
              isEditingThis && playlistNameEdit?.playlistId === pl.id
                ? playlistNameEdit.name
                : pl.name;

              return (
                <motion.section
                  key={pl.id}
                  layout
                  className={[
                    idx === 0 ? "mt-2" : "mt-5",
                    dimmed ? "pointer-events-none" : "",
                  ].join(" ")}
                  animate={{
                    opacity: draft.active
                      ? 0.22
                      : bottomSheetOpen
                        ? isEditingThis
                          ? 1
                          : 0.22
                        : 1,
                  }}
                  transition={{ duration: 0.28, ease: "easeOut" }}
                >
                  <SectionHeader
                    padClass={pad}
                    title={
                      isEditingThis ? (
                        <input
                          autoFocus
                          value={nameValue}
                          onChange={(e) =>
                            setPlaylistNameEdit((prev) => {
                              if (!prev || prev.playlistId !== pl.id) {
                                return {
                                  playlistId: pl.id,
                                  name: e.target.value,
                                };
                              }
                              return { ...prev, name: e.target.value };
                            })
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              commitAndStopEdit();
                            }
                          }}
                          className={[
                            "w-full bg-transparent",
                            "text-xl font-semibold text-white/95",
                            "outline-none",
                            "placeholder:text-white/35",
                            "caret-white",
                            "animate-pulse",
                          ].join(" ")}
                        />
                      ) : (
                        pl.name
                      )
                    }
                    titleClassName="text-xl font-bold"
                    isActive={isEditingThis}
                    right={
                      !isEditingThis ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className={styles.sectionActionButton}
                            onClick={() => startEdit(pl.id)}
                          >
                            <Pencil className="h-4 w-4" />
                            편집
                          </button>

                          <button
                            type="button"
                            className={styles.sectionActionButton}
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
                          className={styles.sectionActionButton}
                          onClick={commitAndStopEdit}
                        >
                          완료
                        </button>
                      )
                    }
                  />

                  <div>
                    {Array.isArray(pl.items) &&
                    pl.items.length > 0 &&
                    visibleMovies.length === 0 ? (
                      <div className={`${pad} py-10`}>
                        <div className="text-sm text-white/60 text-center">
                          플레이리스트를 불러오는 중입니다...
                        </div>
                      </div>
                    ) : (
                      <EditableCarouselRow
                        padClass={pad}
                        items={visibleMovies}
                        favoritesKeySet={favoritesKeySet}
                        isLastCarousel={isLastCarousel}
                        isEditing={isEditingThis}
                        selectedKeys={selectedKeys}
                        onToggleSelect={toggleSelect}
                        onToggleFavorite={(id, mt) =>
                          onToggleFavorite(id, mt as MediaType)
                        }
                        onOpenDetail={onOpenDetail}
                      />
                    )}
                  </div>
                </motion.section>
              );
            })
          )}
        </div>
      </motion.section>

      <PlaylistPickerPopover
        open={!!editingPlaylistId && playlistPickerOpen}
        padClass={pad}
        playlists={pickerPlaylists}
        onClose={() => setPlaylistPickerOpen(false)}
        onCreateNew={onCreateNewFromPicker}
        onPickPlaylist={onPickPlaylistFromPicker}
      />

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
                <div className="text-sm font-semibold text-white/90">
                  {draft.active
                    ? "플레이리스트 생성 중"
                    : `${selectedCount}개 선택`}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className={[
                      styles.bottomGhostButtonWithIcon,
                      "disabled:opacity-40",
                    ].join(" ")}
                    onClick={onUndoLastDelete}
                    disabled={draft.active || deleteHistory.length === 0}
                    aria-label="이전"
                  >
                    <Undo2 className="h-4 w-4" />
                    이전
                  </button>

                  <button
                    type="button"
                    className={[styles.bottomGhostButton, "disabled:opacity-40"].join(
                      " ",
                    )}
                    onClick={onSelectAllToggle}
                    disabled={draft.active || !editingPlaylistId}
                  >
                    {allSelected ? "전체취소" : "전체선택"}
                  </button>

                  <button
                    type="button"
                    className={[
                      styles.bottomGhostButtonWithIcon,
                      "disabled:opacity-40",
                    ].join(" ")}
                    onClick={onDeleteSelectedStage}
                    disabled={
                      draft.active || !editingPlaylistId || selectedCount === 0
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                    삭제
                  </button>

                  <button
                    type="button"
                    className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-white/90 transition-all duration-200 disabled:opacity-40"
                    onClick={openPlaylistPicker}
                    disabled={
                      draft.active || !editingPlaylistId || selectedCount === 0
                    }
                  >
                    플레이리스트 추가
                  </button>

                  {draft.active ? (
                    <button
                      type="button"
                      className={styles.bottomGhostButton}
                      onClick={cancelDraft}
                    >
                      취소
                    </button>
                  ) : null}

                  <button
                    type="button"
                    className={styles.iconOnlyButton}
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
                  ? "제목을 입력하고 생성(Enter 가능)하면 새 플레이리스트가 추가돼요."
                  : editingPlaylistId
                    ? "플레이리스트 편집 중이에요."
                    : "플레이리스트 편집을 시작해 주세요."}
              </motion.div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <BottomConfirmSheet
        open={!!playlistDeleteTarget}
        title="삭제하시겠습니까?"
        footerLeft={playlistDeleteName ? playlistDeleteName : null}
        confirmText="삭제"
        cancelText="취소"
        danger
        onClose={() => setPlaylistDeleteTarget(null)}
        onConfirm={confirmDeletePlaylist}
      />
    </>
  );
});
