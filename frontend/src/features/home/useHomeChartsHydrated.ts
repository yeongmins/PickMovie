// frontend/src/features/home/useHomeChartsHydrated.ts
import { useCallback, useEffect, useState } from "react";
import type { HomeChartsResponse } from "./homeCharts.api";
import { fetchHomeCharts } from "./homeCharts.api";
import type { HomeCardItem } from "./homeCharts.hydrate";
import { hydrateHomeCharts } from "./homeCharts.hydrate";

type State = {
  loading: boolean;
  error: string | null;
  raw: HomeChartsResponse | null;
  byKey: Record<string, HomeCardItem[]> | null;
};

export function useHomeChartsHydrated() {
  const [state, setState] = useState<State>({
    loading: true,
    error: null,
    raw: null,
    byKey: null,
  });

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const raw = await fetchHomeCharts();
      const byKey = await hydrateHomeCharts(raw);
      setState({ loading: false, error: null, raw, byKey });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setState((s) => ({ ...s, loading: false, error: msg }));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...state, refresh };
}
