"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { FolderKanban, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import type { TrackerProject } from "@/lib/sales-operation/tracker-types";

export function TrackerProjectsView() {
  const t = useTranslations("salesOperation.tracker");
  const toast = useToast();
  const [projects, setProjects] = useState<TrackerProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sales-operation/tracker/projects", { cache: "no-store" });
      const data = (await res.json()) as { ok?: boolean; projects?: TrackerProject[]; error?: string };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? "Failed to load projects");
        return;
      }
      setProjects(data.projects ?? []);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional mount load; toast identity churn
  }, []);

  const onCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/sales-operation/tracker/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: description || null }),
      });
      const data = (await res.json()) as { ok?: boolean; project?: TrackerProject; error?: string };
      if (!res.ok || !data.ok || !data.project) {
        toast.error(data.error ?? "Failed to create project");
        return;
      }
      setName("");
      setDescription("");
      setProjects((prev) => [data.project!, ...prev]);
      toast.success(data.project.name);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6">
      <section className="rounded-[14px] border border-[var(--so-border)] bg-[var(--so-surface)] p-4 shadow-[var(--so-shadow-xs)]">
        <h2 className="mb-3 text-sm font-semibold text-[var(--so-text)]">{t("newProject")}</h2>
        <div className="flex flex-col gap-2 md:flex-row md:items-end">
          <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-[var(--so-muted)]">
            {t("projectName")}
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="so-focus-ring h-10 rounded-[10px] border border-[var(--so-border)] bg-[var(--so-surface-2)] px-3 text-sm text-[var(--so-text)]"
              onKeyDown={(e) => {
                if (e.key === "Enter") void onCreate();
              }}
            />
          </label>
          <label className="flex flex-[1.4] flex-col gap-1 text-xs font-medium text-[var(--so-muted)]">
            {t("projectDescription")}
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="so-focus-ring h-10 rounded-[10px] border border-[var(--so-border)] bg-[var(--so-surface-2)] px-3 text-sm text-[var(--so-text)]"
            />
          </label>
          <Button type="button" onClick={() => void onCreate()} disabled={creating || !name.trim()}>
            <Plus className="h-4 w-4" />
            {t("createProject")}
          </Button>
        </div>
      </section>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-[14px]" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <EmptyState icon={<FolderKanban className="h-6 w-6" />} title={t("emptyProjects")} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/sales-operation/tracker/${project.id}`}
              className="group rounded-[14px] border border-[var(--so-border)] bg-[var(--so-surface)] p-4 shadow-[var(--so-shadow-xs)] transition hover:border-[var(--so-accent)] hover:shadow-[var(--so-shadow-sm)]"
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <h3 className="text-base font-semibold text-[var(--so-text)] group-hover:text-[var(--so-accent)]">
                  {project.name}
                </h3>
                <FolderKanban className="h-4 w-4 shrink-0 text-[var(--so-muted-2)]" />
              </div>
              {project.description ? (
                <p className="mb-3 line-clamp-2 text-sm text-[var(--so-muted)]">{project.description}</p>
              ) : null}
              <div className="flex gap-3 text-xs text-[var(--so-muted)]">
                <span>{t("openTickets", { count: project.openTicketCount ?? 0 })}</span>
                <span>{t("totalTickets", { count: project.ticketCount ?? 0 })}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
