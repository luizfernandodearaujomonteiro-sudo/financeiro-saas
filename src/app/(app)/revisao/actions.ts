"use server";
import { requireCtx } from "@/lib/auth/member";
import { formObject, run, type ActionState } from "@/lib/actions";
import { ingestDocument, MAX_PDF_BYTES } from "@/lib/importers/pdf";
import { approveReview, rejectReview } from "@/lib/services/review";

async function ctx() {
  const { member } = await requireCtx();
  return { userId: member.userId, householdId: member.householdId };
}

const PATHS = ["/revisao", "/lancamentos", "/painel", "/cartoes"];

export async function approveAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const c = await ctx();
  const { id, ...fields } = formObject(fd);
  return run(async () => {
    await approveReview(c, id ?? "", fields);
    return "Aprovado e lançado!";
  }, PATHS);
}

export async function rejectAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const c = await ctx();
  return run(async () => {
    await rejectReview(c, String(fd.get("id") ?? ""));
    return "Item rejeitado.";
  }, PATHS);
}

export async function uploadAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const c = await ctx();
  return run(async () => {
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) throw new Error("Escolha um arquivo PDF");
    if (file.size > MAX_PDF_BYTES) throw new Error("PDF maior que 8 MB");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const cardId = String(fd.get("cardId") ?? "") || null;
    const r = await ingestDocument(c, { bytes, fileName: file.name || "fatura.pdf", source: "upload", cardId });
    if (r.duplicate) return "Este PDF já foi importado antes (nenhum item novo).";
    if (r.parseError) return `PDF guardado, mas não foi possível ler o texto (${r.parseError}).`;
    return `PDF lido: ${r.parsed} item(ns) encontrados, ${r.inserted} novo(s) na fila${r.parsed - r.inserted > 0 ? `, ${r.parsed - r.inserted} duplicado(s)` : ""}.`;
  }, PATHS);
}
