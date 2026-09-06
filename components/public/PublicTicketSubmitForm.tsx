"use client";

import { useRef, useState, type FormEvent } from "react";
import { Paperclip, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/ui/cn";
import {
  MAX_PUBLIC_FILE_BYTES,
  MAX_PUBLIC_TICKET_FILES,
  MAX_PUBLIC_DESCRIPTION_CHARS,
  MAX_PUBLIC_TITLE_CHARS,
} from "@/lib/sales-operation/public-ticket-form";
import type { TrackerPriority } from "@/lib/sales-operation/tracker-types";

const PRIORITIES: Array<{ value: TrackerPriority; label: string }> = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function PublicTicketSubmitForm() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TrackerPriority>("normal");
  const [files, setFiles] = useState<File[]>([]);
  const [honeypot, setHoneypot] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const addFiles = (list: FileList | null) => {
    if (!list?.length) return;
    setError(null);
    const next = [...files];
    for (const file of Array.from(list)) {
      if (next.length >= MAX_PUBLIC_TICKET_FILES) {
        setError(`You can attach up to ${MAX_PUBLIC_TICKET_FILES} files.`);
        break;
      }
      if (file.size > MAX_PUBLIC_FILE_BYTES) {
        setError(`"${file.name}" is too large (max ${formatBytes(MAX_PUBLIC_FILE_BYTES)}).`);
        continue;
      }
      if (next.some((f) => f.name === file.name && f.size === file.size)) continue;
      next.push(file);
    }
    setFiles(next);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("title", title.trim());
      form.set("description", description.trim());
      form.set("priority", priority);
      form.set("company_website", honeypot);
      for (const file of files) form.append("files", file);

      const res = await fetch("/api/public/tracker-submit", {
        method: "POST",
        body: form,
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to submit.");
      }
      setDone(true);
      setTitle("");
      setDescription("");
      setPriority("normal");
      setFiles([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit.");
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <div className="rounded-[12px] border border-[var(--so-border)] bg-[var(--so-surface-2)] px-5 py-6 text-center">
        <p className="crm-section-title text-[var(--so-text)]">Request sent</p>
        <p className="mt-2 text-sm text-[var(--so-muted)]">
          Thanks — your ticket was added to our queue. We will follow up from there.
        </p>
        <Button
          className="mt-5"
          variant="secondary"
          onClick={() => {
            setDone(false);
            setError(null);
          }}
        >
          Submit another
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
      <label className="block">
        <span className="crm-label text-[var(--so-muted)]">Title</span>
        <input
          className="crm-input mt-1.5 h-11 w-full px-3 text-sm text-[var(--so-text)]"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Short summary"
          maxLength={MAX_PUBLIC_TITLE_CHARS}
          required
          autoFocus
          disabled={saving}
        />
      </label>

      <label className="block">
        <span className="crm-label text-[var(--so-muted)]">Description</span>
        <textarea
          className="crm-input mt-1.5 min-h-[160px] w-full resize-y px-3 py-2.5 text-sm text-[var(--so-text)]"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the request. You can attach photos or files below."
          maxLength={MAX_PUBLIC_DESCRIPTION_CHARS}
          required
          disabled={saving}
        />
      </label>

      <div>
        <span className="crm-label text-[var(--so-muted)]">Attachments</span>
        <div className="mt-1.5 rounded-[12px] border border-dashed border-[var(--so-border-strong)] bg-[var(--so-surface-2)] p-3">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
            className="sr-only"
            onChange={(e) => addFiles(e.target.files)}
            disabled={saving || files.length >= MAX_PUBLIC_TICKET_FILES}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={saving || files.length >= MAX_PUBLIC_TICKET_FILES}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-[8px] border border-[var(--so-border)] bg-[var(--so-surface)] px-3 py-2.5 text-sm font-medium text-[var(--so-text)]",
              "shadow-[var(--so-shadow-xs)] transition hover:bg-[var(--so-surface-hover)]",
              "disabled:pointer-events-none disabled:opacity-50",
            )}
          >
            <Upload className="h-4 w-4 text-[var(--so-muted)]" strokeWidth={2} />
            Add photo or file
          </button>
          <p className="mt-2 text-center text-xs text-[var(--so-muted-2)]">
            Up to {MAX_PUBLIC_TICKET_FILES} files · {formatBytes(MAX_PUBLIC_FILE_BYTES)} each
          </p>
          {files.length > 0 ? (
            <ul className="mt-3 space-y-1.5">
              {files.map((file, index) => (
                <li
                  key={`${file.name}-${file.size}-${index}`}
                  className="flex items-center gap-2 rounded-[8px] border border-[var(--so-border)] bg-[var(--so-surface)] px-2.5 py-2 text-sm"
                >
                  <Paperclip className="h-3.5 w-3.5 shrink-0 text-[var(--so-muted)]" />
                  <span className="min-w-0 flex-1 truncate text-[var(--so-text)]">{file.name}</span>
                  <span className="shrink-0 text-xs text-[var(--so-muted-2)]">
                    {formatBytes(file.size)}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${file.name}`}
                    onClick={() => removeFile(index)}
                    disabled={saving}
                    className="rounded p-1 text-[var(--so-muted)] hover:bg-[var(--so-surface-2)] hover:text-[var(--so-text)]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      <label className="block">
        <span className="crm-label text-[var(--so-muted)]">Priority</span>
        <select
          className="crm-input mt-1.5 h-11 w-full px-3 text-sm text-[var(--so-text)]"
          value={priority}
          onChange={(e) => setPriority(e.target.value as TrackerPriority)}
          disabled={saving}
        >
          {PRIORITIES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </label>

      {/* Honeypot for bots */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden opacity-0">
        <label>
          Company website
          <input
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </label>
      </div>

      {error ? (
        <p className="rounded-[8px] bg-[rgba(199,15,31,0.08)] px-3 py-2 text-sm text-[var(--destructive)]">
          {error}
        </p>
      ) : null}

      <Button
        type="submit"
        className="h-11 w-full"
        size="lg"
        loading={saving}
        disabled={saving || !title.trim() || !description.trim()}
      >
        Submit request
      </Button>
    </form>
  );
}
