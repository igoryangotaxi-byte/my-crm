const YANGO_BASE_URL = "https://b2b-api.yango.com/integration";

type YangoAuthListResponse = {
  clients?: Array<{ client_id: string; name: string }>;
};

export type YangoTokenValidationResult = {
  clients: Array<{ clientId: string; clientName: string }>;
  suggestedLabel: string;
  suggestedClientName: string;
};

function sanitizeLabel(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

export function buildTokenLabelSuggestion(clientName: string): string {
  const normalized = sanitizeLabel(clientName);
  if (normalized) return normalized;
  return `CLIENT_${new Date().getTime()}`;
}

export async function validateYangoApiToken(token: string): Promise<YangoTokenValidationResult> {
  const normalizedToken = token.trim();
  if (!normalizedToken) {
    throw new Error("API token is required.");
  }

  const response = await fetch(`${YANGO_BASE_URL}/2.0/auth/list`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${normalizedToken}`,
    },
    cache: "no-store",
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${raw}`);
  }

  let payload: YangoAuthListResponse;
  try {
    payload = JSON.parse(raw) as YangoAuthListResponse;
  } catch {
    throw new Error("Invalid JSON returned by auth/list.");
  }

  const clients = (payload.clients ?? [])
    .map((item) => ({
      clientId: item.client_id,
      clientName: item.name || item.client_id,
    }))
    .filter((item) => item.clientId);

  if (clients.length === 0) {
    throw new Error("Token is valid but auth/list returned no clients.");
  }

  const preferredName = clients[0]?.clientName ?? clients[0]?.clientId ?? "Client";
  return {
    clients,
    suggestedLabel: buildTokenLabelSuggestion(preferredName),
    suggestedClientName: preferredName,
  };
}
