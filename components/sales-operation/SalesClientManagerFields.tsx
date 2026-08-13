"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { getPlatformStaffUserOptions } from "@/lib/sales-operation/crm-manager-users";
import { corpClientIdsMatch, normalizeCorpClientId } from "@/lib/sales-operation/corp-client-id";
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
  disabled?: boolean;
};

function formatClientLabel(entry: B2BClientRegistryEntry): string {
  const name = entry.clientName?.trim();
  if (name && name !== entry.corpClientId) {
    return `${name} (${entry.corpClientId})`;
  }
  return entry.corpClientId;
}

function findRegistryEntry(
  registry: B2BClientRegistryEntry[],
  corpClientId: string | null | undefined,
): B2BClientRegistryEntry | null {
  return registry.find((entry) => corpClientIdsMatch(entry.corpClientId, corpClientId)) ?? null;
}

export function SalesClientManagerFields({
  users,
  registry,
  draft,
  onChange,
  disabled = false,
}: SalesClientManagerFieldsProps) {
  const t = useTranslations("salesOperation");
  const staffOptions = useMemo(() => getPlatformStaffUserOptions(users), [users]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [menuRect, setMenuRect] = useState<DOMRect | null>(null);
  const blurTimerRef = useRef<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const selectedEntry = useMemo(
    () => findRegistryEntry(registry, draft.corpClientId),
    [draft.corpClientId, registry],
  );

  useEffect(() => {
    if (!open) {
      setQuery(selectedEntry ? formatClientLabel(selectedEntry) : draft.corpClientId || "");
    }
  }, [open, selectedEntry, draft.corpClientId]);

  useEffect(() => {
    if (!open) return;
    const update = () => {
      const el = wrapRef.current;
      if (!el) return;
      setMenuRect(el.getBoundingClientRect());
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, query]);

  const filteredRegistry = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return registry.slice(0, 80);
    return registry
      .filter((entry) => {
        const name = entry.clientName?.toLowerCase() ?? "";
        const id = entry.corpClientId.toLowerCase();
        const label = formatClientLabel(entry).toLowerCase();
        return name.includes(needle) || id.includes(needle) || label.includes(needle);
      })
      .slice(0, 80);
  }, [query, registry]);

  const selectClient = (corpClientId: string) => {
    const entry = findRegistryEntry(registry, corpClientId);
    onChange({
      ...draft,
      corpClientId: entry?.corpClientId || corpClientId,
      accountManagerUserId: entry?.accountManager.userId || draft.accountManagerUserId,
      salesManagerUserId: entry?.salesManager.userId || draft.salesManagerUserId,
    });
    setQuery(entry ? formatClientLabel(entry) : corpClientId);
    setOpen(false);
  };

  const clearClient = () => {
    onChange({
      ...draft,
      corpClientId: "",
    });
    setQuery("");
    setOpen(false);
  };

  const openUpward = Boolean(menuRect && menuRect.bottom + 240 > window.innerHeight);
  const hasCorpClient = Boolean(normalizeCorpClientId(draft.corpClientId));

  return (
    <div className="space-y-3">
      <label className="block text-sm">
        <span className="crm-label">{t("field.corpClient")}</span>
        <div className="relative mt-1" ref={wrapRef}>
          <input
            type="text"
            value={query}
            disabled={disabled}
            placeholder={t("field.corpClientSearch")}
            onFocus={() => {
              if (blurTimerRef.current) {
                window.clearTimeout(blurTimerRef.current);
                blurTimerRef.current = null;
              }
              setOpen(true);
              setQuery("");
            }}
            onBlur={() => {
              blurTimerRef.current = window.setTimeout(() => {
                setOpen(false);
                setQuery(selectedEntry ? formatClientLabel(selectedEntry) : draft.corpClientId || "");
              }, 200);
            }}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            className="crm-input block h-9 w-full px-2.5 text-sm text-slate-700 disabled:opacity-60"
            autoComplete="off"
          />
          {hasCorpClient && !disabled ? (
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={clearClient}
              className="absolute inset-y-0 end-2 my-auto text-xs font-semibold text-slate-500 hover:text-slate-800"
            >
              {t("manager.clear")}
            </button>
          ) : null}
          {open && !disabled && menuRect && typeof document !== "undefined"
            ? createPortal(
                <div
                  className="fixed z-[240] max-h-56 overflow-y-auto rounded-xl border border-border bg-white shadow-lg"
                  style={{
                    pointerEvents: "auto",
                    left: menuRect.left,
                    width: Math.max(menuRect.width, 240),
                    ...(openUpward
                      ? { bottom: window.innerHeight - menuRect.top + 4 }
                      : { top: menuRect.bottom + 4 }),
                  }}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                >
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
                          corpClientIdsMatch(entry.corpClientId, draft.corpClientId) ? "bg-slate-50" : ""
                        }`}
                      >
                        <p className="text-sm font-semibold text-slate-900">
                          {entry.clientName?.trim() || entry.corpClientId}
                        </p>
                        <p className="break-all text-xs text-slate-500">{entry.corpClientId}</p>
                      </button>
                    ))
                  )}
                </div>,
                document.body,
              )
            : null}
        </div>
      </label>
      <label className="block text-sm">
        <span className="crm-label">{t("manager.accountManager")}</span>
        <select
          value={draft.accountManagerUserId}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...draft, accountManagerUserId: event.target.value })
          }
          className="crm-input mt-1 block h-9 w-full px-2.5 text-sm text-slate-700 disabled:opacity-60"
        >
          <option value="">{t("manager.unassigned")}</option>
          {staffOptions.map((user) => (
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
          disabled={disabled}
          onChange={(event) => onChange({ ...draft, salesManagerUserId: event.target.value })}
          className="crm-input mt-1 block h-9 w-full px-2.5 text-sm text-slate-700 disabled:opacity-60"
        >
          <option value="">{t("manager.unassigned")}</option>
          {staffOptions.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name} ({user.role})
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
