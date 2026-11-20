/**
 * Caminho ponta a ponta LOCAL: sobe o Postgres de teste, aplica migrations + seed e
 * exercita login dos dois membros, lançamentos, cartões/faturas/parcelas, contas a pagar,
 * fila de revisão, importação Open Finance (mock via webhook), WhatsApp (webhook Evolution
 * com Bearer, comandos, desfazer, alertas com código em mensagem separada), metas, busca,
 * patrimônio, investimentos e comparação entre membros.
 */
import "./env";
import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SEED_USERS } from "../../scripts/db/seed";
import { freshTestDb } from "../support/db";
import { authenticate, localVerifier } from "@/lib/auth/core";
import { loadMembership } from "@/lib/auth/member";
import { withService, withUser } from "@/lib/db";
import { addDays, currentMonthStart, formatDateBR, monthStartOf, todayISO } from "@/lib/domain/dates";
import { assignInvoice, installmentSlot } from "@/lib/domain/invoices";
import { summarize } from "@/lib/domain/reports";
import { bancarioBarcodeToLine, buildBancarioBarcode, dateToFactor } from "@/lib/domain/boleto";
import { createBill, listBills, payBill } from "@/lib/services/bills";
import { createCard, createCardPurchase, listCards, listInvoices, updateCard } from "@/lib/services/cards";
import { createEntry, listEntriesForMonth } from "@/lib/services/entries";
import { addContribution, listGoals } from "@/lib/services/goals";
import { listPositions } from "@/lib/services/invest";
import { computeAndSnapshot } from "@/lib/services/networth";
import { membersComparison } from "@/lib/services/reports";
import { approveReview, listReview, rejectReview } from "@/lib/services/review";
import { recentSearches, saveSearch, searchEntries } from "@/lib/services/search";
import { ingestDocument } from "@/lib/importers/pdf";
import { clearPdfPassword, hasPdfPassword, pdfPasswordForJob, savePdfPassword } from "@/lib/services/pdf-password";
import { makePdf } from "../support/pdf";
import { mockStatementText } from "@/lib/gmail/sync";
import { createMockItem, setAccountVisibility } from "@/lib/pluggy/service";
import { runDailyReminder, runDueAlerts, runWeeklySummary } from "@/lib/whatsapp/notifications";
import type { WhatsAppProvider } from "@/lib/whatsapp/provider";
import { getPrefs, savePrefs } from "@/lib/services/prefs";
import { evolutionPayload } from "@/lib/whatsapp/simulate";
import { POST as pluggyWebhook } from "@/app/api/pluggy/webhook/route";
import { POST as whatsappWebhook, GET as whatsappVerify } from "@/app/api/whatsapp/webhook/route";
import { GET as cronRoute } from "@/app/api/cron/[job]/route";
import { closePools } from "@/lib/db/pool";

const { luiz, esposa, outro } = SEED_USERS;
let HH = "";
let NUBANK = "";
const L = () => ({ userId: luiz.id, householdId: HH });
const E = () => ({ userId: esposa.id, householdId: HH });
const month = currentMonthStart();

beforeAll(async () => {
  const db = await freshTestDb();
  HH = db.householdId;
  NUBANK = db.nubank;
});
afterAll(async () => {
  await closePools();
});

async function outbox(userId: string) {
  return withService((db) => db.query<{ body: string; direction: string }>("select body, direction from fam_whatsapp_messages where user_id = $1 and status = 'ok' order by id", [userId]));
}

function waRequest(body: unknown, secret: string | null = process.env.WHATSAPP_WEBHOOK_SECRET!) {
  return new Request("http://localhost/api/whatsapp/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", ...(secret ? { authorization: `Bearer ${secret}` } : {}) },
    body: JSON.stringify(body),
  });
}

async function sendWa(phone: string, text: string, id?: string) {
  const res = await whatsappWebhook(waRequest(evolutionPayload(phone, text, id)));
  return (await res.json()) as { ok: boolean; status?: string; ignored?: string };
}

describe("1. login dos dois membros + limite de tentativas", () => {
  it("Luiz e a esposa entram e pertencem à mesma família", async () => {
    const a = await authenticate(luiz.email, luiz.password, "10.0.0.1", localVerifier);
    const b = await authenticate(esposa.email, esposa.password, "10.0.0.2", localVerifier);
    expect(a.ok && b.ok).toBe(true);
    const ma = await loadMembership(luiz.id), mb = await loadMembership(esposa.id);
    expect(ma?.householdId).toBe(HH);
    expect(mb?.householdId).toBe(HH);
    expect(ma?.role).toBe("owner");
    expect(mb?.role).toBe("member");
  });
  it("conta de outro app (auth.users compartilhado) autentica mas não tem família", async () => {
    const r = await authenticate(outro.email, outro.password, "10.0.0.3", localVerifier);
    expect(r.ok).toBe(true);
    expect(await loadMembership(outro.id)).toBeNull();
  });
  it("bloqueia após 5 senhas erradas, mesmo com a senha certa depois", async () => {
    for (let i = 0; i < 5; i++) expect((await authenticate(esposa.email, "errada-123456", "10.0.0.9", localVerifier)).ok).toBe(false);
    const r = await authenticate(esposa.email, esposa.password, "10.0.0.10", localVerifier);
    expect(r).toEqual({ ok: false, error: "bloqueado" });
    // Luiz não é afetado
    expect((await authenticate(luiz.email, luiz.password, "10.0.0.10", localVerifier)).ok).toBe(true);
  });
});

describe("2. lançamentos pessoal x compartilhado", () => {
  it("lançamento pessoal do Luiz não aparece para a esposa; compartilhado aparece", async () => {
    await createEntry(L(), { kind: "despesa", description: "Presente surpresa", amountCents: "350,00", occurredOn: todayISO(), visibility: "pessoal" });
    await createEntry(L(), { kind: "despesa", description: "Gás de cozinha", amountCents: "120,00", occurredOn: todayISO(), visibility: "compartilhado" });
    const seenByWife = await listEntriesForMonth(E(), month, "tudo");
    expect(seenByWife.some((e) => e.description === "Presente surpresa")).toBe(false);
    expect(seenByWife.some((e) => e.description === "Gás de cozinha")).toBe(true);
    const mine = await listEntriesForMonth(L(), month, "minha");
    expect(mine.find((e) => e.description === "Presente surpresa")?.amount_cents).toBe(35000);
  });
  it("valores inválidos são recusados", async () => {
    await expect(createEntry(L(), { kind: "despesa", description: "x", amountCents: "abc", occurredOn: todayISO() })).rejects.toThrow();
  });
});

describe("3. cartões, faturas e parcelas", () => {
  it("compra parcelada cai nas faturas certas e a soma bate", async () => {
    const card = await createCard(E(), { nickname: "Inter", brand: "mastercard", last4: "1111", closingDay: 10, dueDay: 17, limitCents: "5.000,00", visibility: "pessoal" });
    const r = await createCardPurchase(E(), { cardId: card!.id, description: "Celular", totalCents: "1.000,00", installments: 3, purchasedOn: "2026-11-09", visibility: "pessoal" });
    expect(r.plan.map((p) => p.invoice.referenceMonth)).toEqual(["2026-11-01", "2026-12-01", "2027-01-01"]);
    const invoices = await listInvoices(E(), card!.id);
    expect(invoices.map((i) => i.total_cents).sort()).toEqual([33333, 33333, 33334]);
    // Luiz não enxerga o cartão pessoal da esposa nem consegue lançar nele
    expect((await listCards(L())).some((c) => c.id === card!.id)).toBe(false);
    await expect(createCardPurchase(L(), { cardId: card!.id, description: "x", totalCents: "10", installments: 1, purchasedOn: todayISO() })).rejects.toThrow();
  });
});

describe("3b. mudança de ciclo do cartão", () => {
  it("recalcula só faturas abertas do mês corrente em diante; passadas/pagas ficam como estão", async () => {
    const card = await createCard(E(), { nickname: "C6", brand: "visa", last4: "2222", closingDay: 10, dueDay: 17, limitCents: "1.000,00", visibility: "pessoal" });
    const today = todayISO();
    const past = addDays(today, -75);
    await createCardPurchase(E(), { cardId: card!.id, description: "TV", totalCents: "1.200,00", installments: 4, purchasedOn: past, visibility: "pessoal" });
    const before = await listInvoices(E(), card!.id);
    const current = monthStartOf(today);
    const pastInv = before.find((i) => i.reference_month < current)!;
    await withUser(esposa.id, (db) => db.query("update fam_invoices set status = 'paga' where id = $1", [pastInv.id]));
    const r = await updateCard(E(), card!.id, { nickname: "C6", brand: "visa", last4: "2222", closingDay: 1, dueDay: 8, limitCents: "1.000,00", visibility: "pessoal" }, today);
    const after = await listInvoices(E(), card!.id);
    const future = after.filter((i) => i.reference_month >= current && i.status === "aberta");
    expect(r.recalculated).toBe(future.length);
    expect(future.length).toBeGreaterThan(0);
    for (const inv of future) {
      expect(inv.closing_date.slice(8)).toBe("01");
      expect(inv.due_date.slice(8)).toBe("08");
    }
    const untouched = after.find((i) => i.id === pastInv.id)!;
    expect([untouched.closing_date, untouched.due_date]).toEqual([pastInv.closing_date, pastInv.due_date]);
    // os lançamentos continuam nas mesmas faturas e os totais batem
    expect(after.reduce((a, i) => a + i.total_cents, 0)).toBe(120000);
    // o marido não consegue mudar datas de fatura do cartão pessoal dela
    const hack = await withUser(luiz.id, (db) => db.one<{ ok: boolean }>("select fam_set_invoice_dates($1, '2027-01-01', '2027-01-09', $2) as ok", [future[0]!.id, current]));
    expect(hack?.ok).toBe(false);
  });
});

describe("4. contas a pagar com boleto/Pix", () => {
  it("valida boleto e Pix e registra pagamento", async () => {
    await expect(createBill(L(), { description: "Errada", amountCents: "10", dueDate: todayISO(), boleto: "1234" })).rejects.toThrow(/Boleto inválido/);
    await expect(createBill(L(), { description: "Errada", amountCents: "10", dueDate: todayISO(), pixCode: "000201xyz6304ABCD" })).rejects.toThrow(/Pix/);
    const due = addDays(todayISO(), 3);
    const line = bancarioBarcodeToLine(buildBancarioBarcode("001", dateToFactor(due), 4500, "9".repeat(25)));
    const bill = await createBill(L(), { description: "Seguro do carro", amountCents: "45,00", dueDate: due, boleto: line, visibility: "compartilhado" });
    const listed = (await listBills(E())).find((b) => b.id === bill!.id);
    expect(listed?.boleto_line).toBe(line);
    const { entryId } = await payBill(E(), bill!.id);
    expect(entryId).toBeTruthy();
  });
});

describe("5. fila de revisão (fatura PDF/Gmail)", () => {
  it("importa itens, deduplica e aprova/rejeita", async () => {
    const text = mockStatementText(todayISO());
    const bytes = new TextEncoder().encode(text);
    const r1 = await ingestDocument(L(), { bytes, fileName: "fatura.txt", source: "gmail", cardId: NUBANK, textOverride: text });
    expect(r1.duplicate).toBe(false);
    expect(r1.inserted).toBe(5);
    const r2 = await ingestDocument(L(), { bytes, fileName: "fatura.txt", source: "gmail", cardId: NUBANK, textOverride: text });
    expect(r2.duplicate).toBe(true);
    const pending = await listReview(L());
    const magazine = pending.find((p) => p.description === "MAGAZINE LOJA" && p.installment_total === 6)!;
    expect(magazine).toBeTruthy();
    const entryId = await approveReview(L(), magazine.id);
    const inv = await withUser(luiz.id, (db) => db.one<{ invoice_id: string; card_id: string }>("select invoice_id, card_id from fam_entries where id = $1", [entryId]));
    expect(inv?.card_id).toBe(NUBANK);
    expect(inv?.invoice_id).toBeTruthy();
    const estorno = pending.find((p) => p.kind === "receita")!;
    await rejectReview(L(), estorno.id);
    expect((await listReview(E())).length).toBe(0); // fila é só do dono
  });
});

describe("5b. PDF de fatura protegido por senha", () => {
  const d = (n: number) => formatDateBR(addDays(todayISO(), -n)).slice(0, 5);
  const lines = () => ["FATURA PROTEGIDA", `${d(3)}  ACOUGUE BOI GORDO  98,40`, `${d(5)}  LIVRARIA CULTURA  59,90`];
  it("sem senha: guarda o documento com parse_error; com a senha certa: reprocessa e coloca na revisão", async () => {
    const pdf = makePdf(lines(), { userPassword: "52998224725" });
    const r1 = await ingestDocument(L(), { bytes: pdf, fileName: "fatura-protegida.pdf", source: "upload" });
    expect(r1).toMatchObject({ duplicate: false, parseError: "PDF protegido por senha", inserted: 0 });
    const doc = await withUser(luiz.id, (db) => db.one<{ parse_error: string }>("select parse_error from fam_invoice_documents where id = $1", [r1.documentId]));
    expect(doc?.parse_error).toBe("PDF protegido por senha");
    const wrong = await ingestDocument(L(), { bytes: pdf, fileName: "fatura-protegida.pdf", source: "upload", password: "000" });
    expect(wrong.parseError).toBe("Senha do PDF incorreta");
    const ok = await ingestDocument(L(), { bytes: pdf, fileName: "fatura-protegida.pdf", source: "upload", password: "52998224725" });
    expect(ok).toMatchObject({ duplicate: false, parseError: null, inserted: 2, reprocessed: true, documentId: r1.documentId });
    const fixed = await withUser(luiz.id, (db) => db.one<{ parse_error: string | null; parsed_items: number }>("select parse_error, parsed_items from fam_invoice_documents where id = $1", [r1.documentId]));
    expect(fixed).toEqual({ parse_error: null, parsed_items: 2 });
    // de novo, depois de lido: duplicado
    expect((await ingestDocument(L(), { bytes: pdf, fileName: "x.pdf", source: "upload", password: "52998224725" })).duplicate).toBe(true);
  });
  it("senha do PDF por perfil fica cifrada e só o job a lê", async () => {
    await savePdfPassword(L(), "52998224725");
    expect(await hasPdfPassword(L())).toBe(true);
    expect(await hasPdfPassword(E())).toBe(false);
    const raw = await withService((db) => db.one<{ password_enc: string }>("select password_enc from fam_pdf_passwords where user_id = $1", [luiz.id]));
    expect(raw?.password_enc).toMatch(/^v1\./);
    expect(raw?.password_enc).not.toContain("52998224725");
    expect(await pdfPasswordForJob(luiz.id)).toBe("52998224725");
    await expect(withUser(luiz.id, (db) => db.query("select * from fam_pdf_passwords"))).rejects.toThrow(/permission denied/);
    await clearPdfPassword(L());
    expect(await hasPdfPassword(L())).toBe(false);
  });
});

describe("6. Open Finance (Pluggy mock): conectar -> webhook -> importar -> categorizar", () => {
  it("webhook sem segredo é recusado", async () => {
    const res = await pluggyWebhook(new Request("http://localhost/api/pluggy/webhook", { method: "POST", body: JSON.stringify({ event: "item/updated", itemId: "x" }) }));
    expect(res.status).toBe(401);
  });
  it("importa contas/cartões/transações como PESSOAL da esposa; compartilhar libera para o Luiz", async () => {
    const itemId = await createMockItem(E());
    const res = await pluggyWebhook(new Request(`http://localhost/api/pluggy/webhook?secret=${process.env.PLUGGY_WEBHOOK_SECRET}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event: "item/created", itemId }),
    }));
    const body = (await res.json()) as { ok: boolean; result: { accounts: number; cards: number; transactions: number; bills: number; billsWithCode: number } };
    expect(body.ok).toBe(true);
    expect(body.result).toMatchObject({ accounts: 1, cards: 2, bills: 2, billsWithCode: 1, excluded: 3 });
    expect(body.result.transactions).toBeGreaterThanOrEqual(15);
    // reimportar não duplica
    const againRes = await pluggyWebhook(new Request(`http://localhost/api/pluggy/webhook?secret=${process.env.PLUGGY_WEBHOOK_SECRET}`, {
      method: "POST", body: JSON.stringify({ event: "transactions/created", itemId }),
    }));
    const again = (await againRes.json()) as { result: { transactions: number } };
    expect(again.result.transactions).toBe(0);

    const imported = await withUser(esposa.id, (db) => db.query<{ description: string; visibility: string; category: string | null }>(
      "select e.description, e.visibility, c.name as category from fam_entries e left join fam_categories c on c.id = e.category_id where e.source = 'pluggy'"));
    expect(imported.every((e) => e.visibility === "pessoal")).toBe(true);
    expect(imported.find((e) => e.description === "UBER *TRIP")?.category).toBe("Transporte");
    expect(imported.find((e) => e.description.startsWith("SUPERMERCADO"))?.category).toBe("Mercado");
    expect(imported.find((e) => e.description === "NETFLIX.COM")?.category).toBe("Assinaturas");
    expect(await withUser(luiz.id, (db) => db.query("select 1 from fam_entries where source = 'pluggy'"))).toHaveLength(0);

    const visa = await withUser(esposa.id, (db) => db.one<{ id: string }>("select id from fam_cards where nickname = 'Cartão Simulado Visa'"));
    await setAccountVisibility(E(), "cartao", visa!.id, "compartilhado", true);
    const nowVisible = await withUser(luiz.id, (db) => db.query("select 1 from fam_entries where source = 'pluggy' and card_id = $1", [visa!.id]));
    expect(nowVisible.length).toBeGreaterThan(0);
    const bills = await withUser(esposa.id, (db) => db.query<{ description: string; boleto_line: string | null; pix_code: string | null }>("select description, boleto_line, pix_code from fam_bills where source = 'pluggy' order by description"));
    expect(bills.find((b) => b.description.includes("Master"))?.boleto_line).toBeNull();
    expect(bills.find((b) => b.description.includes("Visa"))?.boleto_line).toMatch(/^\d{47}$/);
  });

  it("pagamento de fatura e transferência própria não viram receita/despesa; estorno reduz despesa", async () => {
    type Row = { description: string; kind: "receita" | "despesa"; amount_cents: number; cost_type: "fixa" | "variavel"; payment_method: string;
      card_id: string | null; invoice_id: string | null; exclude_from_reports: boolean; exclude_reason: string | null };
    const rows = await withUser(esposa.id, (db) => db.query<Row>(
      "select description, kind, amount_cents, cost_type, payment_method, card_id, invoice_id, exclude_from_reports, exclude_reason from fam_entries where source = 'pluggy'"));
    const by = (d: string) => rows.find((r) => r.description === d)!;
    expect(by("PAG FATURA CARTAO SIMULADO VISA")).toMatchObject({ exclude_from_reports: true, exclude_reason: "pagamento_fatura", kind: "despesa" });
    expect(by("TRANSF MESMA TITULARIDADE POUPANCA")).toMatchObject({ exclude_from_reports: true, exclude_reason: "transferencia" });
    expect(by("PAGAMENTO RECEBIDO")).toMatchObject({ exclude_from_reports: true, exclude_reason: "pagamento_fatura", invoice_id: null });
    expect(by("ESTORNO UBER *TRIP")).toMatchObject({ exclude_from_reports: false, kind: "receita" });
    expect(by("ESTORNO UBER *TRIP").invoice_id).not.toBeNull();
    // somente o que veio do Open Finance: receitas = salário + rendimento; despesas sem pagamentos/transferências e com o estorno abatido
    const s = summarize(rows);
    expect(s.receitas).toBe(651237);
    expect(s.despesas).toBe(397431);
    // o total da fatura abate o estorno mas não o pagamento
    const visa = await withUser(esposa.id, (db) => db.one<{ id: string }>("select id from fam_cards where nickname = 'Cartão Simulado Visa'"));
    const totals = await withService((db) => db.query<{ total_cents: number; s: number }>(
      `select i.total_cents, coalesce(sum(case when e.kind='despesa' then e.amount_cents else -e.amount_cents end), 0)::bigint s
         from fam_invoices i left join fam_entries e on e.invoice_id = i.id where i.card_id = $1 group by i.id`, [visa!.id]));
    const allInvoices = totals.reduce((a, t) => a + t.total_cents, 0);
    expect(allInvoices).toBe(129673 - 2390); // compras do Visa - estorno; o pagamento de R$ 980 não entra
    for (const t of totals) expect(t.total_cents).toBe(Number(t.s));
  });

  it("parcelas do Open Finance: billId vai para a fatura do banco; sem billId desloca (n-1) meses", async () => {
    const visa = await withUser(esposa.id, (db) => db.one<{ id: string; closing_day: number; due_day: number }>("select id, closing_day, due_day from fam_cards where nickname = 'Cartão Simulado Visa'"));
    const cycle = { closingDay: visa!.closing_day, dueDay: visa!.due_day };
    const get = (d: string) => withUser(esposa.id, (db) => db.one<{ budget_month: string; reference_month: string; installment_number: number }>(
      "select e.budget_month, i.reference_month, e.installment_number from fam_entries e join fam_invoices i on i.id = e.invoice_id where e.description = $1", [d]));
    const purchase = addDays(todayISO(), -70);
    const magazine = await get("MAGAZINE LUIZA");
    expect(magazine?.installment_number).toBe(3);
    expect(magazine?.reference_month).toBe(installmentSlot(cycle, purchase, 3).referenceMonth);
    expect(magazine?.reference_month).not.toBe(assignInvoice(cycle, purchase).referenceMonth); // não cai na fatura da compra original
    const apple = await get("APPLE.COM/BILL");
    expect(apple?.reference_month).toBe(monthStartOf(addDays(todayISO(), 12))); // fatura do bill informado pela Pluggy
    expect(apple?.budget_month).toBe(apple?.reference_month);
  });

  it("pagar a fatura importada não cria despesa nova e marca a fatura do cartão como paga", async () => {
    const bill = await withUser(esposa.id, (db) => db.one<{ id: string; card_id: string; due_date: string }>("select id, card_id, due_date from fam_bills where source = 'pluggy' and description like '%Visa%'"));
    const before = await withService((db) => db.one<{ n: number }>("select count(*)::int n from fam_entries where owner_id = $1", [esposa.id]));
    const r = await payBill(E(), bill!.id);
    expect(r).toEqual({ entryId: null, invoiceMarkedPaid: true });
    const after = await withService((db) => db.one<{ n: number }>("select count(*)::int n from fam_entries where owner_id = $1", [esposa.id]));
    expect(after!.n).toBe(before!.n);
    const inv = await withService((db) => db.one<{ status: string }>("select status from fam_invoices where card_id = $1 and reference_month = date_trunc('month', $2::date)::date", [bill!.card_id, bill!.due_date]));
    expect(inv?.status).toBe("paga");
  });
});

describe("7. WhatsApp: webhook Evolution + comandos + desfazer", () => {
  it("rejeita sem Bearer e com assinatura Meta inválida", async () => {
    expect((await whatsappWebhook(waRequest(evolutionPayload(luiz.phone, "saldo"), null))).status).toBe(401);
    expect((await whatsappWebhook(waRequest(evolutionPayload(luiz.phone, "saldo"), "segredo-errado-0123456789"))).status).toBe(401);
    const meta = new Request("http://localhost/api/whatsapp/webhook", { method: "POST", headers: { "x-hub-signature-256": "sha256=00" }, body: "{}" });
    expect((await whatsappWebhook(meta)).status).toBe(401);
    expect((await whatsappVerify(new Request("http://localhost/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=x&hub.challenge=1"))).status).toBe(403);
    const ok = await whatsappVerify(new Request("http://localhost/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=e2e-meta-verify-token&hub.challenge=42"));
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("42");
  });
  it("aceita assinatura Meta válida", async () => {
    const raw = JSON.stringify({ object: "whatsapp_business_account", entry: [{ changes: [{ value: { messages: [{ from: "5511990000001", id: "wamid.1", type: "text", text: { body: "ajuda" } }] } }] }] });
    const sig = "sha256=" + createHmac("sha256", "e2e-meta-app-secret").update(raw).digest("hex");
    const res = await whatsappWebhook(new Request("http://localhost/api/whatsapp/webhook", { method: "POST", headers: { "x-hub-signature-256": sig }, body: raw }));
    expect(((await res.json()) as { results: string[] }).results).toEqual(["processado"]);
  });
  it("'gastei 50 mercado' cria lançamento do remetente com categoria e responde", async () => {
    const r = await sendWa(luiz.phone, "gastei 50 mercado", "MSG-1");
    expect(r.status).toBe("processado");
    const e = await withUser(luiz.id, (db) => db.one<{ amount_cents: number; category: string; visibility: string }>(
      "select e.amount_cents, c.name as category, e.visibility from fam_entries e left join fam_categories c on c.id = e.category_id where e.source = 'whatsapp' order by e.created_at desc limit 1"));
    expect(e).toEqual({ amount_cents: 5000, category: "Mercado", visibility: "pessoal" });
    const out = await outbox(luiz.id);
    expect(out.at(-1)?.body).toContain("R$ 50,00");
    expect(out.at(-1)?.body).toContain("desfazer");
  });
  it("Evolution com remoteJid @lid usa o número alternativo; instância diferente é ignorada", async () => {
    const lid = evolutionPayload(esposa.phone, "gastei 12 padaria");
    const realJid = lid.data.key.remoteJid;
    Object.assign(lid.data.key, { remoteJid: "201234567890123@lid", remoteJidAlt: realJid });
    expect(((await (await whatsappWebhook(waRequest(lid))).json()) as { status: string }).status).toBe("processado");
    const e = await withUser(esposa.id, (db) => db.one<{ description: string }>("select description from fam_entries where source = 'whatsapp' order by created_at desc limit 1"));
    expect(e?.description).toBe("padaria");
    const noNumber = evolutionPayload(esposa.phone, "saldo");
    noNumber.data.key.remoteJid = "201234567890123@lid";
    expect(((await (await whatsappWebhook(waRequest(noNumber))).json()) as { ignored: string }).ignored).toBe("lid sem número");
    const otherInstance = { ...evolutionPayload(esposa.phone, "saldo"), instance: "instancia-de-outro-app" };
    expect(((await (await whatsappWebhook(waRequest(otherInstance))).json()) as { ignored: string }).ignored).toBe("instância diferente");
  });

  it("deduplica por id, ignora fromMe, grupos e números desconhecidos", async () => {
    expect((await sendWa(luiz.phone, "gastei 50 mercado", "MSG-1")).status).toBe("duplicado");
    const fromMe = evolutionPayload(luiz.phone, "gastei 1 x");
    fromMe.data.key.fromMe = true;
    expect(((await (await whatsappWebhook(waRequest(fromMe))).json()) as { ignored: string }).ignored).toBe("fromMe");
    const group = evolutionPayload(luiz.phone, "gastei 1 x");
    group.data.key.remoteJid = "120363000000000000@g.us";
    expect(((await (await whatsappWebhook(waRequest(group))).json()) as { ignored: string }).ignored).toBe("grupo");
    expect((await sendWa("+5511977776666", "saldo")).status).toBe("desconhecido");
    expect(((await (await whatsappWebhook(waRequest({ event: "CONNECTION_UPDATE", data: {} }))).json()) as { ignored: string }).ignored).toContain("CONNECTION_UPDATE");
  });
  it("comandos recebi / saldo / fatura nubank / contas / ajuda", async () => {
    await sendWa(esposa.phone, "recebi 3000 salario");
    const inc = await withUser(esposa.id, (db) => db.one<{ kind: string; category: string }>("select e.kind, c.name as category from fam_entries e join fam_categories c on c.id = e.category_id where e.source='whatsapp' order by e.created_at desc limit 1"));
    expect(inc).toEqual({ kind: "receita", category: "Salário" });
    await sendWa(esposa.phone, "saldo");
    await sendWa(esposa.phone, "fatura nubank");
    await sendWa(esposa.phone, "contas");
    await sendWa(esposa.phone, "ajuda");
    const out = (await outbox(esposa.id)).filter((m) => m.direction === "out").map((m) => m.body);
    expect(out.some((b) => b.includes("Resumo do mês"))).toBe(true);
    expect(out.some((b) => b.includes("Nubank") && b.includes("4321"))).toBe(true);
    expect(out.some((b) => b.includes("Próximas contas"))).toBe(true);
    expect(out.some((b) => b.includes("Assistente Financeiro"))).toBe(true);
  });
  it("'desfazer' apaga apenas o último gasto do próprio remetente via WhatsApp", async () => {
    await sendWa(luiz.phone, "gastei 19,90 padaria");
    const before = await withService((db) => db.one<{ n: number }>("select count(*)::int n from fam_entries where source = 'whatsapp' and owner_id = $1", [luiz.id]));
    await sendWa(luiz.phone, "desfazer");
    const after = await withService((db) => db.one<{ n: number }>("select count(*)::int n from fam_entries where source = 'whatsapp' and owner_id = $1", [luiz.id]));
    expect(after!.n).toBe(before!.n - 1);
    expect((await outbox(luiz.id)).at(-1)?.body).toContain("Desfeito");
    // a receita da esposa não foi tocada
    expect((await withService((db) => db.one<{ n: number }>("select count(*)::int n from fam_entries where source='whatsapp' and owner_id=$1 and kind='receita'", [esposa.id])))!.n).toBe(1);
  });
});

describe("8. alertas de vencimento: código em mensagem separada, respeitando visibilidade", () => {
  it("cron exige CRON_SECRET", async () => {
    const res = await cronRoute(new Request("http://localhost/api/cron/whatsapp-due-alerts"), { params: Promise.resolve({ job: "whatsapp-due-alerts" }) });
    expect(res.status).toBe(401);
  });
  it("se o envio falhar por completo, a reserva é desfeita e o próximo cron tenta de novo", async () => {
    const failing: WhatsAppProvider = { name: "simulator", sendText: async () => ({ ok: false, error: "falha simulada" }) };
    const r = await runDueAlerts(new Date(), failing);
    expect(r.sent).toBe(0);
    expect(r.failed).toBeGreaterThan(0);
    const claims = await withService((db) => db.one<{ n: number }>("select count(*)::int n from fam_notification_log where kind in ('bill_due','invoice_due')"));
    expect(claims!.n).toBe(0);
    const errors = await withService((db) => db.one<{ n: number }>("select count(*)::int n from fam_whatsapp_messages where status = 'erro' and error = 'falha simulada'"));
    expect(errors!.n).toBeGreaterThan(0);
  });

  it("conta compartilhada -> os dois; pessoal -> só o dono; Pix sozinho na mensagem", async () => {
    const condPix = (await withService((db) => db.one<{ pix_code: string }>("select pix_code from fam_bills where description = 'Condomínio'")))!.pix_code;
    const res = await cronRoute(new Request("http://localhost/api/cron/whatsapp-due-alerts", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }), { params: Promise.resolve({ job: "whatsapp-due-alerts" }) });
    expect(res.status).toBe(200);
    const luizOut = (await outbox(luiz.id)).filter((m) => m.direction === "out").map((m) => m.body);
    const wifeOut = (await outbox(esposa.id)).filter((m) => m.direction === "out").map((m) => m.body);
    for (const out of [luizOut, wifeOut]) {
      const i = out.findIndex((b) => b.includes("Condomínio") && b.includes("vence amanhã"));
      expect(i).toBeGreaterThan(-1);
      expect(out[i + 1]).toBe(condPix); // mensagem seguinte = SOMENTE o código
    }
    // Academia (pessoal da esposa, vence em 3 dias) só para ela
    expect(wifeOut.some((b) => b.includes("Academia"))).toBe(true);
    expect(luizOut.some((b) => b.includes("Academia"))).toBe(false);
    // luz: linha digitável de 48 dígitos como mensagem isolada
    const iLuz = luizOut.findIndex((b) => b.includes("Conta de luz"));
    expect(luizOut[iLuz + 1]).toMatch(/^\d{48}$/);
    // fatura Open Finance sem código (Master, compartilhada? não: pessoal da esposa) avisa indisponível
    expect(wifeOut.some((b) => b.includes("Cartão Simulado Master") && b.includes("indisponível"))).toBe(true);
    // idempotente
    expect((await runDueAlerts()).sent).toBe(0);
  });
});

describe("8b. preferências de lembrete diário e resumo semanal", () => {
  it("quem desligou não recebe; quem manteve recebe", async () => {
    await savePrefs(esposa.id, { dailyReminder: false, weeklySummary: false });
    const d = await runDailyReminder();
    const w = await runWeeklySummary();
    expect(d).toEqual({ sent: 1, failed: 0 });
    expect(w).toEqual({ sent: 1, failed: 0 });
    const wife = (await outbox(esposa.id)).map((m) => m.body);
    const husband = (await outbox(luiz.id)).map((m) => m.body);
    expect(wife.some((b) => b.includes("Já registrou os gastos de hoje"))).toBe(false);
    expect(wife.some((b) => b.includes("Resumo da semana"))).toBe(false);
    expect(husband.some((b) => b.includes("Já registrou os gastos de hoje"))).toBe(true);
    expect(husband.some((b) => b.includes("Resumo da semana"))).toBe(true);
    expect((await getPrefs(esposa.id))).toMatchObject({ daily_reminder: false, weekly_summary: false });
  });
});

describe("9. metas, busca, patrimônio, investimentos, comparação", () => {
  it("aporte atualiza o progresso da meta", async () => {
    const goal = (await listGoals(L())).find((g) => g.name === "Reserva de emergência")!;
    const before = goal.progress.totalContributedCents;
    await addContribution(E(), { goalId: goal.id, amountCents: "100,00", month: month.slice(0, 7) });
    const after = (await listGoals(L())).find((g) => g.id === goal.id)!;
    expect(after.progress.totalContributedCents).toBe(before + 10000);
  });
  it("busca respeita visibilidade e salva histórico por perfil", async () => {
    const wife = await searchEntries(E(), { q: "presente" });
    expect(wife).toHaveLength(0);
    const husband = await searchEntries(L(), { q: "presente" });
    expect(husband).toHaveLength(1);
    expect((await searchEntries(L(), { q: "350,00" })).some((e) => e.description === "Presente surpresa")).toBe(true);
    await saveSearch(E(), "mercado", {});
    expect((await recentSearches(E())).map((r) => r.query)).toEqual(["mercado"]);
  });
  it("patrimônio e investimentos (ponte invest_*)", async () => {
    const nw = await computeAndSnapshot(E());
    expect(nw.family.investmentsCents).toBeGreaterThan(0); // Luiz compartilhou os investimentos
    expect(nw.mine.investmentsCents).toBe(0);
    const pos = await listPositions(E());
    expect(pos.map((p) => p.ticker).sort()).toEqual(["HGLG11", "ITSA4", "IVVB11", "PETR4"]);
    expect(pos.find((p) => p.ticker === "PETR4")?.marketValueCents).toBe(384500);
  });
  it("comparação entre membros nunca inclui pessoais", async () => {
    const r = await membersComparison(E(), month, "valores");
    const luizShared = await withService((db) => db.one<{ s: number }>(
      "select coalesce(sum(amount_cents),0)::bigint s from fam_entries where owner_id=$1 and visibility='compartilhado' and kind='despesa' and budget_month=$2", [luiz.id, month]));
    expect(r.members.find((m) => m.memberId === luiz.id)?.totalCents).toBe(Number(luizShared!.s));
  });
});
