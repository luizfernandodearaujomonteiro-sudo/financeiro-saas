-- =====================================================================
-- STUBS LOCAIS das tabelas do app invest-tracker — SOMENTE desenvolvimento local.
-- No Supabase real estas tabelas JÁ EXISTEM e NÃO devem ser criadas/alteradas.
-- Este arquivo NUNCA faz parte de supabase/migrations.
-- =====================================================================
create table if not exists public.invest_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text
);
create table if not exists public.invest_brokers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.invest_profiles (id) on delete cascade,
  name text not null
);
create table if not exists public.invest_assets (
  id uuid primary key default gen_random_uuid(),
  ticker text not null unique,
  name text not null,
  asset_type text not null,
  currency text not null default 'BRL'
);
create table if not exists public.invest_holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.invest_profiles (id) on delete cascade,
  broker_id uuid not null references public.invest_brokers (id) on delete cascade,
  asset_id uuid not null references public.invest_assets (id),
  total_quantity numeric(20, 8) not null default 0,
  average_price numeric(20, 8) not null default 0,
  total_invested numeric(20, 2) not null default 0
);
create table if not exists public.invest_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.invest_profiles (id) on delete cascade,
  holding_id uuid not null references public.invest_holdings (id) on delete cascade,
  type text not null,
  quantity numeric(20, 8) not null,
  price_per_unit numeric(20, 8) not null default 0,
  total_value numeric(20, 2) not null,
  fees numeric(20, 2) default 0,
  executed_at timestamptz not null
);
create table if not exists public.invest_price_cache (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null unique references public.invest_assets (id) on delete cascade,
  current_price numeric(20, 8),
  fetched_at timestamptz not null default now()
);
-- Como no app original: RLS por user_id = auth.uid()
alter table public.invest_profiles enable row level security;
alter table public.invest_holdings enable row level security;
alter table public.invest_transactions enable row level security;
alter table public.invest_brokers enable row level security;
create policy invest_profiles_own on public.invest_profiles for select to authenticated using (id = auth.uid());
create policy invest_holdings_own on public.invest_holdings for select to authenticated using (user_id = auth.uid());
create policy invest_transactions_own on public.invest_transactions for select to authenticated using (user_id = auth.uid());
create policy invest_brokers_own on public.invest_brokers for select to authenticated using (user_id = auth.uid());
grant select on public.invest_profiles, public.invest_holdings, public.invest_transactions, public.invest_brokers, public.invest_assets, public.invest_price_cache to authenticated;
