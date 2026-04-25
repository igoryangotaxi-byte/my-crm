import { searchAddressSuggestions } from "@/lib/geocoding";
import { requireApprovedUser } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeString(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}

function normalizeLanguage(input: unknown): "he" | "ru" | "en" {
  const raw = normalizeString(input).toLowerCase();
  if (raw === "he" || raw === "ru" || raw === "en") return raw;
  return "en";
}

export async function POST(request: Request) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as
    | { query?: unknown; language?: unknown }
    | null;
  const query = normalizeString(body?.query);
  const language = normalizeLanguage(body?.language);
  if (!query) {
    return Response.json({ ok: false, error: "query is required." }, { status: 400 });
  }

  try {
    const suggestions = await searchAddressSuggestions({ query, language, limit: 8 });
    return Response.json({ ok: true, suggestions }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to search addresses.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
