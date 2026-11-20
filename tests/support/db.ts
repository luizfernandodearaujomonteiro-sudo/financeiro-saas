/** Banco de TESTE local (porta 54330, .local/pgdata-test). Recriado do zero por arquivo de teste. */
import pg from "pg";
import { connectionString, start, testClusterOptions } from "../../scripts/db/cluster";
import { migrate } from "../../scripts/db/migrate";
import { seed } from "../../scripts/db/seed";

export const testOpts = testClusterOptions();
export const testUrl = connectionString(testOpts);

export async function freshTestDb(opts: { today?: string } = {}) {
  start(testOpts);
  const admin = new URL(testUrl);
  admin.pathname = "/postgres";
  const c = new pg.Client({ connectionString: admin.toString() });
  await c.connect();
  await c.query(`drop database if exists ${testOpts.database} with (force)`);
  await c.query(`create database ${testOpts.database}`);
  await c.end();
  await migrate(testUrl, () => {});
  const s = await seed(testUrl, { quiet: true, today: opts.today });
  return { url: testUrl, ...s };
}

/** Executa como um usuário autenticado (mesmo mecanismo do app/PostgREST). */
export async function asUser<T>(pool: pg.Pool, userId: string | null, fn: (c: pg.PoolClient) => Promise<T>, role: "authenticated" | "anon" = "authenticated"): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query(`set local role ${role}`);
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(userId ? { sub: userId, role } : { role })]);
    const r = await fn(c);
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
