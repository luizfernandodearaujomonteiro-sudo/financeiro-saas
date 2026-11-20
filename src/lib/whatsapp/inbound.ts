/** Normaliza payloads de entrada (Evolution e Meta). Tudo é tratado como NÃO confiável. */
import { z } from "zod";
import { jidToPhone, normalizePhone } from "../domain/phone";

export interface InboundMessage {
  provider: "evolution" | "meta";
  messageId: string;
  phone: string; // E.164
  text: string;
  pushName?: string;
}

const evolutionSchema = z.object({
  event: z.string(),
  instance: z.string().optional(),
  data: z
    .object({
      key: z.object({ remoteJid: z.string().max(100), fromMe: z.boolean().optional().default(false), id: z.string().min(1).max(128) }),
      pushName: z.string().max(100).optional().nullable(),
      messageType: z.string().max(50).optional(),
      message: z
        .object({
          conversation: z.string().max(4000).optional().nullable(),
          extendedTextMessage: z.object({ text: z.string().max(4000).optional().nullable() }).partial().optional().nullable(),
        })
        .passthrough()
        .optional()
        .nullable(),
    })
    .passthrough(),
});

export type EvolutionParse = { kind: "message"; message: InboundMessage } | { kind: "ignored"; reason: string };

export function parseEvolutionPayload(body: unknown): EvolutionParse {
  const r = evolutionSchema.safeParse(body);
  if (!r.success) {
    const ev = (body as { event?: unknown } | null)?.event;
    return { kind: "ignored", reason: typeof ev === "string" ? `evento ${ev}` : "payload inválido" };
  }
  const p = r.data;
  const event = p.event.toLowerCase().replace(/_/g, ".");
  if (event !== "messages.upsert") return { kind: "ignored", reason: `evento ${p.event}` };
  if (p.data.key.fromMe) return { kind: "ignored", reason: "fromMe" };
  if (p.data.key.remoteJid.endsWith("@g.us")) return { kind: "ignored", reason: "grupo" };
  const phone = jidToPhone(p.data.key.remoteJid);
  if (!phone) return { kind: "ignored", reason: "remetente inválido" };
  const text = (p.data.message?.conversation ?? p.data.message?.extendedTextMessage?.text ?? "").trim();
  if (!text) return { kind: "ignored", reason: "sem texto" };
  return { kind: "message", message: { provider: "evolution", messageId: p.data.key.id, phone, text, pushName: p.data.pushName ?? undefined } };
}

const metaSchema = z.object({
  object: z.string(),
  entry: z.array(
    z.object({
      changes: z.array(
        z.object({
          value: z
            .object({
              messages: z
                .array(z.object({ from: z.string().max(20), id: z.string().max(128), type: z.string(), text: z.object({ body: z.string().max(4000) }).optional() }))
                .optional(),
            })
            .passthrough(),
        }),
      ),
    }),
  ),
});

export function parseMetaPayload(body: unknown): InboundMessage[] {
  const r = metaSchema.safeParse(body);
  if (!r.success) return [];
  const out: InboundMessage[] = [];
  for (const e of r.data.entry)
    for (const c of e.changes)
      for (const m of c.value.messages ?? []) {
        const phone = normalizePhone(m.from);
        if (m.type === "text" && m.text?.body && phone) out.push({ provider: "meta", messageId: m.id, phone, text: m.text.body.trim() });
      }
  return out;
}
