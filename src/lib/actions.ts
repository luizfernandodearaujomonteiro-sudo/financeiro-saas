import "server-only";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";

export type ActionState = { ok: boolean; message?: string; error?: string; data?: Record<string, unknown> } | null;

export function errorMessage(e: unknown): string {
  if (e instanceof ZodError) return e.issues[0]?.message ?? "Dados inválidos";
  if (e instanceof Error) {
    // erros do banco/RLS não vazam detalhes internos
    if (/row-level security|permission denied/i.test(e.message)) return "Você não tem permissão para isso.";
    const m = /fin_financeiro: (.+)$/.exec(e.message);
    if (m) return m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1);
    if (/NEXT_REDIRECT/.test(e.message)) throw e;
    return e.message.length < 160 ? e.message : "Não foi possível concluir a operação.";
  }
  return "Erro inesperado";
}

/** Executa uma ação de servidor, revalida páginas e converte erros em mensagem amigável. */
export async function run(fn: () => Promise<string | void | { message?: string; data?: Record<string, unknown> }>, paths: string[] = []): Promise<ActionState> {
  try {
    const r = await fn();
    for (const p of paths) revalidatePath(p);
    if (typeof r === "string") return { ok: true, message: r };
    return { ok: true, message: r?.message ?? "Salvo!", data: r?.data };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export function formObject(fd: FormData): Record<string, string> {
  const o: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") o[k] = v;
  return o;
}
