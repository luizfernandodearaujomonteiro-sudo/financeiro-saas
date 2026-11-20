/**
 * CLI do banco local:  tsx scripts/db/local.ts <start|stop|status|migrate|seed|reset|url>
 */
import { connectionString, destroy, devClusterOptions, isRunning, start, stop } from "./cluster";
import { ensureDatabase, migrate } from "./migrate";
import { seed } from "./seed";

const o = devClusterOptions();
const url = connectionString(o);
const cmd = process.argv[2];

async function main() {
  switch (cmd) {
    case "start":
      console.log(start(o) ? `Postgres local iniciado em 127.0.0.1:${o.port} (${o.dataDir})` : "Postgres local já está rodando");
      await ensureDatabase(url, o.database);
      break;
    case "stop":
      console.log(stop(o) ? "Postgres local parado" : "Postgres local não estava rodando");
      break;
    case "status":
      console.log(isRunning(o) ? `rodando em 127.0.0.1:${o.port}` : "parado");
      break;
    case "migrate":
      start(o);
      await ensureDatabase(url, o.database);
      console.log("Aplicando migrations no banco LOCAL:");
      await migrate(url);
      break;
    case "seed":
      await seed(url);
      break;
    case "reset":
      destroy(o);
      start(o);
      await ensureDatabase(url, o.database);
      await migrate(url);
      await seed(url);
      break;
    case "url":
      console.log(url);
      break;
    default:
      console.log("uso: tsx scripts/db/local.ts <start|stop|status|migrate|seed|reset|url>");
      process.exit(1);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
