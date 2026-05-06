import { getSupabaseAdminClient, isSupabaseConfigured } from "@/lib/supabase";
import { TRANSCRIPT_MOT_TARIFF_CATALOG } from "@/lib/transcript-mot-tariff-catalog";
import {
  evaluateTranscriptMotClientPrice,
  parseTranscriptMotRules,
  type TranscriptMotRules,
} from "@/lib/transcript-mot-tariff-rules";

export type TranscriptMotTariffResolved = {
  code: string;
  label: string;
  sortOrder: number;
  rules: TranscriptMotRules;
};

export {
  evaluateTranscriptMotClientPrice,
  getJerusalemMinuteOfDay,
  getJerusalemWeekdayKey,
  getJerusalemYangoTimeInputs,
  parseTranscriptMotRules,
  type TranscriptMotRules,
} from "@/lib/transcript-mot-tariff-rules";

export { TRANSCRIPT_MOT_TARIFF_CATALOG } from "@/lib/transcript-mot-tariff-catalog";

function catalogToResolved(): TranscriptMotTariffResolved[] {
  return TRANSCRIPT_MOT_TARIFF_CATALOG.map((row) => ({
    code: row.code,
    label: row.label,
    sortOrder: row.sortOrder,
    rules: row.rules,
  }));
}

/** Tariff rows from Supabase when configured and valid; otherwise embedded catalog. */
export async function loadTranscriptMotTariffs(): Promise<TranscriptMotTariffResolved[]> {
  if (!isSupabaseConfigured()) {
    return catalogToResolved();
  }
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("transcript_mot_tariffs")
      .select("code,label,rules,sort_order")
      .order("sort_order", { ascending: true });
    if (error || !data?.length) {
      return catalogToResolved();
    }
    const resolved: TranscriptMotTariffResolved[] = [];
    for (const row of data) {
      const rules = parseTranscriptMotRules(row.rules);
      if (!rules || typeof row.code !== "string") continue;
      resolved.push({
        code: row.code,
        label: typeof row.label === "string" ? row.label : row.code,
        sortOrder: typeof row.sort_order === "number" ? row.sort_order : resolved.length + 1,
        rules,
      });
    }
    return resolved.length > 0 ? resolved : catalogToResolved();
  } catch {
    return catalogToResolved();
  }
}

export function findTranscriptMotTariff(
  rows: TranscriptMotTariffResolved[],
  code: string,
): TranscriptMotTariffResolved | undefined {
  return rows.find((r) => r.code === code);
}
