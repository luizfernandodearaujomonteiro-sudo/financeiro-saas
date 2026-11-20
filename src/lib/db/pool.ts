import pg from "pg";

// Tipos: bigint (int8) -> number seguro; numeric -> string; date -> "YYYY-MM-DD" (sem fuso).
pg.types.setTypeParser(20, (v: string) => {
  const n = Number(v);
  if (!Number.isSafeInteger(n)) throw new Error("bigint fora do limite seguro");
  return n;
});
pg.types.setTypeParser(1082, (v: string) => v);

const globalForPool = globalThis as unknown as { __famPools?: Map<string, pg.Pool> };

export function getPool(url: string): pg.Pool {
  globalForPool.__famPools ??= new Map();
  let pool = globalForPool.__famPools.get(url);
  if (!pool) {
    const isLocal = /@(127\.0\.0\.1|localhost)[:/]/.test(url);
    pool = new pg.Pool({
      connectionString: url,
      max: isLocal ? 10 : 3,
      idleTimeoutMillis: 10_000,
      ssl: isLocal ? undefined : { rejectUnauthorized: false },
    });
    globalForPool.__famPools.set(url, pool);
  }
  return pool;
}

export async function closePools() {
  for (const p of globalForPool.__famPools?.values() ?? []) await p.end();
  globalForPool.__famPools?.clear();
}
