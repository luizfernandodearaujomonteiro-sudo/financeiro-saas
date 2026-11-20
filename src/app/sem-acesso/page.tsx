import { ShieldAlert } from "lucide-react";
import { logoutAction } from "@/app/actions/auth";

export const metadata = { title: "Sem acesso" };

export default function SemAcesso() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="glass max-w-md p-8 text-center">
        <ShieldAlert aria-hidden className="mx-auto h-10 w-10 text-warn" />
        <h1 className="mt-4 text-xl font-bold">Sua conta não faz parte de uma família</h1>
        <p className="mt-2 text-sm text-ink-2">
          Esta conta existe, mas não tem acesso a este painel. Peça ao dono da família um link de convite.
        </p>
        <form action={logoutAction} className="mt-6">
          <button className="h-10 rounded-xl bg-surface-2 px-4 text-sm ring-1 ring-line hover:ring-line-strong">Sair</button>
        </form>
      </div>
    </main>
  );
}
