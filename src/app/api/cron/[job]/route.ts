/** Rotas de cron da Vercel. Exigem Authorization: Bearer CRON_SECRET (falha fechada). */
import { env } from "@/lib/env";
import { JOBS } from "@/lib/jobs";
import { checkBearer } from "@/lib/security/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request, { params }: { params: Promise<{ job: string }> }) {
  if (!checkBearer(req.headers.get("authorization"), env.secret("CRON_SECRET"))) return Response.json({ error: "não autorizado" }, { status: 401 });
  const { job } = await params;
  const fn = Object.hasOwn(JOBS, job) ? JOBS[job] : undefined;
  if (!fn) return Response.json({ error: "job desconhecido" }, { status: 404 });
  try {
    return Response.json({ ok: true, job, result: await fn() });
  } catch (e) {
    console.error(`cron ${job}:`, e instanceof Error ? e.message : "erro");
    return Response.json({ ok: false, job }, { status: 500 });
  }
}
