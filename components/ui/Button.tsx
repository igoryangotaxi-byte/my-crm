"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/ui/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive" | "outline";
type ButtonSize = "sm" | "md" | "lg" | "icon";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
};

const base =
  "inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap rounded-[8px] transition-[background-color,box-shadow,color,border-color,transform] duration-150 ease-out focus-visible:outline-none focus-visible:shadow-[var(--so-focus-ring)] disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97] select-none";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--primary)] text-[var(--primary-foreground)] border border-transparent shadow-[var(--so-shadow-xs)] hover:bg-[var(--primary-hover)]",
  secondary:
    "bg-[var(--so-surface)] text-[var(--so-text)] border border-[var(--so-border-strong)] shadow-[var(--so-shadow-xs)] hover:bg-[var(--so-surface-hover)] hover:border-[var(--so-border-strong)]",
  outline:
    "bg-transparent text-[var(--so-text)] border border-[var(--so-border-strong)] hover:bg-[var(--so-surface-hover)]",
  ghost:
    "bg-transparent text-[var(--so-text)] border border-transparent hover:bg-[var(--so-surface-hover)]",
  destructive:
    "bg-[var(--destructive)] text-[var(--destructive-foreground)] border border-transparent shadow-[var(--so-shadow-xs)] hover:brightness-95",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[0.8125rem]",
  md: "h-9 px-4 text-sm",
  lg: "h-10 px-5 text-sm",
  icon: "h-9 w-9 p-0",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    leftIcon,
    rightIcon,
    className,
    children,
    disabled,
    type = "button",
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : leftIcon}
      {size !== "icon" ? children : loading ? null : children}
      {!loading ? rightIcon : null}
    </button>
  );
});
