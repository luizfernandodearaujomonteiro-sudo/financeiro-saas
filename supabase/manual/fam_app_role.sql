-- =====================================================================
-- MANUAL (go-live) — papel de login dedicado do app "Finanças da Família".
-- Aplique UMA vez no SQL Editor do projeto Supabase (roda como postgres),
-- depois das migrations. NÃO faz parte de supabase/migrations.
--
-- Por quê: a DATABASE_URL do app NÃO deve usar o papel `postgres` (dono de
-- todo o projeto compartilhado). `fam_app` é NOINHERIT: conectado com ele,
-- sem `SET ROLE` não há privilégio nenhum. O app sempre faz, por transação:
--   - requisições do painel: SET LOCAL ROLE authenticated (+ claim sub) -> RLS
--   - login/convite:         SET LOCAL ROLE anon (só RPCs de fam_private)
--   - crons/webhooks/log:    SET LOCAL ROLE service_role (somente DML)
--
-- Troque <SENHA-FORTE> por uma senha aleatória (ex.: openssl rand -base64 32).
-- Nunca commite a senha real.
-- =====================================================================
create role fam_app with login noinherit password '<SENHA-FORTE>';

-- pertencimento aos papéis do Supabase (necessário para SET ROLE)
grant anon, authenticated, service_role to fam_app;

-- (opcional) limite de conexões diretas
alter role fam_app connection limit 20;

-- Conferências (devem retornar: f, t, t, t)
select rolinherit from pg_roles where rolname = 'fam_app';
select pg_has_role('fam_app', 'authenticated', 'MEMBER');
select pg_has_role('fam_app', 'anon', 'MEMBER');
select pg_has_role('fam_app', 'service_role', 'MEMBER');

-- Conexão pelo pooler (Supavisor, modo transaction, porta 6543):
--   DATABASE_URL=postgres://fam_app.<project-ref>:<SENHA-FORTE>@aws-0-sa-east-1.pooler.supabase.com:6543/postgres
--
-- Para revogar no futuro:
--   revoke anon, authenticated, service_role from fam_app; drop role fam_app;
