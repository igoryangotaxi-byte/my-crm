"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { BundleEmptyState } from "@/components/route-bundles/BundleEmptyState";
import { BundleHealthBadge } from "@/components/route-bundles/BundleHealthBadge";
import { BundleOrderList } from "@/components/route-bundles/BundleOrderList";
import { BundleTimeline } from "@/components/route-bundles/BundleTimeline";
import { RouteBundlesMap } from "@/components/route-bundles/RouteBundlesMap";
import { RouteOpportunityBanner } from "@/components/route-bundles/RouteOpportunityBanner";
import { BundleSettingsDrawer } from "@/components/route-bundles/BundleSettingsDrawer";
import type { BundleEvent, RouteBundle, RouteBundleOpportunity, RouteBundleSettings } from "@/lib/route-bundles/types";
import { cn } from "@/lib/ui/cn";

type TabKey = "suggested" | "active" | "all";

function fmtWindow(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function RouteBundlesView() {
  const { canAccess } = useAuth();
  const searchParams = useSearchParams();
  const canEditSettings = canAccess("salesSettings");

  const [tab, setTab] = useState<TabKey>("suggested");
  const [bundles, setBundles] = useState<RouteBundle[]>([]);
  const [opportunities, setOpportunities] = useState<RouteBundleOpportunity[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RouteBundle | null>(null);
  const [events, setEvents] = useState<BundleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [validityMsg, setValidityMsg] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<RouteBundleSettings | null>(null);
  const [googleConfigured, setGoogleConfigured] = useState(true);
  const [driverForm, setDriverForm] = useState({ driverId: "", driverName: "", driverPhone: "" });
  const [addOrderId, setAddOrderId] = useState("");
  const [poolUnassigned, setPoolUnassigned] = useState(0);
  const [previewOpportunity, setPreviewOpportunity] = useState<RouteBundleOpportunity | null>(null);
  const autoGenerateTried = useRef(false);

  const loadList = useCallback(async () => {
    const res = await fetch("/api/route-bundles", { cache: "no-store" });
    const json = (await res.json()) as { ok?: boolean; bundles?: RouteBundle[]; error?: string };
    if (!json.ok) throw new Error(json.error || "Failed to load bundles");
    setBundles(json.bundles ?? []);
  }, []);

  const loadOpportunities = useCallback(async () => {
    const res = await fetch("/api/route-bundles/opportunities", { cache: "no-store" });
    const json = (await res.json()) as { ok?: boolean; opportunities?: RouteBundleOpportunity[] };
    if (json.ok) setOpportunities(json.opportunities ?? []);
  }, []);

  const loadSettings = useCallback(async () => {
    const res = await fetch("/api/route-bundles/settings", { cache: "no-store" });
    const json = (await res.json()) as {
      ok?: boolean;
      settings?: RouteBundleSettings;
      googleConfigured?: boolean;
    };
    if (json.ok && json.settings) {
      setSettings(json.settings);
      setGoogleConfigured(Boolean(json.googleConfigured));
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    const res = await fetch(`/api/route-bundles/${id}`, { cache: "no-store" });
    const json = (await res.json()) as {
      ok?: boolean;
      bundle?: RouteBundle;
      events?: BundleEvent[];
      error?: string;
    };
    if (!json.ok || !json.bundle) throw new Error(json.error || "Failed to load bundle");
    setDetail(json.bundle);
    setEvents(json.events ?? []);
    setDriverForm({
      driverId: json.bundle.driverId ?? "",
      driverName: json.bundle.driverName ?? "",
      driverPhone: json.bundle.driverPhone ?? "",
    });
  }, []);

  const loadPool = useCallback(async () => {
    const res = await fetch("/api/route-bundles/pool", { cache: "no-store" });
    const json = (await res.json()) as { ok?: boolean; poolUnassigned?: number };
    if (json.ok) setPoolUnassigned(json.poolUnassigned ?? 0);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadList(), loadOpportunities(), loadSettings(), loadPool()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [loadList, loadOpportunities, loadSettings, loadPool]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (searchParams.get("settings") === "1") setSettingsOpen(true);
  }, [searchParams]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadList();
      void loadOpportunities();
      void loadPool();
    }, 45000);
    return () => window.clearInterval(timer);
  }, [loadList, loadOpportunities, loadPool]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setEvents([]);
      setValidityMsg(null);
      setPreviewOpportunity(null);
      return;
    }
    void loadDetail(selectedId).catch((e) => setError(e instanceof Error ? e.message : "Detail failed"));
  }, [selectedId, loadDetail]);

  const suggestedCount = useMemo(
    () => bundles.filter((b) => b.status === "suggested" || b.status === "reviewing").length,
    [bundles],
  );
  const activeCount = useMemo(
    () => bundles.filter((b) => ["driver_contacted", "accepted", "active"].includes(b.status)).length,
    [bundles],
  );

  const filtered = useMemo(() => {
    if (tab === "suggested") return bundles.filter((b) => b.status === "suggested" || b.status === "reviewing");
    if (tab === "active") {
      return bundles.filter((b) => ["driver_contacted", "accepted", "active"].includes(b.status));
    }
    return bundles.filter((b) => !["cancelled", "rejected", "completed"].includes(b.status));
  }, [bundles, tab]);

  const selectedOpps = useMemo(
    () => opportunities.filter((o) => o.targetBundleId === selectedId),
    [opportunities, selectedId],
  );

  const mapBundle = useMemo(() => {
    if (!detail || !previewOpportunity) return detail;
    // Preview highlight: annotate explain with proposed sequence
    return {
      ...detail,
      explainText: `Preview: ${previewOpportunity.proposedSequence.map((id) => `#${id}`).join(" → ")}`,
    };
  }, [detail, previewOpportunity]);

  async function onGenerate() {
    setGenerating(true);
    setError(null);
    setBanner(null);
    try {
      const res = await fetch("/api/route-bundles/generate", { method: "POST" });
      const json = (await res.json()) as {
        ok?: boolean;
        created?: number;
        warnings?: string[];
        skippedMissingCoords?: number;
        opportunities?: number;
        error?: string;
      };
      if (!json.ok) throw new Error(json.error || "Generate failed");
      const parts = [
        `Created ${json.created ?? 0} suggested routes`,
        json.opportunities ? `${json.opportunities} new opportunities` : null,
        json.skippedMissingCoords ? `${json.skippedMissingCoords} orders skipped (missing coords)` : null,
        ...(json.warnings ?? []),
      ].filter(Boolean);
      setBanner(parts.join(" · "));
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generate failed");
    } finally {
      setGenerating(false);
    }
  }

  useEffect(() => {
    if (autoGenerateTried.current) return;
    if (loading || !settings?.autoGenerateSuggestions || !googleConfigured) return;
    if (suggestedCount > 0) return;
    autoGenerateTried.current = true;
    void onGenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once when settings known
  }, [loading, settings?.autoGenerateSuggestions, googleConfigured, suggestedCount]);

  function applyValidityFromBundle(bundle: RouteBundle | null | undefined) {
    if (!bundle) {
      setValidityMsg(null);
      return;
    }
    if (bundle.health === "conflict" || bundle.minBufferSec < 0) {
      const lateMin = Math.abs(Math.round(bundle.minBufferSec / 60));
      setValidityMsg(`⚠ Route issue — expected delay / negative buffer ~${lateMin} min.`);
      return;
    }
    setValidityMsg(
      `✓ Route valid — minimum buffer ${Math.round(bundle.minBufferSec / 60)} min (${bundle.health.replace("_", " ")}).`,
    );
  }

  async function patchStatus(status: string) {
    if (!selectedId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/route-bundles/${selectedId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Status failed");
      setDetail(json.bundle);
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Status failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveDriver() {
    if (!selectedId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/route-bundles/${selectedId}/driver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(driverForm),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Driver save failed");
      setDetail(json.bundle);
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Driver save failed");
    } finally {
      setBusy(false);
    }
  }

  async function recalculate() {
    if (!selectedId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/route-bundles/${selectedId}/recalculate`, { method: "POST" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Recalculate failed");
      setDetail(json.bundle);
      applyValidityFromBundle(json.bundle);
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Recalculate failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeOrder(orderId: string) {
    if (!selectedId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/route-bundles/${selectedId}/items/${encodeURIComponent(orderId)}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Remove failed");
      setDetail(json.bundle);
      applyValidityFromBundle(json.bundle);
      setPreviewOpportunity(null);
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Remove failed");
    } finally {
      setBusy(false);
    }
  }

  async function addOrder() {
    if (!selectedId || !addOrderId.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/route-bundles/${selectedId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: addOrderId.trim() }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Add failed");
      setDetail(json.bundle);
      applyValidityFromBundle(json.bundle);
      setAddOrderId("");
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Add failed");
    } finally {
      setBusy(false);
    }
  }

  async function reorderOrders(orderIds: string[]) {
    if (!selectedId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/route-bundles/${selectedId}/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Reorder failed");
      setDetail(json.bundle);
      applyValidityFromBundle(json.bundle);
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reorder failed");
    } finally {
      setBusy(false);
    }
  }

  async function acceptOpportunity(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/route-bundles/opportunities/${id}/accept`, { method: "POST" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Accept failed");
      setDetail(json.bundle);
      applyValidityFromBundle(json.bundle);
      setPreviewOpportunity(null);
      await Promise.all([loadList(), loadOpportunities()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Accept failed");
    } finally {
      setBusy(false);
    }
  }

  async function dismissOpportunity(id: string) {
    await fetch(`/api/route-bundles/opportunities/${id}/dismiss`, { method: "POST" });
    if (previewOpportunity?.id === id) setPreviewOpportunity(null);
    await loadOpportunities();
  }

  async function copyPhone() {
    if (!driverForm.driverPhone) return;
    try {
      await navigator.clipboard.writeText(driverForm.driverPhone);
      setBanner(`Copied ${driverForm.driverPhone}`);
    } catch {
      setError("Could not copy phone");
    }
  }

  return (
    <div className="flex h-[calc(100vh-7.5rem)] min-h-[560px] flex-col gap-3 px-3 pb-3 lg:px-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {(["suggested", "active", "all"] as TabKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition-colors",
                tab === key
                  ? "bg-[var(--so-accent-soft)] text-[var(--so-accent-strong)]"
                  : "bg-[var(--so-surface)] text-[var(--so-muted)] hover:bg-[var(--so-surface-hover)]",
              )}
            >
              {key}
              {key === "suggested" ? ` (${suggestedCount})` : key === "active" ? ` (${activeCount})` : ""}
            </button>
          ))}
          <span className="rounded-full bg-[var(--so-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--so-muted)]">
            Unassigned pool: {poolUnassigned}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="rounded-xl border border-[var(--so-border)] bg-[var(--so-surface)] px-3 py-2 text-xs font-semibold text-[var(--so-text)]"
          >
            Settings
          </button>
          <button
            type="button"
            disabled={generating || !googleConfigured}
            onClick={() => void onGenerate()}
            className="rounded-xl bg-[var(--so-accent)] px-3.5 py-2 text-xs font-bold text-white disabled:opacity-50"
          >
            {generating ? "Generating…" : "Generate routes"}
          </button>
        </div>
      </div>

      {!googleConfigured ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          GOOGLE_MAPS_API_KEY is not configured. Route Bundles require Google Routes for traffic-aware ETAs.
        </div>
      ) : null}
      {banner ? (
        <div className="rounded-xl border border-[var(--so-border)] bg-[var(--so-surface)] px-3 py-2 text-sm text-[var(--so-text)]">
          {banner}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>
      ) : null}

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[320px_minmax(0,1fr)_360px]">
        {/* Left list */}
        <aside className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-[var(--so-border)] bg-[var(--so-surface)]">
          <div className="border-b border-[var(--so-border)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--so-muted)]">
            Bundles ({filtered.length})
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-xl bg-[var(--so-surface-hover)]" />
              ))
            ) : filtered.length === 0 ? (
              <BundleEmptyState onGenerate={googleConfigured ? () => void onGenerate() : undefined} />
            ) : (
              filtered.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setSelectedId(b.id)}
                  className={cn(
                    "w-full rounded-xl border px-3 py-2.5 text-left transition-colors",
                    selectedId === b.id
                      ? "border-[var(--so-accent)] bg-[var(--so-accent-soft)]"
                      : "border-[var(--so-border)] hover:bg-[var(--so-surface-hover)]",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase text-[var(--so-muted)]">
                      {b.status.replaceAll("_", " ")}
                    </span>
                    <BundleHealthBadge health={b.health} />
                  </div>
                  <div className="mt-1 text-sm font-semibold text-[var(--so-text)]">
                    {b.items.length} pre-orders · {b.driverName || "Unassigned"}
                  </div>
                  <div className="mt-0.5 text-xs text-[var(--so-muted)]">
                    {fmtWindow(b.windowStart)} → {fmtWindow(b.windowEnd)}
                  </div>
                  <div className="mt-0.5 text-xs text-[var(--so-muted)]">
                    {(b.emptyDriveM / 1000).toFixed(1)} km empty · buffer {Math.round(b.minBufferSec / 60)} min
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Map */}
        <section className="relative min-h-[280px] h-full overflow-hidden rounded-2xl border border-[var(--so-border)] bg-[var(--so-surface)]">
          <RouteBundlesMap bundle={mapBundle} />
        </section>

        {/* Detail */}
        <aside className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-[var(--so-border)] bg-[var(--so-surface)]">
          {!detail ? (
            <div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-[var(--so-muted)]">
              Select a bundle to review map timing, call a driver, and confirm.
            </div>
          ) : (
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold uppercase text-[var(--so-muted)]">
                    {detail.status.replaceAll("_", " ")}
                  </div>
                  <div className="text-base font-bold text-[var(--so-text)]">
                    {detail.items.length} orders
                  </div>
                </div>
                <BundleHealthBadge health={detail.health} />
              </div>

              {detail.health === "conflict" || detail.health === "at_risk" ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                  Route needs attention — minimum buffer {Math.round(detail.minBufferSec / 60)} min. Recalculate
                  or edit orders before confirming with a driver.
                </div>
              ) : null}

              {detail.explainText ? (
                <div className="rounded-xl bg-[var(--so-accent-soft)]/60 px-3 py-2 text-sm text-[var(--so-text)]">
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[var(--so-muted)]">
                    Why this route?
                  </div>
                  {detail.explainText}
                </div>
              ) : null}

              {validityMsg ? (
                <div
                  className={cn(
                    "rounded-xl border px-3 py-2 text-xs font-semibold",
                    validityMsg.startsWith("✓")
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-amber-200 bg-amber-50 text-amber-900",
                  )}
                >
                  {validityMsg}
                </div>
              ) : null}

              {selectedOpps.map((opp) => (
                <RouteOpportunityBanner
                  key={opp.id}
                  opportunity={opp}
                  busy={busy}
                  onPreview={() => setPreviewOpportunity(opp)}
                  onAccept={() => void acceptOpportunity(opp.id)}
                  onDismiss={() => void dismissOpportunity(opp.id)}
                />
              ))}

              <BundleTimeline
                timeline={detail.latestSnapshot?.timeline ?? []}
                items={detail.items}
              />

              <div className="space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--so-muted)]">
                  Orders {detail.items.length >= 3 ? "(drag to reorder)" : ""}
                </div>
                <BundleOrderList
                  items={detail.items}
                  busy={busy}
                  onRemove={(orderId) => void removeOrder(orderId)}
                  onReorder={(orderIds) => void reorderOrders(orderIds)}
                />
                <div className="flex gap-2">
                  <input
                    value={addOrderId}
                    onChange={(e) => setAddOrderId(e.target.value)}
                    placeholder="Order ID to add"
                    className="min-w-0 flex-1 rounded-lg border border-[var(--so-border)] bg-white px-2 py-1.5 text-xs"
                  />
                  <button
                    type="button"
                    disabled={busy || !addOrderId.trim()}
                    onClick={() => void addOrder()}
                    className="rounded-lg bg-[var(--so-accent-soft)] px-2.5 py-1.5 text-xs font-bold text-[var(--so-accent-strong)] disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--so-muted)]">Driver</div>
                <input
                  value={driverForm.driverName}
                  onChange={(e) => setDriverForm((s) => ({ ...s, driverName: e.target.value }))}
                  placeholder="Driver name"
                  className="w-full rounded-lg border border-[var(--so-border)] px-2 py-1.5 text-xs"
                />
                <div className="flex gap-2">
                  <input
                    value={driverForm.driverPhone}
                    onChange={(e) => setDriverForm((s) => ({ ...s, driverPhone: e.target.value }))}
                    placeholder="Phone"
                    className="min-w-0 flex-1 rounded-lg border border-[var(--so-border)] px-2 py-1.5 text-xs"
                  />
                  {driverForm.driverPhone ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void copyPhone()}
                        className="rounded-lg border border-[var(--so-border)] px-2.5 py-1.5 text-xs font-semibold"
                      >
                        Copy
                      </button>
                      <a
                        href={`tel:${driverForm.driverPhone}`}
                        className="rounded-lg bg-[var(--so-accent)] px-2.5 py-1.5 text-xs font-bold text-white"
                      >
                        Call
                      </a>
                    </>
                  ) : null}
                </div>
                <input
                  value={driverForm.driverId}
                  onChange={(e) => setDriverForm((s) => ({ ...s, driverId: e.target.value }))}
                  placeholder="Driver ID"
                  className="w-full rounded-lg border border-[var(--so-border)] px-2 py-1.5 text-xs"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void saveDriver()}
                  className="w-full rounded-lg border border-[var(--so-border)] py-1.5 text-xs font-semibold"
                >
                  Save driver
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void patchStatus("reviewing")}
                  className="rounded-lg border border-[var(--so-border)] px-2.5 py-1.5 text-xs font-semibold"
                >
                  Review
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void patchStatus("driver_contacted")}
                  className="rounded-lg border border-[var(--so-border)] px-2.5 py-1.5 text-xs font-semibold"
                >
                  Mark contacted
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void patchStatus("accepted")}
                  className="rounded-lg bg-[var(--so-accent)] px-2.5 py-1.5 text-xs font-bold text-white"
                >
                  Confirm with driver
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void patchStatus("rejected")}
                  className="rounded-lg border border-[var(--so-border)] px-2.5 py-1.5 text-xs font-semibold"
                >
                  Reject
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void recalculate()}
                  className="rounded-lg border border-[var(--so-border)] px-2.5 py-1.5 text-xs font-semibold"
                >
                  Recalculate
                </button>
              </div>

              {events.length ? (
                <div className="space-y-1 border-t border-[var(--so-border)] pt-2">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--so-muted)]">History</div>
                  {events.slice(0, 8).map((ev) => (
                    <div key={ev.id} className="text-[11px] text-[var(--so-muted)]">
                      {new Date(ev.createdAt).toLocaleString()} · {ev.action}
                      {ev.actorName ? ` · ${ev.actorName}` : ""}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </aside>
      </div>

      <BundleSettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        canEdit={canEditSettings}
        onSaved={(next) => {
          setSettings(next);
          setSettingsOpen(false);
        }}
      />
    </div>
  );
}
