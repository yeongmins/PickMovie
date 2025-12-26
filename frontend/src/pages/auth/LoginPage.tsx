import React, { useMemo, useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Eye,
  EyeOff,
  Lock,
  User,
  AlertCircle,
  CheckCircle2,
  Circle,
} from "lucide-react";
import { AuthLayout } from "../auth/AuthLayout";
import { AuthSuccessModal } from "./SignupSuccessToast.tsx";
import { Button } from "../../components/ui/button";

const USERNAME_MIN = 5;
const USERNAME_MAX = 20;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 16;

function validateUsername(v: string) {
  const s = v.trim();
  if (s.length < USERNAME_MIN || s.length > USERNAME_MAX) {
    return `아이디는 ${USERNAME_MIN}~${USERNAME_MAX}자입니다.`;
  }
  if (!/^[a-zA-Z0-9_]+$/.test(s)) {
    return "아이디는 영문/숫자/_(언더스코어)만 사용할 수 있습니다.";
  }
  return null;
}

function validatePassword(v: string) {
  if (v.length < PASSWORD_MIN || v.length > PASSWORD_MAX) {
    return `비밀번호는 ${PASSWORD_MIN}~${PASSWORD_MAX}자입니다.`;
  }
  return null;
}

type LocationState = {
  signupSuccess?: boolean;
};

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state || {}) as LocationState;

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [successOpen, setSuccessOpen] = useState(false);

  useEffect(() => {
    if (state.signupSuccess) {
      setSuccessOpen(true);
      navigate("/login", { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const usernameErr = useMemo(
    () => (username ? validateUsername(username) : null),
    [username]
  );
  const passwordErr = useMemo(
    () => (password ? validatePassword(password) : null),
    [password]
  );

  const canSubmit = useMemo(() => {
    return !!username.trim() && !!password && !usernameErr && !passwordErr;
  }, [username, password, usernameErr, passwordErr]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const uErr = validateUsername(username);
    const pErr = validatePassword(password);
    if (uErr) return setError(uErr);
    if (pErr) return setError(pErr);

    console.log("[LOGIN]", { username: username.trim(), password, remember });
  };

  const onFindPassword = () => console.log("TODO: 비밀번호 찾기");
  const onFindId = () => console.log("TODO: 아이디 찾기");

  return (
    <>
      <AuthLayout
        title="로그인"
        subtitle="PickMovie 계정으로 로그인하여 찜/플레이리스트를 관리하세요."
        belowCard={
          <div className="text-sm text-white/65">
            <button
              type="button"
              onClick={onFindPassword}
              className="hover:text-white hover:underline underline-offset-4"
            >
              비밀번호 찾기
            </button>
            <span className="mx-3 text-white/25">|</span>
            <button
              type="button"
              onClick={onFindId}
              className="hover:text-white hover:underline underline-offset-4"
            >
              아이디 찾기
            </button>
            <span className="mx-3 text-white/25">|</span>
            <Link
              to="/signup"
              className="font-semibold text-white/85 hover:text-white hover:underline underline-offset-4"
            >
              회원가입
            </Link>
          </div>
        }
      >
        <form onSubmit={onSubmit} className="space-y-5">
          {/* Username */}
          <label className="block">
            <span className="mb-2 block text-sm text-white/80">
              아이디{" "}
              <span className="text-white/40">
                ({USERNAME_MIN}~{USERNAME_MAX}자)
              </span>
            </span>
            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 focus-within:border-purple-400/50 focus-within:ring-2 focus-within:ring-purple-400/15">
              <User className="text-white/45" size={18} />
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                type="text"
                autoComplete="username"
                placeholder={`아이디를 입력하세요 (${USERNAME_MIN}~${USERNAME_MAX}자)`}
                className="w-full bg-transparent text-sm outline-none placeholder:text-white/30"
              />
            </div>
            {usernameErr ? (
              <p className="mt-1 text-xs text-red-300">{usernameErr}</p>
            ) : null}
          </label>

          {/* Password */}
          <label className="block">
            <span className="mb-2 block text-sm text-white/80">
              비밀번호{" "}
              <span className="text-white/40">
                ({PASSWORD_MIN}~{PASSWORD_MAX}자)
              </span>
            </span>
            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 focus-within:border-purple-400/50 focus-within:ring-2 focus-within:ring-purple-400/15">
              <Lock className="text-white/45" size={18} />
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={showPw ? "text" : "password"}
                autoComplete="current-password"
                placeholder="비밀번호를 입력하세요"
                className="w-full bg-transparent text-sm outline-none placeholder:text-white/30"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="rounded-md p-1 text-white/50 hover:text-white/80"
                aria-label={showPw ? "비밀번호 숨기기" : "비밀번호 보기"}
              >
                {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {passwordErr ? (
              <p className="mt-1 text-xs text-red-300">{passwordErr}</p>
            ) : null}

            {/* ✅ 흰 체크박스 제거 -> 아이콘 토글 */}
            <div className="mt-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setRemember((v) => !v)}
                aria-pressed={remember}
                className="inline-flex items-center gap-2 text-xs text-white/65 hover:text-white"
              >
                {remember ? (
                  <CheckCircle2 size={18} className="text-purple-400" />
                ) : (
                  <Circle size={18} className="text-white/35" />
                )}
                로그인 상태 유지
              </button>
            </div>
          </label>

          {error ? (
            <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              <AlertCircle size={18} className="mt-0.5" />
              <span>{error}</span>
            </div>
          ) : null}

          {/* ✅ 버튼 스타일 통일 */}
          <Button
            type="submit"
            disabled={!canSubmit}
            className="pick-cta text-md w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 text-white disabled:opacity-50 disabled:cursor-not-allowed border-none transition-opacity"
          >
            로그인
          </Button>
        </form>
      </AuthLayout>

      <AuthSuccessModal
        open={successOpen}
        onClose={() => setSuccessOpen(false)}
      />
    </>
  );
}
