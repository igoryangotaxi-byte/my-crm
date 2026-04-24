require("dotenv").config({ path: ".env.local", quiet: true });

const { Client } = require("pg");
const { loadDataGripConnection } = require("./lib/datagrip-connection");

async function main() {
  const connection = loadDataGripConnection();
  const password = process.env.GREENPLUM_PASSWORD;

  if (!password) {
    throw new Error("GREENPLUM_PASSWORD is missing in environment.");
  }

  const client = new Client({
    host: connection.host,
    port: connection.port,
    database: connection.database,
    user: connection.user,
    password,
    ssl:
      process.env.GREENPLUM_SSL_MODE === "disable"
        ? false
        : { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
    statement_timeout: 15000,
  });

  try {
    await client.connect();
    await client.query("select 1");
    process.stdout.write(
      `DataGrip connection check passed: ${connection.user}@${connection.host}:${connection.port}/${connection.database}\n`,
    );
  } finally {
    await client.end().catch(() => null);
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
