export function getDriversPipelineWebhookSecret(): string | null {
  const secret = process.env.DRIVERS_PIPELINE_WEBHOOK_SECRET?.trim();
  return secret || null;
}

export function isDriversPipelineWebhookAuthorized(request: Request): boolean {
  const secret = getDriversPipelineWebhookSecret();
  if (!secret) return false;

  const headerSecret = request.headers.get("x-webhook-secret")?.trim();
  if (headerSecret && headerSecret === secret) return true;

  const authorization = request.headers.get("authorization")?.trim();
  if (authorization === `Bearer ${secret}`) return true;

  // Elementor native webhook cannot set custom headers; allow ?secret= / ?webhook_secret=
  try {
    const url = new URL(request.url);
    const querySecret =
      url.searchParams.get("secret")?.trim() ||
      url.searchParams.get("webhook_secret")?.trim();
    if (querySecret && querySecret === secret) return true;
  } catch {
    // ignore invalid URL
  }

  return false;
}
