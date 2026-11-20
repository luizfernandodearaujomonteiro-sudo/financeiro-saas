import "server-only";
import { withService } from "../db";
import { getProvider } from "./config";
import type { WhatsAppProvider } from "./provider";

export interface OutboundTarget {
  householdId: string;
  userId: string | null;
  phone: string;
}

/**
 * Envia mensagens EM ORDEM (uma chamada por mensagem) e registra cada uma em
 * fam_whatsapp_messages. Alertas com código usam uma mensagem só para o código.
 */
export async function sendMessages(target: OutboundTarget, messages: string[], provider?: WhatsAppProvider) {
  const p = provider ?? (await getProvider(target.householdId));
  const results = [];
  for (const body of messages) {
    let r;
    try {
      r = await p.sendText(target.phone, body);
    } catch (e) {
      r = { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "erro" };
    }
    results.push(r);
    await withService((db) =>
      db.query(
        "insert into public.fam_whatsapp_messages (household_id, user_id, direction, phone_e164, body, provider, status, error) values ($1,$2,'out',$3,$4,$5,$6,$7)",
        [target.householdId, target.userId, target.phone, body.slice(0, 4096), p.name, r.ok ? "ok" : "erro", r.ok ? null : r.error ?? null],
      ),
    );
  }
  return results;
}
