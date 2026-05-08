import { motion } from "motion/react";
import { ReactNode } from "react";

interface GlassCardProps {
  children: ReactNode;
  className?: string;
}

export function GlassCard({ children, className = "" }: GlassCardProps) {
  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -4 }}
      transition={{ duration: 0.3 }}
      className={`p-6 rounded-2xl backdrop-blur-2xl bg-white/60 border border-white/80 shadow-2xl shadow-black/10 hover:shadow-red-500/30 hover:border-red-500/40 transition-all duration-300 ${className}`}
    >
      {children}
    </motion.div>
  );
}
