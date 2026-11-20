import "server-only";
import { withService } from "../db";
import { parseCommand } from "./commands";
import { executeCommand } from "./execute";
import type { InboundMessage } from "./inbound";
import { sendMessages } from "./send";

export type HandleResult = { status: "processado"; replies: string[] } | { status: "duplicado" } | { status: "desconhecido" };

/**
 * Processa uma mensagem recebida: deduplica pelo id, mapeia telefone -> perfil
 * (números desconhecidos não recebem nenhum dado), executa como o remetente e responde.
 */
export async function handleInbound(msg: InboundMessage, now = new Date()): Promise<HandleResult> {
  const fresh = await withService((db) =>
    db.one<{ message_id: string }>(
      "insert into public.fam_whatsapp_inbound (message_id, provider, from_phone) values ($1, $2, $3) on conflict do nothing returning message_id",
      [`${msg.provider}:${msg.messageId}`, msg.provider, msg.phone],
    ),
  );
  if (!fresh) return { status: "duplicado" };

  const sender = await withService((db) =>
    db.one<{ userId: string; householdId: string; displayName: string }>(
      `select w.user_id as "userId", w.household_id as "householdId", p.display_name as "displayName"
         from public.fam_whatsapp_numbers w join public.fam_profiles p on p.id = w.user_id
         join public.fam_household_members m on m.user_id = w.user_id and m.household_id = w.household_id
        where w.phone_e164 = $1`,
      [msg.phone],
    ),
  );
  if (!sender) return { status: "desconhecido" }; // silêncio: não confirma nada a números desconhecidos

  await withService((db) =>
    db.query("insert into public.fam_whatsapp_messages (household_id, user_id, direction, phone_e164, body, provider) values ($1,$2,'in',$3,$4,$5)", [
      sender.householdId, sender.userId, msg.phone, msg.text.slice(0, 4096), msg.provider === "evolution" && process.env.WHATSAPP_PROVIDER === "simulator" ? "simulator" : msg.provider,
    ]),
  );
  const replies = await executeCommand(sender, parseCommand(msg.text), now);
  await sendMessages({ householdId: sender.householdId, userId: sender.userId, phone: msg.phone }, replies);
  return { status: "processado", replies };
}
