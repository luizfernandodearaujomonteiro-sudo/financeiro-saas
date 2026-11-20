import { MailOpen } from "lucide-react";
import { getSessionUser } from "@/lib/auth/session";
import { inviteInfo } from "@/lib/services/household";
import { ActionForm, SubmitButton } from "@/components/ui/client";
import { Field, Input } from "@/components/ui/primitives";
import { acceptInviteAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ConvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const household = /^[0-9a-f]{64}$/.test(token) ? await inviteInfo(token) : null;
  const user = await getSessionUser().catch(() => null);
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="glass glass-gradient w-full max-w-md p-8">
        <MailOpen aria-hidden className="h-9 w-9 text-brand" />
        {household ? (
          <>
            <h1 className="mt-3 text-xl font-bold">Convite para “{household}”</h1>
            <p className="mt-1 text-sm text-ink-2">
              {user ? "Confirme seu nome para entrar na família." : "Entre com sua conta para aceitar. Se ainda não tem conta, peça ao dono para criá-la (veja o README)."}
            </p>
            <ActionForm action={acceptInviteAction} className="mt-6 space-y-4">
              <input type="hidden" name="token" value={token} />
              <Field label="Seu nome"><Input name="name" required maxLength={60} /></Field>
              {!user && (
                <>
                  <Field label="E-mail"><Input name="email" type="email" required autoComplete="email" /></Field>
                  <Field label="Senha"><Input name="password" type="password" required autoComplete="current-password" /></Field>
                </>
              )}
              <SubmitButton className="w-full">Aceitar convite</SubmitButton>
            </ActionForm>
          </>
        ) : (
          <>
            <h1 className="mt-3 text-xl font-bold">Convite inválido ou expirado</h1>
            <p className="mt-1 text-sm text-ink-2">Peça um novo link ao dono da família.</p>
          </>
        )}
      </div>
    </main>
  );
}
