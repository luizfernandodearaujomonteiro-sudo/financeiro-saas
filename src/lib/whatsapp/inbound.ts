/** Normaliza payloads de entrada (Evolution e Meta). Tudo é tratado como NÃO confiável. */
import { z } from "zod";
import { jidToPhone, normalizePhone } from "../domain/phone";

export interface InboundMessage {
  provider: "evolution" | "meta";
  messageId: string;
  phone: string; // E.164
  text: string;
  pushName?: string;
  /**
   * Destino exato para a resposta no provedor (Meta: o `from`/wa_id recebido, que para
   * celulares BR costuma vir SEM o 9º dígito). `phone` continua normalizado para a busca.
   */
  replyTo?: string;
}

const evolutionSchema = z.object({
  event: z.string(),
  instance: z.string().optional(),
  data: z
    .object({
      key: z
        .object({
          remoteJid: z.string().max(100),
          fromMe: z.boolean().optional().default(false),
          id: z.string().min(1).max(128),
          // Evolution v2.3.x / Baileys com LID: número real em campos alternativos
          remoteJidAlt: z.string().max(100).optional().nullable(),
          senderPn: z.string().max(100).optional().nullable(),
        })
        .passthrough(),
      senderPn: z.string().max(100).optional().nullable(),
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

/** Tipos de mensagem que não carregam texto do usuário (edição, revogação, reação, chaves…). */
const NON_TEXT_TYPES = new Set([
  "protocolMessage", "reactionMessage", "senderKeyDistributionMessage", "messageContextInfo", "pollUpdateMessage",
  "pollCreationMessage", "keepInChatMessage", "encReactionMessage", "editedMessage", "stickerMessage",
]);

export interface EvolutionParseOptions {
  /** Instâncias aceitas; payload com `instance` diferente é ignorado (defesa em profundidade). */
  allowedInstances?: string[];
}

export function parseEvolutionPayload(body: unknown, opts: EvolutionParseOptions = {}): EvolutionParse {
  const r = evolutionSchema.safeParse(body);
  if (!r.success) {
    const ev = (body as { event?: unknown } | null)?.event;
    return { kind: "ignored", reason: typeof ev === "string" ? `evento ${ev}` : "payload inválido" };
  }
  const p = r.data;
  const event = p.event.toLowerCase().replace(/_/g, ".");
  if (event !== "messages.upsert") return { kind: "ignored", reason: `evento ${p.event}` };
  if (p.instance && opts.allowedInstances?.length && !opts.allowedInstances.includes(p.instance)) return { kind: "ignored", reason: "instância diferente" };
  if (p.data.key.fromMe) return { kind: "ignored", reason: "fromMe" };
  if (p.data.key.remoteJid.endsWith("@g.us")) return { kind: "ignored", reason: "grupo" };
  const msg = (p.data.message ?? {}) as Record<string, unknown>;
  if ((p.data.messageType && NON_TEXT_TYPES.has(p.data.messageType)) || msg.protocolMessage || msg.reactionMessage) {
    return { kind: "ignored", reason: "protocolo/reação" };
  }
  let phone: string | null;
  if (p.data.key.remoteJid.endsWith("@lid")) {
    // LID: o remoteJid é um id interno; usa o número de remoteJidAlt / senderPn quando vier
    const candidates = [p.data.key.remoteJidAlt, p.data.key.senderPn, p.data.senderPn].filter((c): c is string => typeof c === "string" && c.length > 0);
    phone = candidates.map((c) => jidToPhone(c)).find((x): x is string => Boolean(x)) ?? null;
    if (!phone) return { kind: "ignored", reason: "lid sem número" };
  } else {
    phone = jidToPhone(p.data.key.remoteJid);
    if (!phone) return { kind: "ignored", reason: "remetente inválido" };
  }
  const text = (p.data.message?.conversation ?? p.data.message?.extendedTextMessage?.text ?? "").trim();
  if (!text) return { kind: "ignored", reason: "sem texto" };
  return { kind: "message", message: { provider: "evolution", messageId: p.data.key.id, phone, text, pushName: p.data.pushName ?? undefined } };
}

const metaEnvelope = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z.array(z.object({ changes: z.array(z.unknown()).optional() }).passthrough()).max(100),
});

const metaChange = z.object({
  field: z.string().optional(),
  value: z
    .object({
      metadata: z.object({ phone_number_id: z.string().max(64) }).passthrough().optional(),
      messages: z.array(z.unknown()).optional(),
    })
    .passthrough(),
});

const metaTextMessage = z.object({
  from: z.string().regex(/^\d{8,15}$/),
  id: z.string().min(1).max(256),
  type: z.literal("text"),
  text: z.object({ body: z.string().max(4000) }),
});

export interface MetaParseOptions {
  /**
   * phone_number_id do NOSSO número. A conta (WABA) hospeda outros números de outros sistemas:
   * só mudanças com value.metadata.phone_number_id igual a este são processadas.
   * Vazio/ausente = ignora tudo (falha fechada).
   */
  phoneNumberId: string | null | undefined;
}

export interface MetaParse {
  messages: InboundMessage[];
  /** Quantidade de itens descartados (outro número, status, tipos sem texto, inválidos). */
  ignored: number;
}

export function parseMetaPayload(body: unknown, opts: MetaParseOptions): MetaParse {
  const out: MetaParse = { messages: [], ignored: 0 };
  const parsed = metaEnvelope.safeParse(body);
  if (!parsed.success) return { messages: [], ignored: 1 };
  const ownId = opts.phoneNumberId?.trim();
  for (const e of parsed.data.entry)
    for (const raw of e.changes ?? []) {
      const c = metaChange.safeParse(raw);
      // statuses (sent/delivered/read), outros campos e outros números: ignorados sem erro
      if (!c.success || !ownId || (c.data.field && c.data.field !== "messages") || c.data.value.metadata?.phone_number_id !== ownId || !c.data.value.messages?.length) {
        out.ignored++;
        continue;
      }
      for (const rawMsg of c.data.value.messages) {
        const m = metaTextMessage.safeParse(rawMsg);
        const phone = m.success ? normalizePhone(m.data.from) : null;
        const text = m.success ? m.data.text.body.trim() : "";
        if (!m.success || !phone || !text) {
          out.ignored++;
          continue;
        }
        out.messages.push({ provider: "meta", messageId: m.data.id, phone, text, replyTo: m.data.from });
      }
    }
  return out;
}
