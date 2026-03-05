// frontend/src/components/layout/Footer.tsx
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Github, X } from "lucide-react";
import { Logo } from "../icons/Logo";
import { cn } from "../ui/utils";
import tmdbLogo from "../../assets/logo/tmdb_logo.svg";
import {
  DEVELOPER_NOTE_ITEMS,
  NOTICE_ITEMS,
} from "../../data/footerNotices.generated";

type FooterModalType = "notice" | "copyright" | null;
type NoticeViewType = "notice" | "developer";

export function Footer({ compact = false }: { compact?: boolean }) {
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [modalType, setModalType] = useState<FooterModalType>(null);
  const [noticeView, setNoticeView] = useState<NoticeViewType>("notice");
  const isModalOpen = modalType !== null;
  const footerTextClass = "text-[14px] text-white";

  useEffect(() => {
    if (!isModalOpen) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setModalType(null);
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isModalOpen]);

  const modalTitle = useMemo(() => {
    if (modalType === "notice") return "공지사항";
    if (modalType === "copyright") return "저작권/출처";
    return "";
  }, [modalType]);

  return (
    <footer className="relative bg-[#0b0b10]">
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute left-0 right-0",
          compact ? "-top-10 h-10" : "-top-16 h-16",
        )}
        style={{
          backgroundImage:
            "linear-gradient(to bottom, rgba(16,19,27,0) 0%, rgba(16,19,27,0.88) 58%, #0b0b10 100%)",
        }}
      />
      <div
        className={cn(
          "mx-auto w-full max-w-[1600px] px-10",
          compact ? "py-6" : "py-10",
        )}
      >
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="origin-left scale-[0.92]">
              <Logo size="md" />
            </div>

            <button
              type="button"
              onClick={() => setIsInfoOpen((prev) => !prev)}
              className={cn(
                "mt-2 inline-flex items-center gap-1.5 transition",
                footerTextClass,
              )}
              aria-expanded={isInfoOpen}
              aria-controls="pickmovie-footer-info"
            >
              PickMovie 정보
              <svg
                viewBox="0 0 8 8"
                aria-hidden="true"
                className={cn(
                  "h-2 w-2 transition-transform duration-200 ease-out",
                  isInfoOpen ? "rotate-180" : "rotate-0",
                )}
              >
                <path
                  d="M1 2.25L4 5.25L7 2.25"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            {isInfoOpen ? (
              <div
                id="pickmovie-footer-info"
                className={cn("mt-3 space-y-2 text-white/70", footerTextClass)}
              >
                <p className="font-medium">
                  이메일:{" "}
                  <a
                    className="font-medium text-white/80 transition-colors hover:text-white"
                    href="mailto:contact@pickmovie.net"
                  >
                    contact@pickmovie.net
                  </a>
                </p>
                <p className="font-medium">
                  PickMovie는 포트폴리오 목적 개인 프로젝트 입니다.
                </p>
              </div>
            ) : null}
          </div>

          <div className="shrink-0 inline-flex items-center gap-4 mt-1.5">
            <a
              href="https://github.com/yeongmins/PickMovie"
              target="_blank"
              rel="noreferrer"
              aria-label="PickMovie GitHub"
              className="inline-flex items-center text-white/70 transition hover:text-white"
            >
              <Github className="h-6 w-6" />
            </a>
            <a
              href="https://www.themoviedb.org/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center opacity-85 transition hover:opacity-100"
              aria-label="TMDB 공식 사이트"
            >
              <img
                src={tmdbLogo}
                alt="TMDB"
                className="h-6 w-auto"
                loading="lazy"
              />
            </a>
          </div>
        </div>

        <div className={compact ? "mt-6" : "mt-10"}>
          <div
            className={cn(
              "flex flex-wrap items-center gap-x-6 gap-y-2",
              footerTextClass,
            )}
          >
            <Link to="/info" className={footerTextClass}>
              프로젝트 소개
            </Link>
            <button
              type="button"
              onClick={() => {
                setNoticeView("notice");
                setModalType("notice");
              }}
              className={cn("cursor-pointer", footerTextClass)}
            >
              공지사항
            </button>
            <button
              type="button"
              onClick={() => setModalType("copyright")}
              className={cn("cursor-pointer", footerTextClass)}
            >
              저작권/출처
            </button>
          </div>
        </div>
      </div>

      {isModalOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center bg-black/65 p-4 pt-20 backdrop-blur-[2px] sm:items-center sm:pt-4"
          onClick={() => setModalType(null)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl bg-[#0e1118] text-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label={modalTitle}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-3">
                <h3 className="text-base font-semibold">{modalTitle}</h3>
                {modalType === "notice" ? (
                  <button
                    type="button"
                    onClick={() =>
                      setNoticeView((prev) =>
                        prev === "notice" ? "developer" : "notice",
                      )
                    }
                    className="rounded-full border border-white/20 px-3 py-1 text-xs font-medium text-white/80 transition hover:border-white/40 hover:text-white"
                  >
                    {noticeView === "notice" ? "개발자 노트" : "일반 공지사항"}
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setModalType(null)}
                className="rounded-full p-1.5 text-white/65 transition hover:bg-white/10 hover:text-white"
                aria-label="모달 닫기"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[65vh] overflow-y-auto px-5 py-4 text-sm leading-relaxed text-white/75">
              {modalType === "notice" && noticeView === "notice" ? (
                <div className="space-y-3">
                  {NOTICE_ITEMS.map((item) => (
                    <article
                      key={`${item.date}-${item.title}`}
                      className="rounded-xl bg-white/[0.03] p-4"
                    >
                      <p className="text-[14px] text-white/50">{item.date}</p>
                      <h4 className="mt-1 text-sm font-semibold text-white">
                        {item.title}
                      </h4>
                      <p className="mt-2 text-sm text-white/70">{item.body}</p>
                    </article>
                  ))}
                </div>
              ) : null}

              {modalType === "notice" && noticeView === "developer" ? (
                <div className="space-y-3">
                  {DEVELOPER_NOTE_ITEMS.map((item) => (
                    <article
                      key={`${item.hash}-${item.date}`}
                      className="rounded-xl bg-white/[0.03] p-4"
                    >
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="text-[14px] text-white/50">{item.date}</p>
                        <span className="rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[11px] text-white/70">
                          {item.hash}
                        </span>
                      </div>
                      <h4 className="mt-1 text-sm font-semibold text-white">
                        {item.title}
                      </h4>
                      <p className="mt-2 text-sm text-white/70">{item.body}</p>
                    </article>
                  ))}
                </div>
              ) : null}

              {modalType === "copyright" ? (
                <div className="space-y-5">
                  <section>
                    <h4 className="text-sm font-semibold text-white">
                      데이터/API 출처
                    </h4>
                    <div className="mt-3 space-y-4">
                      <article className="rounded-xl bg-white/[0.03] p-4">
                        <h5 className="font-medium text-white">TMDB API</h5>
                        <p className="mt-1 text-white/70">
                          용도: 영화/TV 메타데이터, 포스터/백드롭 이미지, 장르,
                          평점, Watch Providers 데이터 표시
                        </p>
                        <p className="mt-1 text-white/60">
                          사용 주소: api.themoviedb.org, image.tmdb.org
                        </p>
                      </article>

                      <article className="rounded-xl bg-white/[0.03] p-4">
                        <h5 className="font-medium text-white">
                          KOBIS Open API
                        </h5>
                        <p className="mt-1 text-white/70">
                          용도: 일별 박스오피스, 영화코드/개봉일 보강, 상영중
                          판정 보조 데이터
                        </p>
                        <p className="mt-1 text-white/60">
                          사용 주소: kobis.or.kr/kobisopenapi/webservice/rest
                        </p>
                      </article>

                      <article className="rounded-xl bg-white/[0.03] p-4">
                        <h5 className="font-medium text-white">
                          Naver Open API
                        </h5>
                        <p className="mt-1 text-white/70">
                          용도: 트렌드 산출을 위한 검색량/관심도 지표
                          수집(블로그/카페/뉴스/데이터랩)
                        </p>
                        <p className="mt-1 text-white/60">
                          사용 주소: openapi.naver.com/v1/search,
                          openapi.naver.com/v1/datalab/search
                        </p>
                      </article>

                      <article className="rounded-xl bg-white/[0.03] p-4">
                        <h5 className="font-medium text-white">
                          YouTube Data API
                        </h5>
                        <p className="mt-1 text-white/70">
                          용도: 트렌드 반영을 위한 검색 결과 지표 수집 및 예고편
                          연결 보조
                        </p>
                        <p className="mt-1 text-white/60">
                          사용 주소: www.googleapis.com/youtube/v3/search,
                          www.youtube-nocookie.com/embed
                        </p>
                      </article>

                      <article className="rounded-xl bg-white/[0.03] p-4">
                        <h5 className="font-medium text-white">
                          Google Gemini API
                        </h5>
                        <p className="mt-1 text-white/70">
                          용도: Search AI 자연어 질의 처리 및 추천 보조 응답
                          생성
                        </p>
                        <p className="mt-1 text-white/60">
                          사용 주소: generativelanguage.googleapis.com
                        </p>
                      </article>
                    </div>
                  </section>

                  <section>
                    <h4 className="text-sm font-semibold text-white">
                      필수 고지
                    </h4>
                    <p className="mt-2 text-white/75">
                      This product uses the TMDB API but is not endorsed or
                      certified by TMDB.
                    </p>
                    <p className="mt-2 text-white/75">
                      KOBIS, Naver Open API, YouTube Data API, Google API를 통해
                      제공되는 데이터 및 상표/저작권은 각 제공자와
                      원저작권자에게 있으며, PickMovie는 비상업적 정보 제공/탐색
                      보조 목적으로만 활용합니다.
                    </p>
                  </section>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </footer>
  );
}

type PageFooterProps = {
  className?: string;
};

export function PageFooter({ className }: PageFooterProps) {
  return (
    <div className={cn("relative mt-10 [&>footer]:border-t-0", className)}>
      <Footer />
    </div>
  );
}
