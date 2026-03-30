# PickMovie

PickMovie는 영화/TV 콘텐츠를 탐색하고, 사용자 취향 기반 추천과 개인 라이브러리(찜/플레이리스트)를 관리할 수 있는 웹 서비스입니다.  
현재 코드는 `frontend`(React + Vite)와 `backend`(NestJS + Prisma + PostgreSQL)로 분리된 모노레포 구조입니다.

## 개요
- 홈 화면에서 인기/트렌딩 콘텐츠를 빠르게 탐색
- 상세 화면에서 메타 정보, 시즌, 예고편, 시청 제공자 정보 확인
- 로그인 사용자 기준으로 찜/플레이리스트 저장 및 "For You" 추천 제공
- KOBIS/Naver/YouTube 신호를 조합한 국내 트렌드 랭킹 제공

## 핵심 기능
- 홈 차트
  - `/home/charts` 기반 인기 영화/TV, 트렌딩 영화/TV 컬렉션 제공
  - 스냅샷 캐시 + 크론 갱신(`HOME_CHARTS_CRON`, 기본 6시간 주기)
- 콘텐츠 탐색/상세
  - TMDB 기반 목록/검색/상세/이미지/영상/리뷰/시청 제공자 조회
  - 메타 해석(`meta`)으로 연령등급/상영 상태/재개봉/시즌 메타 보정
- 검색/추천
  - `search` 모듈의 자연어 추천 + 멀티 검색 확장
  - `ai/analyze` 엔드포인트(Gemini)로 사용자 입력 의도 분석
- 인증/계정
  - 회원가입/로그인/JWT Access + Refresh Cookie 회전
  - 이메일 인증, 비밀번호 재설정, 아이디 찾기 메일 플로우
- 개인 라이브러리
  - 찜(favorites) 동기화/토글
  - 플레이리스트 생성/이름 변경/삭제/아이템 편집
  - 사용자 라이브러리 기반 `recommendations/for-you`
- 트렌드 파이프라인
  - KOBIS + Naver Search/DataLab + YouTube 지표 수집 및 점수화
  - `/trends/kr` 랭킹 조회, `/trends/ingest/kobis` 수동 인제스트
- 운영 지원
  - `/healthz`, `/readyz` 헬스체크
  - `admin/meta` 오버라이드 패치, 관리자 가드 토큰 지원

## 기술 스택
- Frontend
  - React 18, TypeScript, Vite 7, React Router 7
  - Tailwind CSS, Framer Motion, Radix UI, Lucide
- Backend
  - NestJS 11, TypeScript
  - Prisma 7, PostgreSQL
  - JWT/Passport, Nodemailer, Axios, Nest Schedule
- 외부 API
  - TMDB, KOBIS, Naver Search/DataLab, YouTube Data API, Gemini API(선택)

## 프로젝트 구조
```text
PickMovie/
  frontend/   # React + Vite 앱
  backend/    # NestJS API 서버 + Prisma
  README.md
```
