const fs = require("node:fs");
const path = require("node:path");
const { XMLParser } = require("fast-xml-parser");

function getDefaultHistoryPath() {
  const homeDir = process.env.HOME || "";
  return path.join(
    homeDir,
    "Library/Application Support/JetBrains/DataGrip2026.1/dataSourcesHistory/c76e2af9/data_sources_history.xml",
  );
}

function normalizeDataSourceEntry(entry) {
  const source = entry["data-source"];
  if (!source) {
    return null;
  }

  const jdbcUrl = source["jdbc-url"];
  const userName = source["user-name"];
  const uuid = source.uuid;
  const name = source.name;

  if (!jdbcUrl || !userName) {
    return null;
  }

  const match = jdbcUrl.match(/^jdbc:postgresql:\/\/([^:/?#]+)(?::(\d+))?\/([^?]+)$/i);
  if (!match) {
    return null;
  }

  return {
    uuid,
    name,
    jdbcUrl,
    host: match[1],
    port: Number(match[2] || "5432"),
    database: match[3],
    user: userName,
  };
}

function loadDataGripConnection() {
  const historyPath =
    process.env.DATAGRIP_DATASOURCES_HISTORY_PATH || getDefaultHistoryPath();

  if (!fs.existsSync(historyPath)) {
    throw new Error(`DataGrip history file not found: ${historyPath}`);
  }

  const xmlContent = fs.readFileSync(historyPath, "utf8");
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    isArray: (name) => name === "DataSourceFromHistory",
  });
  const payload = parser.parse(xmlContent);
  const rows = payload?.DataSourcesHistory?.DataSourceFromHistory || [];
  const entries = rows.map(normalizeDataSourceEntry).filter(Boolean);

  if (entries.length === 0) {
    throw new Error(
      "No valid PostgreSQL/Greenplum data source found in DataGrip history file.",
    );
  }

  const requestedUuid = process.env.DATAGRIP_DATASOURCE_UUID;
  if (requestedUuid) {
    const exact = entries.find((item) => item.uuid === requestedUuid);
    if (exact) {
      return exact;
    }
    throw new Error(`DataGrip data source uuid not found: ${requestedUuid}`);
  }

  return entries[0];
}

module.exports = {
  loadDataGripConnection,
};
