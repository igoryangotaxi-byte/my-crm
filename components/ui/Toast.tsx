"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/ui/cn";

type ToastTone = "success" | "error" | "info";

type ToastItem = {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
};

type ToastApi = {
  toast: (input: { tone?: ToastTone; title: string; description?: string }) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const TONE_STYLES: Record<ToastTone, { icon: ReactNode; bar: string }> = {
  success: {
    icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
    bar: "bg-emerald-500",
  },
  error: {
    icon: <AlertCircle className="h-4 w-4 text-rose-500" />,
    bar: "bg-rose-500",
  },
  info: {
    icon: <Info className="h-4 w-4 text-sky-500" />,
    bar: "bg-sky-500",
  },
};

const AUTO_DISMISS_MS = 4000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const timersRef = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (input: { tone?: ToastTone; title: string; description?: string }) => {
      const id = ++idRef.current;
      setItems((prev) => [...prev.slice(-3), { id, tone: input.tone ?? "info", ...input }]);
      timersRef.current.set(
        id,
        setTimeout(() => dismiss(id), AUTO_DISMISS_MS),
      );
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      toast: push,
      success: (title, description) => push({ tone: "success", title, description }),
      error: (title, description) => push({ tone: "error", title, description }),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        data-module="sales-operation"
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-[120] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
      >
        <AnimatePresence>
          {items.map((item) => {
            const tone = TONE_STYLES[item.tone];
            return (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: 12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.97 }}
                transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
                className="pointer-events-auto relative flex items-start gap-2.5 overflow-hidden rounded-[12px] border border-[var(--so-border)] bg-[var(--so-surface)] py-3 pl-4 pr-9 shadow-[var(--so-shadow-lg)]"
                role="status"
              >
                <span className={cn("absolute inset-y-0 left-0 w-[3px]", tone.bar)} aria-hidden />
                <span className="mt-0.5 shrink-0">{tone.icon}</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--so-text)]">{item.title}</p>
                  {item.description ? (
                    <p className="mt-0.5 text-xs text-[var(--so-muted)]">{item.description}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(item.id)}
                  aria-label="Dismiss"
                  className="so-focus-ring absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--so-muted-2)] transition-colors hover:bg-[var(--so-surface-hover)] hover:text-[var(--so-text)]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}
