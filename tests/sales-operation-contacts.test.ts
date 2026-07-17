import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { SALES_CONTACT_CHANNELS } from "@/lib/sales-operation/types";

describe("sales operation contacts (Phase 3)", () => {
  it("exposes the supported preferred channels", () => {
    assert.deepEqual(
      [...SALES_CONTACT_CHANNELS],
      ["phone", "email", "whatsapp", "sms", "other"],
    );
  });

  it("migration creates the contacts table with dedup + single-primary guarantees", () => {
    const sql = readFileSync(
      join(process.cwd(), "scripts", "sql", "supabase_sales_contacts.sql"),
      "utf8",
    );
    assert.match(sql, /create table if not exists public\.sales_contacts/);
    assert.match(sql, /references public\.sales_leads \(id\) on delete cascade/);
    // At most one primary per lead.
    assert.match(sql, /sales_contacts_one_primary_idx[\s\S]*where is_primary/);
    // Dedup by email (case-insensitive) and mobile phone within a lead.
    assert.match(sql, /sales_contacts_lead_email_uidx[\s\S]*lower\(email\)/);
    assert.match(sql, /sales_contacts_lead_mobile_uidx[\s\S]*mobile_phone/);
  });

  it("registers the migration in the apply script", () => {
    const applyScript = readFileSync(
      join(process.cwd(), "scripts", "apply-sales-operation-schema.js"),
      "utf8",
    );
    assert.match(applyScript, /supabase_sales_contacts\.sql/);
  });

  it("ships contact translations for both locales", () => {
    for (const locale of ["en", "he"]) {
      const messages = JSON.parse(
        readFileSync(join(process.cwd(), "messages", `${locale}.json`), "utf8"),
      ) as { salesOperation?: { contact?: Record<string, unknown> } };
      const contact = messages.salesOperation?.contact;
      assert.ok(contact, `${locale}: missing salesOperation.contact`);
      for (const key of ["title", "add", "primary", "decisionMaker", "makePrimary"]) {
        assert.ok(key in (contact as Record<string, unknown>), `${locale}: missing contact.${key}`);
      }
    }
  });
});
