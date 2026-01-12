// backend/src/kobis/kobis.types.ts
export type KobisDailyBoxOfficeItem = {
  movieCd?: string;
  movieNm?: string;
  openDt?: string;
};

export type KobisSearchMovieItem = {
  movieCd?: string;
  movieNm?: string;
  movieNmEn?: string;
  openDt?: string; // 보통 YYYYMMDD 또는 YYYY
  prdtStatNm?: string; // 제작상태(개봉/개봉예정 등)
};

export type KobisMovieInfo = {
  movieCd?: string;
  movieNm?: string;
  movieNmEn?: string;
  openDt?: string;
  prdtStatNm?: string;
  showTm?: string;
  audits?: Array<{ watchGradeNm?: string }>;
};

export type KobisDailyBoxOfficeResponse = {
  boxOfficeResult?: {
    dailyBoxOfficeList?: KobisDailyBoxOfficeItem[];
  };
};

export type KobisSearchMovieListResponse = {
  movieListResult?: {
    totCnt?: string;
    movieList?: KobisSearchMovieItem[];
  };
};

export type KobisMovieInfoResponse = {
  movieInfoResult?: {
    movieInfo?: KobisMovieInfo;
  };
};
