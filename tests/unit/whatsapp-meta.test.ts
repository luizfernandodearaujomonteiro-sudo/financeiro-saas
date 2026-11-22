import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const handleInbound = vi.fn();
vi.mock("@/lib/whatsapp/handler", () => ({ handleInbound: (...a: unknown[]) => handleInbound(...a) }));
vi.mock("@/lib/db", () => ({ withService: vi.fn(async () => []), withUser: vi.fn() }));

import { parseMetaPayload } from "@/lib/whatsapp/inbound";
import { createMetaProvider, describeMetaError, verifyMetaSignature } from "@/lib/whatsapp/meta";
import type { FetchLike, WhatsAppProvider } from "@/lib/whatsapp/provider";
import { sendMessages } from "@/lib/whatsapp/send";
import { handleMetaVerify, handleWebhookRequest } from "@/lib/whatsapp/webhook";

const OWN = "970939662768046";
const OTHER = "111111111111111";
const SECRET = "unit-meta-app-secret";

const textMsg = (from: string, id = "wamid.A", body = "saldo") => ({ from, id, timestamp: "1700000000", type: "text", text: { body } });
const payload = (phoneNumberId: string, value: Record<string, unknown>) => ({
  object: "whatsapp_business_account",
  entry: [{ id: "WABA", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { display_phone_number: "5522992419630", phone_number_id: phoneNumberId }, ...value } }] }],
});
const sign = (raw: string, secret = SECRET) => "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
const post = (raw: string, sig: string | null) =>
  handleWebhookRequest(new Request("https://x/api/whatsapp/webhook", { method: "POST", headers: sig ? { "x-hub-signature-256": sig } : {}, body: raw }));

const saved = { ...process.env };
beforeEach(() => {
  handleInbound.mockReset().mockResolvedValue({ status: "processado", replies: [] });
  process.env.META_WHATSAPP_APP_SECRET = SECRET;
  process.env.META_WHATSAPP_PHONE_NUMBER_ID = OWN;
  process.env.META_WHATSAPP_VERIFY_TOKEN = "verify-me";
});
afterEach(() => {
  process.env = { ...saved };
});

describe("GET verificação Meta", () => {
  it("ecoa hub.challenge em text/plain com token correto", async () => {
    const r = handleMetaVerify(new URL("https://x/w?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=1158201444"));
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toMatch(/^text\/plain/);
    expect(await r.text()).toBe("1158201444");
  });
  it("403 com token errado, modo errado ou token não configurado", () => {
    expect(handleMetaVerify(new URL("https://x/w?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=1")).status).toBe(403);
    expect(handleMetaVerify(new URL("https://x/w?hub.mode=unsubscribe&hub.verify_token=verify-me&hub.challenge=1")).status).toBe(403);
    delete process.env.META_WHATSAPP_VERIFY_TOKEN;
    expect(handleMetaVerify(new URL("https://x/w?hub.mode=subscribe&hub.verify_token=&hub.challenge=1")).status).toBe(403);
  });
});

describe("assinatura X-Hub-Signature-256", () => {
  it("aceita HMAC correto e recusa errado/malformado/sem segredo", () => {
    const raw = '{"a":1}';
    expect(verifyMetaSignature(raw, sign(raw), SECRET)).toBe(true);
    expect(verifyMetaSignature(raw, sign(raw, "outro"), SECRET)).toBe(false);
    expect(verifyMetaSignature(raw + " ", sign(raw), SECRET)).toBe(false);
    expect(verifyMetaSignature(raw, "sha256=zz", SECRET)).toBe(false);
    expect(verifyMetaSignature(raw, sign(raw).replace("sha256=", "sha1="), SECRET)).toBe(false);
    expect(verifyMetaSignature(raw, sign(raw), undefined)).toBe(false);
  });
  it("POST com assinatura inválida = 401 e não processa", async () => {
    const raw = JSON.stringify(payload(OWN, { messages: [textMsg("5522999990000")] }));
    expect((await post(raw, sign(raw, "errado"))).status).toBe(401);
    delete process.env.META_WHATSAPP_APP_SECRET;
    expect((await post(raw, sign(raw))).status).toBe(401);
    expect(handleInbound).not.toHaveBeenCalled();
  });
});

describe("POST Meta: filtro por phone_number_id", () => {
  it("processa mensagem de texto do nosso número", async () => {
    const raw = JSON.stringify(payload(OWN, { contacts: [{ wa_id: "5522999990000", profile: { name: "X" } }], messages: [textMsg("5522999990000")] }));
    const r = await post(raw, sign(raw));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, results: ["processado"] });
    expect(handleInbound).toHaveBeenCalledWith(expect.objectContaining({ provider: "meta", messageId: "wamid.A", phone: "+5522999990000", text: "saldo", replyTo: "5522999990000" }));
  });
  it("ignora (200) mensagens de outro número da mesma WABA", async () => {
    const raw = JSON.stringify(payload(OTHER, { messages: [textMsg("5522999990000")] }));
    const r = await post(raw, sign(raw));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, results: [], ignored: 1 });
    expect(handleInbound).not.toHaveBeenCalled();
  });
  it("sem META_WHATSAPP_PHONE_NUMBER_ID ignora tudo (falha fechada) mas responde 200", async () => {
    delete process.env.META_WHATSAPP_PHONE_NUMBER_ID;
    const raw = JSON.stringify(payload(OWN, { messages: [textMsg("5522999990000")] }));
    const r = await post(raw, sign(raw));
    expect(r.status).toBe(200);
    expect(handleInbound).not.toHaveBeenCalled();
  });
  it("payload só de statuses é ignorado com 200", async () => {
    const raw = JSON.stringify(payload(OWN, { statuses: [{ id: "wamid.X", status: "delivered", timestamp: "1", recipient_id: "5522999990000" }] }));
    const r = await post(raw, sign(raw));
    expect(r.status).toBe(200);
    expect(handleInbound).not.toHaveBeenCalled();
  });
  it("mistura: só o texto do nosso número passa; imagem/reação/outro número caem fora", async () => {
    const body = payload(OWN, {
      messages: [textMsg("5522999990000", "w1"), { from: "5522999990000", id: "w2", type: "image", image: { id: "m" } }, { from: "5522999990000", id: "w3", type: "reaction", reaction: { emoji: "👍" } }],
    });
    body.entry.push(payload(OTHER, { messages: [textMsg("5522999990000", "w4")] }).entry[0]!);
    const parsed = parseMetaPayload(body, { phoneNumberId: OWN });
    expect(parsed.messages.map((m) => m.messageId)).toEqual(["w1"]);
    expect(parsed.ignored).toBe(3);
  });
  it("erro interno ao processar ainda responde 200 (Meta não reenvia/desativa)", async () => {
    handleInbound.mockRejectedValueOnce(new Error("db fora"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const raw = JSON.stringify(payload(OWN, { messages: [textMsg("5522999990000")] }));
    const r = await post(raw, sign(raw));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ results: ["erro"] });
    err.mockRestore();
  });
  it("JSON inválido assinado responde 200 sem processar", async () => {
    const raw = "{nope";
    expect((await post(raw, sign(raw))).status).toBe(200);
    expect(handleInbound).not.toHaveBeenCalled();
  });
});

describe("Brasil: wa_id sem o 9º dígito", () => {
  it("normaliza para busca (+55 21 9...) e mantém o wa_id original para responder", () => {
    const parsed = parseMetaPayload(payload(OWN, { messages: [textMsg("552175888692")] }), { phoneNumberId: OWN });
    expect(parsed.messages[0]).toMatchObject({ phone: "+5521975888692", replyTo: "552175888692" });
  });
  it("resposta via Meta vai para o wa_id exato; outros provedores usam o E.164", async () => {
    const fake = (name: WhatsAppProvider["name"]) => {
      const sendText = vi.fn<WhatsAppProvider["sendText"]>(async () => ({ ok: true }));
      return { p: { name, sendText } as WhatsAppProvider, sendText };
    };
    const target = { householdId: "h", userId: "u", phone: "+5521975888692", providerTo: "552175888692" };
    const meta = fake("meta");
    await sendMessages(target, ["a", "b"], meta.p);
    expect(meta.sendText.mock.calls.map((c) => c[0])).toEqual(["552175888692", "552175888692"]);
    const evo = fake("evolution");
    await sendMessages(target, ["a"], evo.p);
    expect(evo.sendText).toHaveBeenCalledWith("+5521975888692", "a");
    // cron/notificações (sem providerTo) seguem com o E.164 cadastrado
    const cron = fake("meta");
    await sendMessages({ householdId: "h", userId: "u", phone: "+5521975888692" }, ["c"], cron.p);
    expect(cron.sendText).toHaveBeenCalledWith("+5521975888692", "c");
  });
});

describe("provedor Meta: envio", () => {
  it("POST graph.facebook.com/v21.0/{phone_number_id}/messages com Bearer e corpo correto", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>Response.json({ messaging_product: "whatsapp", messages: [{ id: "wamid.OUT" }] }));
    const p = createMetaProvider({ phoneNumberId: OWN, accessToken: "tok", fetchImpl });
    const r = await p.sendText("552175888692", "olá");
    expect(r).toEqual({ ok: true, providerMessageId: "wamid.OUT" });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(`https://graph.facebook.com/v21.0/${OWN}/messages`);
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(init?.body as string)).toEqual({ messaging_product: "whatsapp", recipient_type: "individual", to: "552175888692", type: "text", text: { body: "olá", preview_url: false } });
  });
  it("aceita E.164 com + (envios do cron) e respeita META_GRAPH_API_VERSION", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>Response.json({ messages: [{ id: "x" }] }));
    await createMetaProvider({ phoneNumberId: OWN, accessToken: "tok", apiVersion: "v22.0", fetchImpl }).sendText("+5521975888692", "oi");
    expect(fetchImpl.mock.calls[0]![0]).toBe(`https://graph.facebook.com/v22.0/${OWN}/messages`);
    expect(JSON.parse(fetchImpl.mock.calls[0]![1]?.body as string).to).toBe("5521975888692");
  });
  it("erro da Graph API traz código e mensagem, sem o token", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ error: { message: "(#131030) Recipient phone number not in allowed list", type: "OAuthException", code: 131030, error_data: { details: "Add recipient" }, fbtrace_id: "A" } }, { status: 400 }),
    );
    const r = await createMetaProvider({ phoneNumberId: OWN, accessToken: "segredo-do-token", fetchImpl }).sendText("+5521975888692", "oi");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("Meta HTTP 400");
    expect(r.error).toContain("131030");
    expect(r.error).toContain("Recipient phone number not in allowed list");
    expect(r.error).not.toContain("segredo-do-token");
    expect(describeMetaError(500, null)).toBe("Meta HTTP 500");
  });
  it("recusa phone_number_id inválido", () => {
    expect(() => createMetaProvider({ phoneNumberId: "../me", accessToken: "t" })).toThrow();
  });
});
