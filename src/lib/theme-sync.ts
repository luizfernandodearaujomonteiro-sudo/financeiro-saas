/** Sincroniza o cookie de tema com as preferências DO USUÁRIO que acabou de entrar. */
import "server-only";
import { cookies } from "next/headers";
import { getPrefs } from "./services/prefs";
import { THEME_COOKIE, themeCookieFromPrefs } from "./theme-cookie";

export async function syncThemeCookie(userId: string) {
  try {
    const prefs = await getPrefs(userId);
    (await cookies()).set(THEME_COOKIE, themeCookieFromPrefs(prefs), { httpOnly: false, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  } catch {
    /* tema é cosmético: nunca bloqueia o login */
  }
}
