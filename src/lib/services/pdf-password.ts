/**
 * Senha dos PDFs de fatura por perfil (opcional). Cifrada com AES-256-GCM antes de
 * ir ao banco; gravada via RPC SECURITY DEFINER do próprio usuário; nunca devolvida
 * ao navegador nem registrada em log. Lida apenas pelo job do Gmail.
 */
import "server-only";
import { z } from "zod";
import { withService, withUser } from "../db";
import { decryptSecret, encryptSecret } from "../security/crypto";
import type { MemberCtx } from "./types";

export async function savePdfPassword(ctx: MemberCtx, plain: string) {
  const pw = z.string().min(1, "Informe a senha").max(64).parse(plain);
  await withUser(ctx.userId, (db) => db.query("select public.fam_set_pdf_password($1)", [encryptSecret(pw)]));
}

export async function clearPdfPassword(ctx: MemberCtx) {
  await withUser(ctx.userId, (db) => db.query("select public.fam_set_pdf_password(null)"));
}

export async function hasPdfPassword(ctx: MemberCtx): Promise<boolean> {
  return withUser(ctx.userId, async (db) => (await db.one<{ ok: boolean }>("select public.fam_has_pdf_password() as ok"))?.ok ?? false);
}

/** Somente jobs (service_role): senha em claro, usada só em memória. */
export async function pdfPasswordForJob(userId: string): Promise<string | null> {
  const row = await withService((db) => db.one<{ password_enc: string }>("select password_enc from public.fam_pdf_passwords where user_id = $1", [userId]));
  if (!row) return null;
  try {
    return decryptSecret(row.password_enc);
  } catch {
    return null;
  }
}
