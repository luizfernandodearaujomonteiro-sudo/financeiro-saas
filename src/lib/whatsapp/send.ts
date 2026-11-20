import "server-only";
import { withService } from "../db";
import { env } from "../env";
import { getProvider } from "./config";
import type { SendResult, WhatsAppProvider } from "./provider";

export interface OutboundTarget {
  householdId: string;
  userId: string | null;
  phone: string;
}

/**
 * Envia mensagens EM ORDEM (uma chamada por mensagem) e registra cada uma em
 * fam_whatsapp_messages. Alertas com código usam uma mensagem só para o código.
 */
export async function sendMessages(target: OutboundTarget, messages: string[], provider?: WhatsAppProvider): Promise<SendResult[]> {
  let p: WhatsAppProvider | null = provider ?? null;
  let setupError: string | null = null;
  if (!p) {
    try {
      p = await getProvider(target.householdId);
    } catch (e) {
      // provedor não configurado (ex.: sem token): registra como falha em vez de derrubar o job
      setupError = e instanceof Error ? e.message.slice(0, 200) : "provedor indisponível";
    }
  }
  const results: SendResult[] = [];
  for (const body of messages) {
    let r: SendResult;
    if (!p) {
      r = { ok: false, error: setupError ?? "provedor indisponível" };
    } else {
      try {
        r = await p.sendText(target.phone, body);
      } catch (e) {
        r = { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "erro" };
      }
    }
    results.push(r);
    await withService((db) =>
      db.query(
        "insert into public.fam_whatsapp_messages (household_id, user_id, direction, phone_e164, body, provider, status, error) values ($1,$2,'out',$3,$4,$5,$6,$7)",
        [target.householdId, target.userId, target.phone, body.slice(0, 4096), p?.name ?? env.whatsappProvider, r.ok ? "ok" : "erro", r.ok ? null : r.error ?? null],
      ),
    );
  }
  return results;
}
