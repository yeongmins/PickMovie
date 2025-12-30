// frontend/src/features/picky/hooks/usePickySearch.ts
import { useCallback, useMemo, useRef, useState } from "react";
import type { AiSearchResponse, ResultItem } from "../api/pickyApi";
import { runPickySearch } from "../api/pickyApi";

type UsePickySearchState = {
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

export function usePickySearch(initialQuery = ""): UsePickySearchState {
  const [query, setQuery] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tags, setTags] = useState<string[]>([]);
  const [results, setResults] = useState<ResultItem[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<
    AiSearchResponse["aiAnalysis"] | null
  >(null);

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
        const res = await runPickySearch(q, { signal: ctrl.signal });
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
  const state = useMemo<UsePickySearchState>(
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

  return state;
}
