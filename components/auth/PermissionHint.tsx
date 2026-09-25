"use client";

import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { Tooltip } from "@/components/ui/Tooltip";
import { permissionI18nKey } from "@/lib/permission-display";
import type { AppPageKey } from "@/types/auth";
import { cn } from "@/lib/ui/cn";

type PermissionHintProps = {
  permission: AppPageKey;
  children: React.ReactNode;
  className?: string;
};

/** Disabled control with lock icon + tooltip when the user lacks a page permission. */
export function PermissionHint({ permission, children, className }: PermissionHintProps) {
  const tHint = useTranslations("access.permissionHint");
  const tPerm = useTranslations("permissions");
  const label = tPerm(permissionI18nKey(permission));

  return (
    <Tooltip content={tHint("lockedTooltip", { permission: label })}>
      <span
        className={cn("inline-flex cursor-not-allowed opacity-60", className)}
        aria-disabled="true"
      >
        <span className="pointer-events-none inline-flex items-center gap-2">
          <Lock className="h-4 w-4 shrink-0 text-[var(--so-muted)]" aria-hidden />
          {children}
        </span>
      </span>
    </Tooltip>
  );
}
