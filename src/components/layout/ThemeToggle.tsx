"use client";
import { Moon, Sun, SunMoon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { setThemeAction } from "@/app/actions/theme";
import { resolveTheme, type ThemeMode } from "@/lib/domain/theme";
import { decodeTheme, THEME_COOKIE } from "@/lib/theme-cookie";

const ORDER: ThemeMode[] = ["dark", "light", "auto"];
const LABEL: Record<ThemeMode, string> = { dark: "Tema escuro", light: "Tema claro", auto: "Automático por horário" };

function readCookie(): string | undefined {
  return document.cookie.split("; ").find((c) => c.startsWith(`${THEME_COOKIE}=`))?.split("=")[1];
}

export function ThemeToggle({ initialMode }: { initialMode: ThemeMode }) {
  const [mode, setMode] = useState<ThemeMode>(initialMode);
  const [, start] = useTransition();
  const router = useRouter();
  useEffect(() => {
    const t = decodeTheme(readCookie());
    if (mode !== "auto") return;
    // reavalia o modo automático periodicamente (horário de São Paulo)
    const id = setInterval(() => {
      document.documentElement.dataset.theme = resolveTheme("auto", { start: t.start, end: t.end });
    }, 5 * 60_000);
    return () => clearInterval(id);
  }, [mode]);
  const next = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length]!;
  const Icon = mode === "dark" ? Moon : mode === "light" ? Sun : SunMoon;
  return (
    <button
      type="button"
      title={`${LABEL[mode]} — clique para: ${LABEL[next]}`}
      aria-label={`${LABEL[mode]}. Alternar para ${LABEL[next]}`}
      onClick={() => {
        setMode(next);
        const t = decodeTheme(readCookie());
        document.documentElement.dataset.theme = resolveTheme(next, { start: t.start, end: t.end });
        start(async () => {
          await setThemeAction(next);
          router.refresh();
        });
      }}
      className="grid h-10 w-10 place-items-center rounded-xl bg-surface-2 text-ink-2 ring-1 ring-line transition hover:text-ink"
    >
      <Icon aria-hidden className="h-4.5 w-4.5" />
    </button>
  );
}
