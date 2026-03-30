// backend/src/home-charts/home-charts.types.ts
export type HomeChartItem = {
  mediaType: 'movie' | 'tv';
  tmdbId: number;
  rank: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  release_date?: string;
  first_air_date?: string;
};

export type HomeChartsResponse = {
  collections: Array<{
    key: 'POPULAR_MOVIE' | 'POPULAR_TV' | 'TRENDING_MOVIE' | 'TRENDING_TV';
    generatedAt: string;
    items: HomeChartItem[];
  }>;
};
