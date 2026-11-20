/**
 * Job (cron) do Gmail: para cada perfil conectado, busca e-mails de fatura com
 * PDF, deduplica (sha256), guarda no Storage, extrai o texto e coloca na fila
 * de revisão do dono. Modo mock (local) usa uma fatura de exemplo.
 */
import "server-only";
import { withService, withUser } from "../db";
import { addDays, formatDateBR, todayISO } from "../domain/dates";
import { env } from "../env";
import { ingestDocument } from "../importers/pdf";
import { decryptSecret } from "../security/crypto";
import { refreshAccessToken } from "./oauth";

export const GMAIL_QUERY = 'has:attachment filename:pdf newer_than:45d (fatura OR "cartão de crédito" OR "cartao de credito")';

export function mockStatementText(today = todayISO()): string {
  const d = (n: number) => formatDateBR(addDays(today, -n)).slice(0, 5);
  return [
    "FATURA DO CARTÃO — BANCO EXEMPLO",
    "Data  Descrição  Valor",
    `${d(2)}  PADARIA PAO QUENTE  18,50`,
    `${d(4)}  POSTO IPIRANGA CENTRO  210,00`,
    `${d(6)}  MAGAZINE LOJA PARC 02/06  149,90`,
    `${d(8)}  DROGARIA SAO PAULO  47,35`,
    `${d(9)}  ESTORNO COMPRA DUPLICADA  -32,00`,
    "TOTAL DA FATURA  393,75",
  ].join("\n");
}

interface Conn {
  user_id: string;
  household_id: string;
  refresh_token_enc: string | null;
}

async function listGmailAttachments(accessToken: string) {
  const h = { Authorization: `Bearer ${accessToken}` };
  const list = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20&q=${encodeURIComponent(GMAIL_QUERY)}`, { headers: h });
  if (!list.ok) throw new Error(`Gmail list HTTP ${list.status}`);
  const ids = ((await list.json()) as { messages?: { id: string }[] }).messages ?? [];
  const out: { messageId: string; fileName: string; bytes: Uint8Array }[] = [];
  for (const { id } of ids) {
    const msg = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, { headers: h });
    if (!msg.ok) continue;
    type Part = { filename?: string; mimeType?: string; body?: { attachmentId?: string; size?: number }; parts?: Part[] };
    const stack: Part[] = [((await msg.json()) as { payload: Part }).payload];
    while (stack.length) {
      const p = stack.pop()!;
      if (p.parts) stack.push(...p.parts);
      if (p.body?.attachmentId && (p.mimeType === "application/pdf" || p.filename?.toLowerCase().endsWith(".pdf")) && (p.body.size ?? 0) < 8 * 1024 * 1024) {
        const att = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}/attachments/${p.body.attachmentId}`, { headers: h });
        if (!att.ok) continue;
        const data = ((await att.json()) as { data: string }).data;
        out.push({ messageId: id, fileName: p.filename || "fatura.pdf", bytes: new Uint8Array(Buffer.from(data, "base64url")) });
      }
    }
  }
  return out;
}

export async function runGmailSync() {
  const mode = env.gmailMode;
  if (mode === "off") return { skipped: "GMAIL_MODE=off" };
  const conns = await withService((db) =>
    db.query<Conn>(
      `select g.user_id, m.household_id, t.refresh_token_enc from public.fam_gmail_connections g
         join public.fam_household_members m on m.user_id = g.user_id
         left join public.fam_oauth_tokens t on t.user_id = g.user_id and t.provider = 'gmail'
        where g.status = 'conectado'`,
    ),
  );
  const summary: { userId: string; documents: number; items: number; error?: string }[] = [];
  for (const c of conns) {
    const ctx = { userId: c.user_id, householdId: c.household_id };
    try {
      let docs = 0, items = 0;
      if (mode === "mock") {
        const text = mockStatementText();
        const r = await ingestDocument(ctx, { bytes: new TextEncoder().encode(text), fileName: "fatura-exemplo.txt", source: "gmail", gmailMessageId: `mock-${todayISO()}`, textOverride: text });
        docs += r.duplicate ? 0 : 1;
        items += r.inserted;
      } else {
        if (!c.refresh_token_enc) throw new Error("sem token");
        const access = await refreshAccessToken(decryptSecret(c.refresh_token_enc));
        for (const a of await listGmailAttachments(access)) {
          const r = await ingestDocument(ctx, { bytes: a.bytes, fileName: a.fileName, source: "gmail", gmailMessageId: a.messageId });
          docs += r.duplicate ? 0 : 1;
          items += r.inserted;
        }
      }
      await withService((db) => db.query("update public.fam_gmail_connections set last_sync_at = now(), last_error = null, status = 'conectado' where user_id = $1", [c.user_id]));
      summary.push({ userId: c.user_id, documents: docs, items });
    } catch (e) {
      const msg = e instanceof Error ? e.message.slice(0, 200) : "erro";
      await withService((db) => db.query("update public.fam_gmail_connections set last_error = $2, status = 'erro' where user_id = $1", [c.user_id, msg]));
      summary.push({ userId: c.user_id, documents: 0, items: 0, error: msg });
    }
  }
  return { mode, connections: conns.length, summary };
}

/** Modo mock: "conecta" o Gmail do usuário sem OAuth (somente local). */
export async function connectMockGmail(userId: string) {
  await withUser(userId, (db) => db.query("select public.fam_store_gmail_token($1, $2, $3)", ["mock", "voce@exemplo.local", "mock"]));
}
