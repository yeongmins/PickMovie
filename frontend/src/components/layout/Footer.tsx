// frontend/src/components/layout/Footer.tsx
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Github, PencilLine, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Logo } from "../icons/Logo";
import { cn } from "../ui/utils";
import tmdbLogo from "../../assets/logo/tmdb_logo.svg";
import {
  DEVELOPER_NOTE_ITEMS,
  NOTICE_ITEMS,
  type FooterNoticeItem,
} from "../../data/footerNotices.generated";
import { AUTH_EVENT, AUTH_KEYS } from "../../lib/auth";
import { trapTabKey } from "../../lib/a11y";

export const OPEN_TERMS_MODAL_EVENT = "pickmovie-open-terms-modal";
export const OPEN_PRIVACY_MODAL_EVENT = "pickmovie-open-privacy-modal";

type FooterModalType = "notice" | "copyright" | "terms" | "privacy" | null;
type NoticeViewType = "notice" | "developer";
type EditableNoticeItem = FooterNoticeItem & { id: string };
type NoticeDeleteTarget = { key: string; title: string; isCustom: boolean; id?: string };

const CUSTOM_NOTICE_STORAGE_KEY = "pickmovie_custom_notices";
const HIDDEN_NOTICE_KEYS_STORAGE_KEY = "pickmovie_hidden_notice_keys";

function readIsAdmin(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(AUTH_KEYS.USER);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { role?: string | null };
    return String(parsed?.role ?? "").toUpperCase() === "ADMIN";
  } catch {
    return false;
  }
}

function readCustomNotices(): EditableNoticeItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CUSTOM_NOTICE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as EditableNoticeItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) =>
        item &&
        typeof item.id === "string" &&
        typeof item.date === "string" &&
        typeof item.title === "string" &&
        typeof item.body === "string",
    );
  } catch {
    return [];
  }
}

function saveCustomNotices(items: EditableNoticeItem[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CUSTOM_NOTICE_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore storage write failures
  }
}

function readHiddenNoticeKeys(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HIDDEN_NOTICE_KEYS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x) => typeof x === "string" && x.length > 0);
  } catch {
    return [];
  }
}

function saveHiddenNoticeKeys(keys: string[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(HIDDEN_NOTICE_KEYS_STORAGE_KEY, JSON.stringify(keys));
  } catch {
    // ignore storage write failures
  }
}

function formatNowDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const modalBackdropMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.12, ease: "easeOut" as const },
};

const modalPanelMotion = {
  initial: { opacity: 0, y: 16, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 10, scale: 0.985 },
  transition: { duration: 0.14, ease: "easeOut" as const },
};

const buttonMotion = {
  whileHover: { scale: 1.03, y: -1 },
  whileTap: { scale: 0.97 },
};

export function Footer({ compact = false }: { compact?: boolean }) {
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [modalType, setModalType] = useState<FooterModalType>(null);
  const [noticeView, setNoticeView] = useState<NoticeViewType>("notice");
  const [isAdmin, setIsAdmin] = useState<boolean>(() => readIsAdmin());
  const [customNotices, setCustomNotices] = useState<EditableNoticeItem[]>(() =>
    readCustomNotices(),
  );
  const [hiddenNoticeKeys, setHiddenNoticeKeys] = useState<string[]>(() =>
    readHiddenNoticeKeys(),
  );
  const [deleteTarget, setDeleteTarget] = useState<NoticeDeleteTarget | null>(null);
  const [isNoticeEditorOpen, setIsNoticeEditorOpen] = useState(false);
  const [noticeTitle, setNoticeTitle] = useState("");
  const [noticeBody, setNoticeBody] = useState("");
  const [noticeError, setNoticeError] = useState<string | null>(null);
  const modalPanelRef = useRef<HTMLDivElement | null>(null);
  const deleteDialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const noticeWriteTooltipId = useId();
  const modalTitleId = useId();
  const noticeTitleInputId = useId();
  const noticeBodyInputId = useId();
  const deleteDialogTitleId = useId();
  const isModalOpen = modalType !== null;
  const isNoticeModal = modalType === "notice";
  const isNoticeWriteEnabled = isAdmin && isNoticeModal && noticeView === "notice";
  const mergedNoticeItems = useMemo<
    Array<FooterNoticeItem & { key: string; isCustom: boolean; customId?: string }>
  >(
    () => {
      const custom = customNotices.map((item) => ({
        ...item,
        key: `custom:${item.id}`,
        isCustom: true,
        customId: item.id,
      }));
      const defaults = NOTICE_ITEMS.map((item) => ({
        ...item,
        key: `default:${item.date}:${item.title}:${item.body}`,
        isCustom: false,
      }));
      return [...custom, ...defaults].filter(
        (item) => !hiddenNoticeKeys.includes(item.key),
      );
    },
    [customNotices, hiddenNoticeKeys],
  );
  const footerTextClass = "text-[14px] text-white";

  useEffect(() => {
    if (!isModalOpen && !deleteTarget) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      const dialog = deleteTarget ? deleteDialogRef.current : modalPanelRef.current;
      if (dialog) trapTabKey(event, dialog);
      if (event.key !== "Escape") return;
      if (deleteTarget) {
        setDeleteTarget(null);
        return;
      }
      if (isModalOpen) setModalType(null);
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
      const prev = previousFocusRef.current;
      if (prev && document.contains(prev)) prev.focus();
    };
  }, [deleteTarget, isModalOpen]);

  useEffect(() => {
    if (deleteTarget) {
      requestAnimationFrame(() => {
        const dialog = deleteDialogRef.current;
        if (!dialog) return;
        const first = dialog.querySelector<HTMLButtonElement>("button");
        first?.focus();
      });
      return;
    }
    if (isModalOpen) {
      requestAnimationFrame(() => {
        const dialog = modalPanelRef.current;
        if (!dialog) return;
        const first = dialog.querySelector<HTMLElement>(
          "button, input, textarea, a[href]",
        );
        first?.focus();
      });
    }
  }, [deleteTarget, isModalOpen]);

  useEffect(() => {
    const sync = () => setIsAdmin(readIsAdmin());
    window.addEventListener(AUTH_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(AUTH_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    const sync = () => setCustomNotices(readCustomNotices());
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    const sync = () => setHiddenNoticeKeys(readHiddenNoticeKeys());
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    if (!isNoticeWriteEnabled) {
      setIsNoticeEditorOpen(false);
      setNoticeError(null);
    }
  }, [isNoticeWriteEnabled]);

  useEffect(() => {
    const onOpenTerms = () => setModalType("terms");
    const onOpenPrivacy = () => setModalType("privacy");
    window.addEventListener(OPEN_TERMS_MODAL_EVENT, onOpenTerms);
    window.addEventListener(OPEN_PRIVACY_MODAL_EVENT, onOpenPrivacy);
    return () => {
      window.removeEventListener(OPEN_TERMS_MODAL_EVENT, onOpenTerms);
      window.removeEventListener(OPEN_PRIVACY_MODAL_EVENT, onOpenPrivacy);
    };
  }, []);

  const modalTitle = useMemo(() => {
    if (modalType === "notice") return "공지사항";
    if (modalType === "copyright") return "저작권/출처";
    if (modalType === "terms") return "PickMovie 서비스 이용약관";
    if (modalType === "privacy") return "PickMovie 개인정보 처리방침";
    return "";
  }, [modalType]);

  const onSaveNotice = () => {
    const title = noticeTitle.trim();
    const body = noticeBody.trim();
    if (!title || !body) {
      setNoticeError("제목과 내용을 모두 입력해 주세요.");
      return;
    }

    const nextItem: EditableNoticeItem = {
      id: `custom-${Date.now()}`,
      date: formatNowDate(),
      title,
      body,
    };
    const nextItems = [nextItem, ...customNotices];
    setCustomNotices(nextItems);
    saveCustomNotices(nextItems);
    setNoticeTitle("");
    setNoticeBody("");
    setNoticeError(null);
    setIsNoticeEditorOpen(false);
  };

  const onConfirmDeleteNotice = () => {
    if (!deleteTarget) return;
    if (deleteTarget.isCustom && deleteTarget.id) {
      const nextCustom = customNotices.filter((item) => item.id !== deleteTarget.id);
      setCustomNotices(nextCustom);
      saveCustomNotices(nextCustom);
    } else {
      const nextHidden = Array.from(new Set([...hiddenNoticeKeys, deleteTarget.key]));
      setHiddenNoticeKeys(nextHidden);
      saveHiddenNoticeKeys(nextHidden);
    }
    setDeleteTarget(null);
  };

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
                className={cn(
                "cursor-pointer transition-transform duration-100 hover:-translate-y-0.5 hover:text-white",
                footerTextClass,
              )}
            >
              공지사항
            </button>
            <button
              type="button"
              onClick={() => setModalType("copyright")}
              className={cn(
                "cursor-pointer transition-transform duration-100 hover:-translate-y-0.5 hover:text-white",
                footerTextClass,
              )}
            >
              저작권/출처
            </button>
            <button
              type="button"
              onClick={() => setModalType("terms")}
              className={cn(
                "cursor-pointer transition-transform duration-100 hover:-translate-y-0.5 hover:text-white",
                footerTextClass,
              )}
            >
              이용약관
            </button>
            <button
              type="button"
              onClick={() => setModalType("privacy")}
              className={cn(
                "cursor-pointer transition-transform duration-100 hover:-translate-y-0.5 hover:text-white font-bold",
                footerTextClass,
              )}
            >
              개인정보 처리방침
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
      {isModalOpen ? (
        <motion.div
          {...modalBackdropMotion}
          className="fixed inset-0 z-[100] flex items-start justify-center bg-black/65 p-4 pt-20 backdrop-blur-[2px] sm:items-center sm:pt-4"
          onClick={() => setModalType(null)}
        >
          <motion.div
            ref={modalPanelRef}
            {...modalPanelMotion}
            className="w-full max-w-2xl rounded-2xl bg-[#0e1118] text-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby={modalTitleId}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-3">
                <h3 id={modalTitleId} className="text-base font-semibold">
                  {modalTitle}
                </h3>
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
              <div className="inline-flex items-center gap-2">
                {isNoticeWriteEnabled ? (
                  <div className="relative group">
                    <motion.button
                      {...buttonMotion}
                      type="button"
                      onClick={() => {
                        setNoticeError(null);
                        setIsNoticeEditorOpen((prev) => !prev);
                      }}
                      aria-describedby={noticeWriteTooltipId}
                      className={cn(
                        "rounded-full p-1.5 transition",
                        isNoticeEditorOpen
                          ? "bg-[#ff7b0d] text-[#0c1019]"
                          : "text-white/75 hover:bg-white/10 hover:text-white",
                      )}
                      aria-label="공지사항 작성 열기"
                    >
                      <PencilLine className="h-4 w-4" />
                    </motion.button>
                    <div
                      id={noticeWriteTooltipId}
                      role="tooltip"
                      className={[
                        "pointer-events-none absolute right-0 top-full mt-2 z-50",
                        "opacity-0 translate-y-1",
                        "group-hover:opacity-100 group-hover:translate-y-0",
                        "transition duration-100 ease-out",
                      ].join(" ")}
                    >
                      <div className="relative rounded-xl border border-white/20 bg-black/75 backdrop-blur-xl px-3 py-1.5 shadow-[0_18px_60px_rgba(0,0,0,0.45)]">
                        <div className="text-xs font-semibold text-white/90 whitespace-nowrap">
                          공지사항 작성
                        </div>
                        <div className="absolute right-4 -top-1 h-2 w-2 rotate-45 border-t border-l border-white/20 bg-black/75" />
                      </div>
                    </div>
                  </div>
                ) : null}
                <motion.button
                  {...buttonMotion}
                  type="button"
                  onClick={() => setModalType(null)}
                  className="rounded-full p-1.5 text-white/65 transition hover:bg-white/10 hover:text-white"
                  aria-label="모달 닫기"
                >
                  <X className="h-4 w-4" />
                </motion.button>
              </div>
            </div>

            <div className="max-h-[65vh] overflow-y-auto px-5 py-4 text-sm leading-relaxed text-white/75">
              <AnimatePresence initial={false}>
              {isNoticeWriteEnabled && isNoticeEditorOpen ? (
                <motion.section
                  key="notice-editor"
                  initial={{ opacity: 0, y: -10, height: 0, marginBottom: 0 }}
                  animate={{ opacity: 1, y: 0, height: "auto", marginBottom: 16 }}
                  exit={{ opacity: 0, y: -8, height: 0, marginBottom: 0 }}
                  transition={{ duration: 0.14, ease: "easeOut" }}
                  className="overflow-hidden rounded-2xl border border-[#ff7b0d]/30 bg-gradient-to-br from-[#11182a] via-[#0f1523] to-[#0d111c] p-4"
                >
                  <h4 className="text-sm font-semibold text-white">공지사항 작성</h4>
                  <div className="mt-3 space-y-3">
                    <label htmlFor={noticeTitleInputId} className="sr-only">
                      공지사항 제목
                    </label>
                    <input
                      id={noticeTitleInputId}
                      type="text"
                      value={noticeTitle}
                      onChange={(event) => setNoticeTitle(event.target.value)}
                      placeholder="제목을 입력해 주세요"
                      className="w-full rounded-xl border border-white/15 bg-[#0b111d] px-3 py-2 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-[#ff7b0d]/70"
                    />
                    <label htmlFor={noticeBodyInputId} className="sr-only">
                      공지사항 내용
                    </label>
                    <textarea
                      id={noticeBodyInputId}
                      value={noticeBody}
                      onChange={(event) => setNoticeBody(event.target.value)}
                      placeholder="내용을 입력해 주세요"
                      rows={5}
                      className="w-full resize-y rounded-xl border border-white/15 bg-[#0b111d] px-3 py-2 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-[#ff7b0d]/70"
                    />
                    {noticeError ? (
                      <p className="text-xs text-rose-300">{noticeError}</p>
                    ) : null}
                    <div className="flex items-center justify-end gap-2">
                      <motion.button
                        {...buttonMotion}
                        type="button"
                        onClick={() => {
                          setIsNoticeEditorOpen(false);
                          setNoticeError(null);
                        }}
                        className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-medium text-white/80 transition hover:border-white/35 hover:text-white"
                      >
                        취소
                      </motion.button>
                      <motion.button
                        {...buttonMotion}
                        type="button"
                        onClick={onSaveNotice}
                        className="rounded-full bg-gradient-to-r from-purple-600 to-pink-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:from-purple-500 hover:to-pink-500"
                      >
                        등록
                      </motion.button>
                    </div>
                  </div>
                </motion.section>
              ) : null}
              </AnimatePresence>

              {modalType === "notice" && noticeView === "notice" ? (
                <div className="space-y-3">
                  {mergedNoticeItems.map((item, index) => (
                    <article
                      key={`notice-${item.key}-${index}`}
                      className="relative rounded-xl bg-white/[0.03] p-4"
                    >
                      {isAdmin ? (
                        <div className="absolute right-3 top-3 group/delete">
                          <motion.button
                            {...buttonMotion}
                            type="button"
                            onClick={() =>
                              setDeleteTarget({
                                key: item.key,
                                title: item.title,
                                isCustom: item.isCustom,
                                id: item.customId,
                              })
                            }
                            className="rounded-full p-1 text-white/50 transition hover:bg-white/10 hover:text-white"
                            aria-label="공지 삭제"
                          >
                            <X className="h-3.5 w-3.5" />
                          </motion.button>
                          <div
                            role="tooltip"
                          className={[
                              "pointer-events-none absolute right-0 top-full mt-1.5 z-30",
                              "opacity-0 translate-y-1",
                              "group-hover/delete:opacity-100 group-hover/delete:translate-y-0",
                              "transition duration-100 ease-out",
                            ].join(" ")}
                          >
                            <div className="relative rounded-xl border border-white/20 bg-black/75 backdrop-blur-xl px-2.5 py-1 shadow-[0_14px_42px_rgba(0,0,0,0.45)]">
                              <div className="text-[11px] font-semibold whitespace-nowrap text-white/90">
                                공지사항 삭제
                              </div>
                              <div className="absolute right-3 -top-1 h-2 w-2 rotate-45 border-t border-l border-white/20 bg-black/75" />
                            </div>
                          </div>
                        </div>
                      ) : null}
                      <p className="text-[14px] text-white/50">{item.date}</p>
                      <h4 className="mt-1 text-sm font-semibold text-white">
                        {item.title}
                      </h4>
                      <p className="mt-2 whitespace-pre-line text-sm text-white/70">
                        {item.body}
                      </p>
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
                      <p className="text-[14px] text-white/50">{item.date}</p>
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

              {modalType === "terms" ? (
                <div className="space-y-5 font-pretendard">
                  <section>
                    <p className="text-white/55 text-xs">최종 업데이트: 2026-03-06</p>
                  </section>

                  <section>
                    <h4 className="text-sm font-semibold text-white">제1조 (목적)</h4>
                    <div className="mt-2 space-y-2 text-white/75">
                      <p>
                        본 약관은 PickMovie 개인 프로젝트 운영자(이하 "운영자")가 제공하는 영화 및 콘텐츠 추천 서비스(이하 "서비스")의 이용과 관련하여 운영자와 이용자 간의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.
                      </p>
                    </div>
                  </section>

                  <section>
                    <h4 className="text-sm font-semibold text-white">제2조 (정의)</h4>
                    <div className="mt-2 space-y-2 text-white/75">
                      <p>서비스: 회사가 제공하는 영화 정보 조회, 콘텐츠 추천, 차트 정보 제공 및 관련 기능</p>
                      <p>회원: 본 약관에 동의하고 이메일 인증을 통해 계정을 생성하여 서비스를 이용하는 이용자</p>
                      <p>계정: 회원 식별 및 서비스 이용을 위해 이메일 기반으로 생성된 사용자 식별 정보</p>
                    </div>
                  </section>

                  <section>
                    <h4 className="text-sm font-semibold text-white">제3조 (약관의 효력 및 변경)</h4>
                    <div className="mt-2 space-y-2 text-white/75">
                      <p>본 약관은 서비스 내 게시 또는 기타 방법으로 공지함으로써 효력이 발생합니다.</p>
                      <p>운영자는 관련 법령을 위반하지 않는 범위에서 약관을 변경할 수 있습니다.</p>
                      <p>약관 변경 시 변경 내용과 시행일을 서비스 내 공지합니다.</p>
                      <p>이용자는 변경된 약관에 동의하지 않을 경우 서비스 이용을 중단하고 탈퇴할 수 있습니다.</p>
                    </div>
                  </section>

                  <section>
                    <h4 className="text-sm font-semibold text-white">제4조 (회원가입)</h4>
                    <div className="mt-2 space-y-2 text-white/75">
                      <p>회원 가입은 이메일 인증을 통해 이루어집니다.</p>
                      <p>회원은 정확한 정보를 제공해야 하며 허위 정보 제공 시 서비스 이용이 제한될 수 있습니다.</p>
                      <p>운영자는 허위 정보 입력, 운영 방해 목적, 법령 위반 시 가입을 거부하거나 제한할 수 있습니다.</p>
                    </div>
                  </section>

                  <section>
                    <h4 className="text-sm font-semibold text-white">제5조 (로그인 방식)</h4>
                    <div className="mt-2 space-y-2 text-white/75">
                      <p>PickMovie는 이메일 인증 링크(Magic Link) 기반 로그인 방식을 사용합니다.</p>
                      <p>회원은 본인 이메일 계정 보안을 유지할 책임이 있습니다.</p>
                      <p>인증 링크는 보안을 위해 일정 시간이 지나면 자동으로 만료될 수 있습니다.</p>
                    </div>
                  </section>

                  <section>
                    <h4 className="text-sm font-semibold text-white">제6조 (회원의 의무)</h4>
                    <div className="mt-2 space-y-2 text-white/75">
                      <p>서비스 운영 방해, 자동화 프로그램을 통한 비정상 접근, 타인 계정 도용, 데이터 무단 수집, 법령 위반 행위를 금지합니다.</p>
                      <p>위 행위 확인 시 운영자는 계정 이용을 제한하거나 삭제할 수 있습니다.</p>
                    </div>
                  </section>

                  <section>
                    <h4 className="text-sm font-semibold text-white">제7조 (서비스 변경 및 중단)</h4>
                    <div className="mt-2 space-y-2 text-white/75">
                      <p>시스템 점검, 서버 장애, 외부 API 변경, 운영 정책 변경 시 서비스 일부 또는 전부를 변경/중단할 수 있습니다.</p>
                      <p>운영자는 법령이 허용하는 범위 내에서 관련 책임을 제한할 수 있습니다.</p>
                    </div>
                  </section>

                  <section>
                    <h4 className="text-sm font-semibold text-white">제8조 (외부 데이터 및 API 사용)</h4>
                    <div className="mt-2 space-y-2 text-white/75">
                      <p>서비스는 외부 데이터 제공 서비스 및 API를 통해 콘텐츠 정보를 제공합니다.</p>
                      <p>외부 API 데이터는 제공 기관의 정책 및 데이터 변경에 따라 달라질 수 있습니다.</p>
                      <p>세부 출처 및 저작권 고지는 "저작권/출처"를 따릅니다.</p>
                    </div>
                  </section>

                  <section>
                    <h4 className="text-sm font-semibold text-white">제9조 (콘텐츠 정보)</h4>
                    <div className="mt-2 space-y-2 text-white/75">
                      <p>서비스에서 제공되는 영화 정보, 포스터, 출연진 정보 등은 외부 데이터 제공처를 기반으로 제공합니다.</p>
                      <p>운영자는 데이터의 완전성, 최신성, 정확성을 보장하지 않습니다.</p>
                    </div>
                  </section>

                  <section>
                    <h4 className="text-sm font-semibold text-white">제10조 (추천 서비스)</h4>
                    <div className="mt-2 space-y-2 text-white/75">
                      <p>PickMovie는 알고리즘 기반 콘텐츠 추천 기능을 제공할 수 있습니다.</p>
                      <p>추천 결과는 참고용 정보이며 추천 정확성 및 이용자 취향과의 일치를 보장하지 않습니다.</p>
                    </div>
                  </section>

                  <section>
                    <h4 className="text-sm font-semibold text-white">제11조 (면책)</h4>
                    <div className="mt-2 space-y-2 text-white/75">
                      <p>운영자는 회원 귀책 사유로 발생한 문제에 대해 책임지지 않습니다.</p>
                      <p>운영자는 이메일 계정 보안 문제, 외부 API 데이터 오류로 인한 문제에 대해 책임을 지지 않습니다.</p>
                      <p>운영자는 무료 서비스 이용 과정에서 발생한 간접 손해에 대해 책임을 제한할 수 있습니다.</p>
                    </div>
                  </section>

                  <section>
                    <h4 className="text-sm font-semibold text-white">제12조 (계정 탈퇴)</h4>
                    <div className="mt-2 space-y-2 text-white/75">
                      <p>회원은 언제든지 계정 삭제를 요청할 수 있습니다.</p>
                      <p>탈퇴 시 개인정보는 개인정보 처리방침에 따라 처리됩니다.</p>
                    </div>
                  </section>

                  <section>
                    <h4 className="text-sm font-semibold text-white">제13조 (준거법)</h4>
                    <div className="mt-2 space-y-2 text-white/75">
                      <p>본 약관은 대한민국 법률을 따르며 서비스 관련 분쟁은 대한민국 법원을 관할 법원으로 합니다.</p>
                    </div>
                  </section>

                  <section>
                    <h4 className="text-sm font-semibold text-white">문의</h4>
                    <p className="mt-2 text-white/75">
                      서비스 관련 문의:{" "}
                      <a
                        className="font-medium text-white/80 transition-colors hover:text-white"
                        href="mailto:contact@pickmovie.net"
                      >
                        contact@pickmovie.net
                      </a>
                    </p>
                  </section>
                </div>
              ) : null}

              {modalType === "privacy" ? (
                <div className="space-y-5 font-pretendard">
                  <section>
                    <p className="text-white/55 text-xs">최종 업데이트: 2026-03-06</p>
                  </section>

                  <section>
                    <h4 className="text-sm font-semibold text-white">1. 수집하는 개인정보</h4>
                    <div className="mt-2 space-y-2 text-white/75">
                      <p>필수: 이메일 주소</p>
                      <p>선택: 닉네임</p>
                      <p>자동 수집: IP 주소, 쿠키, 브라우저/기기 정보, 접속 로그, 서비스 이용 기록</p>
                    </div>
                  </section>

                  <section>
                    <h4 className="text-sm font-semibold text-white">2. 개인정보 이용 목적</h4>
                    <div className="mt-2 space-y-2 text-white/75">
                      <p>회원 식별, 이메일 인증 로그인, 계정 보안 관리, 고객 문의 대응, 서비스 운영 및 개선</p>
                    </div>
                  </section>

                  <section>
                    <h4 className="text-sm font-semibold text-white">3. 개인정보 보유 기간</h4>
                    <div className="mt-2 space-y-2 text-white/75">
                      <p>개인정보는 수집 목적 달성 시 지체 없이 파기합니다.</p>
                      <p>단, 관계 법령에 따라 일정 기간 보관할 수 있습니다.</p>
                    </div>
                  </section>

                  <section>
                    <h4 className="text-sm font-semibold text-white">4. 개인정보 파기</h4>
                    <div className="mt-2 space-y-2 text-white/75">
                      <p>개인정보는 보유 기간이 경과하거나 처리 목적이 달성된 경우 지체 없이 파기합니다.</p>
                      <p>전자적 파일 형태로 저장된 개인정보는 복구가 불가능한 방법으로 영구 삭제합니다.</p>
                    </div>
                  </section>

                  <section>
                    <h4 className="text-sm font-semibold text-white">5. 개인정보 제3자 제공</h4>
                    <div className="mt-2 space-y-2 text-white/75">
                      <p>운영자는 이용자의 개인정보를 제3자에게 제공하지 않습니다.</p>
                      <p>다만 이용자 동의 또는 법령 요구가 있는 경우는 예외입니다.</p>
                    </div>
                  </section>

                  <section>
                    <h4 className="text-sm font-semibold text-white">6. 개인정보 처리 위탁</h4>
                    <div className="mt-2 space-y-2 text-white/75">
                      <p>서비스 운영을 위해 외부 서비스(예: Cloudflare, Vercel, 백엔드 인프라, 인증 이메일 발송 서비스)를 사용할 수 있습니다.</p>
                      <p>위탁 서비스는 서비스 운영 목적 범위 내에서만 사용됩니다.</p>
                    </div>
                  </section>

                  <section>
                    <h4 className="text-sm font-semibold text-white">7. 이용자 권리</h4>
                    <div className="mt-2 space-y-2 text-white/75">
                      <p>이용자는 언제든 개인정보 열람, 수정, 삭제, 처리 정지를 요청할 수 있습니다.</p>
                      <p>
                        문의:{" "}
                        <a
                          className="font-medium text-white/80 transition-colors hover:text-white"
                          href="mailto:contact@pickmovie.net"
                        >
                          contact@pickmovie.net
                        </a>
                      </p>
                    </div>
                  </section>

                  <section>
                    <h4 className="text-sm font-semibold text-white">8. 개인정보 보호 책임자</h4>
                    <p className="mt-2 text-white/75">
                      PickMovie 운영자 (
                      <a
                        className="font-medium text-white/80 transition-colors hover:text-white"
                        href="mailto:contact@pickmovie.net"
                      >
                        contact@pickmovie.net
                      </a>
                      )
                    </p>
                  </section>

                  <section>
                    <h4 className="text-sm font-semibold text-white">9. 개인정보 처리방침 변경</h4>
                    <p className="mt-2 text-white/75">본 정책은 법령 및 서비스 변경에 따라 수정될 수 있으며, 변경 시 서비스 내 공지합니다.</p>
                  </section>
                </div>
              ) : null}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
      </AnimatePresence>

      <AnimatePresence>
      {deleteTarget ? (
        <motion.div
          {...modalBackdropMotion}
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/65 p-4"
          onClick={() => setDeleteTarget(null)}
        >
          <motion.div
            ref={deleteDialogRef}
            {...modalPanelMotion}
            className="w-full max-w-sm rounded-2xl bg-[#0e1118] p-5 text-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby={deleteDialogTitleId}
            onClick={(event) => event.stopPropagation()}
          >
            <h4 id={deleteDialogTitleId} className="text-base font-semibold">
              삭제하시겠습니까?
            </h4>
            <p className="mt-2 line-clamp-2 text-sm text-white/70">
              {deleteTarget.title}
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <motion.button
                {...buttonMotion}
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-medium text-white/80 transition hover:border-white/35 hover:text-white"
              >
                취소
              </motion.button>
              <motion.button
                {...buttonMotion}
                type="button"
                onClick={onConfirmDeleteNotice}
                className="rounded-full bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-400"
              >
                삭제
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
      </AnimatePresence>
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
