import { resolveTheme, type ResolvedTheme, type ThemeMode } from "./domain/theme";

export const THEME_COOKIE = "fin_financeiro_theme";

export function encodeTheme(mode: ThemeMode, start: number, end: number): string {
  return mode === "auto" ? `auto:${start}:${end}` : mode;
}

export function decodeTheme(v: string | undefined): { mode: ThemeMode; start: number; end: number } {
  if (v === "light" || v === "dark") return { mode: v, start: 18, end: 6 };
  const m = /^auto:(\d{1,2}):(\d{1,2})$/.exec(v ?? "");
  if (m) return { mode: "auto", start: Number(m[1]) % 24, end: Number(m[2]) % 24 };
  return { mode: "dark", start: 18, end: 6 }; // escuro primeiro
}

export function themeFromCookie(v: string | undefined, now = new Date()): ResolvedTheme {
  const t = decodeTheme(v);
  return resolveTheme(t.mode, { now, start: t.start, end: t.end });
}

/** Valor do cookie a partir das preferências salvas no perfil (padrão: escuro). */
export function themeCookieFromPrefs(p: { theme_mode: ThemeMode; auto_dark_start: number; auto_dark_end: number } | null | undefined): string {
  return p ? encodeTheme(p.theme_mode, p.auto_dark_start, p.auto_dark_end) : "dark";
}
