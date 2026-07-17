import type { SalesEmailStatus } from "@/lib/sales-operation/types";

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  cc?: string;
  replyTo?: string;
};

export type SendEmailResult = {
  status: SalesEmailStatus;
  provider: string | null;
  providerMessageId: string | null;
  from: string | null;
  error: string | null;
  configError: string | null;
};

function readEnv(name: string): string {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
};

export function readSmtpConfig(): SmtpConfig | null {
  const host = readEnv("SALES_SMTP_HOST");
  const user = readEnv("SALES_SMTP_USER");
  const password = readEnv("SALES_SMTP_PASSWORD");
  if (!host || !user || !password) return null;
  const portRaw = Number(readEnv("SALES_SMTP_PORT"));
  const port = Number.isFinite(portRaw) && portRaw > 0 ? portRaw : 587;
  const secureRaw = readEnv("SALES_SMTP_SECURE").toLowerCase();
  const secure = secureRaw === "true" || secureRaw === "1" || secureRaw === "yes" || port === 465;
  const from = readEnv("SALES_SMTP_FROM") || user;
  return { host, port, secure, user, password, from };
}

export function isEmailSendingConfigured(): boolean {
  return readSmtpConfig() !== null;
}

/**
 * Sends an email via SMTP (Google Workspace / Microsoft 365 compatible).
 * Never throws: when SMTP is not configured it returns status "logged" with a
 * `configError`, so the caller can still record the message to the thread.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const config = readSmtpConfig();
  if (!config) {
    return {
      status: "logged",
      provider: null,
      providerMessageId: null,
      from: null,
      error: null,
      configError: "SMTP is not configured (set SALES_SMTP_HOST/USER/PASSWORD).",
    };
  }

  try {
    // Imported lazily so the module isn't bundled into edge/client contexts.
    const nodemailer = (await import("nodemailer")).default;
    const transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.password },
    });
    const info = await transport.sendMail({
      from: config.from,
      to: input.to,
      cc: input.cc || undefined,
      replyTo: input.replyTo || undefined,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    return {
      status: "sent",
      provider: "smtp",
      providerMessageId: info.messageId ?? null,
      from: config.from,
      error: null,
      configError: null,
    };
  } catch (error) {
    return {
      status: "failed",
      provider: "smtp",
      providerMessageId: null,
      from: config.from,
      error: error instanceof Error ? error.message : "Failed to send email.",
      configError: null,
    };
  }
}
