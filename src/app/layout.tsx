import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { MotionProvider } from "@/components/ui/motion";
import { THEME_COOKIE, themeFromCookie } from "@/lib/theme-cookie";

export const metadata: Metadata = {
  title: { default: "Finanças da Família", template: "%s · Finanças da Família" },
  description: "Painel financeiro compartilhado da família",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#070b16", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = themeFromCookie((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang="pt-BR" data-theme={theme} suppressHydrationWarning>
      <body className="font-sans">
        <div className="tech-bg" aria-hidden />
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
