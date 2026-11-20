import { z } from "zod";
import { withUser } from "../db";
import { parseBoleto } from "../domain/boleto";
import { monthStartOf, todayISO } from "../domain/dates";
import { parsePixCopiaECola, validatePixKey } from "../domain/pix";
import { isoDate, moneyInput, optionalText, optionalUuid, visibility } from "../validation";
import type { MemberCtx } from "./types";

export interface BillRow {
  id: string;
  owner_id: string;
  owner_name: string;
  visibility: "pessoal" | "compartilhado";
  description: string;
  amount_cents: number;
  due_date: string;
  status: "pendente" | "paga" | "cancelada";
  category_id: string | null;
  category_name: string | null;
  card_id: string | null;
  boleto_barcode: string | null;
  boleto_line: string | null;
  pix_code: string | null;
  pix_key: string | null;
  pix_key_type: string | null;
  source: string;
  cost_type: "fixa" | "variavel";
  notes: string | null;
}

export const billInput = z
  .object({
    description: z.string().trim().min(1).max(140),
    amountCents: moneyInput,
    dueDate: isoDate,
    categoryId: optionalUuid,
    visibility: visibility.default("compartilhado"),
    costType: z.enum(["fixa", "variavel"]).default("fixa"),
    boleto: optionalText(80),
    pixCode: optionalText(512),
    pixKey: optionalText(80),
    notes: optionalText(500),
  })
  .transform((v, ctx) => {
    let boletoBarcode: string | null = null, boletoLine: string | null = null;
    if (v.boleto) {
      const b = parseBoleto(v.boleto, v.dueDate);
      if (!b.ok) ctx.addIssue({ code: "custom", path: ["boleto"], message: `Boleto inválido: ${b.error}` });
      else {
        boletoBarcode = b.barcode;
        boletoLine = b.line;
      }
    }
    let pixCode: string | null = null;
    if (v.pixCode) {
      const p = parsePixCopiaECola(v.pixCode);
      if (!p.ok) ctx.addIssue({ code: "custom", path: ["pixCode"], message: `Pix copia e cola inválido: ${p.error}` });
      else pixCode = p.code;
    }
    let pixKey: string | null = null, pixKeyType: string | null = null;
    if (v.pixKey) {
      const k = validatePixKey(v.pixKey);
      if (!k.ok) ctx.addIssue({ code: "custom", path: ["pixKey"], message: k.error });
      else {
        pixKey = k.key;
        pixKeyType = k.type;
      }
    }
    return { ...v, boletoBarcode, boletoLine, pixCode, pixKey, pixKeyType };
  });

const SELECT = `select b.*, p.display_name as owner_name, c.name as category_name
  from public.fam_bills b join public.fam_profiles p on p.id = b.owner_id left join public.fam_categories c on c.id = b.category_id`;

export function listBills(ctx: MemberCtx, opts: { status?: "pendente" | "paga" | "todas" } = {}): Promise<BillRow[]> {
  const status = opts.status ?? "todas";
  return withUser(ctx.userId, (db) =>
    db.query<BillRow>(`${SELECT} where b.household_id = $1 ${status === "todas" ? "" : "and b.status = $2"} order by b.status = 'paga', b.due_date`,
      status === "todas" ? [ctx.householdId] : [ctx.householdId, status]),
  );
}

export async function createBill(ctx: MemberCtx, raw: unknown) {
  const v = billInput.parse(raw);
  return withUser(ctx.userId, (db) =>
    db.one<{ id: string }>(
      `insert into public.fam_bills (household_id, owner_id, visibility, description, amount_cents, due_date, category_id, cost_type,
          boleto_barcode, boleto_line, pix_code, pix_key, pix_key_type, notes)
       values ($1, auth.uid(), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) returning id`,
      [ctx.householdId, v.visibility, v.description, v.amountCents, v.dueDate, v.categoryId ?? null, v.costType,
       v.boletoBarcode, v.boletoLine, v.pixCode, v.pixKey, v.pixKeyType, v.notes ?? null],
    ),
  );
}

export interface PayBillResult {
  entryId: string | null;
  invoiceMarkedPaid: boolean;
}

/**
 * Marca como paga.
 * - Conta comum: registra o lançamento de despesa (em nome de quem pagou).
 * - Fatura de cartão (card_id preenchido, ex.: importada do Open Finance): NÃO cria
 *   despesa — as compras do cartão já foram lançadas; marca a fam_invoices
 *   correspondente (mesmo cartão e vencimento/mês de referência) como paga.
 */
export async function payBill(ctx: MemberCtx, id: string, paidOn = todayISO()): Promise<PayBillResult> {
  return withUser(ctx.userId, async (db) => {
    const b = await db.one<BillRow>("select * from public.fam_bills where id = $1 and status = 'pendente'", [id]);
    if (!b) throw new Error("Conta não encontrada ou já paga");
    if (b.card_id) {
      await db.query("update public.fam_bills set status = 'paga', paid_at = now() where id = $1", [id]);
      const inv = await db.query(
        `update public.fam_invoices set status = 'paga', paid_at = now()
          where card_id = $1 and status <> 'paga'
            and (due_date = $2::date or reference_month = date_trunc('month', $2::date)::date)
          returning id`,
        [b.card_id, b.due_date],
      );
      return { entryId: null, invoiceMarkedPaid: inv.length > 0 };
    }
    const method = b.boleto_line ? "boleto" : b.pix_code || b.pix_key ? "pix" : "transferencia";
    const entry = await db.one<{ id: string }>(
      `insert into public.fam_entries (household_id, owner_id, visibility, kind, description, amount_cents, occurred_on, budget_month,
          category_id, payment_method, cost_type, source, notes)
       values ($1, auth.uid(), $2, 'despesa', $3, $4, $5, $6, $7, $8, $9, 'manual', 'Pagamento de conta a pagar') returning id`,
      [ctx.householdId, b.visibility, b.description, b.amount_cents, paidOn, monthStartOf(paidOn), b.category_id, method, b.cost_type],
    );
    await db.query("update public.fam_bills set status = 'paga', paid_at = now(), entry_id = $2 where id = $1", [id, entry!.id]);
    return { entryId: entry!.id, invoiceMarkedPaid: false };
  });
}

export async function cancelBill(ctx: MemberCtx, id: string) {
  await withUser(ctx.userId, (db) => db.query("update public.fam_bills set status = 'cancelada' where id = $1", [id]));
}

export async function deleteBill(ctx: MemberCtx, id: string) {
  await withUser(ctx.userId, (db) => db.query("delete from public.fam_bills where id = $1 and owner_id = auth.uid()", [id]));
}
