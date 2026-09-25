import type { AppPageKey } from "@/types/auth";

export function buildAccessRequestText(input: {
  email: string;
  role: string;
  pagePath: string;
  permissionKey: AppPageKey;
  permissionLabel: string;
}): string {
  return [
    "Appli Taxi CRM — access request",
    `User: ${input.email}`,
    `Role: ${input.role}`,
    `Page: ${input.pagePath}`,
    `Permission needed: ${input.permissionLabel} (${input.permissionKey})`,
  ].join("\n");
}
