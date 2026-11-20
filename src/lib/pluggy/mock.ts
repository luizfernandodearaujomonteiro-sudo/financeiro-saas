/**
 * Provedor Pluggy SIMULADO (local, sem credenciais). Dados determinísticos,
 * datas relativas a "hoje". Inclui faturas COM código (linha digitável + Pix)
 * e SEM código, para testar os alertas.
 */
import { addDays, todayISO } from "../domain/dates";
import { bancarioBarcodeToLine, buildBancarioBarcode, dateToFactor } from "../domain/boleto";
import { buildPixCopiaECola } from "../domain/pix";
import type { PluggyAccount, PluggyBill, PluggyProvider, PluggyTransaction } from "./types";

export const MOCK_PREFIX = "mock-";

function hash(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}

interface MockTx {
  description: string;
  amount: number;
  type: "DEBIT" | "CREDIT";
  daysAgo: number;
  category?: string;
  method?: string;
  installment?: [number, number];
  /** usa o billId da fatura atual do cartão (creditCardMetadata.billId) */
  currentBill?: boolean;
}

const BANK_TX: MockTx[] = [
  { description: "PIX RECEBIDO SALARIO EMPRESA LTDA", amount: 6500.0, type: "CREDIT", daysAgo: 1, method: "PIX", category: "Salary" },
  { description: "SUPERMERCADO EXTRA 1234", amount: 287.45, type: "DEBIT", daysAgo: 4, category: "Groceries" },
  { description: "PIX ENVIADO CONDOMINIO RESIDENCIAL", amount: 780.0, type: "DEBIT", daysAgo: 7, method: "PIX" },
  { description: "PAG BOLETO ENEL ENERGIA", amount: 213.9, type: "DEBIT", daysAgo: 10, method: "BOLETO" },
  { description: "FARMACIA DROGA RAIA", amount: 64.3, type: "DEBIT", daysAgo: 13 },
  { description: "IFOOD *RESTAURANTE", amount: 58.9, type: "DEBIT", daysAgo: 16 },
  { description: "POSTO SHELL AV BRASIL", amount: 180.0, type: "DEBIT", daysAgo: 19 },
  { description: "RENDIMENTO POUPANCA", amount: 12.37, type: "CREDIT", daysAgo: 22 },
  // NÃO são despesas: pagamento da fatura do cartão e transferência entre contas próprias
  { description: "PAG FATURA CARTAO SIMULADO VISA", amount: 980.0, type: "DEBIT", daysAgo: 9, method: "BOLETO", category: "Credit card payment" },
  { description: "TRANSF MESMA TITULARIDADE POUPANCA", amount: 500.0, type: "DEBIT", daysAgo: 11, category: "Same person transfer" },
];

const CARD_TX: MockTx[] = [
  { description: "UBER *TRIP", amount: 23.9, type: "DEBIT", daysAgo: 1 },
  { description: "NETFLIX.COM", amount: 55.9, type: "DEBIT", daysAgo: 3 },
  { description: "SPOTIFY", amount: 21.9, type: "DEBIT", daysAgo: 5 },
  { description: "AMAZON MARKETPLACE", amount: 349.0, type: "DEBIT", daysAgo: 7, installment: [1, 3] },
  { description: "CARREFOUR HIPER", amount: 412.33, type: "DEBIT", daysAgo: 9 },
  { description: "CINEMARK", amount: 64.0, type: "DEBIT", daysAgo: 11 },
  { description: "PETZ PET SHOP", amount: 189.9, type: "DEBIT", daysAgo: 13 },
];

// Somente no cartão Visa: pagamento da fatura (crédito no cartão), estorno e compras parceladas antigas
const VISA_EXTRA_TX: MockTx[] = [
  { description: "PAGAMENTO RECEBIDO", amount: 980.0, type: "CREDIT", daysAgo: 9, category: "Credit card payment" },
  { description: "ESTORNO UBER *TRIP", amount: 23.9, type: "CREDIT", daysAgo: 2 },
  // parcela 3/10 com a data da COMPRA ORIGINAL (sem billId): desloca 2 faturas
  { description: "MAGAZINE LUIZA", amount: 129.9, type: "DEBIT", daysAgo: 70, installment: [3, 10] },
  // parcela 2/12 com billId da fatura atual: vai para essa fatura
  { description: "APPLE.COM/BILL", amount: 49.9, type: "DEBIT", daysAgo: 70, installment: [2, 12], currentBill: true },
];

function toPluggyTx(accountId: string, list: MockTx[], prefix: string, today: string): PluggyTransaction[] {
  return list.map((t, i) => ({
    id: `${accountId}-${prefix}-${i}`,
    description: t.description,
    amount: accountId.endsWith("-acc-corrente") && t.type === "DEBIT" ? -t.amount : t.amount,
    type: t.type,
    date: addDays(today, -t.daysAgo) + "T12:00:00.000Z",
    category: t.category ?? null,
    paymentData: t.method ? { paymentMethod: t.method } : null,
    creditCardMetadata: t.installment
      ? { installmentNumber: t.installment[0], totalInstallments: t.installment[1], billId: t.currentBill ? `${accountId}-bill-1` : null }
      : null,
  }));
}

export function createMockPluggy(): PluggyProvider {
  return {
    mode: "mock",
    async createConnectToken(clientUserId) {
      return `mock-connect-token-${clientUserId.slice(0, 8)}`;
    },
    async getItem(itemId) {
      if (!itemId.startsWith(MOCK_PREFIX)) throw new Error("item mock inválido");
      return { id: itemId, status: "UPDATED", connector: { name: "Banco Simulado (mock)" }, clientUserId: null };
    },
    async listAccounts(itemId): Promise<PluggyAccount[]> {
      const today = todayISO();
      const h = hash(itemId) % 1000;
      return [
        { id: `${itemId}-acc-corrente`, type: "BANK", subtype: "CHECKING_ACCOUNT", name: "Conta Corrente", marketingName: "Conta Simulada", number: `0001/${10000 + h}-1`, balance: 5432.1 + h },
        {
          id: `${itemId}-acc-visa`, type: "CREDIT", subtype: "CREDIT_CARD", name: "Cartão Simulado Visa", number: `4111********${String(1000 + h).slice(-4)}`, balance: 1116.93,
          creditData: { brand: "VISA", balanceCloseDate: addDays(today, 5) + "T00:00:00.000Z", balanceDueDate: addDays(today, 12) + "T00:00:00.000Z", creditLimit: 8000 },
        },
        {
          id: `${itemId}-acc-master`, type: "CREDIT", subtype: "CREDIT_CARD", name: "Cartão Simulado Master", number: `5555********${String(2000 + h).slice(-4)}`, balance: 230.5,
          creditData: { brand: "MASTERCARD", balanceCloseDate: addDays(today, -6) + "T00:00:00.000Z", balanceDueDate: addDays(today, 1) + "T00:00:00.000Z", creditLimit: 3000 },
        },
      ];
    },
    async listTransactions(accountId): Promise<PluggyTransaction[]> {
      const today = todayISO();
      if (accountId.endsWith("-acc-corrente")) return toPluggyTx(accountId, BANK_TX, "tx", today);
      const base = toPluggyTx(accountId, CARD_TX, "tx", today);
      return accountId.endsWith("-acc-visa") ? [...base, ...toPluggyTx(accountId, VISA_EXTRA_TX, "vx", today)] : base;
    },
    async listBills(accountId): Promise<PluggyBill[]> {
      const today = todayISO();
      if (accountId.endsWith("-acc-visa")) {
        const due = addDays(today, 12);
        const amount = 111693;
        const line = bancarioBarcodeToLine(buildBancarioBarcode("260", dateToFactor(due), amount, "0001" + String(hash(accountId)).padStart(21, "0").slice(0, 21)));
        // Caso 1: banco expõe linha digitável E Pix copia e cola
        return [{ id: `${accountId}-bill-1`, dueDate: due + "T00:00:00.000Z", totalAmount: amount / 100, digitableLine: line,
          pixCode: buildPixCopiaECola({ key: "financeiro@bancosimulado.com.br", name: "BANCO SIMULADO", city: "SAO PAULO", amountCents: amount, txid: "FATVISA" }) }];
      }
      if (accountId.endsWith("-acc-master")) {
        // Caso 2: banco NÃO expõe código de pagamento
        return [{ id: `${accountId}-bill-1`, dueDate: addDays(today, 1) + "T00:00:00.000Z", totalAmount: 230.5 }];
      }
      return [];
    },
  };
}
