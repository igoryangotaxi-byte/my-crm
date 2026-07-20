export const FEEDBACK_STATUSES = ["todo", "in_progress", "done"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export type FeedbackRequest = {
  id: string;
  title: string;
  description: string;
  status: FeedbackStatus;
  createdByUserId: string;
  createdByName: string;
  createdByEmail: string | null;
  createdByRole: string | null;
  pathname: string | null;
  telegramChatId: string | null;
  telegramMessageId: number | null;
  statusChangedAt: string | null;
  statusNotifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export function isFeedbackStatus(value: unknown): value is FeedbackStatus {
  return typeof value === "string" && (FEEDBACK_STATUSES as readonly string[]).includes(value);
}

export function feedbackStatusLabel(status: FeedbackStatus): string {
  if (status === "in_progress") return "In Progress";
  if (status === "done") return "Done";
  return "ToDo";
}
