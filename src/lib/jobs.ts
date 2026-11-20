import "server-only";
import { withService } from "./db";
import { runGmailSync } from "./gmail/sync";
import { getPluggyProvider } from "./pluggy/provider";
import { syncItem } from "./pluggy/sync";
import { runDailyReminder, runDueAlerts, runWeeklySummary } from "./whatsapp/notifications";

/** Jobs agendados (vercel.json). Executados com service role — somente aqui e nos webhooks. */
export const JOBS: Record<string, () => Promise<unknown>> = {
  "whatsapp-due-alerts": () => runDueAlerts(),
  "whatsapp-daily-reminder": () => runDailyReminder(),
  "whatsapp-weekly-summary": () => runWeeklySummary(),
  "gmail-sync": () => runGmailSync(),
  "pluggy-sync": async () => {
    const items = await withService((db) => db.query<{ item_id: string; mode: string }>("select item_id, mode from public.fin_financeiro_pluggy_items where status is distinct from 'removido'"));
    const out = [];
    for (const it of items) {
      try {
        out.push({ item: it.item_id.slice(0, 8), ...(await syncItem(it.item_id, getPluggyProvider(it.mode as "live" | "sandbox" | "mock"))) });
      } catch (e) {
        out.push({ item: it.item_id.slice(0, 8), error: e instanceof Error ? e.message : "erro" });
      }
    }
    return out;
  },
};
