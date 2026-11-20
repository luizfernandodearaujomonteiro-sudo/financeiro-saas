import { describe, expect, it } from "vitest";
import { parseEvolutionPayload } from "@/lib/whatsapp/inbound";
import { jidToPhone } from "@/lib/domain/phone";

const base = (over: Record<string, unknown> = {}, keyOver: Record<string, unknown> = {}, msg: Record<string, unknown> = { conversation: "gastei 50 mercado" }) => ({
  event: "messages.upsert",
  instance: "financeiro",
  data: { key: { remoteJid: "5511990000001@s.whatsapp.net", fromMe: false, id: "ABC", ...keyOver }, message: msg, messageType: "conversation", ...over },
});
const opts = { allowedInstances: ["financeiro"] };

describe("payload Evolution (v2.3.x / Baileys)", () => {
  it("mensagem normal", () => {
    expect(parseEvolutionPayload(base(), opts)).toMatchObject({ kind: "message", message: { phone: "+5511990000001", text: "gastei 50 mercado" } });
  });
  it("remoteJid @lid usa remoteJidAlt, key.senderPn ou data.senderPn", () => {
    expect(parseEvolutionPayload(base({}, { remoteJid: "123456789012345@lid", remoteJidAlt: "5511990000001@s.whatsapp.net" }), opts))
      .toMatchObject({ kind: "message", message: { phone: "+5511990000001" } });
    expect(parseEvolutionPayload(base({}, { remoteJid: "123456789012345@lid", senderPn: "5511990000002@s.whatsapp.net" }), opts))
      .toMatchObject({ kind: "message", message: { phone: "+5511990000002" } });
    expect(parseEvolutionPayload(base({ senderPn: "5511990000001@s.whatsapp.net" }, { remoteJid: "123456789012345@lid" }), opts))
      .toMatchObject({ kind: "message", message: { phone: "+5511990000001" } });
    // alternativo também @lid não serve
    expect(parseEvolutionPayload(base({}, { remoteJid: "123456789012345@lid", remoteJidAlt: "999999999999@lid" }), opts)).toEqual({ kind: "ignored", reason: "lid sem número" });
  });
  it("@lid sem número é ignorado com motivo", () => {
    expect(parseEvolutionPayload(base({}, { remoteJid: "123456789012345@lid" }), opts)).toEqual({ kind: "ignored", reason: "lid sem número" });
  });
  it("instância diferente da configurada é ignorada", () => {
    expect(parseEvolutionPayload({ ...base(), instance: "outra-instancia" }, opts)).toEqual({ kind: "ignored", reason: "instância diferente" });
    // sem instance no payload (ex.: simuladores antigos) continua aceito
    const { instance: _drop, ...noInstance } = base();
    void _drop;
    expect(parseEvolutionPayload(noInstance, opts).kind).toBe("message");
  });
  it("mensagens de protocolo e reações são ignoradas", () => {
    expect(parseEvolutionPayload(base({ messageType: "reactionMessage" }, {}, { reactionMessage: { text: "👍", key: { id: "X" } } }), opts)).toEqual({ kind: "ignored", reason: "protocolo/reação" });
    expect(parseEvolutionPayload(base({ messageType: "protocolMessage" }, {}, { protocolMessage: { type: 0 } }), opts)).toEqual({ kind: "ignored", reason: "protocolo/reação" });
    expect(parseEvolutionPayload(base({ messageType: "imageMessage" }, {}, { imageMessage: {} }), opts)).toEqual({ kind: "ignored", reason: "sem texto" });
  });
  it("jidToPhone não confunde id @lid com telefone", () => {
    expect(jidToPhone("123456789012345@lid")).toBeNull();
    expect(jidToPhone("5511990000001@c.us")).toBe("+5511990000001");
    expect(jidToPhone("5511990000001")).toBe("+5511990000001");
  });
});
