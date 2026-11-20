import { handleMetaVerify, handleWebhookRequest } from "@/lib/whatsapp/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    return await handleWebhookRequest(req);
  } catch (e) {
    console.error("whatsapp webhook:", e instanceof Error ? e.message : "erro");
    return Response.json({ error: "erro interno" }, { status: 500 });
  }
}

export function GET(req: Request) {
  return handleMetaVerify(new URL(req.url));
}
