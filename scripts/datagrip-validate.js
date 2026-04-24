require("dotenv").config({ path: ".env.local", quiet: true });

const { Client } = require("pg");
const { createClient } = require("@supabase/supabase-js");
const { loadDataGripConnection } = require("./lib/datagrip-connection");

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is missing in environment.`);
  }
  return value;
}

function startOfMonthIso(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0));
  return d.toISOString();
}

function addMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0));
}

function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function toNum(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

async function fetchSupabaseMonth(sb, fromIso, toIso) {
  const rows = [];
  const pageSize = 1000;

  for (let offset = 0; offset < 200000; offset += pageSize) {
    const { data, error } = await sb
      .from("gp_fct_order_raw")
      .select("order_id,corp_client_id,user_w_vat_cost,driver_cost")
      .gte("lcl_order_due_dttm", fromIso)
      .lt("lcl_order_due_dttm", toIso)
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw new Error(`Supabase month fetch failed: ${error.message}`);
    }

    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
  }

  return {
    orders: rows.length,
    corpOrders: rows.filter((row) => row.corp_client_id !== null).length,
    userSum: rows.reduce((sum, row) => sum + toNum(row.user_w_vat_cost), 0),
    driverSum: rows.reduce((sum, row) => sum + toNum(row.driver_cost), 0),
  };
}

async function fetchSourceMonth(pg, fromIso, toIso) {
  const query = `
    with latest as (
      select distinct on (order_id)
        order_id,
        corp_client_id,
        user_w_vat_cost,
        driver_cost
      from taxi_cdm_order_rls_geo.fct_order
      where lcl_order_due_dttm >= $1
        and lcl_order_due_dttm < $2
      order by order_id, _etl_processed_dttm desc
    )
    select
      count(*)::bigint as orders,
      count(*) filter (where corp_client_id is not null)::bigint as corp_orders,
      coalesce(sum(user_w_vat_cost), 0)::numeric as user_sum,
      coalesce(sum(driver_cost), 0)::numeric as driver_sum
    from latest
  `;
  const row = (await pg.query(query, [fromIso, toIso])).rows[0];
  return {
    orders: toNum(row.orders),
    corpOrders: toNum(row.corp_orders),
    userSum: toNum(row.user_sum),
    driverSum: toNum(row.driver_sum),
  };
}

async function main() {
  const connection = loadDataGripConnection();
  const password = getRequiredEnv("GREENPLUM_PASSWORD");
  const supabaseUrl = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  const pg = new Client({
    host: connection.host,
    port: connection.port,
    database: connection.database,
    user: connection.user,
    password,
    ssl:
      process.env.GREENPLUM_SSL_MODE === "disable"
        ? false
        : { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
    statement_timeout: 1000 * 60 * 10,
  });
  const sb = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  await pg.connect();
  try {
    const boundsRows = await sb
      .from("gp_fct_order_raw")
      .select("lcl_order_due_dttm")
      .not("lcl_order_due_dttm", "is", null)
      .order("lcl_order_due_dttm", { ascending: true })
      .limit(1);
    const maxRows = await sb
      .from("gp_fct_order_raw")
      .select("lcl_order_due_dttm")
      .not("lcl_order_due_dttm", "is", null)
      .order("lcl_order_due_dttm", { ascending: false })
      .limit(1);

    if (boundsRows.error || maxRows.error) {
      throw new Error(
        `Failed to read Supabase bounds: ${(boundsRows.error || maxRows.error).message}`,
      );
    }

    const minDue = boundsRows.data?.[0]?.lcl_order_due_dttm;
    const maxDue = maxRows.data?.[0]?.lcl_order_due_dttm;
    if (!minDue || !maxDue) {
      process.stdout.write(
        JSON.stringify(
          {
            ok: true,
            message: "No data in gp_fct_order_raw for validation.",
            monthsChecked: 0,
            mismatches: [],
          },
          null,
          2,
        ),
      );
      return;
    }

    let cursor = new Date(minDue);
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1, 0, 0, 0));
    const end = new Date(maxDue);
    const endMonth = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1, 0, 0, 0));

    const months = [];
    for (let d = cursor; d <= endMonth; d = addMonth(d)) {
      months.push(new Date(d));
    }

    const mismatches = [];
    for (let index = 0; index < months.length; index += 1) {
      const monthStart = months[index];
      const monthEnd = addMonth(monthStart);
      const fromIso = startOfMonthIso(monthStart);
      const toIso = startOfMonthIso(monthEnd);
      const label = monthKey(monthStart);

      process.stdout.write(
        `[PROGRESS] step=${index + 1} total=${months.length} message=Validating ${label}\n`,
      );

      let source;
      try {
        source = await fetchSourceMonth(pg, fromIso, toIso);
      } catch (error) {
        mismatches.push({
          month: label,
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }

      const destination = await fetchSupabaseMonth(sb, fromIso, toIso);

      const diffOrders = source.orders - destination.orders;
      const diffCorpOrders = source.corpOrders - destination.corpOrders;
      const diffUserSum = source.userSum - destination.userSum;
      const diffDriverSum = source.driverSum - destination.driverSum;

      if (
        diffOrders !== 0 ||
        diffCorpOrders !== 0 ||
        Math.abs(diffUserSum) > 0.01 ||
        Math.abs(diffDriverSum) > 0.01
      ) {
        mismatches.push({
          month: label,
          source,
          destination,
          diff: {
            orders: diffOrders,
            corpOrders: diffCorpOrders,
            userSum: Number(diffUserSum.toFixed(2)),
            driverSum: Number(diffDriverSum.toFixed(2)),
          },
        });
      }
    }

    process.stdout.write(
      JSON.stringify(
        {
          ok: true,
          message:
            mismatches.length === 0
              ? "Validation passed. Source and Supabase are aligned by month."
              : "Validation finished with mismatches.",
          monthsChecked: months.length,
          mismatchesCount: mismatches.length,
          mismatches: mismatches.slice(0, 24),
        },
        null,
        2,
      ),
    );
  } finally {
    await pg.end().catch(() => null);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
