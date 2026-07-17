import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  EMAIL_TEMPLATE_VARIABLES,
  buildTemplateVariables,
  plainTextToHtml,
  renderEmailTemplate,
  renderTemplateString,
} from "../lib/sales-operation/email-render.ts";

describe("email render — renderTemplateString", () => {
  const vars = { "lead.company": "Acme", "contact.firstName": "John" };

  it("replaces known placeholders and tolerates whitespace", () => {
    assert.equal(renderTemplateString("Hi {{contact.firstName}}", vars), "Hi John");
    assert.equal(renderTemplateString("Hi {{ contact.firstName }}", vars), "Hi John");
    assert.equal(renderTemplateString("{{lead.company}} deal", vars), "Acme deal");
  });

  it("leaves unknown placeholders untouched", () => {
    assert.equal(renderTemplateString("{{unknown.key}}", vars), "{{unknown.key}}");
  });

  it("handles empty template", () => {
    assert.equal(renderTemplateString("", vars), "");
  });
});

describe("email render — buildTemplateVariables", () => {
  it("derives firstName and fills lead/contact fields", () => {
    const variables = buildTemplateVariables({
      lead: { fullName: "Jane Boss", companyName: "Beta LLC", email: "j@beta.io", phone: "050" },
      contact: { fullName: "John Doe", email: "john@beta.io" },
      managerName: "Alex",
      today: "2026-07-17",
    });
    assert.equal(variables["lead.company"], "Beta LLC");
    assert.equal(variables["contact.firstName"], "John");
    assert.equal(variables["contact.fullName"], "John Doe");
    assert.equal(variables["manager.name"], "Alex");
    assert.equal(variables["date.today"], "2026-07-17");
  });

  it("defaults missing values to empty strings", () => {
    const variables = buildTemplateVariables({});
    for (const key of EMAIL_TEMPLATE_VARIABLES) {
      if (key === "date.today") continue;
      assert.equal(variables[key], "");
    }
  });
});

describe("email render — renderEmailTemplate & html", () => {
  it("renders subject and body against context", () => {
    const rendered = renderEmailTemplate(
      { subject: "Offer for {{lead.company}}", body: "Hi {{contact.firstName}},\nLet's talk." },
      {
        lead: { fullName: "X", companyName: "Acme", email: null, phone: null },
        contact: { fullName: "John Doe", email: null },
      },
    );
    assert.equal(rendered.subject, "Offer for Acme");
    assert.equal(rendered.body, "Hi John,\nLet's talk.");
  });

  it("escapes html and converts newlines", () => {
    assert.equal(plainTextToHtml("a & <b>\nc"), "a &amp; &lt;b&gt;<br />c");
  });
});

describe("email gateway — configuration gate", () => {
  it("reports not configured without SMTP env and returns logged status", async () => {
    const saved = { ...process.env };
    delete process.env.SALES_SMTP_HOST;
    delete process.env.SALES_SMTP_USER;
    delete process.env.SALES_SMTP_PASSWORD;
    const gateway = await import("../lib/sales-operation/email-gateway.ts");
    assert.equal(gateway.isEmailSendingConfigured(), false);
    const result = await gateway.sendEmail({ to: "a@b.c", subject: "Hi", html: "<p>Hi</p>" });
    assert.equal(result.status, "logged");
    assert.ok(result.configError);
    process.env = saved;
  });
});

describe("email — migration & wiring", () => {
  const root = process.cwd();

  it("ships the email SQL migration with both tables", () => {
    const sql = readFileSync(join(root, "scripts/sql/supabase_sales_email.sql"), "utf8");
    assert.match(sql, /create table if not exists public\.sales_email_templates/);
    assert.match(sql, /create table if not exists public\.sales_email_messages/);
    assert.match(sql, /direction in \('outbound', 'inbound'\)/);
  });

  it("registers the migration in both appliers", () => {
    const applier = readFileSync(join(root, "scripts/apply-sales-operation-schema.js"), "utf8");
    assert.match(applier, /supabase_sales_email\.sql/);
    const mgmt = readFileSync(join(root, ".tools/apply-mgmt.mjs"), "utf8");
    assert.match(mgmt, /supabase_sales_email\.sql/);
  });
});

describe("email — i18n", () => {
  const root = process.cwd();
  const en = JSON.parse(readFileSync(join(root, "messages/en.json"), "utf8")).salesOperation;
  const he = JSON.parse(readFileSync(join(root, "messages/he.json"), "utf8")).salesOperation;

  it("has email + template keys in both locales", () => {
    for (const messages of [en, he]) {
      assert.ok(messages.detailTab?.email);
      assert.ok(messages.email?.title);
      assert.ok(messages.email?.send);
      assert.ok(messages.email?.status?.sent);
      assert.ok(messages.settings?.emailTemplatesTitle);
      assert.ok(messages.settings?.emailTemplateName);
    }
  });
});
