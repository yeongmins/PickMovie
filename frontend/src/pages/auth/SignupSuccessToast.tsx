// src/pages/auth/SignupSuccessToast.tsx
import React, { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PartyPopper } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  durationMs?: number;
  message?: string;
};

export function AuthSuccessModal({
  open,
  onClose,
  durationMs = 2500,
  message = "회원가입을 축하합니다! 로그인 후 PickMovie를 시작해보세요.",
}: Props) {
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(onClose, durationMs);
    return () => window.clearTimeout(t);
  }, [open, onClose, durationMs]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed left-1/2 top-6 z-[60] -translate-x-1/2"
          initial={{ opacity: 0, y: -10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.98 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-white/10 bg-black/55 px-4 py-3 backdrop-blur-md shadow-[0_12px_40px_rgba(0,0,0,0.35)]"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10">
              <PartyPopper className="h-5 w-5 text-white" />
            </div>
            <div className="text-sm text-white/90">{message}</div>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
