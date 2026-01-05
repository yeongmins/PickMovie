// frontend/src/components/content/contentCard.types.ts

export type MediaType = "movie" | "tv";

export type ProviderBadge = {
  provider_name?: string;
  logo_path?: string | null;

  providerName?: string;
  logoPath?: string | null;

  name?: string;
  logo?: string | null;
};

export type ContentCardItem = {
  id: number;

  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;

  poster_path: string | null;
  vote_average?: number;

  release_date?: string;
  first_air_date?: string;

  media_type?: MediaType;
  genre_ids?: number[];

  isNowPlaying?: boolean;
  isUpcoming?: boolean;

  providers?: ProviderBadge[];
  platform?: string;
  ageRating?: string;

  matchScore?: number;

  trendRank?: number;
  trendScore?: number;

  recommendReason?: string;

  showMatchBadge?: boolean;
};

export type ContentCardProps = {
  item: ContentCardItem;
  isFavorite: boolean;
  onClick: () => void;
  onToggleFavorite: () => void;

  onRemove?: () => void;
  context?: "default" | "picky";
  onPosterError?: () => void;

  className?: string;

  canFavorite?: boolean;
};
