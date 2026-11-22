"use server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth/session";
import { loadMembership } from "@/lib/auth/member";
import { savePrefs } from "@/lib/services/prefs";
import { encodeTheme, THEME_COOKIE } from "@/lib/theme-cookie";
import type { ThemeMode } from "@/lib/domain/theme";

export async function setThemeAction(mode: ThemeMode, start?: number, end?: number) {
  if (!["dark", "light", "auto"].includes(mode)) return;
  let s = start ?? 18, e = end ?? 6;
  const user = await getSessionUser();
  if (user && (await loadMembership(user.id))) {
    const p = await savePrefs(user.id, { themeMode: mode, autoDarkStart: start, autoDarkEnd: end });
    s = p.auto_dark_start;
    e = p.auto_dark_end;
  }
  (await cookies()).set(THEME_COOKIE, encodeTheme(mode, s, e), { httpOnly: false, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
}
