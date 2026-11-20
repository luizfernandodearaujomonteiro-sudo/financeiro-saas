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

const BANK_TX: [string, number, "DEBIT" | "CREDIT", string?][] = [
  ["PIX RECEBIDO SALARIO EMPRESA LTDA", 6500.0, "CREDIT", "PIX"],
  ["SUPERMERCADO EXTRA 1234", 287.45, "DEBIT"],
  ["PIX ENVIADO CONDOMINIO RESIDENCIAL", 780.0, "DEBIT", "PIX"],
  ["PAG BOLETO ENEL ENERGIA", 213.9, "DEBIT", "BOLETO"],
  ["FARMACIA DROGA RAIA", 64.3, "DEBIT"],
  ["IFOOD *RESTAURANTE", 58.9, "DEBIT"],
  ["POSTO SHELL AV BRASIL", 180.0, "DEBIT"],
  ["RENDIMENTO POUPANCA", 12.37, "CREDIT"],
];

const CARD_TX: [string, number, number?, number?][] = [
  ["UBER *TRIP", 23.9],
  ["NETFLIX.COM", 55.9],
  ["SPOTIFY", 21.9],
  ["AMAZON MARKETPLACE", 349.0, 1, 3],
  ["CARREFOUR HIPER", 412.33],
  ["CINEMARK", 64.0],
  ["PETZ PET SHOP", 189.9],
];

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
      if (accountId.endsWith("-acc-corrente")) {
        return BANK_TX.map(([description, amount, type, method], i) => ({
          id: `${accountId}-tx-${i}`, description, amount: type === "DEBIT" ? -amount : amount, type, date: addDays(today, -(i * 3 + 1)) + "T12:00:00.000Z",
          paymentData: method ? { paymentMethod: method } : null,
        }));
      }
      return CARD_TX.map(([description, amount, n, t], i) => ({
        id: `${accountId}-tx-${i}`, description, amount, type: "DEBIT", date: addDays(today, -(i * 2 + 1)) + "T12:00:00.000Z",
        creditCardMetadata: n ? { installmentNumber: n, totalInstallments: t } : null,
      }));
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
