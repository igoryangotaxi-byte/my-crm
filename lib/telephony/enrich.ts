import { lookupCrmEntityByPhone } from "@/lib/call-center/baroz-crm";
import { israelPhoneKey } from "@/lib/call-center/phone";
import { getSupabaseAdminClient, isSupabaseConfigured } from "@/lib/supabase";
import { logTelephony, logTelephonyError } from "@/lib/telephony/log";

export type TelephonyEnrichmentMatch = {
  entityType: "driver" | "lead" | "client" | "contact";
  entityId: string;
  name: string | null;
  phone: string | null;
  url: string | null;
};

/**
 * Non-blocking CRM enrichment for an inbound/outbound phone.
 * Returns all matches; UI must not silently pick one when length > 1.
 */
export async function enrichTelephonyPhone(phone: string): Promise<{
  matches: TelephonyEnrichmentMatch[];
  phoneKey: string;
}> {
  const phoneKey = israelPhoneKey(phone);
  if (!phoneKey) return { matches: [], phoneKey: "" };

  try {
    const entity = await lookupCrmEntityByPhone(phone, { includeDrivers: true });
    if (!entity) return { matches: [], phoneKey };

    const match: TelephonyEnrichmentMatch = {
      entityType:
        entity.entityType === "driver"
          ? "driver"
          : entity.entityType === "client"
            ? "client"
            : "lead",
      entityId: entity.id,
      name: entity.name || null,
      phone: entity.phone || phone,
      url: entity.contactUrl || null,
    };
    return { matches: [match], phoneKey };
  } catch (error) {
    logTelephonyError({
      event: "crm_enrich_failed",
      error: error instanceof Error ? error.message : "enrich failed",
      detail: phoneKey,
    });
    return { matches: [], phoneKey };
  }
}

export async function applyEnrichmentToCall(callId: string, phone: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const { matches, phoneKey } = await enrichTelephonyPhone(phone);
  logTelephony({
    event: "crm_enrich",
    callId,
    detail: `${matches.length} match(es) for ${phoneKey}`,
  });

  const supabase = getSupabaseAdminClient();
  const single = matches.length === 1 ? matches[0] : null;
  await supabase
    .from("telephony_calls")
    .update({
      phone_key: phoneKey || null,
      crm_entity_type: single ? single.entityType : matches.length > 1 ? "unknown" : null,
      crm_entity_id: single ? single.entityId : null,
      raw: { enrichmentMatches: matches, enrichmentMulti: matches.length > 1 },
      updated_at: new Date().toISOString(),
    })
    .eq("id", callId);
}
