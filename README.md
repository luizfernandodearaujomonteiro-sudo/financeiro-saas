# Finanças da Família

Painel financeiro **compartilhado** para o Luiz e a esposa: lançamentos, cartões e faturas
(com parcelas), contas a pagar com boleto/Pix, revisão de faturas do Gmail, Open Finance
(Pluggy), assistente no WhatsApp, metas, patrimônio, investimentos, busca e relatórios.
Interface em português, escura por padrão (com tema claro e automático por horário).

> Guia completo de entrega (como usar, testar cada recurso, WhatsApp, go-live e riscos):
> **[docs/ENTREGA.md](docs/ENTREGA.md)**

## Stack

- **Next.js 16** (App Router, TypeScript strict) — um único app, pronto para a **Vercel**
- **Supabase**: Postgres + Auth (+ Storage) — RLS em todas as tabelas `fam_`
- Migrations SQL **aditivas** em `supabase/migrations` (somente objetos `fam_`)
- Crons da Vercel em `vercel.json`
- Tailwind v4, `motion`, `lucide-react`, `zod`, `pg`
- Testes: Vitest (unitários) + Postgres **local** real (`embedded-postgres`) para RLS e ponta a ponta + Playwright (fumaça no navegador e capturas)

## Rodar localmente (sem Docker, sem Supabase)

Requisitos: Node 20.9+ (testado com Node 24).

```bash
npm install
npm run dev:local        # cria .env.local, sobe Postgres local (127.0.0.1:54329), migra, faz seed e abre http://localhost:3000
```

Logins locais (seed):

| Pessoa | E-mail | Senha |
|---|---|---|
| Luiz (dono) | `luiz@familia.local` | `Luiz@Local2026` |
| Esposa (membro) | `esposa@familia.local` | `Esposa@Local2026` |
| Conta de outro app (sem acesso) | `outroapp@exemplo.local` | `OutroApp@2026xx` |

Comandos úteis:

| Comando | O que faz |
|---|---|
| `npm run db:local:start` / `db:local:stop` / `db:local:status` | Postgres local (dados em `.local/pgdata`, gitignored) |
| `npm run db:local:migrate` | aplica shim local + migrations `fam_` + stubs `invest_*` locais |
| `npm run db:local:seed` / `db:local:reset` | dados de demonstração / recria tudo do zero |
| `npm run setup:local` | gera `.env.local` com segredos aleatórios (não sobrescreve) |
| `npm run typecheck` · `npm run lint` · `npm run build` | verificações |
| `npm test` | testes unitários (dinheiro, datas, faturas, boleto/Pix, comandos…) |
| `npm run test:rls` | testes **reais** de RLS no Postgres local (porta 54330) |
| `npm run test:e2e` | caminho ponta a ponta local (login, cartões, revisão, Pluggy mock, WhatsApp…) |
| `npm run screenshots` | fumaça no navegador (Playwright) + capturas em `docs/screenshots/` (requer `npm run build`; `npx playwright install chromium` uma vez) |
| `npm run check` | typecheck + lint + todos os testes + build |

## Deploy (Vercel + Supabase compartilhado)

Resumo — detalhes e alertas em [docs/ENTREGA.md › Go-live](docs/ENTREGA.md#go-live-supabase--vercel):

1. **Revise** os SQL de `supabase/migrations/` (somente `fam_`, aditivos) e aplique no projeto
   `bqbmvurwmsgitundbdxt` pelo SQL Editor (um arquivo por vez, em ordem) — é um **banco de produção
   compartilhado** com outros apps.
2. Crie no Storage o bucket **privado** `fam_faturas`.
3. Crie a família: `DATABASE_URL=... npm run bootstrap -- --owner-email ... --member-email ... --yes`.
4. Na Vercel, cadastre as variáveis de `.env.example` (nunca `LOCAL_DEV_AUTH`), faça o deploy e
   confira os crons.
5. Configure os webhooks (WhatsApp/Evolution e Pluggy) e o OAuth do Google.

## Segurança (resumo)

- **RLS em todas as tabelas `fam_`**, por pertencimento (`fam_household_members`). O `auth.users`
  é compartilhado com outros apps: **cadastro não concede nada**; vínculo só por convite/bootstrap.
- Cada requisição roda no Postgres como `authenticated` com o `sub` do usuário (o mesmo mecanismo
  do PostgREST) → a RLS vale também no servidor. Privilégio de serviço só em jobs/webhooks
  (exceções listadas no ENTREGA.md).
- Sessão em **cookies httpOnly** (`@supabase/ssr`), nada em `localStorage`.
- Limite de tentativas de login (5 por e-mail / 20 por IP em 15 min), senha mínima de 12 caracteres.
- Dinheiro em **centavos inteiros** de ponta a ponta; datas no fuso `America/Sao_Paulo`.
- Webhooks: Bearer (Evolution) / assinatura HMAC (Meta) / segredo (Pluggy) com comparação em tempo
  constante — todos **falham fechados** se o segredo não estiver configurado. Crons exigem `CRON_SECRET`.
- Segredos só no servidor; tokens OAuth e do WhatsApp cifrados (AES-256-GCM) no banco.
- O código antigo (Express/Vite) foi removido; antes disso, o commit `fix(security)` corrigiu a
  chave admin que liberava `/api/admin/*` sem login e as políticas `WITH CHECK (true)`.

## Estrutura

```
src/app/            páginas (pt-BR) e rotas de API (webhooks, cron, OAuth, documentos)
src/lib/domain/     regras puras e testadas (dinheiro, datas, faturas, boleto, Pix, metas…)
src/lib/services/   acesso a dados com RLS do usuário
src/lib/whatsapp/   provedores (Evolution, Meta, simulador), webhook, comandos, alertas
src/lib/pluggy/     cliente Pluggy, mock, importação por membro
src/lib/gmail/      OAuth e sincronização de faturas
supabase/migrations/   SQL aditivo (fam_) para o Supabase
supabase/local/        shim do Supabase e stubs invest_* SOMENTE locais
scripts/            Postgres local, seed, bootstrap, import de bills, screenshots
tests/              unit, rls, e2e
```
