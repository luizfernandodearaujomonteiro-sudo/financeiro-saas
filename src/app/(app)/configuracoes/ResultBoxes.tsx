"use client";
import { CheckCircle2, Link2, QrCode, XCircle } from "lucide-react";
import { useActionState } from "react";
import type { ActionState } from "@/lib/actions";
import { CopyButton, SubmitButton } from "@/components/ui/client";

type NoArgAction = () => Promise<ActionState>;

function Msg({ state }: { state: ActionState }) {
  if (!state) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={`mt-2 flex items-center gap-2 text-sm ${state.ok ? "text-good" : "text-bad"}`}>
      {state.ok ? <CheckCircle2 aria-hidden className="h-4 w-4" /> : <XCircle aria-hidden className="h-4 w-4" />}
      {state.ok ? state.message : state.error}
    </p>
  );
}

export function InviteBox({ action }: { action: NoArgAction }) {
  const [state, formAction] = useActionState(action, null);
  const url = typeof state?.data?.url === "string" ? state.data.url : null;
  return (
    <form action={formAction}>
      <SubmitButton variant="secondary" pendingText="Gerando…"><Link2 aria-hidden className="h-4 w-4" /> Gerar link de convite</SubmitButton>
      <Msg state={state} />
      {url && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-surface-2 p-3 ring-1 ring-line">
          <code className="code-box min-w-0 flex-1 text-xs">{url}</code>
          <CopyButton value={url} label="Copiar link" />
        </div>
      )}
    </form>
  );
}

export function ActionButton({ action, label, pendingText = "Aguarde…", disabled, variant = "secondary" }: { action: NoArgAction; label: React.ReactNode; pendingText?: string; disabled?: boolean; variant?: "primary" | "secondary" | "danger" | "ghost" }) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction}>
      <fieldset disabled={disabled} className="disabled:opacity-50">
        <SubmitButton variant={variant} pendingText={pendingText}>{label}</SubmitButton>
      </fieldset>
      <Msg state={state} />
    </form>
  );
}

export function QrBox({ action, allowed }: { action: NoArgAction; allowed: boolean }) {
  const [state, formAction] = useActionState(action, null);
  const qr = typeof state?.data?.qr === "string" ? state.data.qr : null;
  const pairing = typeof state?.data?.pairing === "string" ? state.data.pairing : null;
  return (
    <form action={formAction}>
      <fieldset disabled={!allowed}>
        <SubmitButton variant="secondary" pendingText="Gerando QR…" className={allowed ? "" : "cursor-not-allowed opacity-50"}><QrCode aria-hidden className="h-4 w-4" /> Gerar QR code</SubmitButton>
      </fieldset>
      <Msg state={state} />
      {qr && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qr.startsWith("data:image") ? qr : `data:image/png;base64,${qr}`} alt="QR code para conectar o WhatsApp" className="mt-3 h-56 w-56 rounded-xl bg-white p-2" />
      )}
      {pairing && <p className="mt-2 text-sm">Código de pareamento: <code className="code-box">{pairing}</code></p>}
    </form>
  );
}
