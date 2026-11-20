import type { ComponentProps, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function cn(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function Card({ className, gradient, lift, children, ...rest }: ComponentProps<"section"> & { gradient?: boolean; lift?: boolean }) {
  return (
    <section className={cn("glass p-5", gradient && "glass-gradient", lift && "lift", className)} {...rest}>
      {children}
    </section>
  );
}

export function CardTitle({ icon: Icon, children, action }: { icon?: LucideIcon; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-ink-2 uppercase">
        {Icon && <Icon aria-hidden className="h-4 w-4 text-brand" />}
        {children}
      </h2>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, icon: Icon, actions }: { title: string; subtitle?: ReactNode; icon?: LucideIcon; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="flex items-center gap-3">
        {Icon && (
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-brand/30 to-brand-2/20 ring-1 ring-line">
            <Icon aria-hidden className="h-5 w-5 text-brand" />
          </span>
        )}
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-ink-3">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

const variants = {
  primary: "bg-gradient-to-r from-brand to-brand-2 text-brand-ink shadow-[0_8px_24px_-10px_var(--glow)] hover:brightness-110",
  secondary: "bg-surface-2 text-ink ring-1 ring-line hover:ring-line-strong",
  ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink",
  danger: "bg-bad/15 text-bad ring-1 ring-bad/30 hover:bg-bad/25",
};

export function Button({ variant = "primary", size = "md", className, ...rest }: ComponentProps<"button"> & { variant?: keyof typeof variants; size?: "sm" | "md" }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm",
        variants[variant],
        className,
      )}
      {...rest}
    />
  );
}

export function LinkButton({ variant = "secondary", className, ...rest }: ComponentProps<"a"> & { variant?: keyof typeof variants }) {
  return <a className={cn("inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium transition", variants[variant], className)} {...rest} />;
}

const inputBase = "w-full rounded-xl border border-line bg-surface-solid/60 px-3 py-2 text-sm text-ink placeholder:text-ink-3 transition focus:border-brand focus:outline-none focus-visible:outline-2";

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={cn(inputBase, "h-10", props.className)} />;
}

export function Select(props: ComponentProps<"select">) {
  return <select {...props} className={cn(inputBase, "h-10", props.className)} />;
}

export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea {...props} className={cn(inputBase, props.className)} />;
}

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-xs font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-ink-3">{hint}</span>}
    </label>
  );
}

const badgeTones = {
  neutral: "bg-surface-2 text-ink-2 ring-line",
  brand: "bg-brand/15 text-brand ring-brand/30",
  good: "bg-good/15 text-good ring-good/30",
  warn: "bg-warn/15 text-warn ring-warn/30",
  bad: "bg-bad/15 text-bad ring-bad/30",
};

export function Badge({ tone = "neutral", children, className }: { tone?: keyof typeof badgeTones; children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1", badgeTones[tone], className)}>{children}</span>;
}

export function EmptyState({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-surface-2 ring-1 ring-line">
        <Icon aria-hidden className="h-6 w-6 text-ink-3" />
      </span>
      <p className="font-medium">{title}</p>
      {children && <div className="max-w-sm text-sm text-ink-3">{children}</div>}
    </div>
  );
}

export function Money({ cents, className, sign }: { cents: number; className?: string; sign?: boolean }) {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const s = `R$ ${Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${String(abs % 100).padStart(2, "0")}`;
  return <span className={cn("num", className)}>{neg ? `-${s}` : sign && cents > 0 ? `+${s}` : s}</span>;
}

export function VisibilityBadge({ v }: { v: "pessoal" | "compartilhado" | string }) {
  return v === "compartilhado" ? <Badge tone="brand">🏠 Casa</Badge> : <Badge>🔒 Pessoal</Badge>;
}
