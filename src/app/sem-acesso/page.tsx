import { Home, MailOpen, ShieldAlert } from "lucide-react";
import { redirect } from "next/navigation";
import { logoutAction } from "@/app/actions/auth";
import { loadMembership } from "@/lib/auth/member";
import { getSessionUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { ActionForm, SubmitButton } from "@/components/ui/client";
import { FadeIn } from "@/components/ui/motion";
import { Field, Input } from "@/components/ui/primitives";
import { createMyHouseholdAction } from "./actions";

export const metadata = { title: "Criar minha família" };
export const dynamic = "force-dynamic";

/**
 * Usuário logado que ainda não pertence a nenhuma família: pode criar a sua
 * (vira dono) ou aguardar/abrir um link de convite.
 */
export default async function SemAcesso() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (await loadMembership(user.id)) redirect("/painel");
  const canCreate = env.selfOnboardingEnabled;
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <FadeIn className="w-full max-w-md">
        <div className="glass glass-gradient p-8">
          {canCreate ? (
            <>
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-brand to-brand-2 text-brand-ink shadow-[0_0_28px_-6px_var(--glow)]">
                <Home aria-hidden className="h-6 w-6" />
              </span>
              <h1 className="mt-4 text-2xl font-bold">Criar minha família</h1>
              <p className="mt-1 text-sm text-ink-2">
                Sua conta ainda não faz parte de nenhuma família. Crie a sua — você será o dono e depois poderá convidar outra pessoa em
                <b> Configurações › Família</b>.
              </p>
              <ActionForm action={createMyHouseholdAction} className="mt-6 space-y-4">
                <Field label="Nome da família"><Input name="name" required maxLength={80} placeholder="Ex.: Família Silva" autoComplete="off" /></Field>
                <Field label="Seu nome (como aparece no painel)"><Input name="displayName" required maxLength={60} placeholder="Ex.: Luiz" autoComplete="given-name" /></Field>
                <SubmitButton className="h-11 w-full" pendingText="Criando…">Criar família e entrar</SubmitButton>
              </ActionForm>
              <p className="mt-5 flex items-start gap-2 text-xs text-ink-3">
                <MailOpen aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Recebeu um convite? Abra o link do convite em vez de criar uma família nova.
              </p>
            </>
          ) : (
            <div className="text-center">
              <ShieldAlert aria-hidden className="mx-auto h-10 w-10 text-warn" />
              <h1 className="mt-4 text-xl font-bold">Sua conta não faz parte de uma família</h1>
              <p className="mt-2 text-sm text-ink-2">Peça ao dono da família um link de convite.</p>
            </div>
          )}
          <form action={logoutAction} className="mt-6 text-center">
            <button className="h-9 rounded-xl px-4 text-sm text-ink-3 ring-1 ring-line hover:text-ink">Sair</button>
          </form>
        </div>
      </FadeIn>
    </main>
  );
}
