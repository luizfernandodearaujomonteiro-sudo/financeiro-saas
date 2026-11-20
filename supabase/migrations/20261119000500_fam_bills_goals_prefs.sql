-- =====================================================================
-- Financeiro Família — contas a pagar (boleto/Pix), metas, busca,
-- patrimônio, preferências. ADITIVA: apenas novas tabelas fam_.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Contas a pagar (manuais ou importadas via Open Finance)
-- ---------------------------------------------------------------------
create table if not exists public.fam_bills (
  id                 uuid primary key default gen_random_uuid(),
  household_id       uuid not null,
  owner_id           uuid not null,
  visibility         text not null default 'compartilhado' check (visibility in ('pessoal', 'compartilhado')),
  description        text not null check (char_length(description) between 1 and 140),
  amount_cents       bigint not null check (amount_cents > 0),
  due_date           date not null,
  status             text not null default 'pendente' check (status in ('pendente', 'paga', 'cancelada')),
  paid_at            timestamptz,
  category_id        uuid,
  cost_type          text not null default 'fixa' check (cost_type in ('fixa', 'variavel')),
  card_id            uuid,
  -- código de barras (44 dígitos) e linha digitável (47 bancário / 48 arrecadação)
  boleto_barcode     text check (boleto_barcode is null or boleto_barcode ~ '^[0-9]{44}$'),
  boleto_line        text check (boleto_line is null or boleto_line ~ '^[0-9]{47,48}$'),
  -- Pix copia-e-cola (BR Code EMV) e/ou chave Pix
  pix_code           text check (pix_code is null or char_length(pix_code) between 20 and 512),
  pix_key            text check (pix_key is null or char_length(pix_key) between 1 and 77),
  pix_key_type       text check (pix_key_type is null or pix_key_type in ('cpf', 'cnpj', 'email', 'telefone', 'evp')),
  source             text not null default 'manual' check (source in ('manual', 'pluggy', 'importacao')),
  external_id        text,
  entry_id           uuid references public.fam_entries (id) on delete set null,
  notes              text check (notes is null or char_length(notes) <= 500),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (household_id, id),
  check ((pix_key is null) = (pix_key_type is null)),
  foreign key (household_id, owner_id) references public.fam_household_members (household_id, user_id) on delete cascade,
  foreign key (household_id, category_id) references public.fam_categories (household_id, id) on delete set null (category_id),
  foreign key (household_id, card_id) references public.fam_cards (household_id, id) on delete set null (card_id)
);
create index if not exists fam_bills_household_due on public.fam_bills (household_id, due_date);
create unique index if not exists fam_bills_external_unique
  on public.fam_bills (household_id, source, external_id) where external_id is not null;

drop trigger if exists fam_bills_touch_trg on public.fam_bills;
create trigger fam_bills_touch_trg before update on public.fam_bills
  for each row execute function public.fam_touch_updated_at();

-- ---------------------------------------------------------------------
-- Metas
-- ---------------------------------------------------------------------
create table if not exists public.fam_goals (
  id                    uuid primary key default gen_random_uuid(),
  household_id          uuid not null,
  owner_id              uuid not null,
  visibility            text not null default 'compartilhado' check (visibility in ('pessoal', 'compartilhado')),
  name                  text not null check (char_length(name) between 1 and 80),
  kind                  text not null default 'poupanca' check (kind in ('poupanca', 'investimento', 'quitar_divida', 'outro')),
  monthly_target_cents  bigint not null check (monthly_target_cents > 0),
  total_target_cents    bigint check (total_target_cents is null or total_target_cents > 0),
  start_month           date not null check (extract(day from start_month) = 1),
  end_month             date check (end_month is null or extract(day from end_month) = 1),
  active                boolean not null default true,
  created_at            timestamptz not null default now(),
  unique (household_id, id),
  check (end_month is null or end_month >= start_month),
  foreign key (household_id, owner_id) references public.fam_household_members (household_id, user_id) on delete cascade
);

create table if not exists public.fam_goal_contributions (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null,
  goal_id       uuid not null,
  owner_id      uuid not null,
  month         date not null check (extract(day from month) = 1),
  amount_cents  bigint not null check (amount_cents <> 0),  -- negativo = retirada
  entry_id      uuid references public.fam_entries (id) on delete set null,
  note          text check (note is null or char_length(note) <= 200),
  created_at    timestamptz not null default now(),
  foreign key (household_id, goal_id) references public.fam_goals (household_id, id) on delete cascade,
  foreign key (household_id, owner_id) references public.fam_household_members (household_id, user_id) on delete cascade
);
create index if not exists fam_goal_contributions_goal on public.fam_goal_contributions (goal_id, month);

create or replace function public.fam_can_see_goal(p_goal uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.fam_goals g
    join public.fam_household_members m on m.household_id = g.household_id and m.user_id = auth.uid()
    where g.id = p_goal and (g.visibility = 'compartilhado' or g.owner_id = auth.uid())
  )
$$;
revoke execute on function public.fam_can_see_goal(uuid) from public, anon;
grant execute on function public.fam_can_see_goal(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Histórico de buscas (por perfil)
-- ---------------------------------------------------------------------
create table if not exists public.fam_search_history (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,
  household_id  uuid not null,
  query         text not null check (char_length(query) between 1 and 120),
  filters       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  foreign key (household_id, user_id) references public.fam_household_members (household_id, user_id) on delete cascade
);
create index if not exists fam_search_history_user on public.fam_search_history (user_id, created_at desc);

-- ---------------------------------------------------------------------
-- Patrimônio: fotografias mensais (user_id nulo = visão da família)
-- ---------------------------------------------------------------------
create table if not exists public.fam_networth_snapshots (
  id                 uuid primary key default gen_random_uuid(),
  household_id       uuid not null references public.fam_households (id) on delete cascade,
  user_id            uuid references public.fam_profiles (id) on delete cascade,
  month              date not null check (extract(day from month) = 1),
  accounts_cents     bigint not null default 0,
  investments_cents  bigint not null default 0,
  debts_cents        bigint not null default 0,
  net_cents          bigint not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index if not exists fam_networth_unique
  on public.fam_networth_snapshots (household_id, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), month);

-- ---------------------------------------------------------------------
-- Preferências por perfil (tema etc.) e configurações da família
-- ---------------------------------------------------------------------
create table if not exists public.fam_profile_prefs (
  user_id          uuid primary key references public.fam_profiles (id) on delete cascade,
  theme_mode       text not null default 'dark' check (theme_mode in ('dark', 'light', 'auto')),
  auto_dark_start  smallint not null default 18 check (auto_dark_start between 0 and 23),
  auto_dark_end    smallint not null default 6 check (auto_dark_end between 0 and 23),
  comparison_mode  text not null default 'valores' check (comparison_mode in ('valores', 'percentuais')),
  daily_reminder   boolean not null default true,  -- lembrete diário no WhatsApp
  weekly_summary   boolean not null default true,  -- resumo semanal no WhatsApp
  updated_at       timestamptz not null default now()
);

create table if not exists public.fam_household_settings (
  household_id           uuid primary key references public.fam_households (id) on delete cascade,
  whatsapp_undo_minutes  smallint not null default 10 check (whatsapp_undo_minutes between 1 and 120),
  bill_alert_days        smallint not null default 3 check (bill_alert_days between 0 and 15),
  updated_at             timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.fam_bills               enable row level security;
alter table public.fam_goals               enable row level security;
alter table public.fam_goal_contributions  enable row level security;
alter table public.fam_search_history      enable row level security;
alter table public.fam_networth_snapshots  enable row level security;
alter table public.fam_profile_prefs       enable row level security;
alter table public.fam_household_settings  enable row level security;

revoke all on public.fam_bills, public.fam_goals, public.fam_goal_contributions, public.fam_search_history,
  public.fam_networth_snapshots, public.fam_profile_prefs, public.fam_household_settings from anon, authenticated;
grant all on public.fam_bills, public.fam_goals, public.fam_goal_contributions, public.fam_search_history,
  public.fam_networth_snapshots, public.fam_profile_prefs, public.fam_household_settings to service_role;

grant select, insert, update, delete on public.fam_bills to authenticated;
create policy fam_bills_select on public.fam_bills for select to authenticated
  using (public.fam_is_member(household_id) and (visibility = 'compartilhado' or owner_id = auth.uid()));
create policy fam_bills_insert on public.fam_bills for insert to authenticated
  with check (public.fam_is_member(household_id) and owner_id = auth.uid());
create policy fam_bills_update on public.fam_bills for update to authenticated
  using (owner_id = auth.uid() or (visibility = 'compartilhado' and public.fam_is_member(household_id)))
  with check (public.fam_is_member(household_id) and (owner_id = auth.uid() or visibility = 'compartilhado'));
create policy fam_bills_delete on public.fam_bills for delete to authenticated
  using (owner_id = auth.uid());

grant select, insert, update, delete on public.fam_goals to authenticated;
create policy fam_goals_select on public.fam_goals for select to authenticated
  using (public.fam_is_member(household_id) and (visibility = 'compartilhado' or owner_id = auth.uid()));
create policy fam_goals_insert on public.fam_goals for insert to authenticated
  with check (public.fam_is_member(household_id) and owner_id = auth.uid());
create policy fam_goals_update on public.fam_goals for update to authenticated
  using (owner_id = auth.uid()) with check (public.fam_is_member(household_id) and owner_id = auth.uid());
create policy fam_goals_delete on public.fam_goals for delete to authenticated
  using (owner_id = auth.uid());

grant select, insert, delete on public.fam_goal_contributions to authenticated;
create policy fam_goal_contrib_select on public.fam_goal_contributions for select to authenticated
  using (public.fam_can_see_goal(goal_id));
create policy fam_goal_contrib_insert on public.fam_goal_contributions for insert to authenticated
  with check (owner_id = auth.uid() and public.fam_is_member(household_id) and public.fam_can_see_goal(goal_id));
create policy fam_goal_contrib_delete on public.fam_goal_contributions for delete to authenticated
  using (owner_id = auth.uid());

grant select, insert, delete on public.fam_search_history to authenticated;
create policy fam_search_select on public.fam_search_history for select to authenticated
  using (user_id = auth.uid());
create policy fam_search_insert on public.fam_search_history for insert to authenticated
  with check (user_id = auth.uid() and public.fam_is_member(household_id));
create policy fam_search_delete on public.fam_search_history for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update on public.fam_networth_snapshots to authenticated;
create policy fam_networth_select on public.fam_networth_snapshots for select to authenticated
  using (public.fam_is_member(household_id) and (user_id is null or user_id = auth.uid()));
create policy fam_networth_insert on public.fam_networth_snapshots for insert to authenticated
  with check (public.fam_is_member(household_id) and (user_id is null or user_id = auth.uid()));
create policy fam_networth_update on public.fam_networth_snapshots for update to authenticated
  using (public.fam_is_member(household_id) and (user_id is null or user_id = auth.uid()))
  with check (public.fam_is_member(household_id) and (user_id is null or user_id = auth.uid()));

grant select, insert, update on public.fam_profile_prefs to authenticated;
create policy fam_prefs_select on public.fam_profile_prefs for select to authenticated
  using (user_id = auth.uid());
create policy fam_prefs_insert on public.fam_profile_prefs for insert to authenticated
  with check (user_id = auth.uid() and public.fam_current_household() is not null);
create policy fam_prefs_update on public.fam_profile_prefs for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update on public.fam_household_settings to authenticated;
create policy fam_hh_settings_select on public.fam_household_settings for select to authenticated
  using (public.fam_is_member(household_id));
create policy fam_hh_settings_insert on public.fam_household_settings for insert to authenticated
  with check (public.fam_is_owner(household_id));
create policy fam_hh_settings_update on public.fam_household_settings for update to authenticated
  using (public.fam_is_owner(household_id)) with check (public.fam_is_owner(household_id));
