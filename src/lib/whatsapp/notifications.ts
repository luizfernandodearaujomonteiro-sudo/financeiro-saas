/**
 * Notificações agendadas (cron) enviadas pelo adaptador do WhatsApp:
 *  - alertas de vencimento (contas a pagar e faturas): texto + código em mensagem separada;
 *  - lembrete diário de registrar gastos;
 *  - resumo semanal.
 * Visibilidade: conta/fatura compartilhada -> todos os membros com telefone; pessoal -> só o dono.
 */
import "server-only";
import { withService, type Db } from "../db";
import { addDays, diffDays, todayISO } from "../domain/dates";
import { formatBRL } from "../domain/money";
import { buildDueAlertMessages } from "./messages";
import { sendMessages } from "./send";

interface Recipient {
  user_id: string;
  household_id: string;
  phone_e164: string;
  display_name: string;
}

async function recipients(db: Db): Promise<Recipient[]> {
  return db.query<Recipient>(
    `select w.user_id, w.household_id, w.phone_e164, p.display_name
       from public.fam_whatsapp_numbers w
       join public.fam_household_members m on m.user_id = w.user_id and m.household_id = w.household_id
       join public.fam_profiles p on p.id = w.user_id`,
  );
}

async function claim(db: Db, userId: string, kind: string, ref: string): Promise<boolean> {
  const r = await db.one("insert into public.fam_notification_log (user_id, kind, ref) values ($1,$2,$3) on conflict do nothing returning id", [userId, kind, ref]);
  return Boolean(r);
}

export function alertDaysFor(alertDays: number): number[] {
  return [...new Set([alertDays, 1, 0])].filter((d) => d >= 0);
}

export async function runDueAlerts(now = new Date()) {
  const today = todayISO(now);
  const plan = await withService(async (db) => {
    const people = await recipients(db);
    const settings = new Map((await db.query<{ household_id: string; bill_alert_days: number }>("select household_id, bill_alert_days from public.fam_household_settings")).map((s) => [s.household_id, s.bill_alert_days]));
    const bills = await db.query<{
      id: string; household_id: string; owner_id: string; visibility: string; description: string; amount_cents: number; due_date: string;
      boleto_line: string | null; boleto_barcode: string | null; pix_code: string | null; pix_key: string | null; source: string;
    }>("select * from public.fam_bills where status = 'pendente' and due_date between $1 and $2", [today, addDays(today, 15)]);
    const invoices = await db.query<{ id: string; household_id: string; owner_id: string; visibility: string; nickname: string; total_cents: number; due_date: string }>(
      `select i.id, i.household_id, c.owner_id, c.visibility, c.nickname, i.total_cents, i.due_date
         from public.fam_invoices i join public.fam_cards c on c.id = i.card_id
        where i.status <> 'paga' and i.total_cents > 0 and i.due_date between $1 and $2
          and not exists (select 1 from public.fam_bills b where b.card_id = c.id and b.due_date = i.due_date and b.status <> 'cancelada')`,
      [today, addDays(today, 15)],
    );
    const out: { r: Recipient; messages: string[] }[] = [];
    const visibleTo = (hh: string, owner: string, vis: string) => people.filter((p) => p.household_id === hh && (vis === "compartilhado" || p.user_id === owner));
    for (const b of bills) {
      const daysLeft = diffDays(today, b.due_date);
      if (!alertDaysFor(settings.get(b.household_id) ?? 3).includes(daysLeft)) continue;
      for (const r of visibleTo(b.household_id, b.owner_id, b.visibility)) {
        if (!(await claim(db, r.user_id, "bill_due", `${b.id}:${daysLeft}`))) continue;
        out.push({
          r,
          messages: buildDueAlertMessages({ description: b.description, amountCents: b.amount_cents, dueDate: b.due_date, boletoLine: b.boleto_line, boletoBarcode: b.boleto_barcode,
            pixCode: b.pix_code, pixKey: b.pix_key, source: b.source, shared: b.visibility === "compartilhado" }, daysLeft),
        });
      }
    }
    for (const i of invoices) {
      const daysLeft = diffDays(today, i.due_date);
      if (!alertDaysFor(settings.get(i.household_id) ?? 3).includes(daysLeft)) continue;
      for (const r of visibleTo(i.household_id, i.owner_id, i.visibility)) {
        if (!(await claim(db, r.user_id, "invoice_due", `${i.id}:${daysLeft}`))) continue;
        out.push({ r, messages: buildDueAlertMessages({ description: `Fatura do cartão ${i.nickname}`, amountCents: i.total_cents, dueDate: i.due_date, shared: i.visibility === "compartilhado" }, daysLeft) });
      }
    }
    return out;
  });
  for (const p of plan) await sendMessages({ householdId: p.r.household_id, userId: p.r.user_id, phone: p.r.phone_e164 }, p.messages);
  return { sent: plan.length };
}

export async function runDailyReminder(now = new Date()) {
  const today = todayISO(now);
  const plan = await withService(async (db) => {
    const out: { r: Recipient; text: string }[] = [];
    for (const r of await recipients(db)) {
      if (!(await claim(db, r.user_id, "daily", today))) continue;
      const c = await db.one<{ n: number }>(
        "select count(*)::int as n from public.fam_entries where owner_id = $1 and (created_at at time zone 'America/Sao_Paulo')::date = $2::date",
        [r.user_id, today],
      );
      out.push({
        r,
        text: `📝 Oi, ${r.display_name}! Já registrou os gastos de hoje?${c && c.n ? ` (hoje você registrou ${c.n})` : ""}\nResponda por exemplo: *gastei 25 padaria*`,
      });
    }
    return out;
  });
  for (const p of plan) await sendMessages({ householdId: p.r.household_id, userId: p.r.user_id, phone: p.r.phone_e164 }, [p.text]);
  return { sent: plan.length };
}

export async function runWeeklySummary(now = new Date()) {
  const today = todayISO(now);
  const from = addDays(today, -6);
  const prevFrom = addDays(today, -13);
  const plan = await withService(async (db) => {
    const out: { r: Recipient; text: string }[] = [];
    for (const r of await recipients(db)) {
      if (!(await claim(db, r.user_id, "weekly", today))) continue;
      // visível ao destinatário: compartilhados da família + os pessoais dele
      const rows = await db.query<{ amount_cents: number; occurred_on: string; category: string | null }>(
        `select e.amount_cents, e.occurred_on, c.name as category from public.fam_entries e left join public.fam_categories c on c.id = e.category_id
          where e.household_id = $1 and e.kind = 'despesa' and e.occurred_on between $2 and $3
            and (e.visibility = 'compartilhado' or e.owner_id = $4)`,
        [r.household_id, prevFrom, today, r.user_id],
      );
      const week = rows.filter((x) => x.occurred_on >= from);
      const prev = rows.filter((x) => x.occurred_on < from);
      const total = week.reduce((a, x) => a + x.amount_cents, 0);
      const prevTotal = prev.reduce((a, x) => a + x.amount_cents, 0);
      const byCat = new Map<string, number>();
      for (const x of week) byCat.set(x.category ?? "Sem categoria", (byCat.get(x.category ?? "Sem categoria") ?? 0) + x.amount_cents);
      const top = [...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
      const diff = total - prevTotal;
      out.push({
        r,
        text: [
          `📅 *Resumo da semana* (${from.slice(8)}/${from.slice(5, 7)} a ${today.slice(8)}/${today.slice(5, 7)})`,
          `Gastos: *${formatBRL(total)}* (${diff >= 0 ? "▲" : "▼"} ${formatBRL(Math.abs(diff))} vs semana anterior)`,
          ...(top.length ? ["Top categorias:", ...top.map(([n, v]) => `• ${n}: ${formatBRL(v)}`)] : []),
        ].join("\n"),
      });
    }
    return out;
  });
  for (const p of plan) await sendMessages({ householdId: p.r.household_id, userId: p.r.user_id, phone: p.r.phone_e164 }, [p.text]);
  return { sent: plan.length };
}
