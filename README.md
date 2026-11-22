# Finanças da Família

Painel financeiro **compartilhado** para o Luiz e a esposa: lançamentos, cartões e faturas
(com parcelas), contas a pagar com boleto/Pix, revisão de faturas do Gmail, Open Finance
(Pluggy), assistente no WhatsApp, metas, patrimônio, investimentos, busca e relatórios.
Interface em português, escura por padrão (com tema claro e automático por horário).

> Guia completo de entrega (como usar, testar cada recurso, WhatsApp, go-live e riscos):
> **[docs/ENTREGA.md](docs/ENTREGA.md)**

## Stack

- **Next.js 16** (App Router, TypeScript strict) — um único app, pronto para a **Vercel**
- **Supabase**: Postgres + Auth (+ Storage) — RLS em todas as tabelas `fin_financeiro_`
- Migrations SQL **aditivas** em `supabase/migrations` (somente objetos `fin_financeiro_`)
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
| `npm run db:local:migrate` | aplica shim local + migrations `fin_financeiro_` + stubs `invest_*` locais |
| `npm run db:local:seed` / `db:local:reset` | dados de demonstração / recria tudo do zero |
| `npm run setup:local` | gera `.env.local` com segredos aleatórios (não sobrescreve) |
| `npm run typecheck` · `npm run lint` · `npm run build` | verificações |
| `npm test` | 97 testes unitários (dinheiro, datas, faturas, boleto/Pix, PDF com senha, comandos, redirect…) |
| `npm run test:rls` | 60 testes **reais** de RLS no Postgres local (porta 54330), conectando como `fin_financeiro_app` |
| `npm run test:e2e` | 33 testes ponta a ponta locais (login, onboarding, cartões, revisão, Pluggy mock, WhatsApp…), como `fin_financeiro_app` |
| `npm run screenshots` | fumaça no navegador (Playwright) + capturas em `docs/screenshots/` (requer `npm run build`; `npx playwright install chromium` uma vez) |
| `npm run check` | typecheck + lint + todos os testes + build |

## Deploy (Vercel + Supabase compartilhado)

Resumo — detalhes e alertas em [docs/ENTREGA.md › Go-live](docs/ENTREGA.md#go-live-supabase--vercel):

1. **Revise** os SQL de `supabase/migrations/` (8 arquivos; somente `fin_financeiro_*` + schema
   `fin_financeiro_private`, aditivos; não tocam nas tabelas reservadas do app antigo
   `fin_financeiro_categorias/_configuracoes/_empresas/_lancamentos/_usuarios`) e aplique no projeto
   `bqbmvurwmsgitundbdxt` pelo SQL Editor (um arquivo por vez, em ordem) — é um **banco de produção
   compartilhado** com outros apps.
2. Crie o papel de conexão do app com `supabase/manual/fin_financeiro_app_role.sql` (troque a senha
   placeholder na hora; não commite).
3. Na Vercel, cadastre as variáveis de `.env.example` — `DATABASE_URL` com o papel
   **`fin_financeiro_app`** no pooler em modo transaction (porta 6543); nunca `DATABASE_URL_ADMIN`
   nem `LOCAL_DEV_AUTH`. `SUPABASE_SERVICE_ROLE_KEY` é opcional (só upload de PDF; bucket privado
   `fin_financeiro_faturas`). Faça o deploy e confira os crons.
4. O Luiz entra no painel e usa **"Criar minha família"**; depois convida a esposa em
   Configurações › Família (alternativa: `npm run bootstrap` com `DATABASE_URL_ADMIN`).
5. Configure os webhooks (WhatsApp/Evolution; Pluggy com header `x-webhook-secret`) e o OAuth do Google.
   WhatsApp oficial (Meta Cloud API): `WHATSAPP_PROVIDER=meta` + `META_WHATSAPP_ACCESS_TOKEN`,
   `META_WHATSAPP_PHONE_NUMBER_ID`, `META_WHATSAPP_APP_SECRET`, `META_WHATSAPP_VERIFY_TOKEN`
   (opcional `META_GRAPH_API_VERSION`, padrão `v21.0`); webhook em `/api/whatsapp/webhook`, campo
   `messages`. Só eventos do `phone_number_id` configurado são processados — ver `docs/ENTREGA.md` §5.

## Segurança (resumo)

- **RLS em todas as tabelas `fin_financeiro_`**, por pertencimento (`fin_financeiro_household_members`). O `auth.users`
  é compartilhado com outros apps: **cadastro não concede nada**; vínculo só por convite, bootstrap
  ou pelo onboarding explícito "Criar minha família" (cria a família DO usuário, sem acesso a outras).
- O app conecta com o papel dedicado **`fin_financeiro_app` (NOINHERIT)**: sem `SET ROLE` ele não tem
  privilégio. Cada requisição do painel roda como `authenticated` com o `sub` do usuário (o mesmo
  mecanismo do PostgREST) → a RLS vale também no servidor. `service_role` (só DML) apenas em
  crons/webhooks/log de mensagens (lista e limitações no ENTREGA.md).
- RPCs chamadas pelo papel `anon` ficam no schema `fin_financeiro_private`, fora da API REST do Supabase.
- Sessão em **cookies httpOnly** (`@supabase/ssr`), nada em `localStorage`.
- Limite de tentativas de login (5 por e-mail / 20 por IP em 15 min), senha mínima de 12 caracteres.
- Dinheiro em **centavos inteiros** de ponta a ponta; datas no fuso `America/Sao_Paulo`.
  Pagamentos de fatura e transferências próprias ficam fora dos relatórios; estornos reduzem despesa.
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
supabase/migrations/   SQL aditivo (fin_financeiro_) para o Supabase
supabase/local/        shim do Supabase e stubs invest_* SOMENTE locais
scripts/            Postgres local, seed, bootstrap, import de bills, screenshots
tests/              unit, rls, e2e
```
