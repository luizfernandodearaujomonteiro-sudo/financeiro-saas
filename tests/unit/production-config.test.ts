import { afterEach, describe, expect, it } from "vitest";
import { toQueryConfig } from "@/lib/db";
import { putObject, STORAGE_UNAVAILABLE_MESSAGE, StorageUnavailableError, storageAvailable } from "@/lib/storage";

const saved = { ...process.env };
afterEach(() => {
  for (const k of ["STORAGE_DRIVER", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_URL", "LOCAL_DEV_AUTH"]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("pooler do Supabase em modo transaction", () => {
  it("consultas nunca usam prepared statement NOMEADO", () => {
    const cfg = toQueryConfig("select $1::int as n", [1]);
    expect(cfg).toEqual({ text: "select $1::int as n", values: [1] });
    expect("name" in cfg).toBe(false);
  });
});

describe("produção sem SUPABASE_SERVICE_ROLE_KEY", () => {
  it("Storage fica indisponível com mensagem clara (só o upload de PDF é afetado)", async () => {
    process.env.STORAGE_DRIVER = "supabase";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://exemplo.supabase.co";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(storageAvailable()).toBe(false);
    const err = await putObject(`${"a".repeat(8)}-0000-4000-8000-000000000000/${"b".repeat(8)}-0000-4000-8000-000000000000/${"c".repeat(64)}.pdf`, new Uint8Array([1]), "application/pdf").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StorageUnavailableError);
    expect((err as Error).message).toBe(STORAGE_UNAVAILABLE_MESSAGE);
  });
  it("com a chave (ou no modo local) o Storage fica disponível", () => {
    process.env.STORAGE_DRIVER = "supabase";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://exemplo.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-de-teste";
    expect(storageAvailable()).toBe(true);
    process.env.STORAGE_DRIVER = "local";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(storageAvailable()).toBe(true);
  });
  it("login de produção usa Supabase Auth (signInWithPassword) com URL/anon key públicas — sem service role", async () => {
    const fs = await import("node:fs");
    const session = fs.readFileSync("src/lib/auth/session.ts", "utf8");
    const supa = fs.readFileSync("src/lib/auth/supabase.ts", "utf8");
    expect(session).toContain("supabase.auth.signInWithPassword");
    expect(supa).toContain("env.supabaseUrl()");
    expect(supa).toContain("env.supabaseAnonKey()");
    expect(session + supa).not.toMatch(/SERVICE_ROLE|supabaseServiceRoleKey/);
  });
});
