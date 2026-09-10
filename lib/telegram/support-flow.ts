import type { SupportInlineButton } from "@/lib/telegram/support-bot";

/** Fixed title options for the support bot (become Tracker ticket title). */
export const SUPPORT_TICKET_TITLES = [
  {
    id: "price",
    label: "Change price and coupons",
  },
  {
    id: "tech",
    label: "Technical problems in the app",
  },
  {
    id: "driver",
    label: "Bad service from the driver",
  },
  {
    id: "other",
    label: "Other",
  },
] as const;

export type SupportTicketTitleId = (typeof SUPPORT_TICKET_TITLES)[number]["id"];

export const SUPPORT_CB_OPEN = "sup:open";
export const SUPPORT_CB_TITLE_PREFIX = "sup:t:";

export function supportTitleById(id: string): string | null {
  const row = SUPPORT_TICKET_TITLES.find((t) => t.id === id);
  return row?.label ?? null;
}

export function parseSupportTitleCallback(data: string): SupportTicketTitleId | null {
  if (!data.startsWith(SUPPORT_CB_TITLE_PREFIX)) return null;
  const id = data.slice(SUPPORT_CB_TITLE_PREFIX.length);
  return SUPPORT_TICKET_TITLES.some((t) => t.id === id) ? (id as SupportTicketTitleId) : null;
}

export function selectTitleKeyboard(): { inline_keyboard: SupportInlineButton[][] } {
  return {
    inline_keyboard: [[{ text: "Select the Title", callback_data: SUPPORT_CB_OPEN }]],
  };
}

export function titleOptionsKeyboard(): { inline_keyboard: SupportInlineButton[][] } {
  return {
    inline_keyboard: SUPPORT_TICKET_TITLES.map((t) => [
      { text: t.label, callback_data: `${SUPPORT_CB_TITLE_PREFIX}${t.id}` },
    ]),
  };
}

export function welcomeSupportText(): string {
  return [
    "<b>Appli Taxi Oz · Support</b>",
    "",
    "Send a request to our team. Tap the button below to choose a title, then describe the issue.",
  ].join("\n");
}

export function chooseTitleText(): string {
  return "<b>Select the Title</b>\n\nChoose one option:";
}

export function askDescriptionText(title: string): string {
  return [
    `<b>Title:</b> ${title}`,
    "",
    "Please send the <b>Description</b> of your request in the next message.",
  ].join("\n");
}

export function ticketCreatedText(title: string): string {
  return [
    "✅ Request received.",
    "",
    `<b>Title:</b> ${title}`,
    "",
    "Our team will follow up from the CRM Tracker. You can submit another request anytime.",
  ].join("\n");
}

export function needTitleFirstText(): string {
  return "Please tap <b>Select the Title</b> first, then send your description.";
}

export function buildSupportTicketDescription(input: {
  description: string;
  telegramUserId: number | string;
  telegramUsername?: string | null;
  telegramName?: string | null;
}): string {
  const who =
    [
      input.telegramUsername ? `@${input.telegramUsername}` : null,
      input.telegramName?.trim() || null,
      `id:${input.telegramUserId}`,
    ]
      .filter(Boolean)
      .join(" · ") || `id:${input.telegramUserId}`;

  return `${input.description.trim()}\n\n—\nSubmitted via Telegram support bot.\nFrom: ${who}`;
}
