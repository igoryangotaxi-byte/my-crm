"use client";

import { useEffect, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { colorForSequence } from "@/lib/route-bundles/colors";
import type { RouteBundleItem } from "@/lib/route-bundles/types";

function SortableRow({
  item,
  busy,
  onRemove,
}: {
  item: RouteBundleItem;
  busy: boolean;
  onRemove: (orderId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.orderId,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-start justify-between gap-2 rounded-xl border border-[var(--so-border)] px-2.5 py-2"
    >
      <button
        type="button"
        className="mt-0.5 shrink-0 cursor-grab text-[var(--so-muted)] active:cursor-grabbing"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 truncate text-sm font-semibold">
          <span
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: colorForSequence(item.sequence) }}
            aria-hidden
          />
          {item.sequence}. #{item.orderId}
        </div>
        <div className="truncate text-xs text-[var(--so-muted)]">{item.clientName}</div>
        <div className="text-[11px] text-[var(--so-muted)]">
          buffer {Math.round(item.bufferBeforePickupSec / 60)} min
        </div>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => onRemove(item.orderId)}
        className="shrink-0 text-xs font-semibold text-rose-600"
      >
        Remove
      </button>
    </div>
  );
}

export function BundleOrderList({
  items,
  busy,
  onRemove,
  onReorder,
}: {
  items: RouteBundleItem[];
  busy: boolean;
  onRemove: (orderId: string) => void;
  onReorder: (orderIds: string[]) => void;
}) {
  const [ordered, setOrdered] = useState(items);
  useEffect(() => {
    setOrdered(items);
  }, [items]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ordered.findIndex((i) => i.orderId === active.id);
    const newIndex = ordered.findIndex((i) => i.orderId === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(ordered, oldIndex, newIndex);
    setOrdered(next);
    onReorder(next.map((i) => i.orderId));
  }

  if (ordered.length < 2) {
    return (
      <div className="space-y-2">
        {ordered.map((item) => (
          <div
            key={item.id}
            className="rounded-xl border border-[var(--so-border)] px-2.5 py-2 text-sm"
          >
            #{item.orderId}
          </div>
        ))}
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ordered.map((i) => i.orderId)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {ordered.map((item) => (
            <SortableRow key={item.orderId} item={item} busy={busy} onRemove={onRemove} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
