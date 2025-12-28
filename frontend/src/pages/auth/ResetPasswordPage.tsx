// frontend/src/pages/auth/ResetPasswordPage.tsx
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { apiPost } from "../../lib/apiClient";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = useMemo(() => params.get("token") || "", [params]);

  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async () => {
    setMsg(null);

    if (!token)
      return setMsg("토큰이 올바르지 않습니다. 메일 링크를 다시 확인해주세요.");
    if (pw.length < 8 || pw.length > 16)
      return setMsg("비밀번호는 8~16자로 입력해주세요.");
    if (pw !== pw2) return setMsg("비밀번호가 일치하지 않습니다.");

    try {
      setLoading(true);
      await apiPost("/auth/password/reset/confirm", { token, newPassword: pw });
      navigate("/login", { replace: true, state: { resetDone: true } });
    } catch (e: any) {
      setMsg(e?.message || "비밀번호 재설정에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(1200px_circle_at_20%_10%,rgba(139,92,246,0.18),transparent_55%),radial-gradient(900px_circle_at_80%_30%,rgba(236,72,153,0.12),transparent_60%),linear-gradient(to_bottom,rgba(0,0,0,0.92),rgba(0,0,0,0.88))] text-white">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_20px_80px_rgba(0,0,0,0.55)] backdrop-blur">
          <h1 className="text-xl font-semibold">비밀번호 재설정</h1>
          <p className="mt-2 text-sm text-white/60">
            새 비밀번호를 입력해주세요. (8~16자)
          </p>

          <div className="mt-5 space-y-3">
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="새 비밀번호"
              className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-4 outline-none focus:border-violet-400/40"
            />
            <input
              type="password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              placeholder="새 비밀번호 확인"
              className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-4 outline-none focus:border-violet-400/40"
            />

            {msg && (
              <div className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
                {msg}
              </div>
            )}

            <Button
              onClick={submit}
              disabled={loading}
              className="h-11 w-full rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:opacity-95"
            >
              {loading ? "처리 중..." : "비밀번호 변경"}
            </Button>
          </div>

          <button
            onClick={() => navigate("/login")}
            className="mt-4 w-full text-center text-sm text-white/60 hover:text-white"
          >
            로그인으로 돌아가기
          </button>
        </div>
      </div>
    </div>
  );
}
