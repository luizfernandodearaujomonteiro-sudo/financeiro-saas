"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { NAV, SIMULATOR_ITEM } from "./nav";

export function SideNav({ simulator, reviewCount }: { simulator: boolean; reviewCount: number }) {
  const path = usePathname();
  const items = simulator ? [...NAV, SIMULATOR_ITEM] : NAV;
  return (
    <nav aria-label="Navegação principal" className="flex flex-col gap-1">
      {items.map((it) => {
        const active = path === it.href || path.startsWith(`${it.href}/`);
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${active ? "text-ink" : "text-ink-3 hover:bg-surface-2 hover:text-ink"}`}
          >
            {active && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-xl bg-gradient-to-r from-brand/20 to-brand-2/10 ring-1 ring-brand/30" transition={{ type: "spring", stiffness: 400, damping: 34 }} />}
            <it.icon aria-hidden className={`relative h-4.5 w-4.5 ${active ? "text-brand" : ""}`} />
            <span className="relative">{it.label}</span>
            {it.href === "/revisao" && reviewCount > 0 && <span className="relative ml-auto rounded-full bg-brand px-1.5 text-[10px] font-bold text-brand-ink">{reviewCount}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileNav({ simulator, reviewCount }: { simulator: boolean; reviewCount: number }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const main = NAV.filter((n) => n.main);
  return (
    <>
      <nav aria-label="Navegação" className="glass fixed inset-x-3 bottom-3 z-40 flex !bg-surface-solid/95 items-center justify-around rounded-2xl px-1 py-1.5 md:hidden">
        {main.map((it) => {
          const active = path.startsWith(it.href);
          return (
            <Link key={it.href} href={it.href} aria-current={active ? "page" : undefined} className={`flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px] ${active ? "text-brand" : "text-ink-3"}`}>
              <it.icon aria-hidden className="h-5 w-5" />
              {it.label.split(" ")[0]}
            </Link>
          );
        })}
        <button type="button" onClick={() => setOpen(true)} aria-label="Abrir menu" className="flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px] text-ink-3">
          <Menu aria-hidden className="h-5 w-5" />
          Mais
        </button>
      </nav>
      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm md:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)}>
            <motion.div
              role="dialog"
              aria-label="Menu"
              className="glass absolute inset-x-3 bottom-3 max-h-[80dvh] overflow-y-auto p-4"
              initial={{ y: 40 }}
              animate={{ y: 0 }}
              exit={{ y: 40 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-2 flex justify-end">
                <button type="button" onClick={() => setOpen(false)} aria-label="Fechar menu" className="rounded-lg p-2 text-ink-3 hover:text-ink"><X aria-hidden className="h-5 w-5" /></button>
              </div>
              <div onClick={() => setOpen(false)}>
                <SideNav simulator={simulator} reviewCount={reviewCount} />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
