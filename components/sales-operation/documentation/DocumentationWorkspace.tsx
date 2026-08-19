"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BookOpen, GripVertical, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/ui/cn";
import type { JSONContent } from "@tiptap/core";
import type {
  DocumentationDocument,
  DocumentationListItem,
} from "@/lib/sales-operation/documentation-types";
import { DocumentEditor } from "./DocumentEditor";
import "./documentation-editor.css";

function SortableTab({
  item,
  active,
  renaming,
  titleDraft,
  onSelect,
  onStartRename,
  onTitleDraft,
  onCommitRename,
  onDelete,
  lastEdited,
}: {
  item: DocumentationListItem;
  active: boolean;
  renaming: boolean;
  titleDraft: string;
  onSelect: () => void;
  onStartRename: () => void;
  onTitleDraft: (value: string) => void;
  onCommitRename: () => void;
  onDelete: () => void;
  lastEdited: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group flex items-start gap-1 rounded-[8px] border px-1 py-1.5",
        active
          ? "border-[var(--so-border)] bg-[var(--so-surface)]"
          : "border-transparent hover:bg-[var(--so-surface-hover)]",
        isDragging && "opacity-60",
      )}
    >
      <button
        type="button"
        className="mt-0.5 cursor-grab touch-none text-[var(--so-muted-2)] hover:text-[var(--so-muted)]"
        aria-label="Reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <button type="button" className="min-w-0 flex-1 text-left" onClick={onSelect} onDoubleClick={onStartRename}>
        {renaming ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={(event) => onTitleDraft(event.target.value)}
            onBlur={() => onCommitRename()}
            onKeyDown={(event) => {
              if (event.key === "Enter") onCommitRename();
              if (event.key === "Escape") onCommitRename();
            }}
            className="so-focus-ring h-6 w-full rounded-[4px] border border-[var(--so-border)] bg-[var(--so-surface-2)] px-1 text-[12px] text-[var(--so-text)]"
            onClick={(event) => event.stopPropagation()}
          />
        ) : (
          <>
            <div className="truncate text-[12px] font-medium text-[var(--so-text)]">{item.title}</div>
            <div className="truncate text-[10px] text-[var(--so-muted-2)]">{lastEdited}</div>
          </>
        )}
      </button>
      <button
        type="button"
        className="mt-0.5 hidden rounded-[4px] p-0.5 text-[var(--so-muted-2)] hover:bg-[var(--so-surface-2)] hover:text-rose-500 group-hover:block"
        aria-label="Delete"
        onClick={onDelete}
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

export function DocumentationWorkspace() {
  const t = useTranslations("salesOperation.documentation");
  const toast = useToast();
  const confirm = useConfirm();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [items, setItems] = useState<DocumentationListItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [current, setCurrent] = useState<DocumentationDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "conflict">("idle");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSave = useRef<{
    id: string;
    expectedUpdatedAt: string;
    content: JSONContent;
  } | null>(null);
  const flushSaveRef = useRef<() => Promise<void>>(async () => {});
  const currentRef = useRef<DocumentationDocument | null>(null);

  useEffect(() => {
    currentRef.current = current;
  }, [current]);

  const applyDocument = useCallback((document: DocumentationDocument) => {
    currentRef.current = document;
    setCurrent(document);
    setActiveId(document.id);
    setItems((prev) => {
      const exists = prev.some((item) => item.id === document.id);
      if (!exists) return [...prev, document];
      return prev.map((item) => (item.id === document.id ? { ...item, ...document } : item));
    });
  }, []);

  const flushSave = useCallback(async () => {
    const pending = pendingSave.current;
    if (!pending) return;
    pendingSave.current = null;
    setSaving("saving");
    const res = await fetch(`/api/sales-operation/documentation/${pending.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: pending.content, expectedUpdatedAt: pending.expectedUpdatedAt }),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      document?: DocumentationDocument;
      conflict?: boolean;
      error?: string;
    };
    if (res.status === 409 || data.conflict) {
      setSaving("conflict");
      toast.error(t("conflict"));
      if (data.document) {
        applyDocument(data.document);
        currentRef.current = data.document;
      }
      return;
    }
    if (!res.ok || !data.ok || !data.document) {
      setSaving("idle");
      toast.error(data.error ?? t("saveError"));
      return;
    }
    const saved = data.document;
    applyDocument(saved);
    currentRef.current = saved;
    setSaving("saved");
    const queued = pendingSave.current as typeof pending | null;
    if (queued && queued.id === saved.id) {
      queued.expectedUpdatedAt = saved.updatedAt;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void flushSaveRef.current();
      }, 400);
    }
  }, [applyDocument, t, toast]);

  useEffect(() => {
    flushSaveRef.current = flushSave;
  }, [flushSave]);

  const openDocument = useCallback(
    async (id: string) => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      await flushSave();
      const res = await fetch(`/api/sales-operation/documentation/${id}`, { cache: "no-store" });
      const data = (await res.json()) as { ok?: boolean; document?: DocumentationDocument; error?: string };
      if (!res.ok || !data.ok || !data.document) {
        toast.error(data.error ?? t("loadError"));
        return;
      }
      applyDocument(data.document);
      setSaving("idle");
    },
    [applyDocument, flushSave, t, toast],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/sales-operation/documentation", { cache: "no-store" });
        const data = (await res.json()) as {
          ok?: boolean;
          documents?: DocumentationListItem[];
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !data.ok) {
          toast.error(data.error ?? t("loadError"));
          return;
        }
        const next = data.documents ?? [];
        setItems(next);
        if (next[0]) {
          const docRes = await fetch(`/api/sales-operation/documentation/${next[0].id}`, {
            cache: "no-store",
          });
          const docData = (await docRes.json()) as {
            ok?: boolean;
            document?: DocumentationDocument;
          };
          if (cancelled) return;
          if (docRes.ok && docData.ok && docData.document) applyDocument(docData.document);
          else setActiveId(next[0].id);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyDocument, t, toast]);

  useEffect(() => {
    const persist = () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      void flushSaveRef.current();
    };
    const onHidden = () => {
      if (document.visibilityState === "hidden") persist();
    };
    window.addEventListener("pagehide", persist);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("pagehide", persist);
      document.removeEventListener("visibilitychange", onHidden);
      persist();
    };
  }, []);

  const onContentChange = (content: JSONContent) => {
    const document = currentRef.current;
    if (!document) return;
    pendingSave.current = {
      id: document.id,
      expectedUpdatedAt: document.updatedAt,
      content,
    };
    setSaving("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void flushSaveRef.current();
    }, 800);
  };

  const createDocument = async () => {
    await flushSave();
    const res = await fetch("/api/sales-operation/documentation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: t("untitled") }),
    });
    const data = (await res.json()) as { ok?: boolean; document?: DocumentationDocument; error?: string };
    if (!res.ok || !data.ok || !data.document) {
      toast.error(data.error ?? t("saveError"));
      return;
    }
    applyDocument(data.document);
  };

  const commitRename = async () => {
    if (!renamingId) return;
    const title = titleDraft.trim();
    setRenamingId(null);
    if (!title) return;
    const res = await fetch(`/api/sales-operation/documentation/${renamingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    const data = (await res.json()) as { ok?: boolean; document?: DocumentationDocument; error?: string };
    if (!res.ok || !data.ok || !data.document) {
      toast.error(data.error ?? t("saveError"));
      return;
    }
    setItems((prev) => prev.map((item) => (item.id === data.document!.id ? { ...item, ...data.document } : item)));
    if (current?.id === data.document.id) setCurrent(data.document);
  };

  const deleteDocument = async (id: string) => {
    const ok = await confirm({
      title: t("deleteConfirm"),
      destructive: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/sales-operation/documentation/${id}`, { method: "DELETE" });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      toast.error(data.error ?? t("saveError"));
      return;
    }
    const remaining = items.filter((item) => item.id !== id);
    setItems(remaining);
    if (activeId === id) {
      if (remaining[0]) await openDocument(remaining[0].id);
      else {
        setActiveId(null);
        setCurrent(null);
      }
    }
  };

  const onDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((item) => item.id === active.id);
    const newIndex = items.findIndex((item) => item.id === over.id);
    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next);
    const res = await fetch("/api/sales-operation/documentation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds: next.map((item) => item.id) }),
    });
    const data = (await res.json()) as { ok?: boolean; documents?: DocumentationListItem[]; error?: string };
    if (!res.ok || !data.ok) toast.error(data.error ?? t("saveError"));
    else if (data.documents) setItems(data.documents);
  };

  const saveLabel = useMemo(() => {
    if (saving === "saving") return t("saving");
    if (saving === "saved") return t("saved");
    if (saving === "conflict") return t("conflict");
    return "";
  }, [saving, t]);

  if (loading) {
    return <div className="min-h-[50vh] animate-pulse bg-[var(--so-surface-2)]" />;
  }

  return (
    <div className="flex min-h-[calc(100vh-56px)]">
      <aside className="flex w-[240px] shrink-0 flex-col border-r border-[var(--so-border)] bg-[var(--so-bg)]">
        <div className="flex items-center justify-between px-3 py-2.5">
          <div className="text-[12px] font-semibold text-[var(--so-text)]">{t("title")}</div>
          <Button size="icon" variant="ghost" aria-label={t("new")} onClick={() => void createDocument()}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {items.length === 0 ? (
          <div className="px-3 py-6">
            <EmptyState
              compact
              icon={<BookOpen className="h-5 w-5" />}
              title={t("emptyTitle")}
              description={t("emptyHint")}
              action={
                <Button size="sm" onClick={() => void createDocument()}>
                  {t("new")}
                </Button>
              }
            />
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => void onDragEnd(event)}>
            <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-0.5 overflow-auto px-2 pb-3">
                {items.map((item) => (
                  <SortableTab
                    key={item.id}
                    item={item}
                    active={item.id === activeId}
                    renaming={renamingId === item.id}
                    titleDraft={titleDraft}
                    lastEdited={new Date(item.updatedAt).toLocaleString()}
                    onSelect={() => {
                      if (item.id !== activeId) void openDocument(item.id);
                    }}
                    onStartRename={() => {
                      setRenamingId(item.id);
                      setTitleDraft(item.title);
                    }}
                    onTitleDraft={setTitleDraft}
                    onCommitRename={() => void commitRename()}
                    onDelete={() => void deleteDocument(item.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </aside>
      <section className="flex min-w-0 flex-1 flex-col bg-[var(--so-bg)]">
        {current ? (
          <>
            <div className="flex items-center justify-between border-b border-[var(--so-border)] px-4 py-2">
              <div className="text-[13px] font-medium text-[var(--so-text)]">{current.title}</div>
              <div className="text-[11px] text-[var(--so-muted-2)]">{saveLabel}</div>
            </div>
            <DocumentEditor
              key={current.id}
              documentId={current.id}
              content={current.content}
              onChange={onContentChange}
            />
          </>
        ) : activeId ? (
          <div className="min-h-[50vh] flex-1 animate-pulse bg-[var(--so-surface-2)]" />
        ) : (
          <div className="flex flex-1 items-center justify-center p-8">
            <EmptyState
              icon={<BookOpen className="h-6 w-6" />}
              title={t("emptyTitle")}
              description={t("emptyHint")}
              action={
                <Button onClick={() => void createDocument()}>{t("new")}</Button>
              }
            />
          </div>
        )}
      </section>
    </div>
  );
}
