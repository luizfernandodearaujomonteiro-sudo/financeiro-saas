/**
 * Proxy (antigo middleware): renova a sessão do Supabase Auth nos cookies httpOnly.
 * No modo local (LOCAL_DEV_AUTH) não faz nada. A autorização real fica nos layouts/rotas.
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });
  if (process.env.LOCAL_DEV_AUTH === "true" || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return response;
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list, headers) => {
        for (const { name, value, options } of list) response.cookies.set(name, value, { ...options, httpOnly: true, sameSite: "lax" });
        for (const [k, v] of Object.entries(headers ?? {})) response.headers.set(k, v);
      },
    },
  });
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/whatsapp|api/pluggy/webhook|api/cron|api/health).*)"],
};
