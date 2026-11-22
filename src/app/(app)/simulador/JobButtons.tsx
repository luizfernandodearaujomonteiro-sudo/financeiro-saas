"use client";
import { CheckCircle2, XCircle } from "lucide-react";
import { useActionState, type ReactNode } from "react";
import type { ActionState } from "@/lib/actions";
import { SubmitButton } from "@/components/ui/client";

export function JobButton({ action, children }: { action: () => Promise<ActionState>; children: ReactNode }) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="space-y-1.5">
      <SubmitButton variant="secondary" pendingText="Executando…" className="w-full justify-start">{children}</SubmitButton>
      {state && (
        <p role={state.ok ? "status" : "alert"} className={`flex items-center gap-1.5 text-xs ${state.ok ? "text-good" : "text-bad"}`}>
          {state.ok ? <CheckCircle2 aria-hidden className="h-3.5 w-3.5" /> : <XCircle aria-hidden className="h-3.5 w-3.5" />}
          {state.ok ? state.message : state.error}
        </p>
      )}
    </form>
  );
}
