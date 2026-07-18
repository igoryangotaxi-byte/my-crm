"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Dialog";

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** destructive shows a red confirm button (delete flows). */
  destructive?: boolean;
};

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const t = useTranslations("salesOperation");
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((next) => {
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setOptions(null);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={options !== null}
        onOpenChange={(open) => {
          if (!open) settle(false);
        }}
        title={options?.title}
        description={options?.description}
        className="max-w-sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => settle(false)}>
              {options?.cancelLabel ?? t("cancel")}
            </Button>
            <Button
              variant={options?.destructive ? "destructive" : "primary"}
              onClick={() => settle(true)}
            >
              {options?.confirmLabel ?? "OK"}
            </Button>
          </>
        }
      />
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used within ConfirmProvider");
  }
  return ctx;
}
