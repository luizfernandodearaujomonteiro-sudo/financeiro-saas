-- =====================================================================
-- Financeiro Família — schema principal (prefixo fam_)
--
-- ATENÇÃO: este projeto Supabase é COMPARTILHADO com outros apps.
-- Esta migration é ADITIVA: só cria objetos novos com prefixo fam_.
-- Não altera, renomeia, apaga nem escreve em nenhuma tabela existente
-- (auth.users é apenas referenciado por FK a partir de tabelas fam_).
--
-- Valores monetários SEMPRE em centavos inteiros (bigint). Nunca float.
-- Datas de calendário em `date`; "hoje" é calculado em America/Sao_Paulo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Famílias, perfis e membros
-- ---------------------------------------------------------------------
create table if not exists public.fam_households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 80),
  created_at  timestamptz not null default now()
);

-- Perfil do app (auth.users é compartilhado: ter conta NÃO dá acesso a nada;
-- o acesso vem exclusivamente de fam_household_members).
create table if not exists public.fam_profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text not null check (char_length(display_name) between 1 and 60),
  created_at    timestamptz not null default now()
);

create table if not exists public.fam_household_members (
  household_id  uuid not null references public.fam_households (id) on delete cascade,
  user_id       uuid not null references public.fam_profiles (id) on delete cascade,
  role          text not null check (role in ('owner', 'member')),
  created_at    timestamptz not null default now(),
  primary key (household_id, user_id),
  unique (user_id)  -- cada login pertence a no máximo uma família
);

create table if not exists public.fam_household_invites (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.fam_households (id) on delete cascade,
  token_hash    text not null unique,
  created_by    uuid not null references public.fam_profiles (id) on delete cascade,
  expires_at    timestamptz not null,
  accepted_by   uuid references public.fam_profiles (id) on delete set null,
  accepted_at   timestamptz,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Categorias (compartilhadas pela família)
-- ---------------------------------------------------------------------
create table if not exists public.fam_categories (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.fam_households (id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 60),
  kind          text not null check (kind in ('receita', 'despesa')),
  color         text not null default '#6366f1' check (color ~ '^#[0-9a-fA-F]{6}$'),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (household_id, id)
);
create unique index if not exists fam_categories_unique_name on public.fam_categories (household_id, kind, lower(name));

-- ---------------------------------------------------------------------
-- Contas e cartões (dono + visibilidade)
-- ---------------------------------------------------------------------
create table if not exists public.fam_bank_accounts (
  id                 uuid primary key default gen_random_uuid(),
  household_id       uuid not null,
  owner_id           uuid not null,
  name               text not null check (char_length(name) between 1 and 80),
  institution        text,
  kind               text not null default 'corrente' check (kind in ('corrente', 'poupanca', 'pagamento', 'outro')),
  balance_cents      bigint not null default 0,
  visibility         text not null default 'pessoal' check (visibility in ('pessoal', 'compartilhado')),
  pluggy_account_id  text unique,
  created_at         timestamptz not null default now(),
  unique (household_id, id),
  foreign key (household_id, owner_id) references public.fam_household_members (household_id, user_id) on delete cascade
);

create table if not exists public.fam_cards (
  id                 uuid primary key default gen_random_uuid(),
  household_id       uuid not null,
  owner_id           uuid not null,
  nickname           text not null check (char_length(nickname) between 1 and 60),
  brand              text not null check (brand in ('visa', 'mastercard', 'elo', 'amex', 'hipercard', 'outra')),
  last4              char(4) not null check (last4 ~ '^[0-9]{4}$'),
  closing_day        smallint not null check (closing_day between 1 and 31),
  due_day            smallint not null check (due_day between 1 and 31),
  limit_cents        bigint not null default 0 check (limit_cents >= 0),
  visibility         text not null default 'compartilhado' check (visibility in ('pessoal', 'compartilhado')),
  active             boolean not null default true,
  pluggy_account_id  text unique,
  created_at         timestamptz not null default now(),
  unique (household_id, id),
  foreign key (household_id, owner_id) references public.fam_household_members (household_id, user_id) on delete cascade
);

create table if not exists public.fam_invoices (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null,
  card_id          uuid not null,
  reference_month  date not null check (extract(day from reference_month) = 1), -- mês do vencimento
  closing_date     date not null,
  due_date         date not null,
  total_cents      bigint not null default 0,  -- mantido por trigger
  status           text not null default 'aberta' check (status in ('aberta', 'fechada', 'paga')),
  paid_at          timestamptz,
  created_at       timestamptz not null default now(),
  unique (card_id, reference_month),
  unique (household_id, id),
  check (due_date >= closing_date),
  foreign key (household_id, card_id) references public.fam_cards (household_id, id) on delete cascade
);

-- Compra no cartão (agrupa as parcelas)
create table if not exists public.fam_card_purchases (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid not null,
  owner_id          uuid not null,
  card_id           uuid not null,
  visibility        text not null default 'pessoal' check (visibility in ('pessoal', 'compartilhado')),
  description       text not null check (char_length(description) between 1 and 140),
  total_cents       bigint not null check (total_cents > 0),
  installments      smallint not null check (installments between 1 and 48),
  purchased_on      date not null,
  category_id       uuid,
  created_at        timestamptz not null default now(),
  unique (household_id, id),
  foreign key (household_id, owner_id) references public.fam_household_members (household_id, user_id) on delete cascade,
  foreign key (household_id, card_id) references public.fam_cards (household_id, id) on delete cascade,
  foreign key (household_id, category_id) references public.fam_categories (household_id, id) on delete set null (category_id)
);

-- ---------------------------------------------------------------------
-- Lançamentos (parcelas de cartão também são lançamentos)
-- ---------------------------------------------------------------------
create table if not exists public.fam_entries (
  id                  uuid primary key default gen_random_uuid(),
  household_id        uuid not null,
  owner_id            uuid not null,
  visibility          text not null default 'pessoal' check (visibility in ('pessoal', 'compartilhado')),
  kind                text not null check (kind in ('receita', 'despesa')),
  description         text not null check (char_length(description) between 1 and 140),
  amount_cents        bigint not null check (amount_cents > 0),
  occurred_on         date not null,
  budget_month        date not null check (extract(day from budget_month) = 1), -- cartão: mês da fatura
  category_id         uuid,
  payment_method      text not null default 'pix'
                      check (payment_method in ('pix', 'cartao_credito', 'cartao_debito', 'boleto', 'dinheiro', 'transferencia', 'debito_automatico')),
  cost_type           text not null default 'variavel' check (cost_type in ('fixa', 'variavel')),
  bank_account_id     uuid,
  card_id             uuid,
  invoice_id          uuid,
  purchase_id         uuid,
  installment_number  smallint,
  installment_total   smallint,
  source              text not null default 'manual' check (source in ('manual', 'whatsapp', 'gmail', 'pluggy', 'importacao')),
  external_id         text,
  notes               text check (notes is null or char_length(notes) <= 500),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  foreign key (household_id, owner_id) references public.fam_household_members (household_id, user_id) on delete cascade,
  foreign key (household_id, category_id) references public.fam_categories (household_id, id) on delete set null (category_id),
  foreign key (household_id, bank_account_id) references public.fam_bank_accounts (household_id, id) on delete set null (bank_account_id),
  foreign key (household_id, card_id) references public.fam_cards (household_id, id) on delete set null (card_id),
  foreign key (household_id, invoice_id) references public.fam_invoices (household_id, id) on delete set null (invoice_id),
  foreign key (household_id, purchase_id) references public.fam_card_purchases (household_id, id) on delete cascade,
  check (card_id is null or payment_method in ('cartao_credito', 'cartao_debito')),
  check (
    (installment_total is null and installment_number is null)
    or (installment_total between 1 and 48 and installment_number between 1 and installment_total)
  )
);
create index if not exists fam_entries_household_month on public.fam_entries (household_id, budget_month);
create index if not exists fam_entries_owner on public.fam_entries (owner_id);
create index if not exists fam_entries_invoice on public.fam_entries (invoice_id);
create unique index if not exists fam_entries_external_unique
  on public.fam_entries (household_id, source, external_id) where external_id is not null;

-- ---------------------------------------------------------------------
-- Importação de faturas: documentos (PDF) e fila de revisão
-- ---------------------------------------------------------------------
create table if not exists public.fam_invoice_documents (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid not null,
  owner_id          uuid not null,
  card_id           uuid,
  source            text not null default 'upload' check (source in ('upload', 'gmail')),
  gmail_message_id  text,
  file_name         text,
  storage_path      text not null,
  sha256            text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  parsed_items      integer not null default 0,
  parse_error       text,
  created_at        timestamptz not null default now(),
  unique (owner_id, sha256),
  unique (household_id, id),
  foreign key (household_id, owner_id) references public.fam_household_members (household_id, user_id) on delete cascade,
  foreign key (household_id, card_id) references public.fam_cards (household_id, id) on delete set null (card_id)
);

create table if not exists public.fam_review_queue (
  id                  uuid primary key default gen_random_uuid(),
  household_id        uuid not null,
  owner_id            uuid not null,
  source              text not null check (source in ('gmail', 'upload', 'pluggy')),
  status              text not null default 'pendente' check (status in ('pendente', 'aprovado', 'rejeitado')),
  document_id         uuid,
  card_id             uuid,
  kind                text not null default 'despesa' check (kind in ('receita', 'despesa')),
  description         text not null check (char_length(description) between 1 and 140),
  amount_cents        bigint not null check (amount_cents > 0),
  occurred_on         date not null,
  installment_number  smallint,
  installment_total   smallint,
  suggested_category  uuid,
  dedupe_hash         text not null,
  entry_id            uuid references public.fam_entries (id) on delete set null,
  created_at          timestamptz not null default now(),
  reviewed_at         timestamptz,
  unique (household_id, dedupe_hash),
  foreign key (household_id, owner_id) references public.fam_household_members (household_id, user_id) on delete cascade,
  foreign key (household_id, document_id) references public.fam_invoice_documents (household_id, id) on delete set null (document_id),
  foreign key (household_id, card_id) references public.fam_cards (household_id, id) on delete set null (card_id),
  foreign key (household_id, suggested_category) references public.fam_categories (household_id, id) on delete set null (suggested_category)
);
create index if not exists fam_review_queue_owner_status on public.fam_review_queue (owner_id, status);

-- ---------------------------------------------------------------------
-- Integrações
-- ---------------------------------------------------------------------
-- Gmail: status visível ao próprio usuário; token fica em fam_oauth_tokens.
create table if not exists public.fam_gmail_connections (
  user_id       uuid primary key references public.fam_profiles (id) on delete cascade,
  email         text,
  status        text not null default 'conectado' check (status in ('conectado', 'erro', 'desconectado')),
  last_sync_at  timestamptz,
  last_error    text,
  created_at    timestamptz not null default now()
);

-- Tokens OAuth cifrados na aplicação (AES-256-GCM). SEM acesso para anon/authenticated.
create table if not exists public.fam_oauth_tokens (
  user_id            uuid not null references public.fam_profiles (id) on delete cascade,
  provider           text not null check (provider in ('gmail')),
  refresh_token_enc  text not null,
  scope              text,
  updated_at         timestamptz not null default now(),
  primary key (user_id, provider)
);

-- Pluggy (Open Finance): conexão POR MEMBRO; guardamos só o item id.
create table if not exists public.fam_pluggy_items (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null,
  user_id         uuid not null,
  item_id         text not null unique,
  connector_name  text,
  mode            text not null default 'live' check (mode in ('live', 'sandbox', 'mock')),
  status          text,
  last_sync_at    timestamptz,
  last_error      text,
  created_at      timestamptz not null default now(),
  foreign key (household_id, user_id) references public.fam_household_members (household_id, user_id) on delete cascade
);

-- WhatsApp: configuração do assistente da família (campos não secretos)
create table if not exists public.fam_whatsapp_config (
  household_id          uuid primary key references public.fam_households (id) on delete cascade,
  provider              text not null default 'evolution' check (provider in ('evolution', 'meta', 'simulator')),
  display_number        text,
  evolution_base_url    text check (evolution_base_url is null or evolution_base_url ~ '^https://'),
  evolution_instance    text check (evolution_instance is null or evolution_instance ~ '^[A-Za-z0-9_-]{1,64}$'),
  meta_phone_number_id  text,
  updated_by            uuid references public.fam_profiles (id) on delete set null,
  updated_at            timestamptz not null default now()
);

-- Segredos do WhatsApp cifrados (AES-256-GCM). SEM acesso direto para clientes.
create table if not exists public.fam_whatsapp_secrets (
  household_id           uuid primary key references public.fam_households (id) on delete cascade,
  evolution_token_enc    text,
  meta_access_token_enc  text,
  updated_at             timestamptz not null default now()
);

-- Telefone de cada membro -> perfil
create table if not exists public.fam_whatsapp_numbers (
  user_id       uuid primary key,
  household_id  uuid not null,
  phone_e164    text not null unique check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  created_at    timestamptz not null default now(),
  foreign key (household_id, user_id) references public.fam_household_members (household_id, user_id) on delete cascade
);

-- Idempotência de mensagens recebidas (somente servidor)
create table if not exists public.fam_whatsapp_inbound (
  message_id   text primary key,
  provider     text not null,
  from_phone   text not null,
  received_at  timestamptz not null default now()
);

-- Evita alertas/lembretes duplicados (somente servidor)
create table if not exists public.fam_notification_log (
  id       bigint generated always as identity primary key,
  user_id  uuid not null references public.fam_profiles (id) on delete cascade,
  kind     text not null,
  ref      text not null,
  sent_at  timestamptz not null default now(),
  unique (user_id, kind, ref)
);

-- Tentativas de login (somente via funções SECURITY DEFINER)
create table if not exists public.fam_login_attempts (
  id          bigint generated always as identity primary key,
  key_hash    text not null,
  success     boolean not null,
  created_at  timestamptz not null default now()
);
create index if not exists fam_login_attempts_key_time on public.fam_login_attempts (key_hash, created_at desc);

-- Investimentos: vínculo membro -> invest_profiles (app invest-tracker, somente leitura)
create table if not exists public.fam_invest_links (
  user_id            uuid primary key,
  household_id       uuid not null,
  invest_profile_id  uuid not null unique,
  visibility         text not null default 'pessoal' check (visibility in ('pessoal', 'compartilhado')),
  created_at         timestamptz not null default now(),
  foreign key (household_id, user_id) references public.fam_household_members (household_id, user_id) on delete cascade
);
