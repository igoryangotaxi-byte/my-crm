"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Calendar,
  CheckSquare,
  Mail,
  StickyNote,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { ClientHealthBadge } from "@/components/sales-operation/ClientHealthBadge";
import { computeClientHealth } from "@/lib/sales-operation/client-health";
import { Button } from "@/components/ui/Button";
import { StatTile } from "@/components/ui/StatTile";
import {
  SalesClientManagerFields,
  type SalesClientManagerDraft,
} from "@/components/sales-operation/SalesClientManagerFields";
import { formatSalesDateTime } from "@/lib/sales-operation/display";
import { buildSalesOperationB2BClientTripsHref } from "@/lib/sales-operation/b2b-client-trips-href";
import type { SalesClientMetricsSummary } from "@/lib/sales-operation/client-overview-metrics";
import type { ClientActivityItem } from "@/lib/sales-operation/client-activity";
import type { B2BClientRegistryEntry } from "@/lib/sales-operation/manager-types";
import type { SalesClient, SalesLead, SalesSegment } from "@/lib/sales-operation/types";
import type { YangoSupabaseOrderMetric } from "@/types/crm";
import { cn } from "@/lib/ui/cn";
import { useToast } from "@/components/ui/Toast";

type SalesClientDetailViewProps = {
  clientId: string;
};

type ComposerKind = "task" | "note" | "mail" | "meeting";

type ProfileDraft = {
  fullName: string;
  email: string;
  phone: string;
  companyName: string;
};

type DealDraft = {
  legalName: string;
  website: string;
  segmentId: string;
  estimatedMonthlyPotential: string;
  estimatedMonthlyTrips: string;
  pricingProposal: string;
  pricingAmount: string;
  contractNumber: string;
  clientAddress: string;
  expectedCloseDate: string;
  generalNotes: string;
};

const emptyDealDraft = (): DealDraft => ({
  legalName: "",
  website: "",
  segmentId: "",
  estimatedMonthlyPotential: "",
  estimatedMonthlyTrips: "",
  pricingProposal: "",
  pricingAmount: "",
  contractNumber: "",
  clientAddress: "",
  expectedCloseDate: "",
  generalNotes: "",
});

function dealDraftFromLead(lead: SalesLead): DealDraft {
  return {
    legalName: lead.legalName ?? "",
    website: lead.website ?? "",
    segmentId: lead.segmentId ?? "",
    estimatedMonthlyPotential: lead.estimatedMonthlyPotential?.toString() ?? "",
    estimatedMonthlyTrips: lead.estimatedMonthlyTrips?.toString() ?? "",
    pricingProposal: lead.pricingProposal ?? "",
    pricingAmount: lead.pricingAmount?.toString() ?? "",
    contractNumber: lead.contractNumber ?? "",
    clientAddress: lead.clientAddress ?? "",
    expectedCloseDate: lead.expectedCloseDate?.slice(0, 10) ?? "",
    generalNotes: lead.generalNotes ?? "",
  };
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 90);
  const fmt = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };
  return { from: fmt(from), to: fmt(to) };
}

function defaultMeetingWindow() {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start);
  end.setHours(end.getHours() + 1);
  const toLocal = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  return { startsAt: toLocal(start), endsAt: toLocal(end) };
}

export function SalesClientDetailView({ clientId }: SalesClientDetailViewProps) {
  const t = useTranslations("salesOperation");
  const router = useRouter();
  const toast = useToast();
  const { users } = useAuth();
  const [client, setClient] = useState<SalesClient | null>(null);
  const [activity, setActivity] = useState<ClientActivityItem[]>([]);
  const [metrics, setMetrics] = useState<SalesClientMetricsSummary | null>(null);
  const [trips, setTrips] = useState<YangoSupabaseOrderMetric[]>([]);
  const [registry, setRegistry] = useState<B2BClientRegistryEntry[]>([]);
  const [managerDraft, setManagerDraft] = useState<SalesClientManagerDraft>({
    corpClientId: "",
    accountManagerUserId: "",
    salesManagerUserId: "",
  });
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>({
    fullName: "",
    email: "",
    phone: "",
    companyName: "",
  });
  const [dealDraft, setDealDraft] = useState<DealDraft>(emptyDealDraft);
  const [segments, setSegments] = useState<SalesSegment[]>([]);
  const [linkedLeadId, setLinkedLeadId] = useState<string | null>(null);
  const [range, setRange] = useState(defaultRange);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [composer, setComposer] = useState<ComposerKind>("note");
  const [composerText, setComposerText] = useState("");
  const [composerTitle, setComposerTitle] = useState("");
  const [composerDueAt, setComposerDueAt] = useState("");
  const [meetingWindow, setMeetingWindow] = useState(defaultMeetingWindow);
  const [mailTo, setMailTo] = useState("");
  const [mailSubject, setMailSubject] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadActivity = useCallback(async () => {
    const res = await fetch(`/api/sales-operation/clients/${clientId}/activity`, {
      cache: "no-store",
    });
    const data = (await res.json()) as { ok?: boolean; items?: ClientActivityItem[] };
    if (res.ok && data.ok) setActivity(data.items ?? []);
  }, [clientId]);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from: range.from, to: range.to });
      const [detailRes, registryRes, segmentsRes] = await Promise.all([
        fetch(`/api/sales-operation/clients/${clientId}?${params.toString()}`, {
          cache: "no-store",
        }),
        fetch("/api/sales-operation/b2b-clients/registry", { cache: "no-store" }),
        fetch("/api/sales-operation/config/segments", { cache: "no-store" }),
      ]);
      const detailData = (await detailRes.json()) as {
        ok?: boolean;
        client?: SalesClient;
        metrics?: SalesClientMetricsSummary | null;
        trips?: YangoSupabaseOrderMetric[];
        error?: string;
      };
      const registryData = (await registryRes.json()) as {
        ok?: boolean;
        registry?: B2BClientRegistryEntry[];
      };
      const segmentsData = (await segmentsRes.json()) as {
        ok?: boolean;
        segments?: SalesSegment[];
      };
      if (!detailRes.ok || !detailData.ok || !detailData.client) {
        throw new Error(detailData.error ?? "Failed to load client.");
      }
      setClient(detailData.client);
      setMetrics(detailData.metrics ?? null);
      setTrips(detailData.trips ?? []);
      if (registryRes.ok && registryData.ok) {
        setRegistry(registryData.registry ?? []);
      }
      if (segmentsRes.ok && segmentsData.ok) {
        setSegments(segmentsData.segments ?? []);
      }
      setManagerDraft({
        corpClientId: detailData.client.corpClientId ?? "",
        accountManagerUserId: detailData.client.accountManagerUserId ?? "",
        salesManagerUserId: detailData.client.salesManagerUserId ?? "",
      });
      setProfileDraft({
        fullName: detailData.client.fullName ?? "",
        email: detailData.client.email ?? "",
        phone: detailData.client.phone ?? "",
        companyName: detailData.client.companyName ?? "",
      });
      setMailTo(detailData.client.email ?? "");
      setLinkedLeadId(detailData.client.leadId);

      if (detailData.client.leadId) {
        const leadRes = await fetch(`/api/sales-operation/leads/${detailData.client.leadId}`, {
          cache: "no-store",
        });
        const leadData = (await leadRes.json()) as { ok?: boolean; lead?: SalesLead };
        if (leadRes.ok && leadData.ok && leadData.lead) {
          setDealDraft(dealDraftFromLead(leadData.lead));
        } else {
          setDealDraft(emptyDealDraft());
        }
      } else {
        setDealDraft(emptyDealDraft());
      }

      await loadActivity();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load client.");
    } finally {
      setLoading(false);
    }
  }, [clientId, range.from, range.to, loadActivity]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const health = useMemo(() => {
    if (!client?.corpClientId || !metrics) return null;
    return computeClientHealth({
      trips: metrics.trips,
      gmv: metrics.gmv,
      decouplingRate: metrics.decouplingRate,
      lastTripAt: trips[0]?.scheduledAt ?? null,
      signedAt: client.signedAt,
    });
  }, [client?.corpClientId, client?.signedAt, metrics, trips]);

  const saveProfile = async () => {
    if (!client) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/sales-operation/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: profileDraft.fullName.trim(),
          email: profileDraft.email.trim() || null,
          phone: profileDraft.phone.trim() || null,
          companyName: profileDraft.companyName.trim() || null,
          corpClientId: managerDraft.corpClientId.trim() || null,
          accountManagerUserId: managerDraft.accountManagerUserId || null,
          salesManagerUserId: managerDraft.salesManagerUserId || null,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; client?: SalesClient; error?: string };
      if (!res.ok || !data.ok || !data.client) {
        throw new Error(data.error ?? "Failed to save client.");
      }
      setClient(data.client);

      const leadId = linkedLeadId ?? data.client.leadId;
      if (leadId) {
        const potential = dealDraft.estimatedMonthlyPotential.trim()
          ? Number(dealDraft.estimatedMonthlyPotential)
          : null;
        const tripsEst = dealDraft.estimatedMonthlyTrips.trim()
          ? Number(dealDraft.estimatedMonthlyTrips)
          : null;
        const amount = dealDraft.pricingAmount.trim() ? Number(dealDraft.pricingAmount) : null;
        const leadRes = await fetch(`/api/sales-operation/leads/${leadId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            legalName: dealDraft.legalName.trim() || null,
            website: dealDraft.website.trim() || null,
            segmentId: dealDraft.segmentId || null,
            estimatedMonthlyPotential:
              potential !== null && Number.isFinite(potential) ? potential : null,
            estimatedMonthlyTrips:
              tripsEst !== null && Number.isFinite(tripsEst) ? tripsEst : null,
            pricingProposal: dealDraft.pricingProposal.trim() || null,
            pricingAmount: amount !== null && Number.isFinite(amount) ? amount : null,
            contractNumber: dealDraft.contractNumber.trim() || null,
            clientAddress: dealDraft.clientAddress.trim() || null,
            expectedCloseDate: dealDraft.expectedCloseDate || null,
            generalNotes: dealDraft.generalNotes.trim() || null,
          }),
        });
        const leadData = (await leadRes.json()) as { ok?: boolean; error?: string };
        if (!leadRes.ok || !leadData.ok) {
          throw new Error(leadData.error ?? "Failed to save deal fields.");
        }
      }

      toast.success(t("clientProfile.saved"));
      await loadDetail();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save client.");
    } finally {
      setSaving(false);
    }
  };

  const submitComposer = async () => {
    if (!client) return;
    setSubmitting(true);
    setError(null);
    try {
      if (composer === "mail") {
        if (!client.leadId) throw new Error("Linked lead is required to send email.");
        const res = await fetch(`/api/sales-operation/leads/${client.leadId}/email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: mailTo.trim() || client.email,
            subject: mailSubject.trim() || `Follow-up: ${client.companyName || client.fullName}`,
            body: composerText.trim(),
          }),
        });
        const data = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to send email.");
        toast.success(t("clientProfile.mailSent"));
      } else {
        const payload: Record<string, unknown> = { kind: composer };
        if (composer === "note") payload.body = composerText;
        if (composer === "task") {
          payload.title = composerTitle.trim() || composerText.trim().slice(0, 80) || "Task";
          payload.description = composerText;
          payload.dueAt = composerDueAt ? new Date(composerDueAt).toISOString() : null;
        }
        if (composer === "meeting") {
          payload.title = composerTitle.trim() || "Meeting";
          payload.description = composerText;
          payload.startsAt = new Date(meetingWindow.startsAt).toISOString();
          payload.endsAt = new Date(meetingWindow.endsAt).toISOString();
        }
        const res = await fetch(`/api/sales-operation/clients/${client.id}/activity`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = (await res.json()) as { ok?: boolean; error?: string; googleSynced?: boolean };
        if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to submit.");
        if (composer === "meeting" && data.googleSynced) {
          toast.success(t("clientProfile.meetingSynced"));
        } else {
          toast.success(t("clientProfile.activityAdded"));
        }
      }
      setComposerText("");
      setComposerTitle("");
      setComposerDueAt("");
      setMailSubject("");
      await loadActivity();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !client) {
    return <p className="crm-page text-sm text-muted">{t("loading")}</p>;
  }

  if (!client) {
    return (
      <section className="crm-page">
        <p className="text-sm text-rose-700">{error ?? "Client not found."}</p>
        <button
          type="button"
          onClick={() => router.push("/sales-operation/b2b-clients")}
          className="mt-3 text-sm font-semibold text-accent hover:underline"
        >
          ← {t("tab.b2bClients")}
        </button>
      </section>
    );
  }

  const bubbles: Array<{ kind: ComposerKind; label: string; icon: React.ReactNode }> = [
    { kind: "task", label: t("clientProfile.bubble.task"), icon: <CheckSquare className="h-3.5 w-3.5" /> },
    { kind: "note", label: t("clientProfile.bubble.note"), icon: <StickyNote className="h-3.5 w-3.5" /> },
    { kind: "mail", label: t("clientProfile.bubble.mail"), icon: <Mail className="h-3.5 w-3.5" /> },
    { kind: "meeting", label: t("clientProfile.bubble.meeting"), icon: <Calendar className="h-3.5 w-3.5" /> },
  ];

  return (
    <section className="crm-page !max-w-none !px-0 !py-0">
      <div className="flex h-[calc(100vh-4.5rem)] min-h-[36rem] flex-col border-t border-[var(--so-border)] lg:flex-row">
        {/* Left profile panel */}
        <aside className="flex w-full shrink-0 flex-col overflow-y-auto border-b border-[var(--so-border)] bg-[var(--so-surface)] lg:w-[22rem] lg:border-b-0 lg:border-r">
          <div className="border-b border-[var(--so-border)] px-4 py-4">
            <button
              type="button"
              onClick={() => router.push("/sales-operation/b2b-clients")}
              className="text-xs font-semibold text-[var(--so-muted)] hover:text-[var(--so-accent-strong)]"
            >
              ← {t("tab.b2bClients")}
            </button>
            <h1 className="mt-2 text-lg font-semibold text-[var(--so-text)]">
              {client.companyName || client.fullName}
            </h1>
            <p className="mt-0.5 text-xs text-[var(--so-muted)]">
              #{client.id.slice(0, 8)}
              {client.corpClientId ? ` · ${client.corpClientId}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {health ? <ClientHealthBadge status={health.status} score={health.score} /> : null}
              <span className="inline-flex rounded-full bg-[var(--so-surface-2)] px-2 py-0.5 text-[0.68rem] font-semibold text-[var(--so-muted)]">
                {t("signedAt")}: {formatSalesDateTime(client.signedAt)}
              </span>
            </div>
            {client.corpClientId ? (
              <Link
                href={buildSalesOperationB2BClientTripsHref({
                  corpClientId: client.corpClientId,
                  clientName: client.corpClientName ?? client.fullName,
                  from: range.from,
                  to: range.to,
                })}
                className="mt-2 inline-flex text-xs font-semibold text-[var(--so-accent-strong)] hover:underline"
              >
                {t("client.viewAllTrips")}
              </Link>
            ) : null}
          </div>

          <div className="space-y-4 px-4 py-4">
            <div className="space-y-2">
              {(
                [
                  ["fullName", t("field.fullName")],
                  ["companyName", t("field.company")],
                  ["email", t("field.email")],
                  ["phone", t("field.phone")],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="block text-sm">
                  <span className="crm-label">{label}</span>
                  <input
                    className="crm-input mt-1 h-9 w-full px-2.5 text-sm"
                    value={profileDraft[key]}
                    placeholder="…"
                    onChange={(event) =>
                      setProfileDraft((prev) => ({ ...prev, [key]: event.target.value }))
                    }
                  />
                </label>
              ))}
            </div>

            <div>
              <p className="crm-label mb-2">{t("manager.editManagers")}</p>
              <SalesClientManagerFields
                users={users}
                registry={registry}
                draft={managerDraft}
                onChange={setManagerDraft}
                pendingSalesManagerName={client.pendingSalesManagerName}
                assignedSalesManagerName={client.salesManagerName}
              />
            </div>

            {linkedLeadId ? (
              <div className="space-y-2 border-t border-[var(--so-border)] pt-4">
                <p className="crm-label">{t("clientProfile.dealSection")}</p>
                <label className="block text-sm">
                  <span className="crm-label">{t("field.legalName")}</span>
                  <input
                    className="crm-input mt-1 h-9 w-full px-2.5 text-sm"
                    value={dealDraft.legalName}
                    onChange={(event) =>
                      setDealDraft((prev) => ({ ...prev, legalName: event.target.value }))
                    }
                  />
                </label>
                <label className="block text-sm">
                  <span className="crm-label">{t("field.website")}</span>
                  <input
                    className="crm-input mt-1 h-9 w-full px-2.5 text-sm"
                    value={dealDraft.website}
                    onChange={(event) =>
                      setDealDraft((prev) => ({ ...prev, website: event.target.value }))
                    }
                  />
                </label>
                <label className="block text-sm">
                  <span className="crm-label">{t("field.segment")}</span>
                  <select
                    className="crm-input mt-1 h-9 w-full px-2.5 text-sm"
                    value={dealDraft.segmentId}
                    onChange={(event) =>
                      setDealDraft((prev) => ({ ...prev, segmentId: event.target.value }))
                    }
                  >
                    <option value="">—</option>
                    {segments
                      .filter((segment) => segment.isActive || segment.id === dealDraft.segmentId)
                      .map((segment) => (
                        <option key={segment.id} value={segment.id}>
                          {segment.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="crm-label">{t("field.potential")}</span>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    className="crm-input mt-1 h-9 w-full px-2.5 text-sm"
                    value={dealDraft.estimatedMonthlyPotential}
                    onChange={(event) =>
                      setDealDraft((prev) => ({
                        ...prev,
                        estimatedMonthlyPotential: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="block text-sm">
                  <span className="crm-label">{t("field.monthlyTrips")}</span>
                  <input
                    type="number"
                    min="0"
                    className="crm-input mt-1 h-9 w-full px-2.5 text-sm"
                    value={dealDraft.estimatedMonthlyTrips}
                    onChange={(event) =>
                      setDealDraft((prev) => ({
                        ...prev,
                        estimatedMonthlyTrips: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="block text-sm">
                  <span className="crm-label">{t("field.pricingProposal")}</span>
                  <textarea
                    className="crm-input mt-1 min-h-[64px] w-full px-2.5 py-2 text-sm"
                    value={dealDraft.pricingProposal}
                    onChange={(event) =>
                      setDealDraft((prev) => ({ ...prev, pricingProposal: event.target.value }))
                    }
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-sm">
                    <span className="crm-label">{t("field.pricingAmount")}</span>
                    <input
                      type="number"
                      min="0"
                      className="crm-input mt-1 h-9 w-full px-2.5 text-sm"
                      value={dealDraft.pricingAmount}
                      onChange={(event) =>
                        setDealDraft((prev) => ({ ...prev, pricingAmount: event.target.value }))
                      }
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="crm-label">{t("field.contractNumber")}</span>
                    <input
                      className="crm-input mt-1 h-9 w-full px-2.5 text-sm"
                      value={dealDraft.contractNumber}
                      onChange={(event) =>
                        setDealDraft((prev) => ({ ...prev, contractNumber: event.target.value }))
                      }
                    />
                  </label>
                </div>
                <label className="block text-sm">
                  <span className="crm-label">{t("field.address")}</span>
                  <input
                    className="crm-input mt-1 h-9 w-full px-2.5 text-sm"
                    value={dealDraft.clientAddress}
                    onChange={(event) =>
                      setDealDraft((prev) => ({ ...prev, clientAddress: event.target.value }))
                    }
                  />
                </label>
                <label className="block text-sm">
                  <span className="crm-label">{t("field.expectedCloseDate")}</span>
                  <input
                    type="date"
                    className="crm-input mt-1 h-9 w-full px-2.5 text-sm"
                    value={dealDraft.expectedCloseDate}
                    onChange={(event) =>
                      setDealDraft((prev) => ({ ...prev, expectedCloseDate: event.target.value }))
                    }
                  />
                </label>
                <label className="block text-sm">
                  <span className="crm-label">{t("field.generalNotes")}</span>
                  <textarea
                    className="crm-input mt-1 min-h-[64px] w-full px-2.5 py-2 text-sm"
                    value={dealDraft.generalNotes}
                    onChange={(event) =>
                      setDealDraft((prev) => ({ ...prev, generalNotes: event.target.value }))
                    }
                  />
                </label>
              </div>
            ) : null}

            <Button loading={saving} disabled={saving} onClick={() => void saveProfile()}>
              {t("saveLead")}
            </Button>

            {metrics ? (
              <div className="grid grid-cols-2 gap-2">
                <StatTile label={t("manager.trips")} value={metrics.trips.toLocaleString("en-US")} />
                <StatTile label={t("manager.gmv")} value={formatMoney(metrics.gmv)} />
                <StatTile
                  label={t("manager.decouplingRate")}
                  value={formatPercent(metrics.decouplingRate)}
                />
                <StatTile
                  label={t("manager.requests")}
                  value={metrics.requests.toLocaleString("en-US")}
                />
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <input
                type="date"
                value={range.from}
                onChange={(event) => setRange((prev) => ({ ...prev, from: event.target.value }))}
                className="crm-input h-8 px-2 text-xs"
              />
              <input
                type="date"
                value={range.to}
                onChange={(event) => setRange((prev) => ({ ...prev, to: event.target.value }))}
                className="crm-input h-8 px-2 text-xs"
              />
              <Button size="sm" variant="secondary" onClick={() => void loadDetail()}>
                {t("manager.refresh")}
              </Button>
            </div>
          </div>
        </aside>

        {/* Right activity + composer */}
        <div className="flex min-w-0 flex-1 flex-col bg-[var(--so-surface-2)]">
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {error ? <p className="text-sm text-rose-600">{error}</p> : null}
            {activity.length === 0 ? (
              <p className="py-10 text-center text-sm text-[var(--so-muted)]">
                {t("clientProfile.emptyActivity")}
              </p>
            ) : (
              activity.map((item) => (
                <article
                  key={item.id}
                  className="rounded-[12px] border border-[var(--so-border)] bg-[var(--so-surface)] px-3 py-2.5 shadow-[var(--so-shadow-xs)]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--so-muted)]">
                      {item.kind}
                    </p>
                    <time className="text-[0.65rem] text-[var(--so-muted-2)]">
                      {formatSalesDateTime(item.createdAt)}
                    </time>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-[var(--so-text)]">{item.title}</p>
                  {item.body ? (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--so-muted)]">
                      {item.body}
                    </p>
                  ) : null}
                </article>
              ))
            )}
          </div>

          <div className="border-t border-[var(--so-border)] bg-[var(--so-surface)] px-4 py-3">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {bubbles.map((bubble) => (
                <button
                  key={bubble.kind}
                  type="button"
                  onClick={() => setComposer(bubble.kind)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                    composer === bubble.kind
                      ? "bg-[var(--so-accent)] text-white"
                      : "bg-[var(--so-surface-2)] text-[var(--so-muted)] hover:text-[var(--so-text)]",
                  )}
                >
                  {bubble.icon}
                  {bubble.label}
                </button>
              ))}
            </div>

            {composer === "mail" ? (
              <div className="mb-2 grid gap-2 sm:grid-cols-2">
                <input
                  className="crm-input h-9 px-2.5 text-sm"
                  placeholder={t("clientProfile.mailTo")}
                  value={mailTo}
                  onChange={(event) => setMailTo(event.target.value)}
                />
                <input
                  className="crm-input h-9 px-2.5 text-sm"
                  placeholder={t("clientProfile.mailSubject")}
                  value={mailSubject}
                  onChange={(event) => setMailSubject(event.target.value)}
                />
              </div>
            ) : null}

            {composer === "task" || composer === "meeting" ? (
              <input
                className="crm-input mb-2 h-9 w-full px-2.5 text-sm"
                placeholder={t("clientProfile.titlePlaceholder")}
                value={composerTitle}
                onChange={(event) => setComposerTitle(event.target.value)}
              />
            ) : null}

            {composer === "task" ? (
              <input
                type="datetime-local"
                className="crm-input mb-2 h-9 w-full px-2.5 text-sm sm:w-auto"
                value={composerDueAt}
                onChange={(event) => setComposerDueAt(event.target.value)}
              />
            ) : null}

            {composer === "meeting" ? (
              <div className="mb-2 grid gap-2 sm:grid-cols-2">
                <input
                  type="datetime-local"
                  className="crm-input h-9 px-2.5 text-sm"
                  value={meetingWindow.startsAt}
                  onChange={(event) =>
                    setMeetingWindow((prev) => ({ ...prev, startsAt: event.target.value }))
                  }
                />
                <input
                  type="datetime-local"
                  className="crm-input h-9 px-2.5 text-sm"
                  value={meetingWindow.endsAt}
                  onChange={(event) =>
                    setMeetingWindow((prev) => ({ ...prev, endsAt: event.target.value }))
                  }
                />
              </div>
            ) : null}

            <textarea
              className="crm-input min-h-[72px] w-full px-3 py-2 text-sm"
              placeholder={t(`clientProfile.placeholder.${composer}`)}
              value={composerText}
              onChange={(event) => setComposerText(event.target.value)}
            />
            <div className="mt-2 flex justify-end">
              <Button
                size="sm"
                loading={submitting}
                disabled={
                  submitting ||
                  (composer === "note" && !composerText.trim()) ||
                  (composer === "task" && !composerText.trim() && !composerTitle.trim()) ||
                  (composer === "mail" && !composerText.trim()) ||
                  (composer === "meeting" && !composerTitle.trim() && !composerText.trim())
                }
                onClick={() => void submitComposer()}
              >
                {t("clientProfile.submit")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
