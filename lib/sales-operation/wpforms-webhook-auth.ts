export function getWpformsWebhookSecret(): string | null {
  const secret = process.env.SALES_OPERATION_WPFORMS_WEBHOOK_SECRET?.trim();
  return secret || null;
}

export function isWpformsWebhookAuthorized(request: Request): boolean {
  const secret = getWpformsWebhookSecret();
  if (!secret) return false;

  const headerSecret = request.headers.get("x-webhook-secret")?.trim();
  if (headerSecret && headerSecret === secret) return true;

  const authorization = request.headers.get("authorization")?.trim();
  if (authorization === `Bearer ${secret}`) return true;

  return false;
}
