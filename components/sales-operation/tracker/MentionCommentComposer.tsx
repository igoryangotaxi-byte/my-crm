"use client";

import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/ui/cn";

export type MentionStaff = { id: string; name: string };

/** Renders comment text with @Name highlights for known staff. */
export function HighlightedCommentBody({
  body,
  staff,
  className,
}: {
  body: string;
  staff: MentionStaff[];
  className?: string;
}) {
  const names = useMemo(() => {
    const list = staff
      .map((s) => s.name.trim())
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);
    return list;
  }, [staff]);

  if (!body) return null;
  if (names.length === 0) {
    return <p className={cn("whitespace-pre-wrap", className)}>{body}</p>;
  }

  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(@(?:${escaped.join("|")}))`, "gi");
  const parts = body.split(pattern);

  return (
    <p className={cn("whitespace-pre-wrap", className)}>
      {parts.map((part, index) => {
        if (part.startsWith("@")) {
          const matched = names.some((n) => part.slice(1).toLowerCase() === n.toLowerCase());
          if (matched) {
            return (
              <span
                key={`${index}-${part}`}
                className="rounded-md bg-[var(--so-accent-soft)] px-1 py-0.5 font-semibold text-[var(--so-accent-strong)]"
              >
                {part}
              </span>
            );
          }
        }
        return <span key={`${index}-${part}`}>{part}</span>;
      })}
    </p>
  );
}

type MentionComposerProps = {
  value: string;
  onChange: (value: string) => void;
  staff: MentionStaff[];
  placeholder?: string;
  rows?: number;
  className?: string;
};

/**
 * Textarea with @-mention autocomplete against CRM staff names.
 * Inserts `@Full Name` so server-side findMentionedUserIds can resolve them.
 */
export function MentionCommentComposer({
  value,
  onChange,
  staff,
  placeholder,
  rows = 3,
  className,
}: MentionComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [startIndex, setStartIndex] = useState<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const suggestions = useMemo(() => {
    if (query === null) return [];
    const q = query.toLowerCase();
    return staff
      .filter((s) => !q || s.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [query, staff]);

  const syncMentionState = (nextValue: string, caret: number) => {
    const before = nextValue.slice(0, caret);
    const match = before.match(/@([^\s@]*)$/);
    if (!match) {
      setQuery(null);
      setStartIndex(null);
      return;
    }
    setQuery(match[1] ?? "");
    setStartIndex(caret - (match[0]?.length ?? 0));
    setActiveIndex(0);
  };

  const insertMention = (name: string) => {
    if (startIndex == null || !textareaRef.current) return;
    const caret = textareaRef.current.selectionStart;
    const before = value.slice(0, startIndex);
    const after = value.slice(caret);
    const inserted = `@${name} `;
    const next = `${before}${inserted}${after}`;
    onChange(next);
    setQuery(null);
    setStartIndex(null);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      const pos = before.length + inserted.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        rows={rows}
        placeholder={placeholder}
        className={cn(
          "so-focus-ring w-full rounded-[10px] border border-[var(--so-border)] bg-[var(--so-surface-2)] px-3 py-2 text-sm",
          className,
        )}
        onChange={(e) => {
          const next = e.target.value;
          onChange(next);
          syncMentionState(next, e.target.selectionStart);
        }}
        onKeyUp={(e) => {
          const el = e.currentTarget;
          syncMentionState(el.value, el.selectionStart);
        }}
        onClick={(e) => {
          const el = e.currentTarget;
          syncMentionState(el.value, el.selectionStart);
        }}
        onKeyDown={(e) => {
          if (query === null || suggestions.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((i) => (i + 1) % suggestions.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
          } else if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            const pick = suggestions[activeIndex];
            if (pick) insertMention(pick.name);
          } else if (e.key === "Escape") {
            setQuery(null);
            setStartIndex(null);
          }
        }}
      />
      {query !== null && suggestions.length > 0 ? (
        <div className="absolute bottom-full left-0 right-0 z-20 mb-1 max-h-48 overflow-y-auto rounded-[12px] border border-[var(--so-border)] bg-[var(--so-surface)] p-1 shadow-[var(--so-shadow-md)]">
          <p className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--so-muted)]">
            Mention
          </p>
          {suggestions.map((s, index) => (
            <button
              key={s.id}
              type="button"
              className={cn(
                "flex w-full items-center gap-2 rounded-[8px] px-2.5 py-1.5 text-left text-sm",
                index === activeIndex
                  ? "bg-[var(--so-accent-soft)] text-[var(--so-accent-strong)]"
                  : "hover:bg-[var(--so-surface-2)]",
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                insertMention(s.name);
              }}
            >
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--so-surface-2)] text-[10px] font-bold text-[var(--so-muted)]">
                {s.name.slice(0, 1).toUpperCase()}
              </span>
              @{s.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
