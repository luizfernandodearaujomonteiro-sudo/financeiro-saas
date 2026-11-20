import "server-only";
import { withUser } from "../db";
import { todayISO } from "../domain/dates";
import { sha256Hex } from "../security/crypto";
import { ingestStatement } from "../services/review";
import type { MemberCtx } from "../services/types";
import { putObject, StorageUnavailableError, storageAvailable } from "../storage";

export const MAX_PDF_BYTES = 8 * 1024 * 1024;

export const PDF_PASSWORD_NEEDED = "PDF protegido por senha";
export const PDF_PASSWORD_WRONG = "Senha do PDF incorreta";

/** PDF criptografado: sem senha (need) ou com senha errada (incorrect). A senha NUNCA vai para logs/erros. */
export class PdfPasswordError extends Error {
  constructor(public readonly kind: "need" | "incorrect") {
    super(kind === "need" ? PDF_PASSWORD_NEEDED : PDF_PASSWORD_WRONG);
    this.name = "PdfPasswordError";
  }
}

/** Extrai o texto. `password` é usada só em memória para abrir PDFs protegidos. */
export async function pdfToText(bytes: Uint8Array, password?: string): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  let doc;
  try {
    doc = await getDocumentProxy(new Uint8Array(bytes), password ? { password } : {});
  } catch (e) {
    const err = e as { name?: string; code?: number };
    if (err?.name === "PasswordException") throw new PdfPasswordError(err.code === 2 || password ? "incorrect" : "need");
    throw new Error("Não foi possível ler o PDF");
  }
  try {
    const { text } = await extractText(doc, { mergePages: false });
    return (Array.isArray(text) ? text : [text]).join("\n");
  } finally {
    await (doc as unknown as { destroy?: () => Promise<void> }).destroy?.().catch(() => {});
  }
}

/**
 * Guarda o documento (dedupe por sha256 por dono), extrai o texto e coloca os
 * itens na fila de revisão. Executa como o dono (RLS).
 * - `password`: senha do PDF, usada SÓ em memória (nunca gravada nem registrada).
 * - Documento já existente com erro de leitura (ex.: protegido por senha) é
 *   reprocessado quando chega de novo (com senha, ou pelo Gmail após cadastrar a senha).
 */
export async function ingestDocument(
  ctx: MemberCtx,
  input: { bytes: Uint8Array; fileName: string; source: "upload" | "gmail"; cardId?: string | null; gmailMessageId?: string | null; textOverride?: string; password?: string | null },
) {
  const isPdf = input.bytes.length > 4 && Buffer.from(input.bytes.subarray(0, 5)).toString("latin1") === "%PDF-";
  if (!isPdf && input.textOverride === undefined) throw new Error("O arquivo não é um PDF");
  if (input.bytes.length > MAX_PDF_BYTES) throw new Error("PDF maior que 8 MB");
  const sha = sha256Hex(input.bytes);
  const existing = await withUser(ctx.userId, (db) =>
    db.one<{ id: string; parse_error: string | null }>("select id, parse_error from public.fin_financeiro_invoice_documents where owner_id = auth.uid() and sha256 = $1", [sha]),
  );
  if (existing && !existing.parse_error) return { duplicate: true as const, documentId: existing.id, parsed: 0, inserted: 0, parseError: null };

  let documentId = existing?.id ?? null;
  if (!documentId) {
    if (!storageAvailable()) throw new StorageUnavailableError(); // documento novo precisa ser guardado
    const ext = isPdf ? "pdf" : "txt";
    const storagePath = `${ctx.householdId}/${ctx.userId}/${sha}.${ext}`;
    await putObject(storagePath, input.bytes, isPdf ? "application/pdf" : "text/plain");
    const doc = await withUser(ctx.userId, (db) =>
      db.one<{ id: string }>(
        `insert into public.fin_financeiro_invoice_documents (household_id, owner_id, card_id, source, gmail_message_id, file_name, storage_path, sha256)
         values ($1, auth.uid(), $2, $3, $4, $5, $6, $7) returning id`,
        [ctx.householdId, input.cardId ?? null, input.source, input.gmailMessageId ?? null, input.fileName.slice(0, 200), storagePath, sha],
      ),
    );
    documentId = doc!.id;
  }

  let text = input.textOverride ?? "";
  let parseError: string | null = null;
  if (isPdf && input.textOverride === undefined) {
    try {
      text = await pdfToText(input.bytes, input.password ?? undefined);
    } catch (e) {
      parseError = e instanceof PdfPasswordError ? e.message : (e instanceof Error ? e.message : "falha ao ler PDF").slice(0, 200);
    }
  }
  const r = parseError
    ? { parsed: 0, inserted: 0, duplicates: 0 }
    : await ingestStatement(ctx, { text, source: input.source, documentId, cardId: input.cardId, reference: todayISO() });
  await withUser(ctx.userId, (db) =>
    db.query("update public.fin_financeiro_invoice_documents set parsed_items = $2, parse_error = $3 where id = $1", [documentId, r.parsed, parseError]),
  );
  return { duplicate: false as const, documentId, parsed: r.parsed, inserted: r.inserted, parseError, reprocessed: Boolean(existing) };
}
