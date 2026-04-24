import { spawn } from "node:child_process";
import { isSupabaseConfigured } from "@/lib/supabase";
import { requireAdminUser } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ValidatePayload = {
  ok: boolean;
  message: string;
  stdout?: string;
  stderr?: string;
  progress?: number;
  done?: boolean;
};

function trimOutput(value: string | undefined, maxLength = 8000) {
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
}, signal?: AbortSignal) {
  return new Promise<{ code: number | null; aborted: boolean }>((resolve, reject) => {
    const child = spawn("sh", ["-lc", command], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let aborted = false;

    const killChild = () => {
      if (child.killed) return;
      aborted = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) {
          child.kill("SIGKILL");
        }
      }, 1500);
    };

    if (signal?.aborted) {
      killChild();
    }

    const onAbort = () => {
      killChild();
    };
    signal?.addEventListener("abort", onAbort);

    child.stdout.on("data", (chunk) => handlers.onStdout?.(String(chunk)));
    child.stderr.on("data", (chunk) => handlers.onStderr?.(String(chunk)));
    child.on("error", (error) => {
      signal?.removeEventListener("abort", onAbort);
      reject(error);
    });
    child.on("close", (code) => {
      signal?.removeEventListener("abort", onAbort);
      resolve({ code, aborted });
    });
  });
}

export async function POST(request: Request) {
  const auth = await requireAdminUser(request);
  if (!auth.ok) return auth.response;
  const enabled = process.env.ENABLE_LOCAL_GREENPLUM_SYNC === "true";
  const validateCommand =
    process.env.DATAGRIP_VALIDATE_COMMAND ?? "npm run sync:datagrip:validate";
  const connectionCheckCommand = process.env.DATAGRIP_CONNECTION_CHECK_COMMAND;
  const supabaseConfigured = isSupabaseConfigured();

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (payload: ValidatePayload) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
        } catch {
          // Client disconnected; ignore stream write errors.
        }
      };
      let stdoutBuffer = "";
      let stderrBuffer = "";
      const appendStdout = (chunk: string) => {
        stdoutBuffer += chunk;
        stdoutBuffer = trimOutput(stdoutBuffer, 24000) ?? "";
      };
      const appendStderr = (chunk: string) => {
        stderrBuffer += chunk;
        stderrBuffer = trimOutput(stderrBuffer, 24000) ?? "";
      };

      if (!enabled) {
        write({
          ok: false,
          done: true,
          progress: 0,
          message: "Validation is disabled. Set ENABLE_LOCAL_GREENPLUM_SYNC=true.",
        });
        controller.close();
        return;
      }

      if (!supabaseConfigured) {
        write({
          ok: false,
          done: true,
          progress: 0,
          message: "Supabase is not configured for validation.",
        });
        controller.close();
        return;
      }

      try {
        write({ ok: true, progress: 5, message: "Preparing validation..." });

        if (connectionCheckCommand) {
          write({ ok: true, progress: 15, message: "Checking DataGrip/Greenplum connection..." });
          const check = await runCommand(connectionCheckCommand, {
            onStdout: appendStdout,
            onStderr: appendStderr,
          }, request.signal);
          if (check.aborted) {
            controller.close();
            return;
          }
          if (check.code !== 0) {
            write({
              ok: false,
              done: true,
              progress: 100,
              message: "Connection check failed.",
              stdout: trimOutput(stdoutBuffer),
              stderr: trimOutput(stderrBuffer),
            });
            controller.close();
            return;
          }
        }

        write({ ok: true, progress: 25, message: "Running monthly validation..." });
        const validation = await runCommand(validateCommand, {
          onStdout: (chunk) => {
            appendStdout(chunk);
            const markerRegex =
              /\[PROGRESS\]\s*step=(\d+)\s*total=(\d+)\s*message=([^\n\r]+)/g;
            let match = markerRegex.exec(chunk);
            while (match) {
              const step = Number(match[1]);
              const total = Number(match[2]);
              const message = match[3]?.trim() || "Validating";
              if (Number.isFinite(step) && Number.isFinite(total) && total > 0) {
                const progress = Math.min(95, 25 + Math.round((step / total) * 65));
                write({ ok: true, progress, message });
              }
              match = markerRegex.exec(chunk);
            }
          },
          onStderr: appendStderr,
        }, request.signal);
        if (validation.aborted) {
          controller.close();
          return;
        }

        if (validation.code !== 0) {
          write({
            ok: false,
            done: true,
            progress: 100,
            message: "Validation failed.",
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
          message: "Validation finished.",
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
            error instanceof Error ? `Validation failed: ${error.message}` : "Validation failed.",
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
