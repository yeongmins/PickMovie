# 🎬 PickMovie — 당신의 취향을 분석해 영화를 추천하는 알고리즘 기반 OTT 큐레이션 서비스

**PickMovie**는 사용자의 **영화 취향을 설문으로 입력받고**,  
TMDB API 기반 매칭 알고리즘을 통해 **가장 잘 맞는 콘텐츠를 추천해주는 영화 추천 서비스**입니다.

## 📌 주요 기능 (Features)

- 🧭 **온보딩 & 취향 설문 시스템**
  - 장르, 분위기(테마), 러닝타임, 최신성, 국가, 제외 요소
- 🎯 **사용자 맞춤 점수 기반 추천 알고리즘**
- 📡 **TMDB API 기반 영화 데이터 제공**
- 🖼️ **캐러셀 UI / 애니메이션 인터랙션**
- ⚡ **Lazy Loading · Code Splitting** 적용
- 🗂️ **LocalStorage 기반 사용자 상태 유지**



## 🛠️ 기술 스택 (Tech Stack)

| 분야 | 사용 기술 |
|------|-----------|
| Frontend | React, TypeScript, Vite |
| UI 라이브러리 | framer-motion, shadcn/ui, lucide-react |
| API | TMDB API |
| 디자인 | Figma |
| 배포 | Vercel |

## 🚀 시작하기 (Getting Started)

아래 단계를 따라 PickMovie를 로컬에서 실행할 수 있습니다.

### 1. 저장소 클론
```bash
git clone https://github.com/yeongmins/PickMovie.git
cd pickmovie
```

### 2. 패키지 설치
```bash
npm install
```
또는
```bash
yarn install
```

### 3. 환경변수(.env) 설정
프로젝트 루트에 .env 파일을 생성하고 아래 내용을 입력하세요.
```env
VITE_TMDB_API_KEY=YOUR_TMDB_API_KEY
```
TMDB API Key 발급:
https://www.themoviedb.org/settings/api

### 4. 개발 서버 실행
```bash
npm run dev
```

## 🧩 프로젝트 구조 (Project Structure)
```bash
pickmovie/
├─ src/
│  ├─ components/
│  │  ├─ Onboarding/         # 온보딩 단계 컴포넌트
│  │  ├─ MovieRow/           # 영화 리스트 UI
│  │  ├─ FavoritesCarousel/  # 캐러셀 UI
│  │  └─ MovieDetailModal/   # 영화 상세 모달
│  ├─ utils/
│  │  └─ tmdb.js             # TMDB API 유틸 함수
│  ├─ assets/
│  ├─ App.jsx
│  └─ main.jsx
├─ public/
├─ .env.example
├─ package.json
└─ README.md
```

## 📡 TMDB API 유틸 설명
### src/utils/tmdb.js 내 주요 함수:
- getPopularMovies() – 인기 영화 목록
- getNowPlayingMovies() – 현재 상영작
- getMovieDetails(id) – 상세 정보 조회
- normalizeTVToMovie() – TV 데이터를 영화 형태로 변환
- calculateMatchScore(user, movie) – 사용자 맞춤 점수 계산

## 🧪 코드 컨벤션 (Coding Convention)
### 📁 폴더 네이밍
- PascalCase (OnboardingStep, MovieRow 등)

### 📄 파일 네이밍
- 컴포넌트: PascalCase
- 유틸 함수: camelCase

### 🔧 React Hooks 사용 원칙
- useState, useEffect, useCallback, useMemo 적극 활용
- 불필요한 렌더 방지를 위해 memoization 적용
