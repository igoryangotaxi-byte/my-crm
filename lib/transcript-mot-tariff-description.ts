import type { TranscriptMotPricingModel, TranscriptMotRules, TranscriptMotSegment } from "@/lib/transcript-mot-tariff-rules";

export type TariffDescriptionLocale = "en" | "he";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatWindow(segment: TranscriptMotSegment, locale: TariffDescriptionLocale): string {
  const from = `${pad2(segment.fromHour)}:${pad2(segment.fromMinute)}`;
  const to = `${pad2(segment.toHour)}:${pad2(segment.toMinute)}`;
  if (segment.wrap) {
    return locale === "he"
      ? `מ-${from} עד ${to} (חלון חוצה חצות)`
      : `from ${from} to ${to} (overnight window)`;
  }
  return locale === "he" ? `מ-${from} עד ${to}` : `from ${from} to ${to}`;
}

function describeModel(model: TranscriptMotPricingModel, locale: TariffDescriptionLocale): string {
  if (model.type === "linear") {
    return locale === "he"
      ? `${model.base} + ק״מ×${model.perKm}`
      : `${model.base} + km×${model.perKm}`;
  }
  return locale === "he"
    ? `${model.base} + ראשוני ${model.firstKm} ק״מ ב-${model.rateFirst}/ק״מ, כל שאר הק״מ ב-${model.rateAfter}/ק״מ`
    : `${model.base} + first ${model.firstKm} km at ${model.rateFirst}/km, remaining km at ${model.rateAfter}/km`;
}

function describeSegment(segment: TranscriptMotSegment, index: number, locale: TariffDescriptionLocale): string {
  const win = formatWindow(segment, locale);
  const formula = describeModel(segment.model, locale);
  const prefix =
    locale === "he"
      ? `${index + 1}. אם זמן הנסיעה ${win}: נספר כ-${formula}.`
      : `${index + 1}. If trip time is ${win}: price is ${formula}.`;
  return prefix;
}

/**
 * Human-readable MOT tariff rules for UI (and optional LLM context).
 * Trip times refer to Asia/Jerusalem (same as pricing engine).
 */
export function describeTranscriptMotRules(rules: TranscriptMotRules, locale: TariffDescriptionLocale): string {
  return rules.segments.map((seg, i) => describeSegment(seg, i, locale)).join("\n");
}
