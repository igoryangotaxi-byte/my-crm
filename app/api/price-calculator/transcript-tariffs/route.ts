import { describeTranscriptMotRules, type TariffDescriptionLocale } from "@/lib/transcript-mot-tariff-description";
import { loadTranscriptMotTariffs } from "@/lib/transcript-mot-tariffs";
import { requireApprovedUser } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const withDescribe = url.searchParams.get("describe") === "1";
  const localeParam = url.searchParams.get("locale");
  const locale: TariffDescriptionLocale = localeParam === "he" ? "he" : "en";

  try {
    const tariffs = await loadTranscriptMotTariffs();
    return Response.json(
      {
        ok: true,
        tariffs: tariffs.map((t) => ({
          code: t.code,
          label: t.label,
          sortOrder: t.sortOrder,
          ...(withDescribe ? { description: describeTranscriptMotRules(t.rules, locale) } : {}),
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load tariffs.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
