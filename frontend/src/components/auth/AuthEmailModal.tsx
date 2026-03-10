import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Mail, X, Loader2, CircleCheckBig, Clock3, ShieldCheck } from "lucide-react";
import { ApiError, apiPost } from "../../lib/apiClient";
import { AUTH_KEYS, reloadAfterAuth, type AuthModalMode } from "../../lib/auth";

type Props = {
  open: boolean;
  mode: AuthModalMode;
  onModeChange: (mode: AuthModalMode) => void;
  onClose: () => void;
};

type EmailAuthRequestResponse = {
  ok: true;
  directLogin?: boolean;
  user?: unknown;
  accessToken?: string;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AuthEmailModal({
  open,
  mode,
  onModeChange,
  onClose,
}: Props) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setLoading(false);
      setResending(false);
      setError(null);
      setSent(false);
      setEmail("");
    }
  }, [open]);

  const title = mode === "signup" ? "회원가입" : "로그인";
  const helper =
    mode === "signup"
      ? "비밀번호 없이 이메일 링크로 가입을 완료하세요."
      : "비밀번호 없이 이메일 링크로 바로 로그인하세요.";

  const emailError = useMemo(() => {
    if (!email.trim()) return null;
    if (!EMAIL_REGEX.test(email.trim())) {
      return "올바른 이메일 형식을 입력해주세요.";
    }
    return null;
  }, [email]);

  const normalizedEmail = email.trim().toLowerCase();
  const canSubmit = !!normalizedEmail && !emailError && !loading;

  const submit = async () => {
    if (!normalizedEmail) {
      setError("이메일을 입력해주세요.");
      return;
    }
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      setError("올바른 이메일 형식을 입력해주세요.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await apiPost<EmailAuthRequestResponse>("/auth/email-auth/request", {
        email: normalizedEmail,
      });
      if (res?.directLogin && res?.accessToken && res?.user) {
        try {
          localStorage.setItem(AUTH_KEYS.ACCESS, res.accessToken);
          localStorage.setItem(AUTH_KEYS.USER, JSON.stringify(res.user));
        } catch {}
        onClose();
        reloadAfterAuth();
        return;
      }
      setSent(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || "요청 처리에 실패했습니다.");
      } else {
        setError("요청 처리에 실패했습니다. 잠시 후 다시 시도해주세요.");
      }
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (!normalizedEmail || resending) return;
    setResending(true);
    setError(null);
    try {
      await apiPost<{ ok: true }>("/auth/email-auth/request", {
        email: normalizedEmail,
        resend: true,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || "재전송 처리에 실패했습니다.");
      } else {
        setError("재전송 처리에 실패했습니다. 잠시 후 다시 시도해주세요.");
      }
    } finally {
      setResending(false);
    }
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[120] flex min-h-dvh items-center justify-center overflow-y-auto px-3 py-6 sm:px-4 sm:py-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.button
            type="button"
            className="absolute inset-0 bg-black/75 backdrop-blur-sm"
            onClick={onClose}
            aria-label="닫기"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, y: 12, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.985 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="relative w-full max-w-[640px] overflow-hidden rounded-3xl bg-[#10131b] shadow-[0_30px_80px_rgba(0,0,0,0.55)]"
            style={{ maxHeight: "calc(100dvh - 24px)" }}
          >
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute inset-0 bg-[#10131b]" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_62%)]" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_left,rgba(168,85,247,0.08),transparent_52%)]" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_right,rgba(236,72,153,0.06),transparent_52%)]" />
            </div>

            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 z-10 rounded-full p-1.5 text-white/65 hover:bg-white/10 hover:text-white"
              aria-label="닫기"
            >
              <X size={20} />
            </button>

            <div
              className="relative z-[1] overflow-y-auto p-5 pb-[calc(20px+env(safe-area-inset-bottom))] sm:p-6 md:p-8"
              style={{ maxHeight: "calc(100dvh - 24px)" }}
            >
              <div className="relative flex h-12 rounded-full p-1">
                <motion.span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-1 top-1 h-10 w-[calc(50%-4px)] rounded-full border border-white/20 bg-white/[0.06]"
                  animate={{ x: mode === "login" ? "0%" : "100%" }}
                  transition={{ type: "tween", duration: 0.16, ease: "easeInOut" }}
                />
                <button
                  type="button"
                  onClick={() => onModeChange("login")}
                  className={[
                    "relative z-[1] flex h-10 flex-1 items-center justify-center rounded-full text-center text-sm font-semibold transition",
                    mode === "login"
                      ? "text-white"
                      : "text-white/70 hover:text-white/90",
                  ].join(" ")}
                >
                  로그인
                </button>
                <button
                  type="button"
                  onClick={() => onModeChange("signup")}
                  className={[
                    "relative z-[1] flex h-10 flex-1 items-center justify-center rounded-full text-center text-sm font-semibold transition",
                    mode === "signup"
                      ? "text-white"
                      : "text-white/70 hover:text-white/90",
                  ].join(" ")}
                >
                  회원가입
                </button>
              </div>

              <div className="mt-5 sm:mt-6">
                <h2 className="text-[36px] font-extrabold tracking-tight text-white sm:text-[40px]">{title}</h2>
                <p className="mt-1 text-[15px] text-white/65 sm:text-base">{helper}</p>
              </div>

              {!sent ? (
                <div className="mt-7 sm:mt-8">
                  <label className="mb-2 block text-sm font-semibold text-white/85">이메일</label>
                  <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3">
                    <div className="flex h-11 flex-[1_1_auto] items-center rounded-xl border border-white/10 bg-[#08111e]/72 px-3 focus-within:border-[#9b8cad]/55 sm:h-12">
                      <Mail className="h-4 w-4 text-white/45" />
                      <input
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && canSubmit) {
                            e.preventDefault();
                            void submit();
                          }
                        }}
                        type="email"
                        autoComplete="email"
                        placeholder="name@example.com"
                        className="pm-auth-email-input h-full w-full bg-transparent px-2 text-base text-white outline-none placeholder:text-white/30"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={submit}
                      disabled={!canSubmit}
                      className="h-11 w-full rounded-xl bg-[#c9b5d2] px-3.5 text-[17px] font-bold text-[#111827] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-45 sm:h-12 sm:w-auto sm:min-w-[118px] sm:px-4 sm:text-base"
                    >
                      {loading ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Loader2 size={16} className="animate-spin" />
                          전송 중
                        </span>
                      ) : (
                        "링크 받기"
                      )}
                    </button>
                  </div>

                  {emailError ? (
                    <p className="mt-2 text-xs text-rose-300">{emailError}</p>
                  ) : (
                    <p className="mt-2 text-xs text-white/45">입력한 메일은 인증 링크 발송에만 사용됩니다.</p>
                  )}

                  {error ? (
                    <p className="mt-3 rounded-lg border border-rose-300/20 bg-rose-400/10 px-3 py-2 text-sm text-rose-100">
                      {error}
                    </p>
                  ) : null}

                  <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <div className="rounded-xl border border-white/10 bg-[#161e2f]/74 p-2.5 sm:p-3">
                      <Clock3 className="h-4 w-4 text-white/75" />
                      <p className="mt-1 text-[11px] font-semibold leading-tight text-white sm:text-xs">빠른 진입</p>
                      <p className="mt-0.5 text-[10px] leading-tight text-white/55 sm:text-[11px]">10초 내 인증 완료</p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-[#161e2f]/74 p-2.5 sm:p-3">
                      <ShieldCheck className="h-4 w-4 text-white/75" />
                      <p className="mt-1 text-[11px] font-semibold leading-tight text-white sm:text-xs">보안 강화</p>
                      <p className="mt-0.5 text-[10px] leading-tight text-white/55 sm:text-[11px]">비밀번호 저장 없음</p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-[#161e2f]/74 p-2.5 sm:p-3">
                      <Mail className="h-4 w-4 text-white/75" />
                      <p className="mt-1 text-[11px] font-semibold leading-tight text-white sm:text-xs">링크 인증</p>
                      <p className="mt-0.5 text-[10px] leading-tight text-white/55 sm:text-[11px]">메일로 안전 로그인</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-7 rounded-2xl border border-white/10 bg-[#0c1423]/80 p-4">
                  <div className="flex items-start gap-2.5">
                    <CircleCheckBig className="mt-0.5 h-5 w-5 text-emerald-300" />
                    <div>
                      <p className="text-sm font-semibold text-white">인증 링크를 보냈습니다</p>
                      <p className="mt-1 text-sm leading-relaxed text-white/75">
                        <span className="font-semibold text-white">{normalizedEmail}</span>
                        로 도착한 메일에서 링크를 눌러 {mode === "signup" ? "회원가입" : "로그인"}을 완료하세요.
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => {
                        setSent(false);
                        setError(null);
                      }}
                      className="h-11 rounded-lg border border-white/10 bg-white/[0.04] px-4 text-sm text-white/85 hover:bg-white/[0.09]"
                    >
                      다른 이메일 입력
                    </button>
                    <button
                      type="button"
                      onClick={resend}
                      disabled={resending}
                      className="h-11 rounded-lg border border-white/10 bg-white/[0.04] px-4 text-sm text-white/85 hover:bg-white/[0.09] disabled:opacity-50"
                    >
                      {resending ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Loader2 size={14} className="animate-spin" />
                          재전송 중...
                        </span>
                      ) : (
                        "재전송"
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      className="h-11 rounded-lg bg-white px-4 text-sm font-semibold text-[#0d1420] hover:brightness-95"
                    >
                      닫기
                    </button>
                  </div>
                </div>
              )}

              <p className="mt-6 text-center text-xs text-white/40">
                링크 인증은 보안을 위해 일정 시간 후 만료됩니다.
              </p>
            </div>

            <style>{`
              .pm-auth-email-input:-webkit-autofill,
              .pm-auth-email-input:-webkit-autofill:hover,
              .pm-auth-email-input:-webkit-autofill:focus,
              .pm-auth-email-input:-webkit-autofill:active {
                -webkit-text-fill-color: #ffffff !important;
                background-color: transparent !important;
                box-shadow: 0 0 0 1000px transparent inset !important;
                -webkit-box-shadow: 0 0 0 1000px transparent inset !important;
                transition: background-color 9999s ease-out 0s;
                caret-color: #ffffff;
              }
            `}</style>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
