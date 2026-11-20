/**
 * Armazenamento de PDFs de fatura.
 *  - local: sistema de arquivos (.local/storage), usado no desenvolvimento;
 *  - supabase: bucket privado "fin_financeiro_faturas" (criado manualmente). O acesso ao arquivo usa a
 *    service key SOMENTE no servidor e SEMPRE depois de a RLS confirmar (fin_financeiro_invoice_documents)
 *    que o documento pertence ao usuário. O navegador nunca recebe chaves nem URLs públicas.
 * Caminho: <household_id>/<owner_id>/<sha256>.pdf
 */
import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { env } from "../env";

export const BUCKET = "fin_financeiro_faturas";

function safePath(p: string): string {
  if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f]{64}\.(pdf|txt)$/.test(p)) throw new Error("caminho de arquivo inválido");
  return p;
}

function localFile(p: string) {
  return path.resolve(env.localStorageDir, BUCKET, safePath(p));
}

export const STORAGE_UNAVAILABLE_MESSAGE =
  "Upload de PDF indisponível no momento: o armazenamento de arquivos (Supabase Storage) ainda não foi configurado. Login, painel e lançamentos funcionam normalmente.";

/** Armazenamento indisponível (ex.: produção sem SUPABASE_SERVICE_ROLE_KEY). */
export class StorageUnavailableError extends Error {
  constructor() {
    super(STORAGE_UNAVAILABLE_MESSAGE);
    this.name = "StorageUnavailableError";
  }
}

/** Local: sempre. Supabase: só com URL + service key (opcional — sem ela, apenas o upload de PDF fica desligado). */
export function storageAvailable(): boolean {
  return env.storageDriver === "local" || Boolean(env.supabaseUrl() && env.supabaseServiceRoleKey());
}

function serviceClient() {
  const url = env.supabaseUrl(), key = env.supabaseServiceRoleKey();
  if (!url || !key) throw new StorageUnavailableError();
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function putObject(p: string, bytes: Uint8Array, contentType: string) {
  if (env.storageDriver === "local") {
    const f = localFile(p);
    await fs.mkdir(path.dirname(f), { recursive: true });
    await fs.writeFile(f, bytes, { mode: 0o600 });
    return;
  }
  // O bucket privado "fin_financeiro_faturas" é criado MANUALMENTE no painel do Supabase (ver docs/ENTREGA.md):
  // o app não cria nem altera buckets no projeto compartilhado.
  const { error } = await serviceClient().storage.from(BUCKET).upload(safePath(p), bytes, { contentType, upsert: true });
  if (error) throw new Error(/not found/i.test(error.message) ? `bucket privado "${BUCKET}" não existe — crie-o no painel do Supabase` : `falha no upload: ${error.message}`);
}

/** Lê o arquivo. Chame SOMENTE depois de confirmar via RLS que o usuário pode ver o documento. */
export async function getObject(p: string): Promise<Uint8Array> {
  if (env.storageDriver === "local") return new Uint8Array(await fs.readFile(localFile(p)));
  const sb = serviceClient();
  const { data, error } = await sb.storage.from(BUCKET).download(safePath(p));
  if (error || !data) throw new Error("arquivo indisponível");
  return new Uint8Array(await data.arrayBuffer());
}
