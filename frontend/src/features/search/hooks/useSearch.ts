// frontend/src/features/search/hooks/useSearch.ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AiSearchResponse, ResultItem } from "../api/searchApi";
import { runSearch } from "../api/searchApi";

type UseSearchState = {
  query: string;
  loading: boolean;
  error: string | null;
  hasSearched: boolean;

  tags: string[];
  results: ResultItem[];
  aiAnalysis: AiSearchResponse["aiAnalysis"] | null;

  setQuery: (v: string) => void;
  search: (overrideQuery?: string) => Promise<void>;
  clear: () => void;
  cancel: () => void;
};

type SearchSnapshot = {
  query: string;
  hasSearched: boolean;
  error: string | null;
  tags: string[];
  results: ResultItem[];
  aiAnalysis: AiSearchResponse["aiAnalysis"] | null;
  createdAt: number;
  expiresAt: number;
};

const SEARCH_SNAPSHOT_KEY = "pickmovie_search_snapshot_v1";
const SEARCH_SNAPSHOT_TTL_MS = 30 * 60 * 1000;

function readSearchSnapshotFromStorage(): SearchSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SEARCH_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SearchSnapshot>;
    const expiresAt = Number(parsed?.expiresAt ?? 0);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      localStorage.removeItem(SEARCH_SNAPSHOT_KEY);
      return null;
    }
    return {
      query: String(parsed?.query ?? ""),
      hasSearched: !!parsed?.hasSearched,
      error: typeof parsed?.error === "string" ? parsed.error : null,
      tags: Array.isArray(parsed?.tags) ? parsed.tags : [],
      results: Array.isArray(parsed?.results) ? parsed.results : [],
      aiAnalysis: parsed?.aiAnalysis ?? null,
      createdAt: Number(parsed?.createdAt ?? Date.now()),
      expiresAt,
    };
  } catch {
    try {
      localStorage.removeItem(SEARCH_SNAPSHOT_KEY);
    } catch {}
    return null;
  }
}

function clearSearchSnapshotFromStorage() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(SEARCH_SNAPSHOT_KEY);
  } catch {}
}

let searchSnapshot: SearchSnapshot | null = null;

export function useSearch(initialQuery = ""): UseSearchState {
  const snapshot = searchSnapshot ?? readSearchSnapshotFromStorage();

  const [query, setQuery] = useState(() => snapshot?.query ?? initialQuery);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(
    () => snapshot?.hasSearched ?? false,
  );
  const [error, setError] = useState<string | null>(
    () => snapshot?.error ?? null,
  );

  const [tags, setTags] = useState<string[]>(() => snapshot?.tags ?? []);
  const [results, setResults] = useState<ResultItem[]>(
    () => snapshot?.results ?? [],
  );
  const [aiAnalysis, setAiAnalysis] = useState<
    AiSearchResponse["aiAnalysis"] | null
  >(() => snapshot?.aiAnalysis ?? null);

  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const clear = useCallback(() => {
    cancel();
    setHasSearched(false);
    setError(null);
    setTags([]);
    setResults([]);
    setAiAnalysis(null);
    searchSnapshot = null;
    clearSearchSnapshotFromStorage();
  }, [cancel]);

  const search = useCallback(
    async (overrideQuery?: string) => {
      const q = (overrideQuery ?? query ?? "").trim();
      if (!q || loading) return;

      cancel();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      setLoading(true);
      setHasSearched(true);
      setError(null);

      try {
        const res = await runSearch(q, { signal: ctrl.signal });
        setTags(res.tags ?? []);
        setResults(res.results ?? []);
        setAiAnalysis(res.aiAnalysis ?? null);
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "검색 중 오류가 발생했어요.");
        setTags([]);
        setResults([]);
        setAiAnalysis(null);
      } finally {
        setLoading(false);
        abortRef.current = null;
      }
    },
    [cancel, loading, query]
  );

  // UI에서 쓰기 좋은 파생값(선택)
  const state = useMemo<UseSearchState>(
    () => ({
      query,
      loading,
      error,
      hasSearched,
      tags,
      results,
      aiAnalysis,
      setQuery,
      search,
      clear,
      cancel,
    }),
    [
      query,
      loading,
      error,
      hasSearched,
      tags,
      results,
      aiAnalysis,
      search,
      clear,
      cancel,
    ]
  );

  searchSnapshot = {
    query,
    hasSearched,
    error,
    tags,
    results,
    aiAnalysis,
    createdAt: Date.now(),
    expiresAt: Date.now() + SEARCH_SNAPSHOT_TTL_MS,
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (!hasSearched || !query.trim()) {
        clearSearchSnapshotFromStorage();
        return;
      }
      const now = Date.now();
      const payload: SearchSnapshot = {
        query,
        hasSearched,
        error,
        tags,
        results,
        aiAnalysis,
        createdAt: now,
        expiresAt: now + SEARCH_SNAPSHOT_TTL_MS,
      };
      localStorage.setItem(SEARCH_SNAPSHOT_KEY, JSON.stringify(payload));
    } catch {}
  }, [query, hasSearched, error, tags, results, aiAnalysis]);

  return state;
}
