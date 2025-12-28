// frontend/src/pages/auth/VerifyEmailPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Mail,
  RotateCcw,
} from "lucide-react";

import { AuthLayout } from "./AuthLayout";
import { Button } from "../../components/ui/button";
import { apiPost, ApiError } from "../../lib/apiClient";

type LocationState = {
  email?: string; // /verify-email/sent 로 올 때 state로 넘김
};

type Status = "idle" | "loading" | "success" | "error";

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = (params.get("token") ?? "").trim();

  const location = useLocation();
  const navigate = useNavigate();

  const stateEmail = (
    (location.state as LocationState | null)?.email ?? ""
  ).trim();

  // token이 있으면 "검증 모드", 없으면 "메일 발송 안내 모드"
  const mode = token ? "verify" : "sent";

  const [status, setStatus] = useState<Status>(
    mode === "verify" ? "loading" : "idle"
  );
  const [message, setMessage] = useState<string | null>(null);

  const [resending, setResending] = useState(false);
  const [resentDone, setResentDone] = useState(false);

  const title = useMemo(() => {
    return mode === "verify" ? "이메일 인증 확인" : "이메일 인증 안내";
  }, [mode]);

  const subtitle = useMemo(() => {
    return mode === "verify"
      ? "이메일 인증을 확인하는 중입니다."
      : "회원가입이 완료되었습니다. 이메일 인증을 완료하면 로그인할 수 있어요.";
  }, [mode]);

  useEffect(() => {
    if (mode !== "verify") return;

    let alive = true;

    (async () => {
      setStatus("loading");
      setMessage(null);

      try {
        await apiPost<{ ok: true }>("/auth/email/verify", { token });

        if (!alive) return;
        setStatus("success");
      } catch (err) {
        if (!alive) return;

        setStatus("error");
        if (err instanceof ApiError) {
          setMessage(err.message || "이메일 인증에 실패했습니다.");
        } else {
          setMessage("이메일 인증에 실패했습니다.");
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [mode, token]);

  const resend = async () => {
    const email = stateEmail;
    if (!email) {
      setMessage(
        "재발송을 위해 회원가입에 사용한 이메일 정보가 필요합니다. 회원가입 페이지로 돌아가주세요."
      );
      return;
    }

    setResending(true);
    setResentDone(false);
    setMessage(null);

    try {
      await apiPost<{ ok: true }>("/auth/email/request-verification", {
        email,
      });
      setResentDone(true);
    } catch (err) {
      if (err instanceof ApiError) {
        // 백엔드는 존재 여부 노출 안 하도록 항상 ok 처리하는 게 이상적
        setMessage(err.message || "재발송에 실패했습니다.");
      } else {
        setMessage("재발송에 실패했습니다.");
      }
    } finally {
      setResending(false);
    }
  };

  const goLogin = () => {
    // ✅ 인증 완료 후 로그인 페이지로 이동 + “회원가입 성공 토스트” 띄우기 용 state
    navigate("/login", {
      replace: true,
      state: { signupSuccess: true, emailVerified: true },
    });
  };

  return (
    <AuthLayout title={title} subtitle={subtitle}>
      <div className="space-y-4">
        {mode === "sent" ? (
          <>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-4">
              <div className="flex items-start gap-3">
                <Mail className="text-white/70" size={20} />
                <div>
                  <p className="text-white font-semibold">
                    인증 메일을 확인해주세요
                  </p>
                  <p className="mt-1 text-sm text-white/65">
                    {stateEmail ? (
                      <>
                        <span className="text-white/80">{stateEmail}</span> 로
                        인증 링크를 보냈습니다.
                      </>
                    ) : (
                      <>가입한 이메일로 인증 링크를 보냈습니다.</>
                    )}
                    <br />
                    메일의 링크를 누르면 인증이 완료됩니다.
                  </p>
                  <p className="mt-2 text-xs text-white/45">
                    메일이 안 오면 스팸함/프로모션함을 확인해주세요.
                  </p>
                </div>
              </div>
            </div>

            {message ? (
              <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                <AlertCircle size={18} className="mt-0.5" />
                <span>{message}</span>
              </div>
            ) : null}

            {resentDone ? (
              <div className="flex items-start gap-2 rounded-xl border border-emerald-400/15 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-100">
                <CheckCircle2 size={18} className="mt-0.5 text-emerald-300" />
                <span>인증 메일을 다시 보냈습니다.</span>
              </div>
            ) : null}

            <div className="space-y-3">
              <Button
                type="button"
                onClick={resend}
                disabled={resending}
                className="pick-cta text-md w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 text-white disabled:opacity-50 disabled:cursor-not-allowed border-none transition-opacity"
              >
                {resending ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="animate-spin" size={16} />
                    재발송 중...
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2">
                    <RotateCcw size={16} />
                    인증 메일 다시 보내기
                  </span>
                )}
              </Button>

              <div className="text-center text-sm text-white/70">
                인증 링크를 눌렀나요?{" "}
                <Link
                  to="/login"
                  className="font-semibold text-white/85 hover:text-white hover:underline underline-offset-4"
                >
                  로그인 하러가기
                </Link>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* verify mode */}
            {status === "loading" ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6 text-center">
                <div className="inline-flex items-center gap-2 text-white/80">
                  <Loader2 className="animate-spin" size={18} />
                  이메일 인증 확인 중...
                </div>
              </div>
            ) : null}

            {status === "success" ? (
              <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/10 backdrop-blur-xl p-6">
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={20} className="text-emerald-300 mt-0.5" />
                  <div>
                    <p className="text-emerald-100 font-semibold">
                      이메일 인증이 완료되었습니다!
                    </p>
                    <p className="mt-1 text-sm text-white/70">
                      이제 로그인하여 PickMovie를 이용할 수 있어요.
                    </p>
                  </div>
                </div>

                <div className="mt-5">
                  <Button
                    type="button"
                    onClick={goLogin}
                    className="pick-cta text-md w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 text-white border-none transition-opacity"
                  >
                    로그인 하러가기
                  </Button>
                </div>
              </div>
            ) : null}

            {status === "error" ? (
              <>
                <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  <AlertCircle size={18} className="mt-0.5" />
                  <span>{message ?? "이메일 인증에 실패했습니다."}</span>
                </div>

                <div className="mt-4 space-y-3">
                  {/* token으로 들어온 페이지는 이메일을 모르기 때문에, sent 페이지(회원가입에서 state로 email 넘김)에서 재발송하도록 유도 */}
                  <Link
                    to="/signup"
                    className="block text-center text-sm text-white/70 hover:text-white hover:underline underline-offset-4"
                  >
                    회원가입 페이지로 돌아가기
                  </Link>
                </div>
              </>
            ) : null}
          </>
        )}
      </div>
    </AuthLayout>
  );
}
