import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase";
import { loadAuthStore } from "@/lib/auth-store";
import { ensureSalesClientForCorpClient } from "@/lib/sales-operation/ensure-client";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/server-session";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ corpClientId: string }> };

export default async function EnsureB2BClientCorpRedirectPage({ params }: PageProps) {
  const { corpClientId } = await params;
  const decoded = decodeURIComponent(corpClientId);

  if (!isSupabaseConfigured()) {
    redirect("/sales-operation/b2b-clients");
  }

  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE_NAME)?.value ?? "";
  const session = token ? verifySessionToken(token) : null;
  if (!session?.userId) {
    redirect(`/login?next=${encodeURIComponent(`/sales-operation/b2b-clients/corp/${corpClientId}`)}`);
  }

  const store = await loadAuthStore();
  const user = store.users.find((item) => item.id === session.userId && item.status === "approved");
  if (!user) {
    redirect("/sales-operation/b2b-clients");
  }

  try {
    const result = await ensureSalesClientForCorpClient(decoded, {
      userId: user.id,
      name: user.name,
    });
    redirect(`/sales-operation/b2b-clients/${result.clientId}`);
  } catch {
    redirect("/sales-operation/b2b-clients");
  }
}
