/**
 * Simulador local: monta um payload NO FORMATO DA EVOLUTION e o envia para a
 * MESMA lógica do webhook real, com o Bearer secret — exatamente como a Central faria.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import { withUser } from "../db";
import { env } from "../env";
import { toProviderNumber } from "../domain/phone";
import type { MemberCtx } from "../services/types";
import { handleWebhookRequest } from "./webhook";

export function evolutionPayload(phoneE164: string, text: string, id = `SIM${randomUUID().replace(/-/g, "").slice(0, 20).toUpperCase()}`) {
  return {
    event: "messages.upsert",
    instance: process.env.EVOLUTION_INSTANCE_NAME ?? "financeiro",
    data: {
      key: { remoteJid: `${toProviderNumber(phoneE164)}@s.whatsapp.net`, fromMe: false, id },
      pushName: "Simulador",
      message: { conversation: text },
      messageType: "conversation",
      messageTimestamp: Math.floor(Date.now() / 1000),
    },
    date_time: new Date().toISOString(),
    sender: "5511990000000@s.whatsapp.net",
  };
}

export async function simulateInbound(ctx: MemberCtx, text: string) {
  if (!env.simulatorEnabled) throw new Error("Simulador desativado (use LOCAL_DEV_AUTH=true ou WHATSAPP_PROVIDER=simulator)");
  const secret = env.secret("WHATSAPP_WEBHOOK_SECRET");
  if (!secret) throw new Error("Defina WHATSAPP_WEBHOOK_SECRET (mínimo 24 caracteres) para simular o webhook");
  const phone = await withUser(ctx.userId, (db) => db.one<{ phone_e164: string }>("select phone_e164 from public.fin_financeiro_whatsapp_numbers where user_id = auth.uid()"));
  if (!phone) throw new Error("Cadastre seu telefone em Configurações › WhatsApp antes de simular");
  const req = new Request(`${env.appUrl}/api/whatsapp/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
    body: JSON.stringify(evolutionPayload(phone.phone_e164, text.slice(0, 1000))),
  });
  const res = await handleWebhookRequest(req);
  return (await res.json()) as { ok: boolean; status?: string; ignored?: string };
}

export function listConversation(ctx: MemberCtx, limit = 60) {
  return withUser(ctx.userId, (db) =>
    db.query<{ id: number; direction: "in" | "out"; body: string; provider: string; status: string; created_at: string }>(
      "select id, direction, body, provider, status, created_at from public.fin_financeiro_whatsapp_messages where user_id = auth.uid() order by id desc limit $1",
      [limit],
    ),
  );
}
