"use server";
import { requireCtx } from "@/lib/auth/member";
import { formObject, run, type ActionState } from "@/lib/actions";
import { createCard, createCardPurchase, deleteCard, setInvoiceStatus, updateCard } from "@/lib/services/cards";

async function ctx() {
  const { member } = await requireCtx();
  return { userId: member.userId, householdId: member.householdId };
}

export async function createCardAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const c = await ctx();
  return run(async () => {
    await createCard(c, formObject(fd));
    return "Cartão cadastrado!";
  }, ["/cartoes"]);
}

export async function createPurchaseAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const c = await ctx();
  return run(async () => {
    const r = await createCardPurchase(c, formObject(fd));
    return r.plan.length > 1 ? `Compra registrada em ${r.plan.length} parcelas.` : "Compra registrada!";
  }, ["/cartoes", "/lancamentos", "/painel"]);
}

export async function deleteCardAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const c = await ctx();
  return run(async () => {
    await deleteCard(c, String(fd.get("id") ?? ""));
    return "Cartão removido.";
  }, ["/cartoes"]);
}

export async function setInvoiceStatusAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const c = await ctx();
  const status = String(fd.get("status") ?? "");
  const cardId = String(fd.get("cardId") ?? "");
  return run(async () => {
    if (status !== "paga" && status !== "aberta" && status !== "fechada") throw new Error("Status inválido");
    await setInvoiceStatus(c, String(fd.get("invoiceId") ?? ""), status);
    return status === "paga" ? "Fatura marcada como paga." : "Fatura reaberta.";
  }, ["/cartoes", `/cartoes/${cardId}`]);
}

export async function updateCardAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const c = await ctx();
  const o = formObject(fd);
  return run(async () => {
    const r = await updateCard(c, o.id ?? "", o);
    return r.recalculated
      ? `Cartão atualizado. ${r.recalculated} fatura(s) em aberto ajustada(s) para o novo ciclo.`
      : "Cartão atualizado.";
  }, ["/cartoes", `/cartoes/${o.id ?? ""}`, "/painel"]);
}
