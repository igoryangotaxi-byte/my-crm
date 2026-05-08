import { motion } from "motion/react";
import { ReactNode } from "react";

interface GlassButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary";
  className?: string;
}

export function GlassButton({
  children,
  onClick,
  variant = "primary",
  className = "",
}: GlassButtonProps) {
  const baseClasses =
    "px-6 py-3 rounded-xl flex items-center justify-center transition-all duration-300 shadow-lg";

  const variantClasses =
    variant === "primary"
      ? "bg-gradient-to-r from-red-500 to-red-600 text-white hover:shadow-red-500/60 hover:from-red-400 hover:to-red-500"
      : "bg-white/40 backdrop-blur-xl border border-white/60 text-gray-700 hover:bg-white/60";

  return (
    <motion.button
      whileHover={{ scale: 1.05, y: -2 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={`${baseClasses} ${variantClasses} ${className}`}
    >
      {children}
    </motion.button>
  );
}
