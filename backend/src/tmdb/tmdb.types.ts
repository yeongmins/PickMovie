export type MediaType = 'movie' | 'tv';

export type ProviderBadge = {
  provider_name: string;
  logo_path?: string | null;
};

export type WatchProvider = {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
  display_priority?: number;
};

export type WatchProvidersRegion = {
  link?: string;
  flatrate?: WatchProvider[];
  rent?: WatchProvider[];
  buy?: WatchProvider[];
};

export type WatchProvidersResponse = {
  id: number;
  results: Record<string, WatchProvidersRegion | undefined>;
};

export type MovieReleaseDatesResponse = {
  id: number;
  results: Array<{
    iso_3166_1: string;
    release_dates: Array<{
      certification: string;
      type: number;
      release_date: string;
      note: string;
    }>;
  }>;
};

export type TvContentRatingsResponse = {
  id: number;
  results: Array<{
    iso_3166_1: string;
    rating: string;
  }>;
};
