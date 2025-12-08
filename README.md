# 🎬 PickMovie

**내 취향 기반으로 최적화된 영화만 쏙쏙 골라주는 웹 서비스, PickMovie**

처음 접속하면 간단한 온보딩 설문으로 취향을 분석하고,  
TMDB(The Movie Database) API에서 실제 영화 데이터를 가져와 **매칭 점수(match score)** 를 계산하여  
나와 잘 맞는 영화만 모아서 추천해주는 프로젝트입니다.

---

## 🧾 프로젝트 소개

PickMovie는 사용자의 영화 취향을 **온보딩 설문**을 통해 정교하게 수집한 뒤,  
TMDB에서 가져온 실제 영화 데이터와 비교하여 **매칭 점수(%)** 를 계산하고  
그 결과를 기반으로 영화 추천 리스트를 생성하는 웹 서비스입니다.

- **타겟 사용자**: 넷플릭스, 디즈니+ 등 OTT 서비스에서 “뭐 볼지 1시간 고민하는 사람들”
- **핵심 아이디어**
  - **내가 직접 선택한 취향** 을 기준으로 영화 데이터를 정량화
  - 장르, 무드, 러닝타임, 제작 국가 등을 하나의 점수로 **최적화·가중 합산**
  - 찜 기능과 메인 화면의 여러 섹션으로, 추천 + 탐색 경험까지 제공

---

## ✨ 주요 기능

### 1. 온보딩 설문 시스템

처음 접속 시, 단계별 설문으로 사용자의 취향을 수집합니다.

- **1단계 – 장르 선택**
  - 액션, 로맨스, 스릴러, 코미디 등 선호 장르 복수 선택
- **2단계 – 분위기(무드) 선택**
  - 힐링, 잔잔한, 긴장감, 반전, 감동 등
- **3단계 – 선호 러닝타임**
  - 90분 이하 / 90–120분 / 120분 이상 등
- **4단계 – 선호 국가 및 제외 조건**
  - 한국/미국/일본/유럽/상관없음 등
  - 특정 국가/장르 제외 등 (Exclude 옵션)
- **실시간 취향 프리뷰**
  - 4단계에서 지금까지 선택한 취향을 한눈에 볼 수 있는 프리뷰 카드

### 2. 맞춤 영화 추천 (Recommendation Step)

- TMDB `discover` API를 사용해 실제 영화 데이터를 조회
- 각 영화에 대해 **매칭 점수(matchScore)** 를 계산 및 표시
- 매칭 점수 순으로 정렬하여 추천 리스트 출력
- 각 카드에:
  - 포스터 이미지
  - 제목 / 개봉일
  - 평점(vote_average) + ⭐ 아이콘
  - **나와의 매칭도 (%)**

### 3. 찜 기능 (Favorites)

- 하트(❤️) 아이콘 클릭으로 영화 찜/찜 해제
- 메인 화면에서 **내 찜 목록** 섹션에서 한 번에 보기
- 브라우저 `localStorage`에 기본 캐시:
  - `pickmovie_favorites`
  - `pickmovie_preferences`
  - `pickmovie_onboarding_complete`

### 4. 메인 화면 구성

- **내 찜 목록**
- **추천 영화** (온보딩 기반 추천)
- **인기 영화 (Popular Movies)**
- **인기 TV 컨텐츠 (Popular TV)**
- 가로 스크롤 가능한 **슬라이더(캐러셀)** 형태의 Row UI
  - 좌/우 이동 버튼(〈, 〉)으로 컨트롤
  - 모바일/PC 레이아웃 최적화

### 5. 영화 상세 모달 (Movie Detail Modal)

- 카드 클릭 시 모달로 상세 정보 표시
  - 큰 포스터
  - 줄거리(overview)
  - 장르, 국가, 상영 시간
  - TMDB 평점
  - 매칭 점수
- `dynamic import`로 코드 스플리팅 (메인 번들 최적화)

### 6. 검색 기능

- 상단 검색 바로 영화/TV 컨텐츠 검색
- 키워드 기반 TMDB 검색 API 연동
- 검색 결과에도 찜 + 상세 모달 기능 동일 적용

### 7. 반응형 UI & UX 디테일

- 모바일/태블릿/데스크톱 대응
- Framer Motion을 활용한 단계 전환 애니메이션
- 포스터 이미지 로드 실패 시 `ImageWithFallback` 컴포넌트로 기본 이미지 표시
- 로딩 상태에서 로더 아이콘(Spinner) 표시
- 에러 발생 시 안내 문구 출력

---

## 🧰 기술 스택

### Frontend

- **Framework**: React 18
- **Language**: TypeScript
- **Bundler**: Vite
- **UI/스타일링**
  - Tailwind CSS 스타일 유사 Utility Class
  - shadcn/ui 기반 버튼 및 공통 컴포넌트
  - lucide-react 아이콘 (Heart, Star, Chevron, Search 등)
- **Routing**: React Router
- **Animation**: Framer Motion
- **API 통신**: Fetch / Axios (TMDB & 백엔드 연동)

### Backend

- **Framework**: NestJS
- **Runtime**: Node.js
- **주요 역할**
  - TMDB 호출을 프록시하는 API 레이어 (확장용 구조)
  - 향후 사용자별 찜 목록/설문 결과를 DB에 저장할 수 있도록 설계
- **Database**
  - 현재: 구조 설계 단계 (실 DB 미연결, in-memory 기준 개발)
  - 추후: PostgreSQL/MySQL 등 RDB 도입 예정

### Infra & 기타

- **배포**: Vercel (Frontend), 추후 백엔드는 별도 호스팅 예정
- **도메인**: `pickmovie.net` (Cloudflare를 통한 DNS 설정)
- **외부 API**: TMDB (The Movie Database)

---

## 🏗 아키텍처

```text
사용자 브라우저
   │
   ├─ Frontend (React + TS + Vite)
   │    ├─ 온보딩 설문 UI
   │    ├─ 추천 알고리즘 계산 (matchScore)
   │    ├─ TMDB 연동을 위한 API 호출
   │    └─ localStorage를 이용한 최소 상태 캐싱
   │
   └─ Backend (NestJS)
        ├─ TMDB API 연동용 서버 사이드 래퍼
        ├─ (향후) 사용자/찜/설정 데이터 저장용 API
        └─ (향후) Swagger 기반 API 문서 제공
