/**
 * Postgres LOCAL (binários do pacote embedded-postgres, versão 15 = mesma do Supabase).
 * Dados em .local/<dir> (gitignored), escuta só em 127.0.0.1 numa porta não padrão.
 * Nunca se conecta a nenhum banco remoto.
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");

export interface ClusterOptions {
  dataDir: string; // relativo à raiz do projeto
  port: number;
  password: string; // superusuário postgres: SOMENTE migrations/seed
  appPassword: string; // papel fin_financeiro_app (NOINHERIT): usado pelo app e pelos testes
  database: string;
}

export function devClusterOptions(): ClusterOptions {
  return {
    dataDir: process.env.LOCAL_PG_DATA_DIR ?? ".local/pgdata",
    port: Number(process.env.LOCAL_PG_PORT ?? 54329),
    password: process.env.LOCAL_PG_PASSWORD ?? "fam-local-dev",
    appPassword: process.env.LOCAL_PG_APP_PASSWORD ?? "fam-app-local-dev",
    database: process.env.LOCAL_PG_DATABASE ?? "financeiro",
  };
}

export function testClusterOptions(): ClusterOptions {
  return { dataDir: ".local/pgdata-test", port: Number(process.env.TEST_PG_PORT ?? 54330), password: "fam-local-test", appPassword: "fam-app-local-test", database: "financeiro_test" };
}

/** Superusuário: somente para migrations/seed. */
export function connectionString(o: ClusterOptions): string {
  return `postgres://postgres:${encodeURIComponent(o.password)}@127.0.0.1:${o.port}/${o.database}`;
}

/** Papel do app (fin_financeiro_app, NOINHERIT) — como em produção. */
export function appConnectionString(o: ClusterOptions): string {
  return `postgres://fin_financeiro_app:${encodeURIComponent(o.appPassword)}@127.0.0.1:${o.port}/${o.database}`;
}

function binDir(): string {
  // o pacote só exporta dist/index.js; os binários ficam em ../native/bin
  const entry = require.resolve("@embedded-postgres/linux-x64");
  return path.join(path.dirname(entry), "..", "native", "bin");
}

function abs(p: string) {
  return path.isAbsolute(p) ? p : path.join(ROOT, p);
}

export function isRunning(o: ClusterOptions): boolean {
  const pid = path.join(abs(o.dataDir), "postmaster.pid");
  if (!fs.existsSync(pid)) return false;
  const r = spawnSync(path.join(binDir(), "pg_ctl"), ["status", "-D", abs(o.dataDir)], { encoding: "utf8" });
  return r.status === 0;
}

export function initIfNeeded(o: ClusterOptions) {
  const dir = abs(o.dataDir);
  if (fs.existsSync(path.join(dir, "PG_VERSION"))) return;
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const pwfile = path.join(path.dirname(dir), `.pw-${path.basename(dir)}`);
  fs.writeFileSync(pwfile, o.password, { mode: 0o600 });
  try {
    execFileSync(path.join(binDir(), "initdb"), ["-D", dir, "-U", "postgres", "--auth=scram-sha-256", `--pwfile=${pwfile}`, "-E", "UTF8", "--no-locale"], { stdio: "pipe" });
  } finally {
    fs.rmSync(pwfile, { force: true });
  }
}

export function start(o: ClusterOptions) {
  initIfNeeded(o);
  if (isRunning(o)) return false;
  const dir = abs(o.dataDir);
  const sock = path.join(path.dirname(dir), "sock");
  fs.mkdirSync(sock, { recursive: true, mode: 0o700 });
  const opts = `-p ${o.port} -c listen_addresses=127.0.0.1 -c unix_socket_directories=${sock} -c timezone=UTC -c fsync=off`;
  execFileSync(path.join(binDir(), "pg_ctl"), ["start", "-D", dir, "-w", "-t", "60", "-l", path.join(path.dirname(dir), `${path.basename(dir)}.log`), "-o", opts], { stdio: "pipe" });
  return true;
}

export function stop(o: ClusterOptions) {
  if (!isRunning(o)) return false;
  execFileSync(path.join(binDir(), "pg_ctl"), ["stop", "-D", abs(o.dataDir), "-m", "fast", "-w"], { stdio: "pipe" });
  return true;
}

export function destroy(o: ClusterOptions) {
  stop(o);
  fs.rmSync(abs(o.dataDir), { recursive: true, force: true });
}
