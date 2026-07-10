"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  getAccountManagerUserOptions,
  getSalesManagerUserOptions,
} from "@/lib/sales-operation/crm-manager-users";
import type { B2BClientRegistryEntry } from "@/lib/sales-operation/manager-types";
import type { AuthUser } from "@/types/auth";

export type SalesClientManagerDraft = {
  corpClientId: string;
  accountManagerUserId: string;
  salesManagerUserId: string;
};

type SalesClientManagerFieldsProps = {
  users: AuthUser[];
  registry: B2BClientRegistryEntry[];
  draft: SalesClientManagerDraft;
  onChange: (draft: SalesClientManagerDraft) => void;
  pendingSalesManagerName?: string | null;
  assignedSalesManagerName?: string | null;
  disabled?: boolean;
};

function formatClientLabel(entry: B2BClientRegistryEntry): string {
  const name = entry.clientName?.trim();
  if (name && name !== entry.corpClientId) {
    return `${name} (${entry.corpClientId})`;
  }
  return entry.corpClientId;
}

export function SalesClientManagerFields({
  users,
  registry,
  draft,
  onChange,
  pendingSalesManagerName,
  assignedSalesManagerName,
  disabled = false,
}: SalesClientManagerFieldsProps) {
  const t = useTranslations("salesOperation");
  const accountManagerOptions = getAccountManagerUserOptions(users);
  const salesManagerOptions = getSalesManagerUserOptions(users);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const blurTimerRef = useRef<number | null>(null);

  const selectedEntry = useMemo(
    () => registry.find((entry) => entry.corpClientId === draft.corpClientId) ?? null,
    [draft.corpClientId, registry],
  );

  useEffect(() => {
    if (!open) {
      setQuery(selectedEntry ? formatClientLabel(selectedEntry) : "");
    }
  }, [open, selectedEntry]);

  const filteredRegistry = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return registry.slice(0, 50);
    return registry
      .filter((entry) => {
        const name = entry.clientName?.toLowerCase() ?? "";
        const id = entry.corpClientId.toLowerCase();
        return name.includes(needle) || id.includes(needle);
      })
      .slice(0, 50);
  }, [query, registry]);

  const selectClient = (corpClientId: string) => {
    onChange({ ...draft, corpClientId });
    setOpen(false);
  };

  const clearClient = () => {
    onChange({
      ...draft,
      corpClientId: "",
      accountManagerUserId: "",
      salesManagerUserId: "",
    });
    setQuery("");
    setOpen(false);
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm">
        <span className="crm-label">{t("field.corpClient")}</span>
        <div className="relative mt-1">
          <input
            type="search"
            value={query}
            disabled={disabled}
            placeholder={t("field.corpClientSearch")}
            onFocus={() => {
              if (blurTimerRef.current) {
                window.clearTimeout(blurTimerRef.current);
                blurTimerRef.current = null;
              }
              setOpen(true);
              if (selectedEntry) setQuery("");
            }}
            onBlur={() => {
              blurTimerRef.current = window.setTimeout(() => {
                setOpen(false);
                setQuery(selectedEntry ? formatClientLabel(selectedEntry) : "");
              }, 150);
            }}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            className="crm-input block h-9 w-full px-2.5 text-sm text-slate-700 disabled:opacity-60"
            autoComplete="off"
          />
          {draft.corpClientId && !disabled ? (
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={clearClient}
              className="absolute inset-y-0 end-2 my-auto text-xs font-semibold text-slate-500 hover:text-slate-800"
            >
              {t("manager.clear")}
            </button>
          ) : null}
          {open && !disabled ? (
            <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-border bg-white shadow-lg">
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={clearClient}
                className="block w-full border-b border-slate-100 px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-50"
              >
                {t("manager.unassigned")}
              </button>
              {filteredRegistry.length === 0 ? (
                <p className="px-3 py-2 text-xs text-slate-500">{t("field.corpClientNoMatch")}</p>
              ) : (
                filteredRegistry.map((entry) => (
                  <button
                    key={entry.corpClientId}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectClient(entry.corpClientId)}
                    className={`block w-full border-b border-slate-100 px-3 py-2 text-left last:border-b-0 hover:bg-slate-50 ${
                      entry.corpClientId === draft.corpClientId ? "bg-slate-50" : ""
                    }`}
                  >
                    <p className="text-sm font-semibold text-slate-900">
                      {entry.clientName?.trim() || entry.corpClientId}
                    </p>
                    <p className="break-all text-xs text-slate-500">{entry.corpClientId}</p>
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>
      </label>
      <label className="block text-sm">
        <span className="crm-label">{t("manager.accountManager")}</span>
        <select
          value={draft.accountManagerUserId}
          disabled={disabled || !draft.corpClientId}
          onChange={(event) =>
            onChange({ ...draft, accountManagerUserId: event.target.value })
          }
          className="crm-input mt-1 block h-9 w-full px-2.5 text-sm text-slate-700 disabled:opacity-60"
        >
          <option value="">{t("manager.unassigned")}</option>
          {accountManagerOptions.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name} ({user.role})
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="crm-label">{t("manager.salesManager")}</span>
        <select
          value={draft.salesManagerUserId}
          disabled={disabled || !draft.corpClientId}
          onChange={(event) => onChange({ ...draft, salesManagerUserId: event.target.value })}
          className="crm-input mt-1 block h-9 w-full px-2.5 text-sm text-slate-700 disabled:opacity-60"
        >
          <option value="">{t("manager.unassigned")}</option>
          {salesManagerOptions.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name} ({user.role})
            </option>
          ))}
        </select>
      </label>
      {pendingSalesManagerName && !assignedSalesManagerName ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {t("manager.pendingSalesManager", { name: pendingSalesManagerName })}
        </p>
      ) : null}
    </div>
  );
}
