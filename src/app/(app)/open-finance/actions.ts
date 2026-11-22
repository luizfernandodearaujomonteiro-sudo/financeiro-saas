"use server";
import { requireCtx } from "@/lib/auth/member";
import { run, type ActionState } from "@/lib/actions";
import { createMockItem, processWebhook, registerItem, removeItem, setAccountVisibility, syncMyItem } from "@/lib/pluggy/service";
import type { SyncResult } from "@/lib/pluggy/sync";
import { setEntryVisibility } from "@/lib/services/entries";

async function ctx() {
  const { member } = await requireCtx();
  return { userId: member.userId, householdId: member.householdId };
}

const PATHS = ["/open-finance", "/lancamentos", "/painel", "/cartoes", "/contas", "/patrimonio"];

function summary(r: SyncResult): string {
  return `${r.accounts} conta(s), ${r.cards} cartão(ões), ${r.transactions} transação(ões) nova(s), ${r.bills} fatura(s) (${r.billsWithCode} com código de pagamento).`;
}

function vis(v: FormDataEntryValue | null): "pessoal" | "compartilhado" {
  return v === "compartilhado" ? "compartilhado" : "pessoal";
}

/** Modo mock: cria o item e dispara o MESMO processamento do webhook real. */
export async function connectMockAction(): Promise<ActionState> {
  const c = await ctx();
  return run(async () => {
    const itemId = await createMockItem(c);
    const r = await processWebhook({ event: "item/created", itemId });
    if (!r.ok) throw new Error(r.reason ?? "falha no processamento");
    return r.result ? `Banco simulado conectado: ${summary(r.result)}` : "Banco simulado conectado.";
  }, PATHS);
}

/** Chamado pelo widget Pluggy (produção/sandbox) após conectar. */
export async function registerItemAction(itemId: string): Promise<ActionState> {
  const c = await ctx();
  return run(async () => {
    const id = await registerItem(c, itemId);
    const r = await syncMyItem(c, id);
    return `Conta conectada: ${summary(r)}`;
  }, PATHS);
}

export async function syncAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const c = await ctx();
  return run(async () => `Sincronizado: ${summary(await syncMyItem(c, String(fd.get("itemId") ?? "")))}`, PATHS);
}

export async function removeAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const c = await ctx();
  return run(async () => {
    await removeItem(c, String(fd.get("itemId") ?? ""));
    return "Conexão removida. Os dados já importados continuam no painel.";
  }, PATHS);
}

export async function shareAccountAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const c = await ctx();
  return run(async () => {
    const kind = fd.get("kind") === "cartao" ? "cartao" : "conta";
    const v = vis(fd.get("visibility"));
    await setAccountVisibility(c, kind, String(fd.get("id") ?? ""), v, fd.get("apply") === "on");
    return v === "compartilhado" ? "Agora compartilhado com a família." : "Agora é pessoal (só você vê).";
  }, PATHS);
}

export async function shareEntryAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const c = await ctx();
  return run(async () => {
    const v = vis(fd.get("visibility"));
    await setEntryVisibility(c, String(fd.get("id") ?? ""), v);
    return v === "compartilhado" ? "Compartilhado." : "Pessoal.";
  }, PATHS);
}
