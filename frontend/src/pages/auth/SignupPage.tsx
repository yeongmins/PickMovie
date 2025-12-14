// frontend/src/pages/auth/SignupPage.tsx

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Logo } from "../../components/icons/Logo";
import { Button } from "../../components/ui/button";
import { ArrowLeft, Mail, Lock, User } from "lucide-react";

export function SignupPage() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);

  const handleSignup = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    // TODO: 백엔드 회원가입 API 연동
    setTimeout(() => {
      setIsLoading(false);
      navigate("/login"); // 가입 성공 시 로그인 페이지로
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-[#131314] text-white flex flex-col justify-center items-center px-4">
      <div className="w-full max-w-md space-y-8">
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
          <h2 className="text-3xl font-bold">환영합니다! 🎉</h2>
          <p className="text-gray-400 mt-2">
            PickMovie와 함께 취향을 찾아보세요.
          </p>
        </div>

        <form onSubmit={handleSignup} className="space-y-5">
          <div className="space-y-4">
            {/* 닉네임 */}
            <div className="relative group">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <User className="w-5 h-5 text-gray-500 group-focus-within:text-purple-400 transition-colors" />
              </div>
              <input
                type="text"
                placeholder="닉네임"
                className="w-full bg-[#1e1e20] border border-white/10 rounded-xl py-3.5 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all"
                required
              />
            </div>

            {/* 이메일 */}
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

            {/* 비밀번호 */}
            <div className="relative group">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <Lock className="w-5 h-5 text-gray-500 group-focus-within:text-purple-400 transition-colors" />
              </div>
              <input
                type="password"
                placeholder="비밀번호 (8자 이상)"
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
            {isLoading ? "가입 처리 중..." : "회원가입"}
          </Button>
        </form>

        <div className="text-center text-sm text-gray-400">
          이미 계정이 있으신가요?{" "}
          <button
            onClick={() => navigate("/login")}
            className="text-purple-400 hover:text-purple-300 font-semibold hover:underline transition-all"
          >
            로그인
          </button>
        </div>
      </div>
    </div>
  );
}
