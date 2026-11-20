/**
 * Aplica no banco LOCAL: (1) shim local do Supabase, (2) migrations fin_financeiro_ de
 * supabase/migrations (as mesmas que irão para produção), (3) stubs locais
 * das tabelas invest_* (somente local; nunca vão para o Supabase).
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { ROOT } from "./cluster";

export async function ensureDatabase(adminUrl: string, database: string) {
  const u = new URL(adminUrl);
  u.pathname = "/postgres";
  const c = new pg.Client({ connectionString: u.toString() });
  await c.connect();
  try {
    const r = await c.query("select 1 from pg_database where datname = $1", [database]);
    if (!r.rowCount) await c.query(`create database "${database.replace(/"/g, "")}"`);
  } finally {
    await c.end();
  }
}

function sqlFiles(dir: string): string[] {
  const full = path.join(ROOT, dir);
  return fs.readdirSync(full).filter((f) => f.endsWith(".sql")).sort().map((f) => path.join(full, f));
}

export async function migrate(url: string, log: (m: string) => void = console.log, opts: { appPassword?: string } = {}) {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    await c.query("create schema if not exists local_meta");
    await c.query("create table if not exists local_meta.applied (name text primary key, applied_at timestamptz default now())");
    const files = [
      ...sqlFiles("supabase/local").filter((f) => path.basename(f).startsWith("00_")),
      ...sqlFiles("supabase/migrations"),
      ...sqlFiles("supabase/local").filter((f) => !path.basename(f).startsWith("00_")),
    ];
    for (const file of files) {
      const name = path.relative(ROOT, file);
      const done = await c.query("select 1 from local_meta.applied where name = $1", [name]);
      if (done.rowCount) continue;
      const sql = fs.readFileSync(file, "utf8");
      await c.query("begin");
      try {
        await c.query(sql);
        await c.query("insert into local_meta.applied (name) values ($1)", [name]);
        await c.query("commit");
        log(`  ✓ ${name}`);
      } catch (e) {
        await c.query("rollback");
        throw new Error(`falha em ${name}: ${(e as Error).message}`);
      }
    }
    // senha LOCAL do papel fin_financeiro_app (o shim cria o papel sem senha)
    const pw = opts.appPassword ?? process.env.LOCAL_PG_APP_PASSWORD ?? "fam-app-local-dev";
    await c.query(`alter role fin_financeiro_app with login password '${pw.replace(/'/g, "''")}'`);
  } finally {
    await c.end();
  }
}
