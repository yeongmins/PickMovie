// frontend/src/pages/auth/LoginPage.tsx

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Logo } from "../../components/icons/Logo";
import { Button } from "../../components/ui/button";
import { ArrowLeft, Mail, Lock } from "lucide-react";

export function LoginPage() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    // TODO: 백엔드 로그인 API 연동
    setTimeout(() => {
      setIsLoading(false);
      navigate("/"); // 로그인 성공 시 메인으로 이동
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-[#131314] text-white flex flex-col justify-center items-center px-4">
      <div className="w-full max-w-md space-y-8">
        {/* 상단 네비게이션 및 로고 */}
        <div className="text-center">
          <button
            onClick={() => navigate("/")}
            className="absolute top-6 left-6 text-gray-400 hover:text-white flex items-center gap-2 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>홈으로</span>
          </button>

          <div className="flex justify-center mb-6">
            <Logo size="lg" />
          </div>
          <h2 className="text-3xl font-bold">다시 오셨군요! 👋</h2>
          <p className="text-gray-400 mt-2">PickMovie 계정으로 로그인하세요.</p>
        </div>

        {/* 로그인 폼 */}
        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-4">
            <div className="relative group">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <Mail className="w-5 h-5 text-gray-500 group-focus-within:text-purple-400 transition-colors" />
              </div>
              <input
                type="email"
                placeholder="이메일 주소"
                className="w-full bg-[#1e1e20] border border-white/10 rounded-xl py-3.5 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all"
                required
              />
            </div>

            <div className="relative group">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <Lock className="w-5 h-5 text-gray-500 group-focus-within:text-purple-400 transition-colors" />
              </div>
              <input
                type="password"
                placeholder="비밀번호"
                className="w-full bg-[#1e1e20] border border-white/10 rounded-xl py-3.5 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all"
                required
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full h-12 bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 text-white rounded-xl font-medium text-lg transition-all"
          >
            {isLoading ? "로그인 중..." : "로그인"}
          </Button>
        </form>

        {/* 소셜 로그인 구분선 */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-white/10" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-[#131314] px-2 text-gray-500">
              Or continue with
            </span>
          </div>
        </div>

        {/* 소셜 로그인 버튼들 (UI만 구현) */}
        <div className="grid grid-cols-2 gap-3">
          <button className="flex items-center justify-center gap-2 bg-white text-black py-3 rounded-xl font-medium hover:bg-gray-100 transition-colors">
            <img
              src="https://www.svgrepo.com/show/475656/google-color.svg"
              className="w-5 h-5"
              alt="Google"
            />
            Google
          </button>
          <button className="flex items-center justify-center gap-2 bg-[#FEE500] text-black py-3 rounded-xl font-medium hover:bg-[#FDD835] transition-colors">
            <span className="font-bold">KaKao</span>
          </button>
        </div>

        {/* 회원가입 링크 */}
        <div className="text-center text-sm text-gray-400">
          계정이 없으신가요?{" "}
          <button
            onClick={() => navigate("/signup")}
            className="text-purple-400 hover:text-purple-300 font-semibold hover:underline transition-all"
          >
            회원가입
          </button>
        </div>
      </div>
    </div>
  );
}
