"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
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
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--so-muted-2)]" />
        <input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={t("search.placeholder")}
          className="so-focus-ring h-9 w-44 rounded-[10px] border border-[var(--so-border-strong)] bg-[var(--so-surface)] py-1.5 pl-8 pr-3 text-sm text-[var(--so-text)] outline-none transition-[width,border-color,box-shadow] focus:w-64 focus:border-[rgba(255,45,45,0.5)] focus:shadow-[var(--so-focus-ring)]"
          aria-label={t("search.placeholder")}
        />
      </div>
      {open && query.trim().length >= 2 ? (
        <div
          className={`absolute z-30 mt-2 max-h-[26rem] w-80 overflow-y-auto rounded-[14px] border border-[var(--so-border)] bg-[var(--so-surface)] p-2 shadow-[var(--so-shadow-lg)] ${
            language === "he" ? "left-0" : "right-0"
          }`}
        >
          {loading && results.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-[var(--so-muted)]">{t("search.searching")}</p>
          ) : results.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-[var(--so-muted)]">{t("search.empty")}</p>
          ) : (
            <ul className="space-y-0.5">
              {results.map((result) => (
                <li key={`${result.entityType}:${result.id}`}>
                  <button
                    type="button"
                    onClick={() => onSelect(result)}
                    className="so-focus-ring flex w-full items-start gap-2 rounded-[10px] px-2.5 py-2 text-left transition-colors hover:bg-[var(--so-surface-hover)]"
                  >
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[var(--so-surface-2)] text-[0.65rem] font-bold text-[var(--so-muted)]">
                      {ENTITY_ICON[result.entityType]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-semibold text-[var(--so-text)]">
                          {result.title}
                        </span>
                        <span className="shrink-0 text-[0.6rem] uppercase tracking-wide text-[var(--so-muted-2)]">
                          {t(`search.entity.${result.entityType}`)}
                        </span>
                      </span>
                      {result.subtitle ? (
                        <span className="mt-0.5 block truncate text-[0.7rem] text-[var(--so-muted)]">
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
