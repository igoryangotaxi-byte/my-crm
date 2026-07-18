"use client";

import type { ReactNode } from "react";
import * as RadixMenu from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/ui/cn";

export const DropdownMenu = RadixMenu.Root;
export const DropdownMenuTrigger = RadixMenu.Trigger;

export function DropdownMenuContent({
  children,
  align = "end",
  sideOffset = 6,
  className,
}: {
  children: ReactNode;
  align?: "start" | "center" | "end";
  sideOffset?: number;
  className?: string;
}) {
  return (
    <RadixMenu.Portal>
      <RadixMenu.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "so-pop z-[100] min-w-[12rem] rounded-[12px] border border-[#e9ebf0] bg-white p-1.5 shadow-[0_12px_32px_rgba(16,24,40,0.12),0_3px_8px_rgba(16,24,40,0.06)]",
          className,
        )}
      >
        {children}
      </RadixMenu.Content>
    </RadixMenu.Portal>
  );
}

export function DropdownMenuItem({
  children,
  onSelect,
  className,
  disabled,
}: {
  children: ReactNode;
  onSelect?: (event: Event) => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <RadixMenu.Item
      onSelect={onSelect}
      disabled={disabled}
      className={cn(
        "flex cursor-pointer select-none items-center gap-2 rounded-[8px] px-2.5 py-1.5 text-sm text-[var(--so-text)] outline-none transition-colors",
        "focus:bg-[var(--so-surface-hover)] data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
    >
      {children}
    </RadixMenu.Item>
  );
}

export function DropdownMenuSeparator() {
  return <RadixMenu.Separator className="my-1 h-px bg-[var(--so-border)]" />;
}

export function DropdownMenuLabel({ children }: { children: ReactNode }) {
  return (
    <RadixMenu.Label className="px-2.5 py-1.5 text-[0.6875rem] font-bold uppercase tracking-wide text-[var(--so-muted-2)]">
      {children}
    </RadixMenu.Label>
  );
}
