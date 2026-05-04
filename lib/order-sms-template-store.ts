import { kv } from "@vercel/kv";
import {
  type OrderSmsTemplateId,
  ORDER_SMS_TEMPLATE_IDS,
  getMergedOrderSmsTemplates,
} from "@/lib/order-sms-templates";

const PREFIX = "appli:order-sms-templates:v1:";
const DOC_VERSION = 1 as const;
const MAX_HISTORY = 50;

export type OrderSmsTemplateHistoryEntry = {
  id: string;
  at: string;
  editorId: string;
  editorName: string;
  templateId: OrderSmsTemplateId;
  previousText: string;
  nextText: string;
};

export type OrderSmsTemplateDocument = {
  version: typeof DOC_VERSION;
  /** Only keys the user has explicitly set in the editor (optional). */
  templates: Partial<Record<OrderSmsTemplateId, string>>;
  history: OrderSmsTemplateHistoryEntry[];
};

const memoryDocs = new Map<string, OrderSmsTemplateDocument>();

function canUseKv() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function storageKey(tokenLabel: string, clientId: string): string {
  return `${PREFIX}${encodeURIComponent(tokenLabel)}:${encodeURIComponent(clientId)}`;
}

function emptyDoc(): OrderSmsTemplateDocument {
  return { version: DOC_VERSION, templates: {}, history: [] };
}

function normalizeDoc(raw: unknown): OrderSmsTemplateDocument {
  if (!raw || typeof raw !== "object") return emptyDoc();
  const o = raw as Record<string, unknown>;
  if (o.version !== DOC_VERSION) return emptyDoc();
  const templates: Partial<Record<OrderSmsTemplateId, string>> = {};
  if (o.templates && typeof o.templates === "object") {
    for (const id of ORDER_SMS_TEMPLATE_IDS) {
      const v = (o.templates as Record<string, unknown>)[id];
      if (typeof v === "string" && v.trim()) {
        templates[id] = v.trim();
      }
    }
  }
  const history: OrderSmsTemplateHistoryEntry[] = [];
  if (Array.isArray(o.history)) {
    for (const item of o.history) {
      if (!item || typeof item !== "object") continue;
      const h = item as Record<string, unknown>;
      const templateId = h.templateId as OrderSmsTemplateId | undefined;
      if (!templateId || !ORDER_SMS_TEMPLATE_IDS.includes(templateId)) continue;
      const id = typeof h.id === "string" ? h.id : "";
      const at = typeof h.at === "string" ? h.at : "";
      const editorId = typeof h.editorId === "string" ? h.editorId : "";
      const editorName = typeof h.editorName === "string" ? h.editorName : "";
      const previousText = typeof h.previousText === "string" ? h.previousText : "";
      const nextText = typeof h.nextText === "string" ? h.nextText : "";
      if (!id || !at || !editorId) continue;
      history.push({
        id,
        at,
        editorId,
        editorName,
        templateId,
        previousText,
        nextText,
      });
    }
  }
  return { version: DOC_VERSION, templates, history: history.slice(-MAX_HISTORY) };
}

export async function loadOrderSmsTemplateDocument(
  tokenLabel: string,
  clientId: string,
): Promise<OrderSmsTemplateDocument> {
  const key = storageKey(tokenLabel, clientId);
  if (canUseKv()) {
    try {
      const raw = await kv.get<unknown>(key);
      return normalizeDoc(raw);
    } catch {
      // fall through
    }
  }
  return normalizeDoc(memoryDocs.get(key));
}

export async function saveOrderSmsTemplateDocument(
  tokenLabel: string,
  clientId: string,
  doc: OrderSmsTemplateDocument,
): Promise<void> {
  const key = storageKey(tokenLabel, clientId);
  const normalized: OrderSmsTemplateDocument = {
    ...doc,
    history: doc.history.slice(-MAX_HISTORY),
  };
  if (canUseKv()) {
    try {
      await kv.set(key, normalized);
      return;
    } catch {
      // fall through
    }
  }
  memoryDocs.set(key, normalized);
}

export type SaveOrderSmsTemplatesInput = {
  tokenLabel: string;
  clientId: string;
  templates: Partial<Record<OrderSmsTemplateId, string>>;
  editorId: string;
  editorName: string;
};

export async function saveOrderSmsTemplateOverrides(input: SaveOrderSmsTemplatesInput): Promise<{
  doc: OrderSmsTemplateDocument;
  merged: ReturnType<typeof getMergedOrderSmsTemplates>;
}> {
  const prev = await loadOrderSmsTemplateDocument(input.tokenLabel, input.clientId);
  const nextTemplates: Partial<Record<OrderSmsTemplateId, string>> = { ...prev.templates };

  for (const id of ORDER_SMS_TEMPLATE_IDS) {
    if (!Object.prototype.hasOwnProperty.call(input.templates, id)) continue;
    const raw = input.templates[id];
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    if (!trimmed) {
      delete nextTemplates[id];
    } else {
      nextTemplates[id] = trimmed;
    }
  }

  const mergedBefore = getMergedOrderSmsTemplates(prev.templates);
  const mergedAfter = getMergedOrderSmsTemplates(nextTemplates);

  const history = [...prev.history];
  for (const id of ORDER_SMS_TEMPLATE_IDS) {
    const before = mergedBefore[id] ?? "";
    const after = mergedAfter[id] ?? "";
    if (before === after) continue;
    history.push({
      id: globalThis.crypto.randomUUID(),
      at: new Date().toISOString(),
      editorId: input.editorId,
      editorName: input.editorName,
      templateId: id,
      previousText: before.slice(0, 500),
      nextText: after.slice(0, 500),
    });
  }

  const doc: OrderSmsTemplateDocument = {
    version: DOC_VERSION,
    templates: nextTemplates,
    history: history.slice(-MAX_HISTORY),
  };
  await saveOrderSmsTemplateDocument(input.tokenLabel, input.clientId, doc);
  return { doc, merged: mergedAfter };
}
