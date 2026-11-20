/**
 * OPCIONAL — importa contas do antigo app "fincontrol" (tabelas bills/wallets) para fin_financeiro_bills.
 * - Somente LÊ bills e wallets (SELECT); escreve apenas em fin_financeiro_bills.
 * - Idempotente: external_id = "bills:<id>" + índice único (on conflict do nothing).
 * - Nunca roda automaticamente. Sem --apply é só simulação.
 *
 *   DATABASE_URL_ADMIN=... npx tsx scripts/import-bills.ts --source-user <auth uuid dono das bills> \
 *       --member <auth uuid do membro fin_financeiro_> [--visibility compartilhado|pessoal] [--apply]
 */
import pg from "pg";
import { parseBoleto } from "../src/lib/domain/boleto";
import { decimalToCents } from "../src/lib/domain/money";
import { parsePixCopiaECola } from "../src/lib/domain/pix";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

type Row = Record<string, unknown>;
const pick = (r: Row, keys: string[]) => keys.map((k) => r[k]).find((v) => v !== null && v !== undefined && v !== "");

export function mapBill(b: Row, walletName: string | null) {
  const rawAmount = pick(b, ["amount_cents", "amount", "value", "valor", "total"]);
  if (rawAmount === undefined) return { skip: "sem valor" as const };
  const amount = "amount_cents" in b && b.amount_cents != null ? Number(b.amount_cents) : decimalToCents(String(rawAmount));
  const due = pick(b, ["due_date", "vencimento"]);
  if (!due || amount <= 0) return { skip: "sem vencimento/valor" as const };
  const status = String(pick(b, ["status"]) ?? "pending").toLowerCase();
  const pix = typeof b.pix_code === "string" ? parsePixCopiaECola(b.pix_code) : null;
  const boletoRaw = pick(b, ["barcode", "boleto", "digitable_line", "linha_digitavel"]);
  const boleto = typeof boletoRaw === "string" ? parseBoleto(boletoRaw) : null;
  const notes = [b.payer ? `Pagador: ${b.payer}` : null, walletName ? `Carteira: ${walletName}` : null, "Importado do fincontrol"].filter(Boolean).join(" · ");
  return {
    description: String(pick(b, ["description", "title", "name", "descricao"]) ?? "Conta importada").slice(0, 140),
    amount,
    dueDate: (due instanceof Date ? due.toISOString() : String(due)).slice(0, 10),
    status: ["paid", "pago", "paga"].includes(status) ? "paga" : ["canceled", "cancelled", "cancelada"].includes(status) ? "cancelada" : "pendente",
    costType: b.is_recurring ? "fixa" : "variavel",
    pixCode: pix?.ok ? pix.code : null,
    boletoLine: boleto?.ok ? boleto.line : null,
    boletoBarcode: boleto?.ok ? boleto.barcode : null,
    notes: notes.slice(0, 500),
  };
}

async function main() {
  const url = process.env.DATABASE_URL_ADMIN; // papel administrativo, só para este script (nunca na Vercel)
  const sourceUser = arg("source-user"), member = arg("member");
  const visibility = arg("visibility") === "pessoal" ? "pessoal" : "compartilhado";
  const apply = process.argv.includes("--apply");
  if (!url || !sourceUser || !member) throw new Error("uso: DATABASE_URL_ADMIN=... tsx scripts/import-bills.ts --source-user <uuid> --member <uuid> [--apply]");
  const c = new pg.Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false } });
  await c.connect();
  try {
    const hh = (await c.query("select household_id from public.fin_financeiro_household_members where user_id = $1", [member])).rows[0]?.household_id;
    if (!hh) throw new Error("membro não pertence a nenhuma família fin_financeiro_");
    const bills = (await c.query("select * from public.bills where user_id = $1", [sourceUser])).rows as Row[];
    const wallets = new Map<string, string>();
    try {
      for (const w of (await c.query("select * from public.wallets where user_id = $1", [sourceUser])).rows as Row[]) wallets.set(String(w.id), String(w.name ?? w.title ?? "carteira"));
    } catch {
      /* tabela wallets ausente/diferente: segue sem nomes */
    }
    let ok = 0, skipped = 0, inserted = 0;
    if (apply) await c.query("begin");
    for (const b of bills) {
      const m = mapBill(b, b.wallet_id ? wallets.get(String(b.wallet_id)) ?? null : null);
      if ("skip" in m) {
        skipped++;
        continue;
      }
      ok++;
      if (!apply) continue;
      const r = await c.query(
        `insert into public.fin_financeiro_bills (household_id, owner_id, visibility, description, amount_cents, due_date, status, cost_type, pix_code, boleto_line, boleto_barcode, notes, source, external_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'importacao',$13) on conflict (household_id, source, external_id) where external_id is not null do nothing`,
        [hh, member, visibility, m.description, m.amount, m.dueDate, m.status, m.costType, m.pixCode, m.boletoLine, m.boletoBarcode, m.notes, `bills:${b.id}`],
      );
      inserted += r.rowCount ?? 0;
    }
    if (apply) await c.query("commit");
    console.log(`${bills.length} bills lidas · ${ok} mapeáveis · ${skipped} ignoradas${apply ? ` · ${inserted} inseridas (o resto já existia)` : " · DRY-RUN (use --apply)"}`);
  } catch (e) {
    if (apply) await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    await c.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
