"use client";

import type { ReactNode } from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/ui/cn";
import { drawerVariants, modalVariants, overlayVariants } from "@/lib/ui/motion";

type BaseProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
  showClose?: boolean;
};

function CloseButton() {
  return (
    <RadixDialog.Close
      className="so-focus-ring absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--so-muted)] transition-colors hover:bg-[var(--so-surface-hover)] hover:text-[var(--so-text)]"
      aria-label="Close"
    >
      <X className="h-4 w-4" />
    </RadixDialog.Close>
  );
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  showClose = true,
}: BaseProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open ? (
          <RadixDialog.Portal forceMount>
            <RadixDialog.Overlay asChild forceMount>
              <motion.div
                data-module="sales-operation"
                className="so-overlay"
                variants={overlayVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
              />
            </RadixDialog.Overlay>
            <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
              <RadixDialog.Content asChild forceMount onOpenAutoFocus={(e) => e.preventDefault()}>
                <motion.div
                  data-module="sales-operation"
                  variants={modalVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className={cn(
                    "relative flex max-h-[calc(100vh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-[16px] bg-[var(--so-surface)] shadow-[var(--so-shadow-lg)] outline-none",
                    "border border-[var(--so-border)]",
                    className,
                  )}
                >
                  {title || description ? (
                    <div className="border-b border-[var(--so-border)] px-5 py-4 pr-12">
                      {title ? (
                        <RadixDialog.Title className="text-base font-bold tracking-tight text-[var(--so-text)]">
                          {title}
                        </RadixDialog.Title>
                      ) : null}
                      {description ? (
                        <RadixDialog.Description className="mt-0.5 text-sm text-[var(--so-muted)]">
                          {description}
                        </RadixDialog.Description>
                      ) : null}
                    </div>
                  ) : null}
                  {showClose ? <CloseButton /> : null}
                  {children ? (
                    <div data-so-modal-body className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                      {children}
                    </div>
                  ) : null}
                  {footer ? (
                    <div className="flex items-center justify-end gap-2 border-t border-[var(--so-border)] px-5 py-3.5">
                      {footer}
                    </div>
                  ) : null}
                </motion.div>
              </RadixDialog.Content>
            </div>
          </RadixDialog.Portal>
        ) : null}
      </AnimatePresence>
    </RadixDialog.Root>
  );
}

type DrawerProps = BaseProps & {
  side?: "left" | "right";
  width?: string;
};

export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  showClose = true,
  side = "right",
  width = "28rem",
}: DrawerProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open ? (
          <RadixDialog.Portal forceMount>
            <RadixDialog.Overlay asChild forceMount>
              <motion.div
                data-module="sales-operation"
                className="so-overlay"
                variants={overlayVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
              />
            </RadixDialog.Overlay>
            <RadixDialog.Content asChild forceMount onOpenAutoFocus={(e) => e.preventDefault()}>
              <motion.aside
                data-module="sales-operation"
                variants={drawerVariants(side)}
                initial="hidden"
                animate="visible"
                exit="exit"
                style={{ width: `min(${width}, 100vw)` }}
                className={cn(
                  "fixed inset-y-0 z-[95] flex h-full flex-col bg-[var(--so-surface)] shadow-[var(--so-shadow-lg)] outline-none",
                  side === "right"
                    ? "right-0 border-l border-[var(--so-border)]"
                    : "left-0 border-r border-[var(--so-border)]",
                  "max-sm:w-screen max-sm:!max-w-none",
                  className,
                )}
              >
                {title || description ? (
                  <div className="flex items-start justify-between gap-3 border-b border-[var(--so-border)] px-5 py-4">
                    <div className="min-w-0">
                      {title ? (
                        <RadixDialog.Title className="truncate text-base font-bold tracking-tight text-[var(--so-text)]">
                          {title}
                        </RadixDialog.Title>
                      ) : null}
                      {description ? (
                        <RadixDialog.Description className="mt-0.5 truncate text-sm text-[var(--so-muted)]">
                          {description}
                        </RadixDialog.Description>
                      ) : null}
                    </div>
                    {showClose ? (
                      <RadixDialog.Close
                        className="so-focus-ring inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--so-muted)] transition-colors hover:bg-[var(--so-surface-hover)] hover:text-[var(--so-text)]"
                        aria-label="Close"
                      >
                        <X className="h-4 w-4" />
                      </RadixDialog.Close>
                    ) : null}
                  </div>
                ) : null}
                <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
                {footer ? (
                  <div className="flex items-center justify-end gap-2 border-t border-[var(--so-border)] px-5 py-3.5">
                    {footer}
                  </div>
                ) : null}
              </motion.aside>
            </RadixDialog.Content>
          </RadixDialog.Portal>
        ) : null}
      </AnimatePresence>
    </RadixDialog.Root>
  );
}
