// src/pages/auth/AccountRecoveryModal.tsx
import React, { useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Mail,
  UserSearch,
  X,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { apiPost, ApiError } from "../../lib/apiClient";

type Mode = "id" | "password";

type Props = {
  open: boolean;
  mode: Mode;
  onClose: () => void;
  onSwitchMode?: (mode: Mode) => void;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AccountRecoveryModal({
  open,
  mode,
  onClose,
  onSwitchMode,
}: Props) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = useMemo(
    () => (mode === "id" ? "아이디 찾기" : "비밀번호 찾기"),
    [mode]
  );
  const subtitle = useMemo(
    () =>
      mode === "id"
        ? "가입 시 등록한 이메일로 아이디 안내를 보내드립니다."
        : "가입 시 등록한 이메일로 비밀번호 재설정 링크를 보내드립니다.",
    [mode]
  );

  if (!open) return null;

  const resetAndClose = () => {
    setEmail("");
    setLoading(false);
    setDone(false);
    setError(null);
    onClose();
  };

  const submit = async () => {
    const e = email.trim();
    if (!EMAIL_REGEX.test(e)) {
      setError("올바른 이메일 형식으로 입력해주세요.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // ✅ 백엔드에서 '계정 존재 여부'와 상관없이 200(OK)로 처리하는 것을 권장
      if (mode === "id") {
        await apiPost<{ ok: true }>("/auth/username/lookup", { email: e });
      } else {
        await apiPost<{ ok: true }>("/auth/password/forgot", { identifier: e });
      }
      setDone(true);
    } catch (err) {
      // ✅ 여기서도 존재 여부 유추 가능한 메시지 노출 X
      if (err instanceof ApiError && err.status >= 500) {
        setError("서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
      } else {
        setError("요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80]">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={resetAndClose}
        aria-label="overlay"
      />
      <div className="absolute left-1/2 top-1/2 w-[92vw] max-w-[520px] -translate-x-1/2 -translate-y-1/2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl shadow-[0_10px_50px_rgba(0,0,0,0.35)]">
          <div className="p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                {mode === "id" ? (
                  <UserSearch size={18} className="text-white/70" />
                ) : (
                  <KeyRound size={18} className="text-white/70" />
                )}
                <div>
                  <h2 className="text-lg font-bold text-white">{title}</h2>
                  <p className="mt-1 text-sm text-white/60">{subtitle}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={resetAndClose}
                className="rounded-md p-1 text-white/50 hover:text-white/80"
                aria-label="close"
              >
                <X size={18} />
              </button>
            </div>

            {!done ? (
              <>
                <div className="mt-5">
                  <span className="mb-2 block text-sm text-white/80">
                    이메일
                  </span>
                  <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 focus-within:border-purple-400/50 focus-within:ring-2 focus-within:ring-purple-400/15">
                    <Mail className="text-white/45" size={18} />
                    <input
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      type="email"
                      autoComplete="email"
                      placeholder="이메일을 입력하세요"
                      className="w-full bg-transparent text-sm outline-none placeholder:text-white/30"
                    />
                  </div>

                  {error ? (
                    <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                      <AlertCircle size={18} className="mt-0.5" />
                      <span>{error}</span>
                    </div>
                  ) : null}
                </div>

                <div className="mt-5 space-y-3">
                  <Button
                    type="button"
                    onClick={submit}
                    disabled={loading}
                    className="pick-cta text-md w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 text-white disabled:opacity-50 disabled:cursor-not-allowed border-none transition-opacity"
                  >
                    {loading ? "전송 중..." : "이메일 보내기"}
                  </Button>

                  {onSwitchMode ? (
                    <div className="text-center text-sm text-white/65">
                      <button
                        type="button"
                        onClick={() => onSwitchMode("id")}
                        className="hover:text-white hover:underline underline-offset-4"
                      >
                        아이디 찾기
                      </button>
                      <span className="mx-3 text-white/25">|</span>
                      <button
                        type="button"
                        onClick={() => onSwitchMode("password")}
                        className="hover:text-white hover:underline underline-offset-4"
                      >
                        비밀번호 찾기
                      </button>
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                <div className="mt-6 flex items-start gap-2 rounded-xl border border-emerald-400/15 bg-emerald-400/10 px-3 py-3 text-sm text-emerald-100">
                  <CheckCircle2 size={18} className="mt-0.5 text-emerald-300" />
                  <div>
                    <p className="font-semibold">안내 메일을 보냈습니다</p>
                    <p className="mt-1 text-white/70">
                      입력하신 이메일로 안내를 발송했습니다. <br />
                      계정이 존재한다면 몇 분 내에 메일이 도착합니다.
                    </p>
                    <p className="mt-2 text-xs text-white/45">
                      메일이 오지 않으면 스팸함/프로모션함을 확인해주세요.
                    </p>
                  </div>
                </div>

                <div className="mt-5">
                  <Button
                    type="button"
                    onClick={resetAndClose}
                    className="pick-cta text-md w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 text-white border-none transition-opacity"
                  >
                    확인
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
