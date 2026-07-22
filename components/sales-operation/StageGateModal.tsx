"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Dialog";
import { getAccountManagerUserOptions, getPlatformStaffUserOptions } from "@/lib/sales-operation/crm-manager-users";
import { formatSalesStatus } from "@/lib/sales-operation/display";
import type { StageMissingField } from "@/lib/sales-operation/status-transitions";
import type { B2BClientRegistryEntry } from "@/lib/sales-operation/manager-types";
import type { SalesLead, SalesLeadStatus, UpdateSalesLeadInput } from "@/lib/sales-operation/types";

export type StageGateConfirmPayload = {
  fields: UpdateSalesLeadInput;
  accountManagerUserId?: string | null;
  accountManagerName?: string | null;
  followUpTask?: {
    title: string;
    description: string | null;
    dueAt: string | null;
    assignedToUserId: string | null;
    assignedToName: string | null;
  } | null;
  /** When contact is missing — create via contacts API before transition. */
  contact?: {
    fullName: string;
    email: string | null;
    mobilePhone: string | null;
  } | null;
};

export function StageGateModal({
  open,
  onOpenChange,
  lead,
  toStatus,
  missing,
  onConfirm,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: SalesLead | null;
  toStatus: SalesLeadStatus | null;
  missing: StageMissingField[];
  onConfirm: (payload: StageGateConfirmPayload) => Promise<void>;
  loading?: boolean;
}) {
  const t = useTranslations("salesOperation");
  const tg = useTranslations("salesOperation.stageGate");
  const { users, currentUser } = useAuth();
  const amOptions = useMemo(() => getAccountManagerUserOptions(users), [users]);
  const staffOptions = useMemo(() => getPlatformStaffUserOptions(users), [users]);

  const missingKeys = useMemo(() => new Set(missing.map((m) => m.key)), [missing]);

  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [potential, setPotential] = useState("");
  const [pricingProposal, setPricingProposal] = useState("");
  const [pricingAmount, setPricingAmount] = useState("");
  const [contractNumber, setContractNumber] = useState("");
  const [corpClientId, setCorpClientId] = useState("");
  const [accountManagerUserId, setAccountManagerUserId] = useState("");
  const [followUpTitle, setFollowUpTitle] = useState("Follow-up with client");
  const [followUpDescription, setFollowUpDescription] = useState("");
  const [followUpDue, setFollowUpDue] = useState("");
  const [followUpAssignee, setFollowUpAssignee] = useState("");
  const [registry, setRegistry] = useState<B2BClientRegistryEntry[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !lead) return;
    setContactName(lead.fullName || "");
    setContactEmail(lead.email || "");
    setContactPhone(lead.phone || "");
    setPotential(lead.estimatedMonthlyPotential?.toString() ?? "");
    setPricingProposal(lead.pricingProposal ?? "");
    setPricingAmount(lead.pricingAmount?.toString() ?? "");
    setContractNumber(lead.contractNumber ?? "");
    setCorpClientId(lead.corpClientId ?? "");
    setAccountManagerUserId("");
    setFollowUpTitle("Follow-up with client");
    setFollowUpDescription("");
    setFollowUpDue("");
    setFollowUpAssignee(currentUser?.id ?? lead.assignedManagerUserId ?? "");
    setLocalError(null);
  }, [open, lead, currentUser?.id]);

  useEffect(() => {
    if (!open || !missingKeys.has("contractOrClientId")) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/sales-operation/b2b-clients/registry", { cache: "no-store" });
        const data = (await res.json()) as {
          ok?: boolean;
          entries?: B2BClientRegistryEntry[];
          registry?: B2BClientRegistryEntry[];
        };
        if (!cancelled && data.ok) setRegistry(data.entries ?? data.registry ?? []);
      } catch {
        /* optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, missingKeys]);

  if (!lead || !toStatus) return null;

  const canSubmit = () => {
    if (missingKeys.has("contact") && !contactName.trim()) return false;
    if (missingKeys.has("contact") && !contactEmail.trim() && !contactPhone.trim()) return false;
    if (missingKeys.has("estimatedMonthlyPotential")) {
      const n = Number(potential);
      if (!Number.isFinite(n) || n <= 0) return false;
    }
    if (missingKeys.has("pricingProposal") && !pricingProposal.trim()) return false;
    if (missingKeys.has("followUpTask") && !followUpTitle.trim()) return false;
    if (missingKeys.has("contractOrClientId") && !contractNumber.trim() && !corpClientId.trim()) {
      return false;
    }
    if (missingKeys.has("accountManager") && !accountManagerUserId) return false;
    return true;
  };

  const handleConfirm = async () => {
    setLocalError(null);
    if (!canSubmit()) {
      setLocalError(tg("fillRequired"));
      return;
    }

    const fields: UpdateSalesLeadInput = {};
    if (missingKeys.has("estimatedMonthlyPotential")) {
      fields.estimatedMonthlyPotential = Number(potential);
    }
    if (missingKeys.has("pricingProposal")) {
      fields.pricingProposal = pricingProposal.trim();
      if (pricingAmount.trim()) {
        const amount = Number(pricingAmount);
        if (Number.isFinite(amount)) fields.pricingAmount = amount;
      }
    }
    if (missingKeys.has("contractOrClientId")) {
      if (contractNumber.trim()) fields.contractNumber = contractNumber.trim();
      if (corpClientId.trim()) fields.corpClientId = corpClientId.trim();
    }
    // Also patch lead contact fields as legacy fallback when creating contact.
    if (missingKeys.has("contact")) {
      fields.fullName = contactName.trim();
      fields.email = contactEmail.trim() || null;
      fields.phone = contactPhone.trim() || null;
    }

    const am = amOptions.find((u) => u.id === accountManagerUserId);
    const followAssignee = users.find((u) => u.id === followUpAssignee);

    await onConfirm({
      fields,
      accountManagerUserId: missingKeys.has("accountManager") ? accountManagerUserId : undefined,
      accountManagerName: missingKeys.has("accountManager") ? am?.name ?? null : undefined,
      followUpTask: missingKeys.has("followUpTask")
        ? {
            title: followUpTitle.trim(),
            description: followUpDescription.trim() || null,
            dueAt: followUpDue ? new Date(followUpDue).toISOString() : null,
            assignedToUserId: followUpAssignee || null,
            assignedToName: followAssignee?.name ?? null,
          }
        : toStatus === "negotiation"
          ? {
              title: followUpTitle.trim() || "Follow-up with client",
              description: followUpDescription.trim() || null,
              dueAt: followUpDue ? new Date(followUpDue).toISOString() : null,
              assignedToUserId: followUpAssignee || currentUser?.id || null,
              assignedToName: followAssignee?.name ?? currentUser?.name ?? null,
            }
          : null,
      contact: missingKeys.has("contact")
        ? {
            fullName: contactName.trim(),
            email: contactEmail.trim() || null,
            mobilePhone: contactPhone.trim() || null,
          }
        : null,
    });
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={tg("title", { status: formatSalesStatus(toStatus) })}
      description={tg("description")}
      className="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            {t("cancel")}
          </Button>
          <Button loading={loading} disabled={loading} onClick={() => void handleConfirm()}>
            {tg("confirm")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {missing.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {missing.map((item) => (
              <span
                key={item.key}
                className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800"
              >
                {item.label}
              </span>
            ))}
          </div>
        ) : null}

        {missingKeys.has("contact") ? (
          <div className="space-y-2 rounded-[12px] border border-[var(--so-border)] p-3">
            <p className="text-xs font-bold text-[var(--so-text)]">{tg("contactSection")}</p>
            <input
              className="crm-input h-9 w-full px-3 text-sm"
              placeholder={tg("contactName")}
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                className="crm-input h-9 w-full px-3 text-sm"
                placeholder={tg("contactEmail")}
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
              />
              <input
                className="crm-input h-9 w-full px-3 text-sm"
                placeholder={tg("contactPhone")}
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
              />
            </div>
          </div>
        ) : null}

        {missingKeys.has("estimatedMonthlyPotential") ? (
          <label className="block text-sm">
            <span className="crm-label">{tg("fields.estimatedMonthlyPotential")}</span>
            <input
              type="number"
              min={0}
              className="crm-input mt-1 h-10 w-full px-3 text-sm"
              value={potential}
              onChange={(e) => setPotential(e.target.value)}
            />
          </label>
        ) : null}

        {missingKeys.has("pricingProposal") ? (
          <div className="space-y-2">
            <label className="block text-sm">
              <span className="crm-label">{tg("fields.pricingProposal")}</span>
              <textarea
                className="crm-input mt-1 min-h-[88px] w-full px-3 py-2 text-sm"
                value={pricingProposal}
                onChange={(e) => setPricingProposal(e.target.value)}
                placeholder={tg("pricingPlaceholder")}
              />
            </label>
            <label className="block text-sm">
              <span className="crm-label">{tg("pricingAmount")}</span>
              <input
                type="number"
                min={0}
                className="crm-input mt-1 h-10 w-full px-3 text-sm"
                value={pricingAmount}
                onChange={(e) => setPricingAmount(e.target.value)}
              />
            </label>
          </div>
        ) : null}

        {missingKeys.has("followUpTask") ? (
          <div className="space-y-2 rounded-[12px] border border-[var(--so-border)] p-3">
            <p className="text-xs font-bold text-[var(--so-text)]">{tg("followUpSection")}</p>
            <input
              className="crm-input h-9 w-full px-3 text-sm"
              value={followUpTitle}
              onChange={(e) => setFollowUpTitle(e.target.value)}
            />
            <textarea
              className="crm-input min-h-[56px] w-full px-3 py-2 text-sm"
              value={followUpDescription}
              onChange={(e) => setFollowUpDescription(e.target.value)}
              placeholder={t("task.description")}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="datetime-local"
                className="crm-input h-9 w-full px-3 text-sm"
                value={followUpDue}
                onChange={(e) => setFollowUpDue(e.target.value)}
              />
              <select
                className="crm-input h-9 w-full px-3 text-sm"
                value={followUpAssignee}
                onChange={(e) => setFollowUpAssignee(e.target.value)}
              >
                {staffOptions.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : null}

        {missingKeys.has("contractOrClientId") ? (
          <div className="space-y-2 rounded-[12px] border border-[var(--so-border)] p-3">
            <p className="text-xs font-bold text-[var(--so-text)]">{tg("signedSection")}</p>
            <label className="block text-sm">
              <span className="crm-label">{tg("contractNumber")}</span>
              <input
                className="crm-input mt-1 h-9 w-full px-3 text-sm"
                value={contractNumber}
                onChange={(e) => setContractNumber(e.target.value)}
              />
            </label>
            <p className="text-center text-[11px] font-semibold text-[var(--so-muted-2)]">
              {tg("or")}
            </p>
            <label className="block text-sm">
              <span className="crm-label">{tg("corpClientId")}</span>
              <input
                className="crm-input mt-1 h-9 w-full px-3 text-sm"
                list="stage-gate-corp-ids"
                value={corpClientId}
                onChange={(e) => setCorpClientId(e.target.value)}
                placeholder={tg("corpClientPlaceholder")}
              />
              <datalist id="stage-gate-corp-ids">
                {registry.slice(0, 80).map((entry) => (
                  <option key={entry.corpClientId} value={entry.corpClientId}>
                    {entry.clientName ?? entry.corpClientId}
                  </option>
                ))}
              </datalist>
            </label>
          </div>
        ) : null}

        {missingKeys.has("accountManager") ? (
          <label className="block text-sm">
            <span className="crm-label">{tg("fields.accountManager")}</span>
            <select
              className="crm-input mt-1 h-10 w-full px-3 text-sm"
              value={accountManagerUserId}
              onChange={(e) => setAccountManagerUserId(e.target.value)}
            >
              <option value="">—</option>
              {amOptions.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {localError ? <p className="text-xs text-rose-600">{localError}</p> : null}
      </div>
    </Modal>
  );
}
