/** Sobe tudo localmente: .env.local, Postgres local, migrations, seed (se vazio) e `next dev`. */
import { spawn } from "node:child_process";
import pg from "pg";
import { connectionString, devClusterOptions, start, stop, ROOT } from "./db/cluster";
import { ensureDatabase, migrate } from "./db/migrate";
import { seed } from "./db/seed";
import { ensureLocalEnv } from "./setup-local";

async function main() {
  ensureLocalEnv();
  const o = devClusterOptions();
  const url = connectionString(o);
  const started = start(o);
  await ensureDatabase(url, o.database);
  await migrate(url, () => {});
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  const n = (await c.query("select count(*)::int n from public.fam_households")).rows[0].n;
  await c.end();
  if (!n) await seed(url);
  console.log(`\nPostgres local em 127.0.0.1:${o.port}. Abrindo o app em http://localhost:3000 …\n`);
  const child = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "dev", "-p", process.env.PORT ?? "3000"], { cwd: ROOT, stdio: "inherit", env: process.env });
  const shutdown = () => {
    child.kill("SIGTERM");
    if (started) stop(o); // só para o Postgres se foi este script que o iniciou
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  child.on("exit", () => shutdown());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
