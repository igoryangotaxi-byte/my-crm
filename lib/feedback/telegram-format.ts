import {
  escapeHtml,
  type InlineKeyboardButton,
} from "@/lib/telegram/client";
import {
  feedbackStatusLabel,
  type FeedbackRequest,
  type FeedbackStatus,
} from "@/lib/feedback/types";

export function feedbackStatusKeyboard(feedbackId: string): {
  inline_keyboard: InlineKeyboardButton[][];
} {
  // callback_data max 64 bytes — use compact prefix + short uuid without dashes if needed
  const shortId = feedbackId.replaceAll("-", "");
  return {
    inline_keyboard: [
      [
        { text: "ToDo", callback_data: `fb:${shortId}:todo` },
        { text: "In Progress", callback_data: `fb:${shortId}:in_progress` },
        { text: "Done", callback_data: `fb:${shortId}:done` },
      ],
    ],
  };
}

export function parseFeedbackCallbackData(
  data: string,
): { feedbackId: string; status: FeedbackStatus } | null {
  const match = /^fb:([a-f0-9]{32}):(todo|in_progress|done)$/.exec(data.trim());
  if (!match) return null;
  const hex = match[1]!;
  const status = match[2] as FeedbackStatus;
  const feedbackId = [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
  return { feedbackId, status };
}

export function formatFeedbackTelegramMessage(feedback: FeedbackRequest): string {
  const status = feedbackStatusLabel(feedback.status);
  const lines = [
    `<b>New CRM feedback</b>`,
    ``,
    `<b>Status:</b> ${escapeHtml(status)}`,
    `<b>Title:</b> ${escapeHtml(feedback.title)}`,
    ``,
    `<b>Description:</b>`,
    escapeHtml(feedback.description),
    ``,
    `<b>From:</b> ${escapeHtml(feedback.createdByName)}`,
  ];
  if (feedback.createdByEmail) {
    lines.push(`<b>Email:</b> ${escapeHtml(feedback.createdByEmail)}`);
  }
  if (feedback.createdByRole) {
    lines.push(`<b>Role:</b> ${escapeHtml(feedback.createdByRole)}`);
  }
  if (feedback.pathname) {
    lines.push(`<b>Page:</b> ${escapeHtml(feedback.pathname)}`);
  }
  lines.push(`<b>ID:</b> <code>${escapeHtml(feedback.id)}</code>`);
  return lines.join("\n");
}
