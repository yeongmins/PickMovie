// frontend/src/components/layout/Footer.tsx 
import { Link } from "react-router-dom";
import { Github } from "lucide-react";
import { Logo } from "../icons/Logo";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-[#0b0b10] border-t border-white/5">
      <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-10 py-12">
        {/* 상단: 로고/문구(좌) + GitHub(우) */}
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            {/* ✅ Header 로고와 동일한 컴포넌트 사용 + 살짝 축소 */}
            <div className="origin-left scale-[0.92]">
              <Logo showIcon={false} size="md" />
            </div>

            <div className="mt-5 text-sm text-white/70">
              이메일:{" "}
              <a
                href="mailto:contact@pickmovie.net"
                className="hover:text-white underline underline-offset-4 decoration-white/20 hover:decoration-white/60 transition"
              >
                contact@pickmovie.net
              </a>
            </div>

            <div className="mt-2 text-xs sm:text-sm text-white/45">
              PickMovie는 상업용 목적이 없는 개인프로젝트 입니다.
            </div>
          </div>

          <a
            href="https://github.com/yeongmins/PickMovie"
            target="_blank"
            rel="noreferrer"
            aria-label="PickMovie GitHub"
            className="shrink-0 inline-flex items-center justify-center h-12 w-12 rounded-full border border-white/10 bg-white/5 text-white/80 hover:text-white hover:bg-white/10 hover:border-white/20 transition"
          >
            <Github className="h-5 w-5" />
          </a>
        </div>

        {/* 하단: 버튼(좌) + 연도(우) ✅ 같은 줄 */}
        <div className="mt-10 flex items-center justify-between gap-6">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-white/60">
            <Link to="/info" className="hover:text-white transition">
              프로젝트 소개
            </Link>
            <Link to="/notices" className="hover:text-white transition">
              공지사항
            </Link>
            <Link to="/legal/terms" className="hover:text-white transition">
              이용약관
            </Link>
            <Link to="/legal/privacy" className="hover:text-white transition">
              개인정보 처리방침
            </Link>
            <Link to="/legal/copyright" className="hover:text-white transition">
              저작권/출처
            </Link>
          </div>

          <div className="text-xs text-white/30 whitespace-nowrap">
            © {year} PickMovie
          </div>
        </div>
      </div>
    </footer>
  );
}
