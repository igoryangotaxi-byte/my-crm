"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CirclePause,
  Loader2,
  MapPin,
  Play,
  Plus,
  Radar,
  Settings2,
  Sparkles,
  Target,
  Building2,
  Users,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { cn } from "@/lib/ui/cn";

type Overview = {
  leadsDiscoveredToday: number;
  qualifiedToday: number;
  pendingApproval: number;
  totalCandidates: number;
  dailyTarget: number;
  dailyTargetProgress: string;
  rejectedToday: number;
  duplicatesToday: number;
  sizeFailToday: number;
  insufficientDataToday: number;
  addedToPipelineToday: number;
  emailsSentToday: number;
  repliesToday: number;
  activeCampaigns: number;
  runningCampaignIds?: string[];
  activeCampaignList?: Array<{
    id: string;
    name: string;
    lastRunAt: string | null;
    lastError: string | null;
  }>;
  targetReached: boolean;
  groq: { used: number; limit: number; forceRulesOnly: boolean; enabled: boolean; model: string };
};

type Mode = "campaigns" | "advanced";
type WizardStep = 1 | 2 | 3;

type SegmentDraft = {
  summary: string;
  suggestedName: string;
  cities: string[];
  categories: string[];
  keywords: string[];
  mapsQueries: string[];
  excludedKeywords: string[];
  rulesSummary: string;
  qualificationRules: Array<{
    signalKey: string;
    name: string;
    enabled: boolean;
    weight: number;
    isDisqualify: boolean;
  }>;
  minTaxiScore: number;
};

function statusTone(status: string) {
  switch (status) {
    case "active":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "running":
      return "bg-sky-50 text-sky-700 ring-sky-200";
    case "paused":
      return "bg-amber-50 text-amber-800 ring-amber-200";
    case "error":
      return "bg-rose-50 text-rose-700 ring-rose-200";
    case "completed":
      return "bg-slate-100 text-slate-600 ring-slate-200";
    default:
      return "bg-[var(--so-surface-2)] text-[var(--so-muted)] ring-[var(--so-border)]";
  }
}

function campaignDisplayStatus(
  status: string,
  campaignId: string,
  runningCampaignId: string | null,
  runningFromServer?: string[],
): string {
  if (runningCampaignId === campaignId || runningFromServer?.includes(campaignId)) return "running";
  return status;
}

function statusLabel(
  status: string,
  t: (key: string) => string,
): string {
  if (
    (["draft", "active", "paused", "completed", "error", "running"] as const).includes(
      status as "draft",
    )
  ) {
    return t(`status.${status as "active"}`);
  }
  return status;
}

function Chip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-150",
        selected
          ? "border-[var(--so-accent)] bg-[var(--so-accent-soft)] text-[var(--so-accent)] shadow-[var(--so-shadow-xs)]"
          : "border-[var(--so-border)] bg-[var(--so-surface)] text-[var(--so-muted)] hover:border-[var(--so-border-strong)] hover:text-[var(--so-text)]",
      )}
    >
      {label}
    </button>
  );
}

export function LeadDiscoveryView() {
  const t = useTranslations("salesOperation.leadDiscovery");
  const toast = useToast();
  const confirm = useConfirm();

  const [mode, setMode] = useState<Mode>("campaigns");
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [runningCampaignId, setRunningCampaignId] = useState<string | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [campaigns, setCampaigns] = useState<Array<Record<string, unknown>>>([]);
  const [leads, setLeads] = useState<Array<Record<string, unknown>>>([]);
  const [rules, setRules] = useState<Array<Record<string, unknown>>>([]);
  const [logs, setLogs] = useState<Array<Record<string, unknown>>>([]);
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
  const [dailyTargetDraft, setDailyTargetDraft] = useState("10");
  const [savingTarget, setSavingTarget] = useState(false);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  const [campaignName, setCampaignName] = useState("");
  const [segmentPrompt, setSegmentPrompt] = useState("");
  const [segmentDraft, setSegmentDraft] = useState<SegmentDraft | null>(null);
  const [interpreting, setInterpreting] = useState(false);
  const [cities, setCities] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [mapsQueries, setMapsQueries] = useState<string[]>([]);
  const [excludedKeywords, setExcludedKeywords] = useState<string[]>([]);
  const [qualificationRules, setQualificationRules] = useState<SegmentDraft["qualificationRules"]>(
    [],
  );
  const [minTaxiScore, setMinTaxiScore] = useState(60);
  const [rulesSummary, setRulesSummary] = useState("");
  const [startImmediately, setStartImmediately] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [overviewRes, campaignsRes, leadsRes] = await Promise.all([
        fetch("/api/sales-operation/lead-discovery/overview", { cache: "no-store" }),
        fetch("/api/sales-operation/lead-discovery/campaigns", { cache: "no-store" }),
        fetch("/api/sales-operation/lead-discovery/leads", { cache: "no-store" }),
      ]);
      const [overviewData, campaignsData, leadsData] = await Promise.all([
        overviewRes.json(),
        campaignsRes.json(),
        leadsRes.json(),
      ]);
      if (!overviewRes.ok || !overviewData.ok) throw new Error(overviewData.error ?? "Failed");
      if (!campaignsRes.ok || !campaignsData.ok) throw new Error(campaignsData.error ?? "Failed");
      if (!leadsRes.ok || !leadsData.ok) throw new Error(leadsData.error ?? "Failed");
      setOverview(overviewData.overview);
      setCampaigns(campaignsData.campaigns ?? []);
      setLeads(leadsData.leads ?? []);
    } catch (err) {
      toast.error(t("error"), err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  const loadAdvanced = useCallback(async () => {
    try {
      const [rulesRes, logsRes, settingsRes] = await Promise.all([
        fetch("/api/sales-operation/lead-discovery/rules", { cache: "no-store" }),
        fetch("/api/sales-operation/lead-discovery/logs", { cache: "no-store" }),
        fetch("/api/sales-operation/lead-discovery/groq", { cache: "no-store" }),
      ]);
      const [rulesData, logsData, settingsData] = await Promise.all([
        rulesRes.json(),
        logsRes.json(),
        settingsRes.json(),
      ]);
      if (rulesData.ok) setRules(rulesData.rules ?? []);
      if (logsData.ok) setLogs(logsData.logs ?? []);
      if (settingsData.ok) {
        const next = (settingsData.settings ?? null) as Record<string, unknown> | null;
        setSettings(next);
        const target = Number(next?.dailyQualifiedTarget);
        if (Number.isFinite(target) && target > 0) setDailyTargetDraft(String(target));
      }
    } catch {
      /* advanced is optional */
    }
  }, []);

  useEffect(() => {
    if (overview?.dailyTarget != null) setDailyTargetDraft(String(overview.dailyTarget));
  }, [overview?.dailyTarget]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (mode === "advanced") void loadAdvanced();
  }, [mode, loadAdvanced]);

  const openWizard = () => {
    setWizardStep(1);
    setCampaignName("");
    setSegmentPrompt("");
    setSegmentDraft(null);
    setCities([]);
    setCategories([]);
    setKeywords([]);
    setMapsQueries([]);
    setExcludedKeywords([]);
    setQualificationRules([]);
    setMinTaxiScore(60);
    setRulesSummary("");
    setStartImmediately(true);
    setWizardOpen(true);
  };

  const suggestedName = useMemo(() => {
    if (segmentDraft?.suggestedName) return segmentDraft.suggestedName;
    const city = cities[0] ?? "Israel";
    const cat = categories[0] ?? "Companies";
    return `${cat} — ${city}`;
  }, [cities, categories, segmentDraft?.suggestedName]);

  const applyInterpretation = (interpretation: SegmentDraft) => {
    setSegmentDraft(interpretation);
    setCities(interpretation.cities);
    setCategories(interpretation.categories);
    setKeywords(interpretation.keywords);
    setMapsQueries(interpretation.mapsQueries);
    setExcludedKeywords(interpretation.excludedKeywords);
    setQualificationRules(interpretation.qualificationRules ?? []);
    setMinTaxiScore(interpretation.minTaxiScore ?? 60);
    setRulesSummary(interpretation.rulesSummary ?? "");
    if (!campaignName.trim()) setCampaignName(interpretation.suggestedName);
  };

  const interpretSegment = async (): Promise<boolean> => {
    const description = segmentPrompt.trim();
    if (description.length < 8) {
      toast.error(t("error"), t("wizard.segmentTooShort"));
      return false;
    }
    setInterpreting(true);
    try {
      const res = await fetch("/api/sales-operation/lead-discovery/campaigns/interpret-segment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed");
      applyInterpretation(data.interpretation as SegmentDraft);
      if (typeof data.warning === "string" && data.warning) {
        toast.error(t("wizard.groqFallbackTitle"), data.warning);
      } else if (data.source === "heuristic") {
        toast.success(t("wizard.heuristicOk"));
      }
      return true;
    } catch (err) {
      toast.error(t("error"), err instanceof Error ? err.message : "Error");
      return false;
    } finally {
      setInterpreting(false);
    }
  };

  const createCampaign = async () => {
    setBusy(true);
    try {
      const name = campaignName.trim() || suggestedName;
      const res = await fetch("/api/sales-operation/lead-discovery/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: segmentPrompt.trim() || null,
          cities,
          categories,
          keywords,
          mapsQueries,
          excludedKeywords,
          qualificationRules,
          minTaxiScore,
          status: "draft",
          manualApproval: true,
          autoAddToPipeline: false,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed");

      const campaignId = String(data.campaign?.id ?? "");
      toast.success(t("campaignCreated"));
      setWizardOpen(false);
      setMode("campaigns");
      if (campaignId) setSelectedCampaignId(campaignId);
      await loadAll();

      if (startImmediately && campaignId) {
        toast.success(t("runStarted"));
        void runCampaign(campaignId, { quiet: true });
      }
    } catch (err) {
      toast.error(t("error"), err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const runCampaign = async (id: string, opts?: { quiet?: boolean }) => {
    setBusy(true);
    setRunningCampaignId(id);
    try {
      const res = await fetch(`/api/sales-operation/lead-discovery/campaigns/${id}?action=run`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed");
      if (!opts?.quiet) {
        toast.success(
          t("runComplete"),
          t("runCompleteDetail", {
            qualified: data.result?.qualified ?? 0,
            added: data.result?.addedToPipeline ?? 0,
          }),
        );
      }
      const runErrors = Array.isArray(data.result?.errors) ? data.result.errors : [];
      const visibleErrors = runErrors.filter(
        (e: unknown) => !/rate limit|tokens per day|TPD|Groq daily token/i.test(String(e)),
      );
      if (visibleErrors.length) {
        toast.error(t("error"), String(visibleErrors[0]).slice(0, 220));
      }
      if (!opts?.quiet && (data.result?.qualified ?? 0) === 0 && !runErrors.length) {
        toast.error(t("error"), t("noCandidatesSaved"));
      }
      await loadAll();
      setSelectedCampaignId(id);
      setMode("campaigns");
    } catch (err) {
      toast.error(t("error"), err instanceof Error ? err.message : "Error");
      await loadAll();
    } finally {
      setRunningCampaignId(null);
      setBusy(false);
    }
  };

  const setCampaignAction = async (id: string, action: "start" | "stop") => {
    if (action !== "stop") setBusy(true);
    try {
      const res = await fetch(`/api/sales-operation/lead-discovery/campaigns/${id}?action=${action}`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed");
      toast.success(action === "stop" ? t("stopped") : t("started"));
      if (action === "stop") setRunningCampaignId(null);
      await loadAll();
      // Activate immediately runs Find leads for THIS campaign only.
      if (action === "start" && data.shouldRun) {
        toast.success(t("runStarted"));
        void runCampaign(id, { quiet: true });
        return;
      }
    } catch (err) {
      toast.error(t("error"), err instanceof Error ? err.message : "Error");
    } finally {
      if (action !== "stop") setBusy(false);
    }
  };

  const deleteCampaign = async (id: string, name: string) => {
    const ok = await confirm({
      title: t("deleteConfirmTitle"),
      description: t("deleteConfirmDesc", { name }),
      confirmLabel: t("delete"),
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/sales-operation/lead-discovery/campaigns/${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed");
      toast.success(t("deleted"));
      if (selectedCampaignId === id) setSelectedCampaignId(null);
      if (runningCampaignId === id) setRunningCampaignId(null);
      await loadAll();
    } catch (err) {
      toast.error(t("error"), err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const saveDailyTarget = async () => {
    const value = Math.max(1, Math.min(500, Math.round(Number(dailyTargetDraft) || 10)));
    setSavingTarget(true);
    try {
      const res = await fetch("/api/sales-operation/lead-discovery/groq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dailyQualifiedTarget: value }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed");
      setDailyTargetDraft(String(value));
      toast.success(t("advanced.targetSaved"));
      await loadAll();
      await loadAdvanced();
    } catch (err) {
      toast.error(t("error"), err instanceof Error ? err.message : "Error");
    } finally {
      setSavingTarget(false);
    }
  };

  const approveLead = async (discoveryId: string) => {
    try {
      const res = await fetch("/api/sales-operation/lead-discovery/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discoveryId, action: "approve" }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed");
      toast.success(t("approved"));
      await loadAll();
    } catch (err) {
      toast.error(t("error"), err instanceof Error ? err.message : "Error");
    }
  };

  const selectedCampaign = useMemo(
    () => campaigns.find((c) => String(c.id) === selectedCampaignId) ?? null,
    [campaigns, selectedCampaignId],
  );

  const campaignLeadCounts = useMemo(() => {
    const counts = new Map<string, { total: number; pending: number }>();
    for (const l of leads) {
      const cid = typeof l.campaignId === "string" ? l.campaignId : "";
      if (!cid) continue;
      const cur = counts.get(cid) ?? { total: 0, pending: 0 };
      cur.total += 1;
      if (!l.approvedAt && String(l.qualificationStatus) !== "disqualified") {
        cur.pending += 1;
      }
      counts.set(cid, cur);
    }
    return counts;
  }, [leads]);

  const visibleLeads = useMemo(() => {
    if (selectedCampaignId) {
      return leads.filter((l) => String(l.campaignId) === selectedCampaignId);
    }
    return leads;
  }, [leads, selectedCampaignId]);

  const openCampaign = (id: string) => {
    setSelectedCampaignId(id);
    setMode("campaigns");
  };

  const closeCampaign = () => setSelectedCampaignId(null);

  const progressPct = overview
    ? Math.min(
        100,
        Math.round(
          ((overview.pendingApproval + overview.addedToPipelineToday) /
            Math.max(1, overview.dailyTarget)) *
            100,
        ),
      )
    : 0;

  const modes: Array<{ id: Mode; label: string; icon: ReactNode }> = [
    { id: "campaigns", label: t("modes.campaigns"), icon: <Radar className="h-3.5 w-3.5" /> },
    { id: "advanced", label: t("modes.advanced"), icon: <Settings2 className="h-3.5 w-3.5" /> },
  ];

  const renderLeadCard = (l: Record<string, unknown>) => {
    const approved = Boolean(l.approvedAt);
    const name = String(l.companyName ?? l.domain ?? l.website ?? l.id);
    const signals = Array.isArray(l.confirmedSignals)
      ? (l.confirmedSignals as Array<{ signal: string }>).slice(0, 3)
      : [];
    const enrichment =
      l.enrichment && typeof l.enrichment === "object"
        ? (l.enrichment as Record<string, unknown>)
        : {};
    const explanation =
      typeof enrichment.explanation === "string" ? enrichment.explanation : null;
    return (
      <li
        key={String(l.id)}
        className="rounded-[var(--so-radius-lg)] border border-[var(--so-border)] bg-[var(--so-surface)] p-4 shadow-[var(--so-shadow-xs)] md:p-5"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base font-semibold text-[var(--so-text)]">{name}</h3>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
                  approved
                    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                    : "bg-amber-50 text-amber-800 ring-amber-200",
                )}
              >
                {approved ? t("leadState.inPipeline") : t("leadState.pending")}
              </span>
              <span className="rounded-full bg-[var(--so-accent-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--so-accent)]">
                {t("col.score")} {String(l.taxiPotentialScore)}
              </span>
            </div>
            <p className="text-xs text-[var(--so-muted)]">
              {[l.city, l.googleCategory, l.employeeSizeEstimate]
                .filter(Boolean)
                .map(String)
                .join(" · ")}
              {l.employeeSizeConfidence ? ` (${String(l.employeeSizeConfidence)})` : ""}
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--so-muted)]">
              {l.email ? <span>{String(l.email)}</span> : null}
              {l.phone ? <span>{String(l.phone)}</span> : null}
              {l.website ? (
                <a
                  href={
                    String(l.website).startsWith("http")
                      ? String(l.website)
                      : `https://${l.website}`
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-[var(--so-accent)]"
                >
                  {String(l.domain ?? l.website)}
                </a>
              ) : null}
            </div>
            {l.address ? (
              <p className="flex items-start gap-1 text-xs text-[var(--so-muted-2)]">
                <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                {String(l.address)}
              </p>
            ) : null}
            {explanation ? (
              <p className="line-clamp-2 text-xs leading-relaxed text-[var(--so-text)]">
                {explanation}
              </p>
            ) : null}
            {signals.length ? (
              <div className="flex flex-wrap gap-1">
                {signals.map((s) => (
                  <span
                    key={s.signal}
                    className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700"
                  >
                    {s.signal}
                  </span>
                ))}
              </div>
            ) : null}
            {l.emailPersonalisationLine ? (
              <p className="rounded-[8px] bg-[var(--so-surface-2)] px-2.5 py-1.5 text-[11px] text-[var(--so-muted)]">
                {String(l.emailPersonalisationLine)}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {!approved && String(l.qualificationStatus) !== "disqualified" ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    void fetch("/api/sales-operation/lead-discovery/leads", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        discoveryId: l.id,
                        action: "disqualify",
                      }),
                    }).then(() => loadAll())
                  }
                >
                  {t("reject")}
                </Button>
                <Button type="button" size="sm" onClick={() => void approveLead(String(l.id))}>
                  {t("approve")}
                </Button>
              </>
            ) : approved ? (
              <span className="text-xs font-semibold text-emerald-700">
                {t("leadState.approvedHint")}
              </span>
            ) : null}
          </div>
        </div>
      </li>
    );
  };

  return (
    <div className="relative min-h-[70vh] overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(ellipse_at_top,_rgba(255,45,45,0.07),_transparent_55%)]"
      />

      <div className="relative mx-auto max-w-5xl space-y-6 p-4 md:p-6">
        {loading && !overview ? (
          <div className="space-y-3">
            <Skeleton className="h-28 w-full rounded-[var(--so-radius-lg)]" />
            <Skeleton className="h-40 w-full rounded-[var(--so-radius-lg)]" />
          </div>
        ) : (
          <>
            {overview ? (
              <section className="space-y-3">
                <div className="overflow-hidden rounded-[var(--so-radius-lg)] border border-[var(--so-border)] bg-[var(--so-surface)] shadow-[var(--so-shadow-sm)]">
                  <div className="grid gap-0 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      {
                        icon: <Users className="h-3.5 w-3.5" />,
                        label: t("kpi.pending"),
                        value: overview.pendingApproval ?? 0,
                        hint: t("kpi.pendingHint"),
                      },
                      {
                        icon: <Building2 className="h-3.5 w-3.5" />,
                        label: t("kpi.pipeline"),
                        value: overview.addedToPipelineToday,
                        hint: t("kpi.pipelineHint"),
                      },
                      {
                        icon: <Radar className="h-3.5 w-3.5" />,
                        label: t("kpi.activeCampaigns"),
                        value: overview.activeCampaigns,
                        hint: t("kpi.activeHint"),
                      },
                      {
                        icon: <Sparkles className="h-3.5 w-3.5" />,
                        label: t("kpi.qualified"),
                        value: overview.qualifiedToday,
                        hint: t("kpi.qualifiedHint"),
                      },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="border-b border-[var(--so-border)] p-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"
                      >
                        <div className="flex items-center gap-2 text-xs font-semibold text-[var(--so-muted)]">
                          {item.icon}
                          {item.label}
                        </div>
                        <p className="mt-2 text-2xl font-semibold tracking-tight text-[var(--so-text)]">
                          {item.value}
                        </p>
                        <p className="mt-1 text-[11px] text-[var(--so-muted-2)]">{item.hint}</p>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-[var(--so-border)] px-4 py-3">
                    <div className="flex items-center justify-between gap-3 text-xs text-[var(--so-muted)]">
                      <span className="inline-flex items-center gap-1.5 font-semibold">
                        <Target className="h-3.5 w-3.5 text-[var(--so-accent)]" />
                        {t("dailyTarget")}
                      </span>
                      <span>
                        {overview.pendingApproval + overview.addedToPipelineToday} /{" "}
                        {overview.dailyTarget}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--so-surface-2)]">
                      <div
                        className="h-full rounded-full bg-[var(--so-accent)] transition-all duration-500 ease-out"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>
                </div>

                {overview.activeCampaignList?.length ? (
                  <div className="rounded-[var(--so-radius)] border border-[var(--so-border)] bg-[var(--so-surface)] p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--so-muted)]">
                      {t("dashboard.activeNow")}
                    </p>
                    <ul className="mt-2 space-y-2">
                      {overview.activeCampaignList.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            className="w-full rounded-[10px] border border-[var(--so-border)] px-3 py-2 text-left transition-colors hover:bg-[var(--so-surface-hover)]"
                            onClick={() => openCampaign(c.id)}
                          >
                            <p className="truncate text-sm font-semibold text-[var(--so-text)]">
                              {c.name}
                            </p>
                            <p className="mt-0.5 text-[11px] text-[var(--so-muted)]">
                              {c.lastRunAt
                                ? t("dashboard.lastRun", {
                                    time: new Date(c.lastRunAt).toLocaleString(),
                                  })
                                : t("dashboard.neverRun")}
                              {c.lastError ? ` · ${c.lastError.slice(0, 80)}` : ""}
                            </p>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </section>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="inline-flex items-center gap-1 rounded-[12px] border border-[var(--so-border)] bg-[var(--so-surface)] p-1 shadow-[var(--so-shadow-xs)]">
                {modes.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setMode(m.id);
                      if (m.id !== "campaigns") setSelectedCampaignId(null);
                    }}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-[10px] px-3.5 py-2 text-sm font-semibold transition-all",
                      mode === m.id
                        ? "bg-[var(--so-text)] text-white shadow-[var(--so-shadow-sm)]"
                        : "text-[var(--so-muted)] hover:text-[var(--so-text)]",
                    )}
                  >
                    {m.icon}
                    {m.label}
                  </button>
                ))}
              </div>
              <Button type="button" leftIcon={<Plus className="h-4 w-4" />} onClick={openWizard}>
                {t("newCampaign")}
              </Button>
            </div>

            {mode === "campaigns" && selectedCampaign ? (
              <section className="space-y-4">
                <div className="rounded-[var(--so-radius-lg)] border border-[var(--so-border)] bg-[var(--so-surface)] p-4 shadow-[var(--so-shadow-sm)] md:p-5">
                  <button
                    type="button"
                    onClick={closeCampaign}
                    className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-[var(--so-muted)] hover:text-[var(--so-text)]"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    {t("backToCampaigns")}
                  </button>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl font-semibold tracking-tight text-[var(--so-text)]">
                          {String(selectedCampaign.name)}
                        </h2>
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
                            statusTone(
                              campaignDisplayStatus(
                                String(selectedCampaign.status),
                                String(selectedCampaign.id),
                                runningCampaignId,
                                overview?.runningCampaignIds,
                              ),
                            ),
                          )}
                        >
                          {statusLabel(
                            campaignDisplayStatus(
                              String(selectedCampaign.status),
                              String(selectedCampaign.id),
                              runningCampaignId,
                              overview?.runningCampaignIds,
                            ),
                            t,
                          )}
                        </span>
                      </div>
                      <p className="text-sm text-[var(--so-muted)]">
                        {((selectedCampaign.cities as string[]) ?? []).join(", ")} ·{" "}
                        {((selectedCampaign.categories as string[]) ?? []).slice(0, 4).join(", ")}
                      </p>
                      {typeof selectedCampaign.description === "string" &&
                      selectedCampaign.description.trim() ? (
                        <p className="text-xs italic text-[var(--so-muted-2)]">
                          “{selectedCampaign.description.trim()}”
                        </p>
                      ) : null}
                      <p className="text-xs text-[var(--so-muted-2)]">
                        {t("campaignLeadsCount", {
                          total: visibleLeads.length,
                          pending: visibleLeads.filter(
                            (l) =>
                              !l.approvedAt &&
                              String(l.qualificationStatus) !== "disqualified",
                          ).length,
                        })}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {String(selectedCampaign.status) === "active" ||
                      runningCampaignId === String(selectedCampaign.id) ||
                      overview?.runningCampaignIds?.includes(String(selectedCampaign.id)) ? (
                        <Button
                          type="button"
                          size="md"
                          variant="destructive"
                          leftIcon={<CirclePause className="h-4 w-4" />}
                          onClick={() => void setCampaignAction(String(selectedCampaign.id), "stop")}
                        >
                          {runningCampaignId === String(selectedCampaign.id) ||
                          overview?.runningCampaignIds?.includes(String(selectedCampaign.id))
                            ? t("stopRun")
                            : t("stop")}
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="md"
                          variant="secondary"
                          leftIcon={<Play className="h-4 w-4" />}
                          disabled={Boolean(runningCampaignId)}
                          onClick={() => void setCampaignAction(String(selectedCampaign.id), "start")}
                        >
                          {t("start")}
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="md"
                        leftIcon={
                          runningCampaignId === String(selectedCampaign.id) ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Radar className="h-4 w-4" />
                          )
                        }
                        disabled={Boolean(runningCampaignId)}
                        onClick={() => void runCampaign(String(selectedCampaign.id))}
                      >
                        {runningCampaignId === String(selectedCampaign.id) ? t("running") : t("runNow")}
                      </Button>
                      <Button
                        type="button"
                        size="md"
                        variant="ghost"
                        leftIcon={<Trash2 className="h-4 w-4" />}
                        disabled={busy || Boolean(runningCampaignId)}
                        onClick={() =>
                          void deleteCampaign(
                            String(selectedCampaign.id),
                            String(selectedCampaign.name),
                          )
                        }
                      >
                        {t("delete")}
                      </Button>
                    </div>
                  </div>
                </div>

                {!visibleLeads.length ? (
                  <div className="rounded-[var(--so-radius-lg)] border border-dashed border-[var(--so-border-strong)] bg-[var(--so-surface)] px-4">
                    <EmptyState
                      icon={<Users className="h-5 w-5" />}
                      title={t("emptyCampaignLeadsTitle")}
                      description={t("emptyCampaignLeadsHint")}
                      action={
                        <Button
                          type="button"
                          disabled={Boolean(runningCampaignId)}
                          onClick={() => void runCampaign(String(selectedCampaign.id))}
                        >
                          {t("runNow")}
                        </Button>
                      }
                    />
                  </div>
                ) : (
                  <ul className="space-y-3">{visibleLeads.map(renderLeadCard)}</ul>
                )}
              </section>
            ) : null}

            {mode === "campaigns" && !selectedCampaign ? (
              <section className="space-y-4">
                {!campaigns.length ? (
                  <div className="rounded-[var(--so-radius-lg)] border border-dashed border-[var(--so-border-strong)] bg-[var(--so-surface)] px-4">
                    <EmptyState
                      icon={<Radar className="h-5 w-5" />}
                      title={t("empty.title")}
                      description={t("empty.description")}
                      action={
                        <Button type="button" leftIcon={<Plus className="h-4 w-4" />} onClick={openWizard}>
                          {t("empty.cta")}
                        </Button>
                      }
                    />
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {campaigns.map((c) => {
                      const status = campaignDisplayStatus(
                        String(c.status),
                        String(c.id),
                        runningCampaignId,
                        overview?.runningCampaignIds,
                      );
                      const isActive = String(c.status) === "active";
                      const isRunning = status === "running";
                      const cityList = (c.cities as string[]) ?? [];
                      const catList = (c.categories as string[]) ?? [];
                      const counts = campaignLeadCounts.get(String(c.id)) ?? { total: 0, pending: 0 };
                      return (
                        <li
                          key={String(c.id)}
                          className="group rounded-[var(--so-radius-lg)] border border-[var(--so-border)] bg-[var(--so-surface)] p-4 shadow-[var(--so-shadow-xs)] transition-shadow hover:shadow-[var(--so-shadow-md)] md:p-5"
                        >
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                            <button
                              type="button"
                              onClick={() => openCampaign(String(c.id))}
                              className="min-w-0 flex-1 space-y-2 text-left"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <h2 className="truncate text-base font-semibold text-[var(--so-text)] group-hover:text-[var(--so-accent)]">
                                  {String(c.name)}
                                </h2>
                                <span
                                  className={cn(
                                    "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
                                    statusTone(status),
                                  )}
                                >
                                  {statusLabel(status, t)}
                                </span>
                                <ChevronRight className="h-4 w-4 text-[var(--so-muted-2)] opacity-0 transition-opacity group-hover:opacity-100" />
                              </div>
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--so-muted)]">
                                <span className="inline-flex items-center gap-1">
                                  <MapPin className="h-3 w-3" />
                                  {cityList.slice(0, 3).join(", ")}
                                  {cityList.length > 3 ? ` +${cityList.length - 3}` : ""}
                                </span>
                                <span className="text-[var(--so-border-strong)]">·</span>
                                <span>{catList.slice(0, 2).join(", ")}</span>
                                <span className="text-[var(--so-border-strong)]">·</span>
                                <span>
                                  {t("campaignLeadsShort", {
                                    total: counts.total,
                                    pending: counts.pending,
                                  })}
                                </span>
                              </div>
                              <p className="text-xs text-[var(--so-muted-2)]">{t("openCampaignHint")}</p>
                            </button>
                            <div className="flex flex-wrap items-center gap-2">
                              {isActive || isRunning ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="destructive"
                                  leftIcon={<CirclePause className="h-3.5 w-3.5" />}
                                  onClick={() => void setCampaignAction(String(c.id), "stop")}
                                >
                                  {isRunning ? t("stopRun") : t("stop")}
                                </Button>
                              ) : (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  leftIcon={<Play className="h-3.5 w-3.5" />}
                                  disabled={Boolean(runningCampaignId)}
                                  onClick={() => void setCampaignAction(String(c.id), "start")}
                                >
                                  {t("start")}
                                </Button>
                              )}
                              <Button
                                type="button"
                                size="sm"
                                leftIcon={
                                  runningCampaignId === String(c.id) ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Radar className="h-3.5 w-3.5" />
                                  )
                                }
                                disabled={Boolean(runningCampaignId)}
                                onClick={() => void runCampaign(String(c.id))}
                              >
                                {runningCampaignId === String(c.id) ? t("running") : t("runNow")}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                                disabled={busy || isRunning}
                                onClick={() => void deleteCampaign(String(c.id), String(c.name))}
                              >
                                {t("delete")}
                              </Button>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            ) : null}

            {mode === "advanced" ? (
              <section className="space-y-4">
                <p className="text-sm text-[var(--so-muted)]">{t("advancedIntro")}</p>

                <div className="rounded-[var(--so-radius-lg)] border border-[var(--so-border)] bg-[var(--so-surface)] p-4 shadow-[var(--so-shadow-xs)]">
                  <h3 className="text-sm font-semibold text-[var(--so-text)]">{t("advanced.progress")}</h3>
                  <p className="mt-1 text-xs text-[var(--so-muted)]">{t("advanced.progressHint")}</p>
                  <div className="mt-3 flex flex-wrap items-end gap-3">
                    <label className="block min-w-[10rem] flex-1">
                      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--so-muted)]">
                        {t("advanced.dailyTargetLabel")}
                      </span>
                      <input
                        type="number"
                        min={1}
                        max={500}
                        value={dailyTargetDraft}
                        onChange={(e) => setDailyTargetDraft(e.target.value)}
                        className="w-full rounded-[10px] border border-[var(--so-border)] bg-[var(--so-surface-2)] px-3 py-2 text-sm text-[var(--so-text)] outline-none focus:border-[var(--so-accent)]"
                      />
                    </label>
                    <Button
                      type="button"
                      size="sm"
                      disabled={savingTarget || busy}
                      onClick={() => void saveDailyTarget()}
                    >
                      {savingTarget ? t("saving") : t("advanced.saveTarget")}
                    </Button>
                  </div>
                  {overview ? (
                    <p className="mt-3 text-xs text-[var(--so-muted-2)]">
                      {t("advanced.progressNow", {
                        current: overview.pendingApproval + overview.addedToPipelineToday,
                        target: overview.dailyTarget,
                      })}
                    </p>
                  ) : null}
                </div>

                <div className="rounded-[var(--so-radius-lg)] border border-[var(--so-border)] bg-[var(--so-surface)] p-4 shadow-[var(--so-shadow-xs)]">
                  <h3 className="text-sm font-semibold text-[var(--so-text)]">{t("advanced.rules")}</h3>
                  <p className="mt-1 text-xs text-[var(--so-muted)]">{t("advanced.rulesHint")}</p>
                  <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto">
                    {rules.map((r) => (
                      <li
                        key={String(r.id)}
                        className="flex items-center justify-between gap-3 rounded-[10px] border border-[var(--so-border)] px-3 py-2 text-sm"
                      >
                        <span className="truncate text-[var(--so-text)]">{String(r.name)}</span>
                        <label className="flex shrink-0 items-center gap-2 text-xs text-[var(--so-muted)]">
                          <input
                            type="checkbox"
                            defaultChecked={Boolean(r.enabled)}
                            onChange={(e) =>
                              void fetch("/api/sales-operation/lead-discovery/rules", {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ id: r.id, enabled: e.target.checked }),
                              })
                            }
                          />
                          {t("enabled")}
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-[var(--so-radius-lg)] border border-[var(--so-border)] bg-[var(--so-surface)] p-4 shadow-[var(--so-shadow-xs)]">
                  <h3 className="text-sm font-semibold text-[var(--so-text)]">{t("advanced.ai")}</h3>
                  <p className="mt-1 text-xs text-[var(--so-muted)]">{t("keyHint")}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() =>
                        void fetch("/api/sales-operation/lead-discovery/groq", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ action: "test" }),
                        }).then(async (r) => {
                          const d = await r.json();
                          if (d.ok) toast.success(t("groqOk"));
                          else toast.error(t("groqFail"));
                        })
                      }
                    >
                      {t("testGroq")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        void fetch("/api/sales-operation/lead-discovery/groq", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ forceRulesOnly: true }),
                        }).then(() => loadAdvanced())
                      }
                    >
                      {t("forceRules")}
                    </Button>
                  </div>
                  {settings || overview?.groq ? (
                    <p className="mt-3 text-xs text-[var(--so-muted-2)]">
                      Groq ·{" "}
                      {String(
                        settings?.groqModel ?? overview?.groq.model ?? "—",
                      )}{" "}
                      · {String(settings?.groqRequestsUsedToday ?? overview?.groq.used ?? 0)}/
                      {String(settings?.groqDailyRequestLimit ?? overview?.groq.limit ?? "—")}
                    </p>
                  ) : null}
                </div>

                <div className="rounded-[var(--so-radius-lg)] border border-[var(--so-border)] bg-[var(--so-surface)] p-4 shadow-[var(--so-shadow-xs)]">
                  <h3 className="text-sm font-semibold text-[var(--so-text)]">{t("advanced.activity")}</h3>
                  <ul className="mt-3 max-h-56 space-y-1.5 overflow-y-auto text-xs">
                    {logs.slice(0, 40).map((l) => (
                      <li key={String(l.id)} className="rounded-md bg-[var(--so-surface-2)] px-2.5 py-1.5">
                        <span className="font-semibold text-[var(--so-text)]">{String(l.event)}</span>
                        <span className="text-[var(--so-muted)]"> — {String(l.message)}</span>
                      </li>
                    ))}
                    {!logs.length ? (
                      <li className="text-[var(--so-muted)]">{t("advanced.noActivity")}</li>
                    ) : null}
                  </ul>
                </div>
              </section>
            ) : null}
          </>
        )}
      </div>

      <Modal
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        title={t("wizard.title")}
        description={t(`wizard.step${wizardStep}Desc`)}
        className="max-w-xl"
      >
        <div className="space-y-5">
          <div className="flex items-center gap-2">
            {([1, 2, 3] as WizardStep[]).map((step) => (
              <div key={step} className="flex flex-1 items-center gap-2">
                <div
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
                    wizardStep === step
                      ? "bg-[var(--so-accent)] text-white"
                      : wizardStep > step
                        ? "bg-emerald-500 text-white"
                        : "bg-[var(--so-surface-2)] text-[var(--so-muted)]",
                  )}
                >
                  {wizardStep > step ? <Check className="h-3.5 w-3.5" /> : step}
                </div>
                <span
                  className={cn(
                    "hidden text-xs font-semibold sm:inline",
                    wizardStep === step ? "text-[var(--so-text)]" : "text-[var(--so-muted)]",
                  )}
                >
                  {t(`wizard.step${step}`)}
                </span>
                {step < 3 ? <div className="hidden h-px flex-1 bg-[var(--so-border)] sm:block" /> : null}
              </div>
            ))}
          </div>

          {wizardStep === 1 ? (
            <div className="space-y-3">
              <p className="text-sm font-medium text-[var(--so-text)]">{t("wizard.describeSegment")}</p>
              <textarea
                className="crm-input min-h-[120px] w-full resize-y px-3 py-2.5 text-sm leading-relaxed"
                placeholder={t("wizard.segmentPlaceholder")}
                value={segmentPrompt}
                onChange={(e) => setSegmentPrompt(e.target.value)}
                maxLength={2000}
              />
              <p className="text-xs text-[var(--so-muted)]">{t("wizard.segmentHint")}</p>
              <div className="flex flex-wrap gap-2">
                {[
                  t("wizard.example1"),
                  t("wizard.example2"),
                  t("wizard.example3"),
                ].map((example) => (
                  <button
                    key={example}
                    type="button"
                    className="rounded-full border border-[var(--so-border)] bg-[var(--so-surface-2)] px-3 py-1.5 text-left text-[11px] font-medium text-[var(--so-muted)] transition-colors hover:border-[var(--so-border-strong)] hover:text-[var(--so-text)]"
                    onClick={() => setSegmentPrompt(example)}
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {wizardStep === 2 ? (
            <div className="space-y-4">
              {segmentDraft?.summary ? (
                <div className="rounded-[12px] border border-[var(--so-border)] bg-[var(--so-surface-2)] p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--so-muted)]">
                    {t("wizard.groqSummary")}
                  </p>
                  <p className="mt-1 text-sm text-[var(--so-text)]">{segmentDraft.summary}</p>
                </div>
              ) : null}

              <div className="space-y-2">
                <p className="text-sm font-medium text-[var(--so-text)]">{t("wizard.pickCities")}</p>
                <div className="flex flex-wrap gap-2">
                  {cities.map((city) => (
                    <Chip
                      key={city}
                      label={city}
                      selected
                      onClick={() =>
                        setCities((prev) => (prev.length <= 1 ? prev : prev.filter((c) => c !== city)))
                      }
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-[var(--so-text)]">{t("wizard.pickCategory")}</p>
                <div className="flex flex-wrap gap-2">
                  {categories.map((cat) => (
                    <Chip
                      key={cat}
                      label={cat}
                      selected
                      onClick={() =>
                        setCategories((prev) =>
                          prev.length <= 1 ? prev : prev.filter((c) => c !== cat),
                        )
                      }
                    />
                  ))}
                </div>
              </div>

              {keywords.length ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-[var(--so-text)]">{t("wizard.keywords")}</p>
                  <div className="flex flex-wrap gap-2">
                    {keywords.map((kw) => (
                      <Chip
                        key={kw}
                        label={kw}
                        selected
                        onClick={() => setKeywords((prev) => prev.filter((k) => k !== kw))}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="space-y-2">
                <p className="text-sm font-medium text-[var(--so-text)]">{t("wizard.rules")}</p>
                {rulesSummary ? (
                  <p className="text-xs text-[var(--so-muted)]">{rulesSummary}</p>
                ) : null}
                <p className="text-[11px] text-[var(--so-muted-2)]">
                  {t("wizard.minScore", { score: minTaxiScore })}
                </p>
                <ul className="max-h-40 space-y-1 overflow-y-auto rounded-[10px] border border-[var(--so-border)] bg-[var(--so-surface-2)] p-2">
                  {qualificationRules
                    .filter((r) => r.enabled && (r.weight > 0 || r.isDisqualify))
                    .slice(0, 12)
                    .map((r) => (
                      <li
                        key={r.signalKey}
                        className="flex items-center justify-between gap-2 px-1 py-0.5 text-xs text-[var(--so-text)]"
                      >
                        <span className="truncate">{r.name}</span>
                        <span className="shrink-0 font-semibold text-[var(--so-muted)]">
                          {r.isDisqualify ? t("wizard.disqualify") : `+${r.weight}`}
                        </span>
                      </li>
                    ))}
                  {!qualificationRules.some((r) => r.enabled && r.weight > 0) ? (
                    <li className="px-1 py-1 text-xs text-[var(--so-muted)]">{t("wizard.noRules")}</li>
                  ) : null}
                </ul>
              </div>

              <Button
                type="button"
                size="sm"
                variant="secondary"
                loading={interpreting}
                leftIcon={<Sparkles className="h-3.5 w-3.5" />}
                onClick={() => void interpretSegment()}
              >
                {t("wizard.reinterpret")}
              </Button>
            </div>
          ) : null}

          {wizardStep === 3 ? (
            <div className="space-y-4">
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-[var(--so-muted)]">{t("wizard.name")}</span>
                <input
                  className="crm-input h-11 w-full px-3 text-sm"
                  placeholder={suggestedName}
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                />
              </label>
              <div className="rounded-[12px] border border-[var(--so-border)] bg-[var(--so-surface-2)] p-3 text-sm">
                <p className="font-semibold text-[var(--so-text)]">{campaignName.trim() || suggestedName}</p>
                {segmentPrompt.trim() ? (
                  <p className="mt-1 text-xs italic text-[var(--so-muted)]">“{segmentPrompt.trim()}”</p>
                ) : null}
                <p className="mt-1 text-xs text-[var(--so-muted)]">
                  {categories.join(", ")} · {cities.join(", ")}
                </p>
              </div>
              <label className="flex cursor-pointer items-start gap-3 rounded-[12px] border border-[var(--so-border)] p-3">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={startImmediately}
                  onChange={(e) => setStartImmediately(e.target.checked)}
                />
                <span>
                  <span className="block text-sm font-semibold text-[var(--so-text)]">
                    {t("wizard.startNow")}
                  </span>
                  <span className="mt-0.5 block text-xs text-[var(--so-muted)]">
                    {t("wizard.startNowHint")}
                  </span>
                </span>
              </label>
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3 border-t border-[var(--so-border)] pt-4">
            <Button
              type="button"
              variant="ghost"
              disabled={wizardStep === 1 || busy || interpreting}
              onClick={() => setWizardStep((s) => (s > 1 ? ((s - 1) as WizardStep) : s))}
            >
              {t("wizard.back")}
            </Button>
            {wizardStep < 3 ? (
              <Button
                type="button"
                rightIcon={<ChevronRight className="h-4 w-4" />}
                loading={interpreting}
                disabled={
                  busy ||
                  (wizardStep === 1 && segmentPrompt.trim().length < 8) ||
                  (wizardStep === 2 && (cities.length === 0 || categories.length === 0))
                }
                onClick={() => {
                  void (async () => {
                    if (wizardStep === 1) {
                      const ok = await interpretSegment();
                      if (ok) setWizardStep(2);
                      return;
                    }
                    setWizardStep(3);
                  })();
                }}
              >
                {wizardStep === 1 ? t("wizard.interpret") : t("wizard.next")}
              </Button>
            ) : (
              <Button
                type="button"
                loading={busy}
                disabled={!cities.length || !categories.length}
                onClick={() => void createCampaign()}
              >
                {startImmediately ? t("wizard.createAndRun") : t("createCampaign")}
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
