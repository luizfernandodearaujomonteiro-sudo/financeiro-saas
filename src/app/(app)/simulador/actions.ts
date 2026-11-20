"use server";
import { z } from "zod";
import { requireCtx } from "@/lib/auth/member";
import { run, type ActionState } from "@/lib/actions";
import { env } from "@/lib/env";
import { runDailyReminder, runDueAlerts, runWeeklySummary } from "@/lib/whatsapp/notifications";
import { simulateInbound } from "@/lib/whatsapp/simulate";

const PATH = "/simulador";

export async function sendSimulatedAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { member } = await requireCtx();
  return run(async () => {
    const text = z.string().trim().min(1, "Digite uma mensagem").max(1000).parse(fd.get("text"));
    const r = await simulateInbound({ userId: member.userId, householdId: member.householdId }, text);
    if (r.status === "desconhecido") throw new Error("Número não cadastrado: a mensagem foi ignorada (nenhum dado é enviado).");
    if (r.status === "duplicado") return "Mensagem duplicada ignorada.";
    if (r.ignored) return `Ignorada pelo webhook: ${r.ignored}`;
    return "Mensagem processada pelo webhook.";
  }, [PATH]);
}

function localOnly() {
  // jobs com privilégio de serviço: somente no modo local de desenvolvimento
  if (!env.localDevAuth) throw new Error("Disponível apenas no modo local (LOCAL_DEV_AUTH=true).");
}

export async function runAlertsAction(): Promise<ActionState> {
  await requireCtx();
  return run(async () => {
    localOnly();
    const r = await runDueAlerts();
    return `Alertas de vencimento: ${r.sent} envio(s) (alertas já enviados hoje não se repetem).`;
  }, [PATH]);
}

export async function runDailyAction(): Promise<ActionState> {
  await requireCtx();
  return run(async () => {
    localOnly();
    const r = await runDailyReminder();
    return `Lembrete diário: ${r.sent} envio(s).`;
  }, [PATH]);
}

export async function runWeeklyAction(): Promise<ActionState> {
  await requireCtx();
  return run(async () => {
    localOnly();
    const r = await runWeeklySummary();
    return `Resumo semanal: ${r.sent} envio(s).`;
  }, [PATH]);
}
