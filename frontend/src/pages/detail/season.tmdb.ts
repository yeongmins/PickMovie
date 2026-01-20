// frontend/src/pages/detail/season.tmdb.ts
export type TmdbSeasonDetail = {
  id: number;
  name: string;
  season_number: number;
  air_date: string | null;
  poster_path: string | null;
  overview?: string;
};

const TMDB_BASE = "https://api.themoviedb.org/3";

function getTmdbKey(): string {
  const k = import.meta.env.VITE_TMDB_API_KEY as string | undefined;
  if (!k) throw new Error("VITE_TMDB_API_KEY is missing");
  return k;
}

export async function fetchTmdbSeasonDetail(params: {
  tvId: number;
  seasonNumber: number;
}): Promise<TmdbSeasonDetail | null> {
  const { tvId, seasonNumber } = params;

  try {
    const url = `${TMDB_BASE}/tv/${tvId}/season/${seasonNumber}`;
    const key = getTmdbKey();

    const resp = await fetch(
      `${url}?api_key=${encodeURIComponent(key)}&language=ko-KR`,
      { method: "GET" },
    );

    if (!resp.ok) return null;
    const data = (await resp.json()) as Partial<TmdbSeasonDetail>;
    if (!data || typeof data.season_number !== "number") return null;

    return {
      id: Number(data.id ?? 0),
      name: String(data.name ?? ""),
      season_number: data.season_number,
      air_date: data.air_date ?? null,
      poster_path: data.poster_path ?? null,
      overview: data.overview ?? "",
    };
  } catch {
    return null;
  }
}

export function yearFromAirDate(airDate: string | null): number | null {
  if (!airDate) return null;
  const m = airDate.match(/^(\d{4})/);
  return m ? Number(m[1]) : null;
}
