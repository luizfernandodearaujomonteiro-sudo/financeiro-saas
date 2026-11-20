/**
 * Acesso ao Postgres.
 *
 * - withUser(userId): transação com `SET LOCAL ROLE authenticated` e o claim
 *   `request.jwt.claims` = { sub: userId, role: "authenticated" } — o mesmo
 *   mecanismo do PostgREST/Supabase. TODAS as políticas RLS se aplicam.
 * - withAnon(): papel anon (apenas RPCs liberadas, ex.: limite de login).
 * - withService(): SOMENTE para jobs (cron), webhooks e log de mensagens:
 *   `SET LOCAL ROLE service_role` (só DML; ignora RLS). Atenção: no Supabase o
 *   service_role também alcança tabelas de outros apps do projeto (limitação
 *   conhecida, ver docs/ENTREGA.md) — por isso o uso é restrito e auditado.
 *
 * A conexão (DATABASE_URL) usa o papel fam_app (NOINHERIT): sem SET ROLE ele não
 * tem privilégio algum; nunca use o papel postgres no app.
 *
 * O userId passado para withUser SEMPRE vem da sessão validada no servidor
 * (Supabase Auth ou sessão local assinada), nunca do navegador.
 */
import "server-only";
import type pg from "pg";
import { getPool } from "./pool";
import { env } from "../env";

export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  one<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>;
}

let urlResolver: () => string = () => env.databaseUrl;

/** Usado em testes para apontar para o banco de teste. */
export function setDatabaseUrlResolver(fn: () => string) {
  urlResolver = fn;
}

function wrap(client: pg.PoolClient): Db {
  return {
    async query<T>(sql: string, params: unknown[] = []) {
      const r = await client.query(sql, params);
      return r.rows as T[];
    },
    async one<T>(sql: string, params: unknown[] = []) {
      const r = await client.query(sql, params);
      return (r.rows[0] as T) ?? null;
    },
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function tx<T>(setup: (c: pg.PoolClient) => Promise<void>, fn: (db: Db) => Promise<T>): Promise<T> {
  const client = await getPool(urlResolver()).connect();
  try {
    await client.query("begin");
    await setup(client);
    const out = await fn(wrap(client));
    await client.query("commit");
    return out;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export function withUser<T>(userId: string, fn: (db: Db) => Promise<T>): Promise<T> {
  if (!UUID_RE.test(userId)) return Promise.reject(new Error("userId inválido"));
  return tx(async (c) => {
    await c.query("set local role authenticated");
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: "authenticated" })]);
  }, fn);
}

export function withAnon<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  return tx(async (c) => {
    await c.query("set local role anon");
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "anon" })]);
  }, fn);
}

/** Somente jobs/webhooks/log de mensagens. Nunca para ler dados em rotas do navegador. */
export function withService<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  return tx(async (c) => {
    await c.query("set local role service_role");
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "service_role" })]);
  }, fn);
}
