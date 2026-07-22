import { getSupabaseAdminClient } from "@/lib/supabase";
import { listSalesClients, listSalesLeads } from "@/lib/sales-operation/repository";
import {
  rankSearchResults,
  type SearchIndexItem,
  type SearchResult,
} from "@/lib/sales-operation/search";

function compact(parts: Array<string | null | undefined>): string {
  return parts.filter((part) => typeof part === "string" && part.trim()).join(" ");
}

/**
 * Builds a lightweight in-memory index across leads, clients and contacts, then
 * ranks it against the query. Reused mapping keeps lead/client shapes correct.
 */
export async function globalSearch(query: string, limit = 20): Promise<SearchResult[]> {
  if (!query.trim()) return [];
  const supabase = getSupabaseAdminClient();

  const [leads, clients, contactsRes] = await Promise.all([
    listSalesLeads({ archive: "all" }),
    listSalesClients(),
    supabase
      .from("sales_contacts")
      .select("id, lead_id, full_name, email, mobile_phone, office_phone, job_title")
      .eq("is_active", true)
      .limit(2000),
  ]);

  const items: SearchIndexItem[] = [];

  for (const lead of leads) {
    items.push({
      entityType: "lead",
      id: lead.id,
      title: lead.companyName || lead.fullName,
      subtitle: compact([lead.fullName, lead.email, lead.phone]),
      href: `/sales-operation/pipeline?lead=${lead.id}`,
      haystack: compact([
        lead.fullName,
        lead.companyName,
        lead.email,
        lead.phone,
        lead.legalName,
        lead.website,
      ]),
    });
  }

  for (const client of clients) {
    items.push({
      entityType: "client",
      id: client.id,
      title: client.companyName || client.fullName,
      subtitle: compact([client.fullName, client.email, client.phone]),
      href: `/sales-operation/b2b-clients/${client.id}`,
      haystack: compact([
        client.fullName,
        client.companyName,
        client.email,
        client.phone,
        client.corpClientId,
        client.corpClientName,
      ]),
    });
  }

  for (const row of (contactsRes.data ?? []) as Record<string, unknown>[]) {
    const fullName = typeof row.full_name === "string" ? row.full_name : "";
    const email = typeof row.email === "string" ? row.email : null;
    const mobile = typeof row.mobile_phone === "string" ? row.mobile_phone : null;
    const office = typeof row.office_phone === "string" ? row.office_phone : null;
    const jobTitle = typeof row.job_title === "string" ? row.job_title : null;
    const leadId = String(row.lead_id ?? "");
    if (!leadId) continue;
    items.push({
      entityType: "contact",
      id: String(row.id),
      title: fullName || email || "Contact",
      subtitle: compact([jobTitle, email, mobile]),
      href: `/sales-operation/pipeline?lead=${leadId}`,
      haystack: compact([fullName, jobTitle, email, mobile, office]),
    });
  }

  return rankSearchResults(query, items, limit);
}
