/** Cliente da API Pluggy (produção ou sandbox). Credenciais apenas no servidor. */
import type { PluggyAccount, PluggyBill, PluggyItem, PluggyProvider, PluggyTransaction } from "./types";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export function createPluggyClient(opts: { clientId: string; clientSecret: string; sandbox: boolean; baseUrl?: string; fetchImpl?: FetchLike }): PluggyProvider {
  const base = (opts.baseUrl ?? "https://api.pluggy.ai").replace(/\/$/, "");
  const f: FetchLike = opts.fetchImpl ?? ((u, i) => fetch(u, i));
  let apiKey: { value: string; exp: number } | null = null;

  async function key(): Promise<string> {
    if (apiKey && apiKey.exp > Date.now()) return apiKey.value;
    const res = await f(`${base}/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId: opts.clientId, clientSecret: opts.clientSecret }) });
    if (!res.ok) throw new Error(`Pluggy auth HTTP ${res.status}`);
    const j = (await res.json()) as { apiKey: string };
    apiKey = { value: j.apiKey, exp: Date.now() + 90 * 60_000 }; // apiKey válida por 2h
    return apiKey.value;
  }

  async function get<T>(path: string): Promise<T> {
    const res = await f(`${base}${path}`, { headers: { "X-API-KEY": await key() }, cache: "no-store" });
    if (!res.ok) throw new Error(`Pluggy GET ${path.split("?")[0]} HTTP ${res.status}`);
    return (await res.json()) as T;
  }

  return {
    mode: opts.sandbox ? "sandbox" : "live",
    async createConnectToken(clientUserId, webhookUrl) {
      const res = await f(`${base}/connect_token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-KEY": await key() },
        body: JSON.stringify({ clientUserId, webhookUrl, avoidDuplicates: true }),
      });
      if (!res.ok) throw new Error(`Pluggy connect_token HTTP ${res.status}`);
      return ((await res.json()) as { accessToken: string }).accessToken;
    },
    getItem: (id) => get<PluggyItem>(`/items/${encodeURIComponent(id)}`),
    async listAccounts(itemId) {
      return (await get<{ results: PluggyAccount[] }>(`/accounts?itemId=${encodeURIComponent(itemId)}`)).results;
    },
    async listTransactions(accountId, from) {
      const out: PluggyTransaction[] = [];
      for (let page = 1; page <= 20; page++) {
        const j = await get<{ results: PluggyTransaction[]; totalPages: number }>(`/transactions?accountId=${encodeURIComponent(accountId)}&from=${from}&pageSize=500&page=${page}`);
        out.push(...j.results);
        if (page >= (j.totalPages ?? 1)) break;
      }
      return out;
    },
    async listBills(accountId) {
      try {
        return (await get<{ results: PluggyBill[] }>(`/bills?accountId=${encodeURIComponent(accountId)}`)).results;
      } catch {
        return []; // nem todo conector oferece faturas
      }
    },
  };
}
