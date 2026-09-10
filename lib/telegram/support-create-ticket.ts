import {
  findPublicTargetStatus,
  getPublicTrackerProjectId,
  getPublicTrackerStatusName,
} from "@/lib/sales-operation/public-ticket-form";
import {
  createTrackerTicket,
  getTrackerProject,
  listTrackerStatuses,
} from "@/lib/sales-operation/tracker";
import { buildSupportTicketDescription } from "@/lib/telegram/support-flow";

export const TELEGRAM_SUPPORT_ACTOR = {
  userId: null as string | null,
  name: "Telegram support",
};

export async function createSupportTrackerTicket(input: {
  title: string;
  description: string;
  telegramUserId: number | string;
  telegramUsername?: string | null;
  telegramName?: string | null;
}): Promise<{ ticketId: string }> {
  const projectId = getPublicTrackerProjectId();
  const project = await getTrackerProject(projectId);
  if (!project || project.archivedAt) {
    throw new Error("Submission target is unavailable.");
  }

  const statuses = await listTrackerStatuses(projectId);
  const status = findPublicTargetStatus(statuses, getPublicTrackerStatusName());
  if (!status) {
    throw new Error(`Column "${getPublicTrackerStatusName()}" was not found on the target board.`);
  }

  const ticket = await createTrackerTicket(
    projectId,
    {
      title: input.title.trim(),
      description: buildSupportTicketDescription({
        description: input.description,
        telegramUserId: input.telegramUserId,
        telegramUsername: input.telegramUsername,
        telegramName: input.telegramName,
      }),
      statusId: status.id,
      priority: "normal",
    },
    TELEGRAM_SUPPORT_ACTOR,
  );

  return { ticketId: ticket.id };
}
