import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Eye,
  EyeOff,
  Lock,
  User,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { AuthLayout } from "../auth/AuthLayout";
import { Button } from "../../components/ui/button";

const NICKNAME_MIN = 2;
const NICKNAME_MAX = 12;

const USERNAME_MIN = 5;
const USERNAME_MAX = 20;

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 16;

const STORAGE_KEY_USERS = "pickmovie_mock_users";

type MockUser = {
  nickname: string;
  username: string;
};

function loadUsers(): MockUser[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_USERS);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveUsers(users: MockUser[]) {
  localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
}

function validateNickname(v: string) {
  const s = v.trim();
  if (s.length < NICKNAME_MIN || s.length > NICKNAME_MAX) {
    return `닉네임은 ${NICKNAME_MIN}~${NICKNAME_MAX}자입니다.`;
  }
  if (!/^[가-힣a-zA-Z0-9_]+$/.test(s)) {
    return "닉네임은 한글/영문/숫자/_(언더스코어)만 사용할 수 있습니다.";
  }
  return null;
}

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
  const hasLetter = /[A-Za-z]/.test(v);
  const hasNumber = /[0-9]/.test(v);
  if (!hasLetter || !hasNumber) {
    return "비밀번호는 영문+숫자 조합을 사용해주세요.";
  }
  return null;
}

type DupState = "idle" | "checking" | "available" | "duplicate";

export function SignupPage() {
  const navigate = useNavigate();

  const [nickname, setNickname] = useState("");
  const [username, setUsername] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [showPw, setShowPw] = useState(false);

  const [nicknameState, setNicknameState] = useState<DupState>("idle");
  const [usernameState, setUsernameState] = useState<DupState>("idle");

  const [error, setError] = useState<string | null>(null);

  const nicknameErr = useMemo(
    () => (nickname ? validateNickname(nickname) : null),
    [nickname]
  );
  const usernameErr = useMemo(
    () => (username ? validateUsername(username) : null),
    [username]
  );
  const pwErr = useMemo(() => (pw ? validatePassword(pw) : null), [pw]);
  const pwMatch = pw.length > 0 && pw === pw2;

  useEffect(() => setNicknameState("idle"), [nickname]);
  useEffect(() => setUsernameState("idle"), [username]);

  const checkNicknameDup = async () => {
    if (nicknameErr || !nickname.trim()) return;
    setNicknameState("checking");
    await new Promise((r) => setTimeout(r, 200));
    const users = loadUsers();
    const exists = users.some(
      (u) => u.nickname.toLowerCase() === nickname.trim().toLowerCase()
    );
    setNicknameState(exists ? "duplicate" : "available");
  };

  const checkUsernameDup = async () => {
    if (usernameErr || !username.trim()) return;
    setUsernameState("checking");
    await new Promise((r) => setTimeout(r, 200));
    const users = loadUsers();
    const exists = users.some(
      (u) => u.username.toLowerCase() === username.trim().toLowerCase()
    );
    setUsernameState(exists ? "duplicate" : "available");
  };

  const canSubmit = useMemo(() => {
    return (
      nickname.trim().length > 0 &&
      username.trim().length > 0 &&
      pw.length > 0 &&
      pw2.length > 0 &&
      !nicknameErr &&
      !usernameErr &&
      !pwErr &&
      pwMatch &&
      nicknameState === "available" &&
      usernameState === "available"
    );
  }, [
    nickname,
    username,
    pw,
    pw2,
    nicknameErr,
    usernameErr,
    pwErr,
    pwMatch,
    nicknameState,
    usernameState,
  ]);

  const DupBadge = ({ state }: { state: DupState }) => {
    if (state === "idle") return null;
    if (state === "checking")
      return <span className="text-xs text-white/45">확인 중...</span>;
    if (state === "available")
      return (
        <span className="inline-flex items-center gap-1 text-xs text-emerald-300">
          <CheckCircle2 size={14} /> 사용 가능
        </span>
      );
    return <span className="text-xs text-red-300">중복</span>;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const nErr = validateNickname(nickname);
    const uErr = validateUsername(username);
    const pErr = validatePassword(pw);

    if (nErr) return setError(nErr);
    if (uErr) return setError(uErr);
    if (pErr) return setError(pErr);
    if (!pwMatch) return setError("비밀번호가 일치하지 않습니다.");

    const users = loadUsers();
    const nickExists = users.some(
      (u) => u.nickname.toLowerCase() === nickname.trim().toLowerCase()
    );
    const userExists = users.some(
      (u) => u.username.toLowerCase() === username.trim().toLowerCase()
    );
    if (nickExists) return setError("이미 사용 중인 닉네임입니다.");
    if (userExists) return setError("이미 사용 중인 아이디입니다.");

    saveUsers([
      { nickname: nickname.trim(), username: username.trim() },
      ...users,
    ]);

    navigate("/login", { replace: true, state: { signupSuccess: true } });
  };

  return (
    <AuthLayout
      title="회원가입"
      subtitle="닉네임, 아이디, 비밀번호 정보를 입력해 PickMovie를 시작하세요."
      belowCard={
        <div className="text-sm text-white/70">
          이미 계정이 있으신가요?{" "}
          <Link
            to="/login"
            className="font-semibold text-white/85 hover:text-white hover:underline underline-offset-4"
          >
            로그인
          </Link>
        </div>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5">
        <label className="block">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm text-white/80">
              닉네임{" "}
              <span className="text-white/40">
                ({NICKNAME_MIN}~{NICKNAME_MAX}자)
              </span>
            </span>
            <DupBadge state={nicknameState} />
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 focus-within:border-purple-400/50 focus-within:ring-2 focus-within:ring-purple-400/15">
            <User className="text-white/45" size={18} />
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              onBlur={checkNicknameDup}
              type="text"
              autoComplete="nickname"
              placeholder="닉네임을 입력하세요"
              className="w-full bg-transparent text-sm outline-none placeholder:text-white/30"
            />
          </div>

          {nicknameErr ? (
            <p className="mt-1 text-xs text-red-300">{nicknameErr}</p>
          ) : null}
          {nicknameState === "duplicate" && !nicknameErr ? (
            <p className="mt-1 text-xs text-red-300">
              이미 사용 중인 닉네임입니다.
            </p>
          ) : null}
        </label>

        <label className="block">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm text-white/80">
              아이디{" "}
              <span className="text-white/40">
                ({USERNAME_MIN}~{USERNAME_MAX}자)
              </span>
            </span>
            <DupBadge state={usernameState} />
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 focus-within:border-purple-400/50 focus-within:ring-2 focus-within:ring-purple-400/15">
            <User className="text-white/45" size={18} />
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onBlur={checkUsernameDup}
              type="text"
              autoComplete="username"
              placeholder={`아이디를 입력하세요 (${USERNAME_MIN}~${USERNAME_MAX}자)`}
              className="w-full bg-transparent text-sm outline-none placeholder:text-white/30"
            />
          </div>

          {usernameErr ? (
            <p className="mt-1 text-xs text-red-300">{usernameErr}</p>
          ) : null}
          {usernameState === "duplicate" && !usernameErr ? (
            <p className="mt-1 text-xs text-red-300">
              이미 사용 중인 아이디입니다.
            </p>
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
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              type={showPw ? "text" : "password"}
              autoComplete="new-password"
              placeholder="영문+숫자 조합"
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

          {pwErr ? <p className="mt-1 text-xs text-red-300">{pwErr}</p> : null}
        </label>

        <label className="block">
          <span className="mb-2 block text-sm text-white/80">
            비밀번호 확인
          </span>

          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 focus-within:border-purple-400/50 focus-within:ring-2 focus-within:ring-purple-400/15">
            <Lock className="text-white/45" size={18} />
            <input
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              type={showPw ? "text" : "password"}
              autoComplete="new-password"
              placeholder="비밀번호를 다시 입력"
              className="w-full bg-transparent text-sm outline-none placeholder:text-white/30"
            />
            {pw2.length > 0 ? (
              pwMatch ? (
                <CheckCircle2 size={18} className="text-emerald-300" />
              ) : (
                <AlertCircle size={18} className="text-red-300" />
              )
            ) : null}
          </div>

          {pw2.length > 0 && !pwMatch ? (
            <p className="mt-1 text-xs text-red-300">
              비밀번호가 일치하지 않습니다.
            </p>
          ) : null}
        </label>

        {error ? (
          <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            <AlertCircle size={18} className="mt-0.5" />
            <span>{error}</span>
          </div>
        ) : null}

        <Button
          type="submit"
          disabled={!canSubmit}
          className="pick-cta text-md w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 text-white disabled:opacity-50 disabled:cursor-not-allowed border-none transition-opacity"
        >
          회원가입
        </Button>
      </form>
    </AuthLayout>
  );
}
