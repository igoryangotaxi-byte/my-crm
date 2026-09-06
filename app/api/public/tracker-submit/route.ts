import { isSupabaseConfigured } from "@/lib/supabase";
import {
  MAX_PUBLIC_FILE_BYTES,
  MAX_PUBLIC_TICKET_FILES,
  PUBLIC_TICKET_ACTOR,
  buildPublicTicketDescription,
  consumePublicTicketRateLimit,
  findPublicTargetStatus,
  getPublicTrackerProjectId,
  getPublicTrackerStatusName,
  getRequestClientIp,
  normalizePublicPriority,
  validatePublicTicketFields,
} from "@/lib/sales-operation/public-ticket-form";
import {
  createTrackerTicket,
  getTrackerProject,
  listTrackerStatuses,
  uploadTrackerFile,
} from "@/lib/sales-operation/tracker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function collectFiles(form: FormData): File[] {
  const out: File[] = [];
  for (const value of form.getAll("files")) {
    if (value instanceof File && value.size > 0) out.push(value);
  }
  // Single-file field fallback
  const single = form.get("file");
  if (single instanceof File && single.size > 0) out.push(single);
  return out;
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Service is not configured." }, { status: 500 });
  }

  const ip = getRequestClientIp(request);
  if (!consumePublicTicketRateLimit(ip)) {
    return Response.json(
      { ok: false, error: "Too many submissions. Please try again in a few minutes." },
      { status: 429 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ ok: false, error: "Invalid form data." }, { status: 400 });
  }

  // Honeypot — bots fill hidden fields; accept silently.
  const honeypot = form.get("company_website");
  if (typeof honeypot === "string" && honeypot.trim()) {
    return Response.json({ ok: true, ticketId: null, accepted: true });
  }

  const validated = validatePublicTicketFields({
    title: form.get("title"),
    description: form.get("description"),
  });
  if (!validated.ok) {
    return Response.json({ ok: false, error: validated.error }, { status: 400 });
  }

  const priority = normalizePublicPriority(form.get("priority"));
  const files = collectFiles(form);

  if (files.length > MAX_PUBLIC_TICKET_FILES) {
    return Response.json(
      { ok: false, error: `Too many files (max ${MAX_PUBLIC_TICKET_FILES}).` },
      { status: 400 },
    );
  }
  for (const file of files) {
    if (file.size > MAX_PUBLIC_FILE_BYTES) {
      return Response.json(
        {
          ok: false,
          error: `File "${file.name}" is too large (max ${Math.round(MAX_PUBLIC_FILE_BYTES / (1024 * 1024))}MB).`,
        },
        { status: 400 },
      );
    }
  }

  const projectId = getPublicTrackerProjectId();
  try {
    const project = await getTrackerProject(projectId);
    if (!project || project.archivedAt) {
      return Response.json(
        { ok: false, error: "Submission target is unavailable." },
        { status: 503 },
      );
    }

    const statuses = await listTrackerStatuses(projectId);
    const status = findPublicTargetStatus(statuses, getPublicTrackerStatusName());
    if (!status) {
      return Response.json(
        {
          ok: false,
          error: `Column "${getPublicTrackerStatusName()}" was not found on the target board.`,
        },
        { status: 503 },
      );
    }

    const ticket = await createTrackerTicket(
      projectId,
      {
        title: validated.title,
        description: buildPublicTicketDescription(validated.description),
        statusId: status.id,
        priority,
      },
      PUBLIC_TICKET_ACTOR,
    );

    const uploaded: string[] = [];
    for (const file of files) {
      const buffer = await file.arrayBuffer();
      const meta = await uploadTrackerFile(
        ticket.id,
        {
          fileName: file.name || "attachment",
          mimeType: file.type || null,
          body: buffer,
        },
        PUBLIC_TICKET_ACTOR,
      );
      uploaded.push(meta.fileName);
    }

    return Response.json(
      { ok: true, ticketId: ticket.id, files: uploaded },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to submit request.",
      },
      { status: 500 },
    );
  }
}
