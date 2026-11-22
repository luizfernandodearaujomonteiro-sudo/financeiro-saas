/** Download do PDF de fatura: a RLS confirma que o documento é do usuário antes de ler o arquivo. */
import { getSessionUser } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { getObject, StorageUnavailableError } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return new Response("não autorizado", { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("não encontrado", { status: 404 });
  const doc = await withUser(user.id, (db) => db.one<{ storage_path: string; file_name: string | null }>("select storage_path, file_name from public.fin_financeiro_invoice_documents where id = $1", [id]));
  if (!doc) return new Response("não encontrado", { status: 404 });
  let bytes: Uint8Array;
  try {
    bytes = await getObject(doc.storage_path);
  } catch (e) {
    if (e instanceof StorageUnavailableError) return new Response(e.message, { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
    return new Response("arquivo indisponível", { status: 404 });
  }
  const isPdf = doc.storage_path.endsWith(".pdf");
  return new Response(Buffer.from(bytes), {
    headers: {
      "content-type": isPdf ? "application/pdf" : "text/plain; charset=utf-8",
      "content-disposition": `inline; filename="${(doc.file_name ?? "fatura").replace(/[^\w.\- ]/g, "_")}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
