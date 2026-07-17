"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import type { SearchResult } from "@/lib/sales-operation/search";

const DEBOUNCE_MS = 250;

const ENTITY_ICON: Record<SearchResult["entityType"], string> = {
  lead: "L",
  client: "C",
  contact: "@",
};

export function SalesGlobalSearch() {
  const t = useTranslations("salesOperation");
  const router = useRouter();
  const { language } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const runSearch = useCallback(async (value: string) => {
    if (value.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/sales-operation/search?q=${encodeURIComponent(value)}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { ok?: boolean; results?: SearchResult[] };
      if (data.ok) setResults(data.results ?? []);
    } catch {
      // best-effort; ignore transient errors
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => void runSearch(query), DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [query, runSearch]);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const onSelect = (result: SearchResult) => {
    setOpen(false);
    setQuery("");
    setResults([]);
    router.push(result.href);
  };

  return (
    <div className="relative hidden sm:block" ref={containerRef}>
      <div className="relative">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </span>
        <input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={t("search.placeholder")}
          className="w-44 rounded-full border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-sm text-slate-700 outline-none transition focus:w-64 focus:border-red-300"
          aria-label={t("search.placeholder")}
        />
      </div>
      {open && query.trim().length >= 2 ? (
        <div
          className={`crm-surface absolute z-30 mt-2 max-h-[26rem] w-80 overflow-y-auto rounded-2xl p-2 ${
            language === "he" ? "left-0" : "right-0"
          }`}
        >
          {loading && results.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted">{t("search.searching")}</p>
          ) : results.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted">{t("search.empty")}</p>
          ) : (
            <ul className="space-y-1">
              {results.map((result) => (
                <li key={`${result.entityType}:${result.id}`}>
                  <button
                    type="button"
                    onClick={() => onSelect(result)}
                    className="flex w-full items-start gap-2 rounded-xl px-2.5 py-2 text-left transition hover:bg-slate-50"
                  >
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[0.65rem] font-bold text-slate-500">
                      {ENTITY_ICON[result.entityType]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-semibold text-slate-900">
                          {result.title}
                        </span>
                        <span className="shrink-0 text-[0.6rem] uppercase tracking-wide text-muted">
                          {t(`search.entity.${result.entityType}`)}
                        </span>
                      </span>
                      {result.subtitle ? (
                        <span className="mt-0.5 block truncate text-[0.7rem] text-slate-500">
                          {result.subtitle}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
