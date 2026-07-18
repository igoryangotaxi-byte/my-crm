import type { Transition, Variants } from "framer-motion";

// Linear-style easing, mirrors the CSS --ease-ui token.
export const EASE_UI = [0.2, 0.8, 0.2, 1] as const;

export const durations = {
  fast: 0.15,
  base: 0.2,
  slow: 0.25,
} as const;

export const transitionBase: Transition = {
  duration: durations.base,
  ease: EASE_UI,
};

export const overlayVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: durations.fast, ease: EASE_UI } },
  exit: { opacity: 0, transition: { duration: durations.fast, ease: EASE_UI } },
};

export const modalVariants: Variants = {
  hidden: { opacity: 0, scale: 0.97, y: 8 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: durations.base, ease: EASE_UI },
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    y: 6,
    transition: { duration: durations.fast, ease: EASE_UI },
  },
};

export const drawerVariants = (side: "left" | "right"): Variants => {
  const offset = side === "right" ? "100%" : "-100%";
  return {
    hidden: { x: offset },
    visible: { x: 0, transition: { duration: durations.slow, ease: EASE_UI } },
    exit: { x: offset, transition: { duration: durations.base, ease: EASE_UI } },
  };
};

export const listContainerVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.035 } },
};

export const listItemVariants: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: { duration: durations.base, ease: EASE_UI } },
};
