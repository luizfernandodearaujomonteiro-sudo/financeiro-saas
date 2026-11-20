/**
 * Armazenamento de PDFs de fatura.
 *  - local: sistema de arquivos (.local/storage), usado no desenvolvimento;
 *  - supabase: bucket privado "fam_faturas". Jobs usam service role para enviar;
 *    o navegador NUNCA recebe chaves — downloads passam por rota autenticada.
 * Caminho: <household_id>/<owner_id>/<sha256>.pdf
 */
import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { env } from "../env";

export const BUCKET = "fam_faturas";

function safePath(p: string): string {
  if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f]{64}\.(pdf|txt)$/.test(p)) throw new Error("caminho de arquivo inválido");
  return p;
}

function localFile(p: string) {
  return path.resolve(env.localStorageDir, BUCKET, safePath(p));
}

function serviceClient() {
  const url = env.supabaseUrl(), key = env.supabaseServiceRoleKey();
  if (!url || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY necessário para o armazenamento em produção");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function putObject(p: string, bytes: Uint8Array, contentType: string) {
  if (env.storageDriver === "local") {
    const f = localFile(p);
    await fs.mkdir(path.dirname(f), { recursive: true });
    await fs.writeFile(f, bytes, { mode: 0o600 });
    return;
  }
  const sb = serviceClient();
  const { error } = await sb.storage.from(BUCKET).upload(safePath(p), bytes, { contentType, upsert: true });
  if (error && /not found/i.test(error.message)) {
    await sb.storage.createBucket(BUCKET, { public: false });
    const retry = await sb.storage.from(BUCKET).upload(p, bytes, { contentType, upsert: true });
    if (retry.error) throw new Error(`falha no upload: ${retry.error.message}`);
  } else if (error) {
    throw new Error(`falha no upload: ${error.message}`);
  }
}

/** Lê o arquivo. Chame SOMENTE depois de confirmar via RLS que o usuário pode ver o documento. */
export async function getObject(p: string): Promise<Uint8Array> {
  if (env.storageDriver === "local") return new Uint8Array(await fs.readFile(localFile(p)));
  const { data, error } = await serviceClient().storage.from(BUCKET).download(safePath(p));
  if (error || !data) throw new Error("arquivo indisponível");
  return new Uint8Array(await data.arrayBuffer());
}
