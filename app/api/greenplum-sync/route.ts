import { spawn } from "node:child_process";
import { getSupabaseAdminClient, isSupabaseConfigured } from "@/lib/supabase";
import { requireAdminUser } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SyncPayload = {
  ok: boolean;
  message: string;
  stdout?: string;
  stderr?: string;
  progress?: number;
  done?: boolean;
};

type SyncRequestRow = {
  id: string;
  started_at: string;
};

type SyncRequestOptions = {
  fromTs: string | null;
  toTs: string | null;
};

type RemoteSyncJobRow = {
  id: string;
  source_name: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  error_text: string | null;
  from_ts?: string | null;
  to_ts?: string | null;
};

function trimOutput(value: string | undefined, maxLength = 4000) {
  if (!value) {
    return undefined;
  }
  if (value.length <= maxLength) {
    return value;
  }
  return value.slice(value.length - maxLength);
}

async function runCommand(command: string, handlers: {
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
}, envOverrides?: Record<string, string>) {
  return new Promise<{ code: number | null }>((resolve, reject) => {
    const child = spawn("sh", ["-lc", command], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...(envOverrides ?? {}),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", (chunk) => {
      handlers.onStdout?.(String(chunk));
    });
    child.stderr.on("data", (chunk) => {
      handlers.onStderr?.(String(chunk));
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code }));
  });
}

function parseIsoOrNull(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

async function normalizeWindow(request: Request): Promise<SyncRequestOptions> {
  const payload = (await request.json().catch(() => null)) as { fromTs?: unknown; toTs?: unknown } | null;
  const fromProvided = typeof payload?.fromTs === "string" && payload.fromTs.trim().length > 0;
  const toProvided = typeof payload?.toTs === "string" && payload.toTs.trim().length > 0;
  const fromTs = parseIsoOrNull(payload?.fromTs);
  const toTs = parseIsoOrNull(payload?.toTs);
  if ((fromProvided && !fromTs) || (toProvided && !toTs)) {
    throw new Error("Invalid date-time range.");
  }
  if (fromTs && toTs && new Date(toTs).getTime() <= new Date(fromTs).getTime()) {
    throw new Error("To must be later than From.");
  }
  return { fromTs, toTs };
}

async function enqueueRemoteSyncRequest(options: SyncRequestOptions) {
  const supabase = getSupabaseAdminClient();
  const requestedBy = process.env.GREENPLUM_SYNC_REQUESTED_BY ?? "notes-dashboard";
  const windowText =
    options.fromTs || options.toTs
      ? `window=${options.fromTs ?? "auto"}..${options.toTs ?? "now"}`
      : "window=auto";
  const { data, error } = await supabase
    .from("sync_runs")
    .insert({
      source_name: "remote_sync_request",
      started_at: new Date().toISOString(),
      finished_at: null,
      status: "pending",
      rows_loaded: 0,
      from_ts: options.fromTs,
      to_ts: options.toTs,
      error_text: `queued_by=${requestedBy}; ${windowText}`,
    })
    .select("id,started_at")
    .single();

  if (error || !data) {
    throw new Error(`Failed to enqueue sync request: ${error?.message ?? "Unknown error"}`);
  }

  return data as SyncRequestRow;
}

export async function GET(request: Request) {
  const auth = await requireAdminUser(request);
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json(
      {
        ok: false,
        message:
          "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.",
      },
      { status: 500 },
    );
  }

  const supabase = getSupabaseAdminClient();
  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId");

  let currentQuery = supabase
    .from("sync_runs")
    .select("id,source_name,status,started_at,finished_at,error_text,from_ts,to_ts")
    .eq("source_name", "remote_sync_request")
    .order("started_at", { ascending: false })
    .limit(1);

  if (jobId) {
    currentQuery = currentQuery.eq("id", jobId);
  }

  const { data: current, error: currentError } = await currentQuery.maybeSingle();
  if (currentError) {
    return Response.json(
      { ok: false, message: `Failed to read remote sync status: ${currentError.message}` },
      { status: 500 },
    );
  }

  const { data: lastSuccessful, error: successfulError } = await supabase
    .from("sync_runs")
    .select("id,source_name,status,started_at,finished_at,error_text,rows_loaded,from_ts,to_ts")
    .eq("source_name", "fct_order_b2b_created_window")
    .eq("status", "success")
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (successfulError) {
    return Response.json(
      { ok: false, message: `Failed to read last successful sync: ${successfulError.message}` },
      { status: 500 },
    );
  }

  return Response.json({
    ok: true,
    current: (current ?? null) as RemoteSyncJobRow | null,
    lastSuccessful: lastSuccessful
      ? {
          id: lastSuccessful.id,
          rowsLoaded: Number(lastSuccessful.rows_loaded ?? 0),
          fromTs: lastSuccessful.from_ts,
          toTs: lastSuccessful.to_ts,
          finishedAt: lastSuccessful.finished_at,
        }
      : null,
  });
}

export async function POST(request: Request) {
  const auth = await requireAdminUser(request);
  if (!auth.ok) return auth.response;
  let options: SyncRequestOptions;
  try {
    options = await normalizeWindow(request);
  } catch (error) {
    return Response.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Invalid sync window.",
      },
      { status: 400 },
    );
  }
  const syncEnabled = process.env.ENABLE_LOCAL_GREENPLUM_SYNC === "true";
  const remoteQueueEnabled =
    process.env.ENABLE_REMOTE_GREENPLUM_SYNC_REQUESTS === "true";
  const syncCommand =
    process.env.DATAGRIP_SYNC_COMMAND ?? process.env.GREENPLUM_SYNC_COMMAND;
  const connectionCheckCommand = process.env.DATAGRIP_CONNECTION_CHECK_COMMAND;
  const supabaseConfigured = isSupabaseConfigured();

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (payload: SyncPayload) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      };

      let stdoutBuffer = "";
      let stderrBuffer = "";
      const appendStdout = (chunk: string) => {
        stdoutBuffer += chunk;
        stdoutBuffer = trimOutput(stdoutBuffer, 12000) ?? "";
      };
      const appendStderr = (chunk: string) => {
        stderrBuffer += chunk;
        stderrBuffer = trimOutput(stderrBuffer, 12000) ?? "";
      };

      if (!syncEnabled && remoteQueueEnabled) {
        try {
          write({
            ok: true,
            progress: 15,
            message: "Local sync is disabled here. Queueing remote sync request...",
          });
          const job = await enqueueRemoteSyncRequest(options);
          const windowLabel =
            options.fromTs || options.toTs
              ? ` (window: ${options.fromTs ?? "auto"} -> ${options.toTs ?? "now"})`
              : "";
          write({
            ok: true,
            done: true,
            progress: 100,
            message: `Sync request #${job.id} queued${windowLabel}. Keep local worker running on VPN laptop to execute it.`,
          });
          controller.close();
          return;
        } catch (error) {
          write({
            ok: false,
            done: true,
            progress: 100,
            message:
              error instanceof Error
                ? error.message
                : "Failed to queue remote sync request.",
          });
          controller.close();
          return;
        }
      }

      if (!syncEnabled) {
        write({
          ok: false,
          done: true,
          progress: 0,
          message:
            "Sync is disabled on this environment. Enable ENABLE_LOCAL_GREENPLUM_SYNC=true locally.",
        });
        controller.close();
        return;
      }

      if (!syncCommand) {
        write({
          ok: false,
          done: true,
          progress: 0,
          message:
            "DATAGRIP_SYNC_COMMAND is missing. Configure your local sync command in .env.local.",
        });
        controller.close();
        return;
      }

      if (!supabaseConfigured) {
        write({
          ok: false,
          done: true,
          progress: 0,
          message:
            "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.",
        });
        controller.close();
        return;
      }

      try {
        write({ ok: true, progress: 5, message: "Preparing sync..." });

        if (connectionCheckCommand) {
          write({ ok: true, progress: 15, message: "Checking DataGrip/Greenplum connection..." });
          const check = await runCommand(connectionCheckCommand, {
            onStdout: appendStdout,
            onStderr: appendStderr,
          });
          if (check.code !== 0) {
            write({
              ok: false,
              done: true,
              progress: 100,
              message: "DataGrip/Greenplum connection check failed.",
              stdout: trimOutput(stdoutBuffer),
              stderr: trimOutput(stderrBuffer),
            });
            controller.close();
            return;
          }
        }

        write({ ok: true, progress: 30, message: "Connection OK. Running sync..." });
        const syncEnv: Record<string, string> = {};
        if (options.fromTs) syncEnv.FCT_FORCE_FROM_TS = options.fromTs;
        if (options.toTs) syncEnv.FCT_FORCE_TO_TS = options.toTs;

        const sync = await runCommand(syncCommand, {
          onStdout: (chunk) => {
            appendStdout(chunk);
            const markerRegex =
              /\[PROGRESS\]\s*step=(\d+)\s*total=(\d+)\s*message=([^\n\r]+)/g;
            let match: RegExpExecArray | null = markerRegex.exec(chunk);
            while (match) {
              const step = Number(match[1]);
              const total = Number(match[2]);
              const message = match[3]?.trim() || "Sync step";
              if (Number.isFinite(step) && Number.isFinite(total) && total > 0) {
                const computed = Math.min(95, 30 + Math.round((step / total) * 60));
                write({ ok: true, progress: computed, message });
              }
              match = markerRegex.exec(chunk);
            }
          },
          onStderr: appendStderr,
        }, syncEnv);

        if (sync.code !== 0) {
          write({
            ok: false,
            done: true,
            progress: 100,
            message: "Greenplum sync failed.",
            stdout: trimOutput(stdoutBuffer),
            stderr: trimOutput(stderrBuffer),
          });
          controller.close();
          return;
        }

        write({
          ok: true,
          done: true,
          progress: 100,
          message: "DataGrip sync finished successfully.",
          stdout: trimOutput(stdoutBuffer),
          stderr: trimOutput(stderrBuffer),
        });
        controller.close();
      } catch (error) {
        write({
          ok: false,
          done: true,
          progress: 100,
          message:
            error instanceof Error ? `Greenplum sync failed: ${error.message}` : "Unknown sync error",
          stdout: trimOutput(stdoutBuffer),
          stderr: trimOutput(stderrBuffer),
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
