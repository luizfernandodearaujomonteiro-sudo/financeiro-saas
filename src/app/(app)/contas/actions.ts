"use server";
import { requireCtx } from "@/lib/auth/member";
import { formObject, run, type ActionState } from "@/lib/actions";
import { cancelBill, createBill, deleteBill, payBill } from "@/lib/services/bills";

async function ctx() {
  const { member } = await requireCtx();
  return { userId: member.userId, householdId: member.householdId };
}

const PATHS = ["/contas", "/painel", "/lancamentos"];

export async function createBillAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const c = await ctx();
  return run(async () => {
    await createBill(c, formObject(fd));
    return "Conta cadastrada! Você receberá alertas no WhatsApp perto do vencimento.";
  }, PATHS);
}

export async function payBillAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const c = await ctx();
  return run(async () => {
    const r = await payBill(c, String(fd.get("id") ?? ""));
    if (r.entryId) return "Conta paga e lançamento registrado.";
    return r.invoiceMarkedPaid
      ? "Fatura marcada como paga (as compras do cartão já estavam lançadas — nenhuma despesa nova foi criada)."
      : "Conta marcada como paga (fatura de cartão: nenhuma despesa nova foi criada).";
  }, PATHS);
}

export async function cancelBillAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const c = await ctx();
  return run(async () => {
    await cancelBill(c, String(fd.get("id") ?? ""));
    return "Conta cancelada.";
  }, PATHS);
}

export async function deleteBillAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const c = await ctx();
  return run(async () => {
    await deleteBill(c, String(fd.get("id") ?? ""));
    return "Conta excluída.";
  }, PATHS);
}
