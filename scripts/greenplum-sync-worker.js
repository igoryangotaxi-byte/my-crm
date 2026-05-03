require("dotenv").config({ path: ".env.local", quiet: true });

const { spawn } = require("node:child_process");
const { createClient } = require("@supabase/supabase-js");

const pollMs = Number(process.env.SYNC_REQUEST_POLL_MS || 15000);
const workerId =
  process.env.SYNC_REQUEST_WORKER_ID || `${process.env.USER || "local-user"}@${process.env.HOSTNAME || "local"}`;
const runOnce = process.argv.includes("--once");

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is missing in environment.`);
  }
  return value;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function trimOutput(value, maxLength = 4000) {
  if (!value) return "";
  if (value.length <= maxLength) return value;
  return value.slice(value.length - maxLength);
}

async function runCommand(command, envOverrides) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const child = spawn("sh", ["-lc", command], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...(envOverrides || {}),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
      stdout = trimOutput(stdout, 12000);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
      stderr = trimOutput(stderr, 12000);
    });
    child.on("error", reject);
    child.on("close", (code) =>
      resolve({
        code,
        stdout,
        stderr,
      }),
    );
  });
}

async function claimPendingRequest(supabase) {
  const { data: pending, error: pendingError } = await supabase
    .from("sync_runs")
    .select("id,status,started_at,source_name,from_ts,to_ts")
    .eq("source_name", "remote_sync_request")
    .eq("status", "pending")
    .order("started_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (pendingError) {
    throw new Error(`Failed to read pending sync requests: ${pendingError.message}`);
  }
  if (!pending) return null;

  const startedAt = new Date().toISOString();
  const { data: claimed, error: claimError } = await supabase
    .from("sync_runs")
    .update({
      status: "running",
      started_at: startedAt,
      finished_at: null,
      error_text: `running_by=${workerId}`,
    })
    .eq("id", pending.id)
    .eq("status", "pending")
    .select("id,status,started_at,source_name,from_ts,to_ts")
    .maybeSingle();

  if (claimError) {
    throw new Error(`Failed to claim sync request ${pending.id}: ${claimError.message}`);
  }

  return claimed;
}

async function setRequestFinalState(supabase, requestId, status, errorText) {
  const { error } = await supabase
    .from("sync_runs")
    .update({
      status,
      finished_at: new Date().toISOString(),
      error_text: errorText || null,
      rows_loaded: 0,
    })
    .eq("id", requestId);

  if (error) {
    throw new Error(`Failed to finalize sync request ${requestId}: ${error.message}`);
  }
}

async function processRequest(supabase, request) {
  const syncCommand =
    process.env.DATAGRIP_SYNC_COMMAND ?? process.env.GREENPLUM_SYNC_COMMAND;
  const connectionCheckCommand = process.env.DATAGRIP_CONNECTION_CHECK_COMMAND;

  if (!syncCommand) {
    await setRequestFinalState(
      supabase,
      request.id,
      "failed",
      "DATAGRIP_SYNC_COMMAND (or GREENPLUM_SYNC_COMMAND) is not configured.",
    );
    return;
  }

  const syncEnv = {};
  if (request.from_ts) syncEnv.FCT_FORCE_FROM_TS = request.from_ts;
  if (request.to_ts) syncEnv.FCT_FORCE_TO_TS = request.to_ts;

  if (connectionCheckCommand) {
    const checkResult = await runCommand(connectionCheckCommand);
    if (checkResult.code !== 0) {
      await setRequestFinalState(
        supabase,
        request.id,
        "failed",
        trimOutput(
          `Connection check failed.\n${checkResult.stderr || checkResult.stdout || "No output"}`,
          6000,
        ),
      );
      return;
    }
  }

  const syncResult = await runCommand(syncCommand, syncEnv);
  if (syncResult.code !== 0) {
    await setRequestFinalState(
      supabase,
      request.id,
      "failed",
      trimOutput(
        `Sync failed.\n${syncResult.stderr || syncResult.stdout || "No output"}`,
        6000,
      ),
    );
    return;
  }

  await setRequestFinalState(supabase, request.id, "success", null);
}

async function main() {
  const supabaseUrl = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseServiceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const remoteQueueEnabled = process.env.ENABLE_REMOTE_GREENPLUM_SYNC_REQUESTS === "true";

  if (!remoteQueueEnabled) {
    throw new Error("ENABLE_REMOTE_GREENPLUM_SYNC_REQUESTS must be true to run remote worker.");
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  process.stdout.write(
    `Greenplum sync worker started. poll=${pollMs}ms worker=${workerId} once=${runOnce}\n`,
  );

  while (true) {
    const request = await claimPendingRequest(supabase);
    if (!request) {
      if (runOnce) {
        process.stdout.write("No pending sync requests.\n");
        return;
      }
      await wait(pollMs);
      continue;
    }

    process.stdout.write(`Processing sync request #${request.id}\n`);
    try {
      await processRequest(supabase, request);
      process.stdout.write(`Request #${request.id} finished.\n`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await setRequestFinalState(supabase, request.id, "failed", trimOutput(message, 6000));
      process.stderr.write(`Request #${request.id} failed: ${message}\n`);
    }

    if (runOnce) {
      return;
    }
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
