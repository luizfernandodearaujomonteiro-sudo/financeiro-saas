/**
 * Executa um comando do WhatsApp COM O CONTEXTO DO REMETENTE (withUser => RLS).
 * O remetente é identificado pelo telefone cadastrado em fam_whatsapp_numbers.
 */
import "server-only";
import { withUser } from "../db";
import { matchCategoryByName, suggestCategory } from "../domain/categorize";
import { addDays, currentMonthStart, formatDateBR, monthStartOf, todayISO } from "../domain/dates";
import { assignInvoice } from "../domain/invoices";
import { formatBRL } from "../domain/money";
import { summarize } from "../domain/reports";
import { normalizeText } from "../domain/text";
import { DEFAULT_UNDO_MINUTES, pickUndoTarget } from "../domain/undo";
import { HELP_TEXT, type Command } from "./commands";

export interface Sender {
  userId: string;
  householdId: string;
  displayName: string;
}

export async function executeCommand(sender: Sender, cmd: Command, now = new Date()): Promise<string[]> {
  const today = todayISO(now);
  return withUser(sender.userId, async (db) => {
    switch (cmd.type) {
      case "ajuda":
        return [HELP_TEXT];
      case "desconhecido":
        return [cmd.reason === "valor" ? "Não encontrei o valor. Exemplo: *gastei 50 mercado*" : "Não entendi 🤔 Envie *ajuda* para ver os comandos."];
      case "lancamento": {
        const cats = await db.query<{ id: string; name: string; kind: "receita" | "despesa" }>("select id, name, kind from public.fam_categories where household_id = $1 and active", [sender.householdId]);
        let categoryId = matchCategoryByName(cmd.categoryHint, cmd.kind, cats);
        if (!categoryId) {
          const hist = await db.query<{ description: string; category_id: string; kind: "receita" | "despesa" }>(
            "select description, category_id, kind from public.fam_entries where household_id = $1 and category_id is not null order by created_at desc limit 300",
            [sender.householdId],
          );
          categoryId = suggestCategory(cmd.description, cmd.kind, hist.map((h) => ({ description: h.description, categoryId: h.category_id, kind: h.kind })), cats);
        }
        await db.query(
          `insert into public.fam_entries (household_id, owner_id, visibility, kind, description, amount_cents, occurred_on, budget_month, category_id, payment_method, cost_type, source)
           values ($1, auth.uid(), $2, $3, $4, $5, $6, $7, $8, 'pix', 'variavel', 'whatsapp')`,
          [sender.householdId, cmd.shared ? "compartilhado" : "pessoal", cmd.kind, cmd.description, cmd.amountCents, today, monthStartOf(today), categoryId],
        );
        const settings = await db.one<{ whatsapp_undo_minutes: number }>("select whatsapp_undo_minutes from public.fam_household_settings where household_id = $1", [sender.householdId]);
        const cat = cats.find((c) => c.id === categoryId)?.name ?? "sem categoria";
        return [
          `✅ ${cmd.kind === "despesa" ? "Gasto registrado" : "Receita registrada"}: *${formatBRL(cmd.amountCents)}* — ${cmd.description} (${cat})` +
            `\n${cmd.shared ? "🏠 Compartilhado com a família" : "🔒 Pessoal (só você vê)"}` +
            `\nErrou? Envie *desfazer* em até ${settings?.whatsapp_undo_minutes ?? DEFAULT_UNDO_MINUTES} min.`,
        ];
      }
      case "saldo": {
        const month = currentMonthStart(now);
        const rows = await db.query<{
          kind: "receita" | "despesa"; amount_cents: number; cost_type: "fixa" | "variavel"; owner_id: string; visibility: "pessoal" | "compartilhado";
          payment_method: string; card_id: string | null; exclude_from_reports: boolean;
        }>(
          "select kind, amount_cents, cost_type, owner_id, visibility, payment_method, card_id, exclude_from_reports from public.fam_entries where household_id = $1 and budget_month = $2",
          [sender.householdId, month],
        );
        const mine = summarize(rows.filter((r) => r.owner_id === sender.userId));
        const casa = summarize(rows.filter((r) => r.visibility === "compartilhado"));
        return [
          [
            `📊 *Resumo do mês* (${formatDateBR(month).slice(3)})`,
            "",
            `*Você*: receitas ${formatBRL(mine.receitas)} · despesas ${formatBRL(mine.despesas)} · resultado ${formatBRL(mine.resultado)}`,
            `*Casa (compartilhado)*: despesas ${formatBRL(casa.despesas)} · receitas ${formatBRL(casa.receitas)}`,
          ].join("\n"),
        ];
      }
      case "fatura": {
        const cards = await db.query<{ id: string; nickname: string; closing_day: number; due_day: number; last4: string }>(
          "select id, nickname, closing_day, due_day, last4 from public.fam_cards where household_id = $1 and active order by nickname",
          [sender.householdId],
        );
        if (!cards.length) return ["Você ainda não tem cartões cadastrados."];
        const hint = normalizeText(cmd.cardHint);
        const matches = hint ? cards.filter((c) => normalizeText(c.nickname).includes(hint) || c.last4 === hint) : cards;
        if (!matches.length) return [`Não encontrei o cartão "${cmd.cardHint}". Cartões: ${cards.map((c) => c.nickname).join(", ")}`];
        const lines: string[] = [];
        for (const c of matches.slice(0, 4)) {
          const slot = assignInvoice({ closingDay: c.closing_day, dueDay: c.due_day }, today);
          const inv = await db.one<{ total_cents: number }>("select total_cents from public.fam_invoices where card_id = $1 and reference_month = $2", [c.id, slot.referenceMonth]);
          lines.push(`💳 *${c.nickname}* (final ${c.last4}): ${formatBRL(inv?.total_cents ?? 0)} — fecha ${formatDateBR(slot.closingDate)}, vence ${formatDateBR(slot.dueDate)}`);
        }
        return [lines.join("\n")];
      }
      case "contas": {
        const bills = await db.query<{ description: string; amount_cents: number; due_date: string }>(
          "select description, amount_cents, due_date from public.fam_bills where household_id = $1 and status = 'pendente' and due_date <= $2 order by due_date limit 10",
          [sender.householdId, addDays(today, 15)],
        );
        if (!bills.length) return ["🎉 Nenhuma conta pendente nos próximos 15 dias."];
        return [["🧾 *Próximas contas*", ...bills.map((b) => `• ${formatDateBR(b.due_date)} — ${b.description}: ${formatBRL(b.amount_cents)}`)].join("\n")];
      }
      case "desfazer": {
        const settings = await db.one<{ whatsapp_undo_minutes: number }>("select whatsapp_undo_minutes from public.fam_household_settings where household_id = $1", [sender.householdId]);
        const minutes = settings?.whatsapp_undo_minutes ?? DEFAULT_UNDO_MINUTES;
        const recent = await db.query<{ id: string; owner_id: string; source: string; created_at: Date; description: string; amount_cents: number }>(
          "select id, owner_id, source, created_at, description, amount_cents from public.fam_entries where owner_id = auth.uid() and source = 'whatsapp' order by created_at desc limit 5",
        );
        const target = pickUndoTarget(recent, sender.userId, now, minutes);
        if (!target) return [`Nada para desfazer: só é possível apagar seu último lançamento feito pelo WhatsApp nos últimos ${minutes} minutos.`];
        await db.query("delete from public.fam_entries where id = $1 and owner_id = auth.uid()", [target.id]);
        return [`↩️ Desfeito: ${target.description} (${formatBRL(target.amount_cents)}) foi apagado.`];
      }
    }
  });
}
