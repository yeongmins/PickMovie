import type { UserPreferences } from "../../onboarding/Onboarding";

export const PLAYLIST_STORAGE_KEY = "pickmovie_playlists_v1";
export const PREF_STORAGE_KEY = "pickmovie_preferences";

export type MediaType = "movie" | "tv";
export type PlaylistItem = { key: string; addedAt: number };

export type Playlist = {
  id: string;
  name: string;
  items: PlaylistItem[];
  createdAt: number;
  updatedAt: number;
};

function safeNum(v: unknown, fallback = 0) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function readUserPreferences(): UserPreferences {
  try {
    const raw = localStorage.getItem(PREF_STORAGE_KEY);
    if (!raw) {
      return {
        genres: [],
        moods: [],
        runtime: "",
        releaseYear: "",
        country: "",
        excludes: [],
      };
    }
    const parsed = JSON.parse(raw);
    return {
      genres: Array.isArray(parsed.genres) ? parsed.genres : [],
      moods: Array.isArray(parsed.moods) ? parsed.moods : [],
      runtime: parsed.runtime || "",
      releaseYear: parsed.releaseYear || "",
      country: parsed.country || "",
      excludes: Array.isArray(parsed.excludes) ? parsed.excludes : [],
    };
  } catch {
    return {
      genres: [],
      moods: [],
      runtime: "",
      releaseYear: "",
      country: "",
      excludes: [],
    };
  }
}

export function loadPlaylists(): Playlist[] {
  try {
    const raw = localStorage.getItem(PLAYLIST_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (p) => p && typeof p.id === "string" && typeof p.name === "string"
      )
      .map((p) => ({
        id: p.id,
        name: p.name,
        items: Array.isArray(p.items) ? p.items : [],
        createdAt: safeNum(p.createdAt, Date.now()),
        updatedAt: safeNum(p.updatedAt, Date.now()),
      })) as Playlist[];
  } catch {
    return [];
  }
}

export function savePlaylists(list: Playlist[]) {
  localStorage.setItem(PLAYLIST_STORAGE_KEY, JSON.stringify(list));
}
