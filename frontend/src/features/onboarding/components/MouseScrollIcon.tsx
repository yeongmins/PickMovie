// 웰컴 화면 하단에서 "스크롤 해 주세요" 를 시각적으로 보여주는 애니메이션 아이콘

import { motion } from "framer-motion";

export function MouseScrollIcon() {
  return (
    <div className="flex flex-col items-center gap-3">
      <motion.div
        className="w-6 h-10 border-2 border-gray-400 rounded-full p-1 relative"
        initial={{ opacity: 0.5 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, repeat: Infinity, repeatType: "reverse" }}
      >
        <motion.div
          className="w-1.5 h-1.5 bg-gray-400 rounded-full mx-auto"
          animate={{ y: [0, 12, 0] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        />
      </motion.div>
    </div>
  );
}
