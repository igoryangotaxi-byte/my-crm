import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/ui/cn";

export const Checkbox = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Checkbox({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        type="checkbox"
        className={cn(
          "h-4 w-4 shrink-0 rounded-[4px] border border-[var(--so-border-strong)] text-[var(--primary)] accent-[var(--primary)] focus-visible:outline-none focus-visible:shadow-[var(--so-focus-ring)] disabled:opacity-50",
          className,
        )}
        {...props}
      />
    );
  },
);
