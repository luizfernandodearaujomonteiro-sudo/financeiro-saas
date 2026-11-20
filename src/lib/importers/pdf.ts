import "server-only";
import { withUser } from "../db";
import { todayISO } from "../domain/dates";
import { sha256Hex } from "../security/crypto";
import { ingestStatement } from "../services/review";
import type { MemberCtx } from "../services/types";
import { putObject } from "../storage";

export const MAX_PDF_BYTES = 8 * 1024 * 1024;

export async function pdfToText(bytes: Uint8Array): Promise<string> {
  const { extractText } = await import("unpdf");
  const { text } = await extractText(new Uint8Array(bytes), { mergePages: false });
  return (Array.isArray(text) ? text : [text]).join("\n");
}

/**
 * Guarda o documento (dedupe por sha256 por dono), extrai o texto e coloca os
 * itens na fila de revisão. Executa como o dono (RLS).
 */
export async function ingestDocument(
  ctx: MemberCtx,
  input: { bytes: Uint8Array; fileName: string; source: "upload" | "gmail"; cardId?: string | null; gmailMessageId?: string | null; textOverride?: string },
) {
  const isPdf = input.bytes.length > 4 && Buffer.from(input.bytes.subarray(0, 5)).toString("latin1") === "%PDF-";
  if (!isPdf && input.textOverride === undefined) throw new Error("O arquivo não é um PDF");
  if (input.bytes.length > MAX_PDF_BYTES) throw new Error("PDF maior que 8 MB");
  const sha = sha256Hex(input.bytes);
  const existing = await withUser(ctx.userId, (db) => db.one<{ id: string }>("select id from public.fam_invoice_documents where owner_id = auth.uid() and sha256 = $1", [sha]));
  if (existing) return { duplicate: true as const, documentId: existing.id, parsed: 0, inserted: 0 };

  const ext = isPdf ? "pdf" : "txt";
  const storagePath = `${ctx.householdId}/${ctx.userId}/${sha}.${ext}`;
  await putObject(storagePath, input.bytes, isPdf ? "application/pdf" : "text/plain");
  let text = input.textOverride ?? "";
  let parseError: string | null = null;
  if (isPdf && input.textOverride === undefined) {
    try {
      text = await pdfToText(input.bytes);
    } catch (e) {
      parseError = e instanceof Error ? e.message.slice(0, 200) : "falha ao ler PDF"; // ex.: PDF com senha (ver TODO no ENTREGA.md)
    }
  }
  const doc = await withUser(ctx.userId, (db) =>
    db.one<{ id: string }>(
      `insert into public.fam_invoice_documents (household_id, owner_id, card_id, source, gmail_message_id, file_name, storage_path, sha256, parse_error)
       values ($1, auth.uid(), $2, $3, $4, $5, $6, $7, $8) returning id`,
      [ctx.householdId, input.cardId ?? null, input.source, input.gmailMessageId ?? null, input.fileName.slice(0, 200), storagePath, sha, parseError],
    ),
  );
  const r = parseError ? { parsed: 0, inserted: 0, duplicates: 0 } : await ingestStatement(ctx, { text, source: input.source, documentId: doc!.id, cardId: input.cardId, reference: todayISO() });
  await withUser(ctx.userId, (db) => db.query("update public.fam_invoice_documents set parsed_items = $2 where id = $1", [doc!.id, r.parsed]));
  return { duplicate: false as const, documentId: doc!.id, parsed: r.parsed, inserted: r.inserted, parseError };
}
