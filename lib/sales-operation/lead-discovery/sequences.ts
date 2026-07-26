import { sendLeadEmail } from "@/lib/sales-operation/email";
import { getSalesLeadById } from "@/lib/sales-operation/repository";
import {
  getLeadDiscovery,
  incrementDailyStat,
  listEmailSequences,
  writeDiscoveryLog,
  assignLeadStickers,
} from "@/lib/sales-operation/lead-discovery/repository";
import { getSupabaseAdminClient } from "@/lib/supabase";

function renderTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? "");
}

export async function enrollLeadInSequence(
  sequenceId: string,
  leadId: string,
  opts?: { approve?: boolean },
) {
  const supabase = getSupabaseAdminClient();
  const discovery = await getLeadDiscovery(leadId);
  if (discovery?.doNotContact) {
    throw new Error("Lead is marked Do Not Contact.");
  }

  const { data: existing } = await supabase
    .from("sales_email_sequence_enrollments")
    .select("id, status")
    .eq("lead_id", leadId)
    .in("status", ["pending_approval", "active", "paused"])
    .maybeSingle();
  if (existing) throw new Error("Lead already enrolled in an active sequence.");

  const sequences = await listEmailSequences();
  const sequence = sequences.find((s) => s.id === sequenceId);
  if (!sequence) throw new Error("Sequence not found.");

  const manual = sequence.manualApproval && !opts?.approve;
  const { data, error } = await supabase
    .from("sales_email_sequence_enrollments")
    .insert({
      sequence_id: sequenceId,
      lead_id: leadId,
      status: manual ? "pending_approval" : "active",
      current_step: 0,
      next_send_at: manual ? null : new Date().toISOString(),
      approved_at: manual ? null : new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to enroll.");

  await assignLeadStickers(leadId, ["email_sequence_active"], { reason: sequence.name });
  await writeDiscoveryLog({
    event: "sequence_started",
    message: `Enrolled in ${sequence.name}`,
    leadId,
  });
  return data;
}

export async function approveEnrollment(enrollmentId: string) {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("sales_email_sequence_enrollments")
    .update({
      status: "active",
      approved_at: new Date().toISOString(),
      next_send_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", enrollmentId);
  if (error) throw new Error(error.message);
}

export async function stopEnrollment(enrollmentId: string, reason: string) {
  const supabase = getSupabaseAdminClient();
  const status =
    reason === "replied"
      ? "replied"
      : reason === "bounced"
        ? "bounced"
        : reason === "unsubscribed"
          ? "unsubscribed"
          : "stopped";
  const { data } = await supabase
    .from("sales_email_sequence_enrollments")
    .update({
      status,
      stopped_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", enrollmentId)
    .select("lead_id")
    .maybeSingle();
  await supabase.from("sales_email_sequence_events").insert({
    enrollment_id: enrollmentId,
    event_type: reason,
  });
  if (data && reason === "replied") {
    await assignLeadStickers(String((data as { lead_id: string }).lead_id), ["replied"]);
    await incrementDailyStat("replies");
  }
}

export async function processDueSequenceSends(
  actor: { userId: string | null; name: string },
): Promise<{ sent: number; errors: string[] }> {
  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data: due, error } = await supabase
    .from("sales_email_sequence_enrollments")
    .select("*")
    .eq("status", "active")
    .lte("next_send_at", now)
    .limit(20);
  if (error) throw new Error(error.message);

  let sent = 0;
  const errors: string[] = [];
  const sequences = await listEmailSequences();

  for (const row of due ?? []) {
    const enrollment = row as Record<string, unknown>;
    const enrollmentId = String(enrollment.id);
    const leadId = String(enrollment.lead_id);
    const sequenceId = String(enrollment.sequence_id);
    const sequence = sequences.find((s) => s.id === sequenceId);
    if (!sequence) continue;

    const discovery = await getLeadDiscovery(leadId);
    if (discovery?.doNotContact && sequence.stopOnDnc) {
      await stopEnrollment(enrollmentId, "do_not_contact");
      continue;
    }

    const stepIndex = Number(enrollment.current_step ?? 0);
    const step = sequence.steps.find((s) => s.stepIndex === stepIndex);
    if (!step) {
      await supabase
        .from("sales_email_sequence_enrollments")
        .update({ status: "completed", updated_at: now })
        .eq("id", enrollmentId);
      continue;
    }

    try {
      const lead = await getSalesLeadById(leadId);
      if (!lead?.email) {
        errors.push(`Lead ${leadId} has no email`);
        continue;
      }
      const vars: Record<string, string> = {
        company_name: lead.companyName ?? lead.fullName,
        city: discovery?.city ?? "",
        category: discovery?.googleCategory ?? "",
        detected_signal: discovery?.confirmedSignals[0]?.signal ?? "",
        proposed_use_case: discovery?.recommendedUseCases[0] ?? "",
        employee_size: discovery?.employeeSizeEstimate ?? "",
        number_of_locations: "",
        contact_name: lead.fullName,
        sales_manager_name: lead.assignedManagerName ?? actor.name,
        email_personalisation_line: discovery?.emailPersonalisationLine ?? "",
      };

      await sendLeadEmail(
        leadId,
        {
          to: lead.email,
          subject: renderTemplate(step.subject, vars),
          body: renderTemplate(step.body, vars),
        },
        actor,
      );

      await assignLeadStickers(leadId, ["email_sent"]);
      await incrementDailyStat("emails_sent");
      await supabase.from("sales_email_sequence_events").insert({
        enrollment_id: enrollmentId,
        event_type: "email_sent",
        meta: { stepIndex },
      });

      const nextStep = stepIndex + 1;
      const next = sequence.steps.find((s) => s.stepIndex === nextStep);
      if (!next) {
        await supabase
          .from("sales_email_sequence_enrollments")
          .update({ status: "completed", current_step: nextStep, updated_at: now })
          .eq("id", enrollmentId);
      } else {
        const nextAt = new Date();
        nextAt.setDate(nextAt.getDate() + next.delayDays);
        await supabase
          .from("sales_email_sequence_enrollments")
          .update({
            current_step: nextStep,
            next_send_at: nextAt.toISOString(),
            updated_at: now,
          })
          .eq("id", enrollmentId);
      }
      sent += 1;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "send failed");
    }
  }

  return { sent, errors };
}

/** Call from inbound email webhook when a reply is linked to a lead. */
export async function handleInboundReplyForSequences(leadId: string) {
  const supabase = getSupabaseAdminClient();
  const { data } = await supabase
    .from("sales_email_sequence_enrollments")
    .select("id")
    .eq("lead_id", leadId)
    .eq("status", "active");
  for (const row of data ?? []) {
    await stopEnrollment(String((row as { id: string }).id), "replied");
  }
}
