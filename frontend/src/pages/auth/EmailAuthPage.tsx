import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { AuthLayout } from "./AuthLayout";
import { ApiError, apiPost } from "../../lib/apiClient";
import { AUTH_KEYS, reloadAfterAuth } from "../../lib/auth";

type SafeUser = {
  id: number;
  username: string;
  email: string | null;
  nickname: string | null;
};

type CompleteResponse = {
  user: SafeUser;
  accessToken: string;
  isNewUser?: boolean;
};

type Status = "loading" | "success" | "error";

export function EmailAuthPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const token = useMemo(() => (params.get("token") ?? "").trim(), [params]);

  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("유효하지 않은 링크입니다.");
      return;
    }

    let alive = true;

    void (async () => {
      setStatus("loading");
      setMessage(null);

      try {
        const res = await apiPost<CompleteResponse>("/auth/email-auth/complete", {
          token,
        });

        if (!alive) return;

        localStorage.setItem(AUTH_KEYS.ACCESS, res.accessToken);
        localStorage.setItem(AUTH_KEYS.USER, JSON.stringify(res.user));

        const isNewUser = !!res?.isNewUser;
        const hasNickname = !!String(res?.user?.nickname ?? "").trim();

        if (!hasNickname) {
          reloadAfterAuth(`/?onboard=nickname${isNewUser ? "&new=1" : ""}`);
          return;
        }

        if (isNewUser) {
          localStorage.setItem("pickmovie_new_signup", "1");
        }

        setStatus("success");
        window.setTimeout(() => {
          reloadAfterAuth("/");
        }, 250);
      } catch (err) {
        if (!alive) return;
        setStatus("error");
        if (err instanceof ApiError) {
          setMessage(err.message || "인증에 실패했습니다.");
        } else {
          setMessage("인증에 실패했습니다.");
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [token, navigate]);

  return (
    <AuthLayout
      title="이메일 확인"
      subtitle="이메일 링크를 확인하여 로그인 또는 회원가입을 완료하고 있어요."
    >
      <div className="space-y-3">
        {status === "loading" ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/80">
            <span className="inline-flex items-center gap-2">
              <Loader2 size={16} className="animate-spin" />
              인증 처리 중입니다...
            </span>
          </div>
        ) : null}

        {status === "success" ? (
          <div className="rounded-xl border border-emerald-300/20 bg-emerald-400/10 p-5 text-sm text-emerald-100">
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 size={16} />
              인증이 완료되었습니다. 메인으로 이동합니다.
            </span>
          </div>
        ) : null}

        {status === "error" ? (
          <div className="rounded-xl border border-rose-300/20 bg-rose-400/10 p-5 text-sm text-rose-100">
            <span className="inline-flex items-center gap-2">
              <AlertCircle size={16} />
              {message ?? "인증에 실패했습니다."}
            </span>
          </div>
        ) : null}
      </div>
    </AuthLayout>
  );
}
