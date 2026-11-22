/** Supabase Auth com cookies httpOnly via @supabase/ssr (somente servidor). */
import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "../env";

export async function supabaseServer() {
  const url = env.supabaseUrl();
  const key = env.supabaseAnonKey();
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY não configuradas");
  const store = await cookies();
  return createServerClient(url, key, {
    cookieOptions: { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, { ...options, httpOnly: true, sameSite: "lax" });
        } catch {
          // chamado de Server Component: o proxy renova os cookies
        }
      },
    },
  });
}
