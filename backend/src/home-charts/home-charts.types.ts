// backend/src/home-charts/home-charts.types.ts
export type HomeChartItem = {
  mediaType: 'movie' | 'tv';
  tmdbId: number;
  rank: number;
};

export type HomeChartsResponse = {
  collections: Array<{
    key: 'POPULAR_MOVIE' | 'POPULAR_TV' | 'TRENDING_MOVIE' | 'TRENDING_TV';
    generatedAt: string;
    items: HomeChartItem[];
  }>;
};
