"use client";
import { animate, motion, MotionConfig, useInView, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import { formatBRL } from "@/lib/domain/money";

export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

export function FadeIn({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay, ease: [0.2, 0.8, 0.2, 1] }}>
      {children}
    </motion.div>
  );
}

export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}>
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.35 } } }}>
      {children}
    </motion.div>
  );
}

/** Contador animado de valores em centavos (respeita prefers-reduced-motion). */
export function AnimatedMoney({ cents, className }: { cents: number; className?: string }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const mv = useMotionValue(reduce ? cents : 0);
  const text = useTransform(mv, (v) => formatBRL(Math.round(v)));
  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      mv.set(cents);
      return;
    }
    const c = animate(mv, cents, { duration: 1.1, ease: [0.16, 1, 0.3, 1] });
    return () => c.stop();
  }, [cents, inView, mv, reduce]);
  return (
    <span ref={ref} className={className} aria-label={formatBRL(cents)}>
      <motion.span aria-hidden className="num">{text}</motion.span>
    </span>
  );
}

export function ProgressBar({ bp, label, tone = "brand" }: { bp: number; label: string; tone?: "brand" | "good" | "warn" }) {
  const pct = Math.max(0, Math.min(100, bp / 100));
  const color = tone === "good" ? "from-good to-brand-2" : tone === "warn" ? "from-warn to-bad" : "from-brand to-brand-2";
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} className="h-2.5 w-full overflow-hidden rounded-full bg-surface-2 ring-1 ring-line">
      <motion.div className={`h-full rounded-full bg-gradient-to-r ${color}`} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }} />
    </div>
  );
}

export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: "easeOut" }}>
      {children}
    </motion.div>
  );
}
