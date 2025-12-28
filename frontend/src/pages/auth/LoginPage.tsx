// frontend/src/pages/auth/LoginPage.tsx
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
import { AuthSuccessModal } from "./SignupSuccessToast";
import { Button } from "../../components/ui/button";
import { apiPost, ApiError } from "../../lib/apiClient";
import { AccountRecoveryModal } from "./AccountRecoveryModal";

const USERNAME_MIN = 5;
const USERNAME_MAX = 20;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 16;

const AUTH_STORAGE = {
  ACCESS: "pickmovie_access_token",
  USER: "pickmovie_user",
} as const;

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

type SafeUser = {
  id: number;
  username: string;
  email: string | null;
  nickname: string | null;
};

type LoginResponse = {
  user: SafeUser;
  accessToken: string;
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
  const [successMessage, setSuccessMessage] = useState<string | undefined>(
    undefined
  );

  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState<"id" | "password">(
    "password"
  );

  const [loading, setLoading] = useState(false);

  // ✅ 1) SignupPage에서 state로 넘어온 성공 모달 유지
  useEffect(() => {
    if (state.signupSuccess) {
      setSuccessMessage(
        "회원가입을 축하합니다! 이메일 인증 후 로그인해보세요."
      );
      setSuccessOpen(true);
      navigate("/login", { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ 2) 이메일 인증 링크 클릭 후 리다이렉트(/login?verified=1) 처리
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const verified = params.get("verified");

    if (!verified) return;

    if (verified === "1") {
      setSuccessMessage(
        "이메일 인증이 완료되었습니다. 이제 로그인할 수 있어요!"
      );
      setSuccessOpen(true);
    } else {
      setError("이메일 인증 링크가 만료되었거나 이미 사용되었습니다.");
    }

    // ✅ 쿼리 제거(새로고침 시 반복 방지)
    params.delete("verified");
    const nextSearch = params.toString();
    navigate(
      {
        pathname: location.pathname,
        search: nextSearch ? `?${nextSearch}` : "",
      },
      { replace: true, state: {} }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

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

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const uErr = validateUsername(username);
    const pErr = validatePassword(password);
    if (uErr) return setError(uErr);
    if (pErr) return setError(pErr);

    setLoading(true);
    try {
      const data = await apiPost<LoginResponse>("/auth/login", {
        username: username.trim(),
        password,
        rememberMe: remember,
      });

      // ✅ 로그인 상태 저장(헤더 닉네임 표시/마이페이지 접근 등에 사용)
      localStorage.setItem(AUTH_STORAGE.ACCESS, data.accessToken);
      localStorage.setItem(AUTH_STORAGE.USER, JSON.stringify(data.user));

      // ✅ 이벤트는 둘 다 쏴서(기존/신규 헤더) 호환
      window.dispatchEvent(new Event("pickmovie:auth"));
      window.dispatchEvent(new Event("pickmovie-auth-changed"));

      navigate("/", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 403) {
          setError("이메일 인증이 필요합니다. 메일함을 확인해주세요.");
        } else if (err.status >= 500) {
          setError("서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
        } else {
          setError("아이디 또는 비밀번호가 올바르지 않습니다.");
        }
      } else {
        setError("로그인에 실패했습니다. 잠시 후 다시 시도해주세요.");
      }
    } finally {
      setLoading(false);
    }
  };

  const onFindPassword = () => {
    setRecoveryMode("password");
    setRecoveryOpen(true);
  };

  const onFindId = () => {
    setRecoveryMode("id");
    setRecoveryOpen(true);
  };

  return (
    <>
      <AuthLayout
        title="로그인"
        subtitle="PickMovie 계정으로 로그인하여 찜/플레이리스트를 관리하세요."
        belowCard={
          <div className="text-sm text-white/65">
            <button
              type="button"
              onClick={onFindId}
              className="hover:text-white hover:underline underline-offset-4"
            >
              아이디 찾기
            </button>
            <span className="mx-3 text-white/25">|</span>
            <button
              type="button"
              onClick={onFindPassword}
              className="hover:text-white hover:underline underline-offset-4"
            >
              비밀번호 찾기
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

          <Button
            type="submit"
            disabled={!canSubmit || loading}
            className="pick-cta text-md w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 text-white disabled:opacity-50 disabled:cursor-not-allowed border-none transition-opacity"
          >
            {loading ? "로그인 중..." : "로그인"}
          </Button>
        </form>
      </AuthLayout>

      <AuthSuccessModal
        open={successOpen}
        onClose={() => setSuccessOpen(false)}
        message={successMessage}
      />

      <AccountRecoveryModal
        open={recoveryOpen}
        mode={recoveryMode}
        onClose={() => setRecoveryOpen(false)}
        onSwitchMode={(m) => setRecoveryMode(m)}
      />
    </>
  );
}
