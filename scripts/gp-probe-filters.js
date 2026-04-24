require("dotenv").config({ path: ".env.local", quiet: true });

const { Client } = require("pg");
const { loadDataGripConnection } = require("./lib/datagrip-connection");

async function runProbe(pg, name, query, params) {
  const started = Date.now();
  try {
    const result = await pg.query(query, params);
    const elapsed = Date.now() - started;
    console.log(`${name}: ok in ${elapsed}ms, rows=${result.rows.length}`);
  } catch (error) {
    const elapsed = Date.now() - started;
    console.log(`${name}: fail in ${elapsed}ms, error=${error.message}`);
  }
}

async function main() {
  const connection = loadDataGripConnection();
  const pg = new Client({
    host: connection.host,
    port: connection.port,
    database: connection.database,
    user: connection.user,
    password: process.env.GREENPLUM_PASSWORD,
    ssl:
      process.env.GREENPLUM_SSL_MODE === "disable"
        ? false
        : { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
    statement_timeout: 60000,
  });

  await pg.connect();
  try {
    const from = "2026-01-01";
    const to = "2026-01-02";

    await runProbe(
      pg,
      "_etl_processed_dttm",
      `select order_id
       from taxi_cdm_order_rls_geo.fct_order
       where _etl_processed_dttm >= $1
         and _etl_processed_dttm < $2
         and corp_client_id is not null
       limit 1`,
      [from, to],
    );

    await runProbe(
      pg,
      "msk_order_created_dt",
      `select order_id
       from taxi_cdm_order_rls_geo.fct_order
       where msk_order_created_dt >= $1::date
         and msk_order_created_dt < $2::date
         and corp_client_id is not null
       limit 1`,
      [from, to],
    );

    await runProbe(
      pg,
      "utc_order_created_dt",
      `select order_id
       from taxi_cdm_order_rls_geo.fct_order
       where utc_order_created_dt >= $1::date
         and utc_order_created_dt < $2::date
         and corp_client_id is not null
       limit 1`,
      [from, to],
    );

    await runProbe(
      pg,
      "lcl_order_due_dttm",
      `select order_id
       from taxi_cdm_order_rls_geo.fct_order
       where lcl_order_due_dttm >= $1
         and lcl_order_due_dttm < $2
         and corp_client_id is not null
       limit 1`,
      [from, to],
    );
  } finally {
    await pg.end().catch(() => null);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
