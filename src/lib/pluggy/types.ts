/** Subconjunto dos objetos da API Pluggy usados pela importação. */
export interface PluggyItem {
  id: string;
  clientUserId?: string | null;
  status?: string;
  connector?: { name?: string; id?: number } | null;
}

export interface PluggyAccount {
  id: string;
  itemId?: string;
  type: "BANK" | "CREDIT" | string;
  subtype?: string;
  name: string;
  marketingName?: string | null;
  number?: string | null;
  balance?: number | null;
  currencyCode?: string;
  creditData?: {
    brand?: string | null;
    balanceCloseDate?: string | null;
    balanceDueDate?: string | null;
    creditLimit?: number | null;
    availableCreditLimit?: number | null;
  } | null;
}

export interface PluggyTransaction {
  id: string;
  accountId?: string;
  description: string;
  amount: number;
  date: string; // ISO
  type: "DEBIT" | "CREDIT" | string;
  category?: string | null;
  creditCardMetadata?: { installmentNumber?: number | null; totalInstallments?: number | null } | null;
  paymentData?: {
    paymentMethod?: string | null;
    boletoMetadata?: { digitableLine?: string | null; barcode?: string | null } | null;
  } | null;
}

/** Fatura de cartão (GET /bills). Campos de código são lidos de forma defensiva — nem todo banco expõe. */
export interface PluggyBill {
  id: string;
  dueDate: string;
  totalAmount: number;
  minimumPaymentAmount?: number | null;
  [extra: string]: unknown;
}

export interface PluggyProvider {
  mode: "live" | "sandbox" | "mock";
  createConnectToken(clientUserId: string, webhookUrl?: string): Promise<string>;
  getItem(itemId: string): Promise<PluggyItem>;
  listAccounts(itemId: string): Promise<PluggyAccount[]>;
  listTransactions(accountId: string, from: string): Promise<PluggyTransaction[]>;
  listBills(accountId: string): Promise<PluggyBill[]>;
}
