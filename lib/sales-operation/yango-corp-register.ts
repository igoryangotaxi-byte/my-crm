export const YANG_CORP_REGISTER_CHANNEL = "yango-corp-register";
export const YANG_CORP_REGISTER_WIDGET_SRC =
  "https://yastatic.net/s3/taxi-front/corp-client/widgets/production/offer-form/init.isr_common_en.js";

export type YangoCorpRegisterSignal = {
  type: "yango-corp-register";
  leadId: string;
  completedAt: string;
};

export function yangoCorpRegisterStorageKey(leadId: string) {
  return `yango-corp-register:${leadId}`;
}

export function isYangoCorpRegisterSignal(value: unknown): value is YangoCorpRegisterSignal {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return row.type === "yango-corp-register" && typeof row.leadId === "string" && row.leadId.length > 0;
}

export function isYangoWidgetOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return (
      host === "yastatic.net" ||
      host.endsWith(".yastatic.net") ||
      host.includes("yandex") ||
      host.includes("yango")
    );
  } catch {
    return false;
  }
}

export function readYangoCorpRegisterCompleted(leadId: string): boolean {
  if (!leadId) return false;
  try {
    return Boolean(localStorage.getItem(yangoCorpRegisterStorageKey(leadId)));
  } catch {
    return false;
  }
}

export function signalYangoCorpRegisterCompleted(leadId: string) {
  if (!leadId) return;
  const payload: YangoCorpRegisterSignal = {
    type: "yango-corp-register",
    leadId,
    completedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(yangoCorpRegisterStorageKey(leadId), JSON.stringify(payload));
  } catch {
    // ignore quota / private mode
  }
  try {
    const channel = new BroadcastChannel(YANG_CORP_REGISTER_CHANNEL);
    channel.postMessage(payload);
    channel.close();
  } catch {
    // BroadcastChannel may be unavailable
  }
  try {
    window.parent?.postMessage(payload, "*");
    window.opener?.postMessage(payload, "*");
  } catch {
    // cross-window may be blocked
  }
}
