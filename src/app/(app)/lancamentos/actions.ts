"use server";
import { requireCtx } from "@/lib/auth/member";
import { formObject, run, type ActionState } from "@/lib/actions";
import { createCardPurchase } from "@/lib/services/cards";
import { createEntry, deleteEntry, setEntryVisibility, updateEntry } from "@/lib/services/entries";

const PATHS = ["/lancamentos", "/painel", "/cartoes"];

async function ctx() {
  const { member } = await requireCtx();
  return { userId: member.userId, householdId: member.householdId };
}

export async function createEntryAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const c = await ctx();
  const o = formObject(fd);
  return run(async () => {
    if (o.paymentMethod === "cartao_credito") {
      if (!o.cardId) throw new Error("Escolha o cartão");
      const r = await createCardPurchase(c, {
        cardId: o.cardId, description: o.description, totalCents: o.amountCents, installments: o.installments || "1",
        purchasedOn: o.occurredOn, categoryId: o.categoryId, visibility: o.visibility, costType: o.costType,
      });
      return `Compra registrada em ${r.plan.length} parcela(s), na fatura certa de cada mês.`;
    }
    await createEntry(c, o);
    return "Lançamento registrado!";
  }, PATHS);
}

export async function updateEntryAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const c = await ctx();
  const o = formObject(fd);
  return run(() => updateEntry(c, o.id ?? "", o).then(() => "Lançamento atualizado"), PATHS);
}

export async function toggleVisibilityAction(fd: FormData) {
  const c = await ctx();
  const v = fd.get("visibility") === "compartilhado" ? "compartilhado" : "pessoal";
  await run(() => setEntryVisibility(c, String(fd.get("id")), v), PATHS);
}

export async function deleteEntryAction(fd: FormData) {
  const c = await ctx();
  await run(() => deleteEntry(c, String(fd.get("id"))).then(() => undefined), PATHS);
}
