-- =====================================================================
-- Financeiro Família — funções, triggers e RPCs (prefixo fam_)
-- Todas as funções SECURITY DEFINER fixam search_path = '' e qualificam
-- nomes. EXECUTE é revogado de PUBLIC e concedido explicitamente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helpers de pertencimento (usados pelas políticas RLS)
-- ---------------------------------------------------------------------
create or replace function public.fam_current_household()
returns uuid language sql stable security definer set search_path = '' as $$
  select m.household_id from public.fam_household_members m where m.user_id = auth.uid()
$$;

create or replace function public.fam_is_member(p_household uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.fam_household_members m
    where m.household_id = p_household and m.user_id = auth.uid()
  )
$$;

create or replace function public.fam_is_owner(p_household uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.fam_household_members m
    where m.household_id = p_household and m.user_id = auth.uid() and m.role = 'owner'
  )
$$;

create or replace function public.fam_shares_household(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.fam_household_members me
    join public.fam_household_members other on other.household_id = me.household_id
    where me.user_id = auth.uid() and other.user_id = p_user
  )
$$;

create or replace function public.fam_can_see_card(p_card uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.fam_cards c
    join public.fam_household_members m on m.household_id = c.household_id and m.user_id = auth.uid()
    where c.id = p_card and (c.visibility = 'compartilhado' or c.owner_id = auth.uid())
  )
$$;

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------
create or replace function public.fam_touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Garante coerência de lançamento: mês de orçamento, cartão/fatura/conta
-- visíveis ao dono do lançamento e pertencentes à mesma família.
create or replace function public.fam_entries_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
  v_vis text;
  v_card uuid;
begin
  if new.budget_month is null then
    new.budget_month := date_trunc('month', new.occurred_on)::date;
  end if;

  if new.card_id is not null then
    select c.owner_id, c.visibility into v_owner, v_vis
      from public.fam_cards c where c.id = new.card_id and c.household_id = new.household_id;
    if not found or (v_owner <> new.owner_id and v_vis <> 'compartilhado') then
      raise exception 'fam: cartão não disponível para este usuário' using errcode = '42501';
    end if;
  end if;

  if new.invoice_id is not null then
    select i.card_id into v_card from public.fam_invoices i where i.id = new.invoice_id;
    if v_card is distinct from new.card_id then
      raise exception 'fam: fatura não pertence ao cartão do lançamento' using errcode = '23514';
    end if;
  end if;

  if new.bank_account_id is not null then
    select a.owner_id, a.visibility into v_owner, v_vis
      from public.fam_bank_accounts a where a.id = new.bank_account_id and a.household_id = new.household_id;
    if not found or (v_owner <> new.owner_id and v_vis <> 'compartilhado') then
      raise exception 'fam: conta não disponível para este usuário' using errcode = '42501';
    end if;
  end if;

  if new.purchase_id is not null then
    select p.owner_id into v_owner from public.fam_card_purchases p where p.id = new.purchase_id;
    if v_owner is distinct from new.owner_id then
      raise exception 'fam: compra pertence a outro usuário' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end $$;

create or replace function public.fam_card_purchases_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
  v_vis text;
begin
  select c.owner_id, c.visibility into v_owner, v_vis
    from public.fam_cards c where c.id = new.card_id and c.household_id = new.household_id;
  if not found or (v_owner <> new.owner_id and v_vis <> 'compartilhado') then
    raise exception 'fam: cartão não disponível para este usuário' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function public.fam_recompute_invoice_total(p_invoice uuid)
returns void language sql security definer set search_path = '' as $$
  update public.fam_invoices i
     set total_cents = coalesce((
       select sum(case when e.kind = 'despesa' then e.amount_cents else -e.amount_cents end)
         from public.fam_entries e where e.invoice_id = p_invoice
     ), 0)
   where i.id = p_invoice
$$;

create or replace function public.fam_entries_invoice_total()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.invoice_id is not null then
    perform public.fam_recompute_invoice_total(old.invoice_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.invoice_id is not null
     and (tg_op = 'INSERT' or new.invoice_id is distinct from old.invoice_id
          or new.amount_cents <> old.amount_cents or new.kind <> old.kind) then
    perform public.fam_recompute_invoice_total(new.invoice_id);
  end if;
  return null;
end $$;

drop trigger if exists fam_entries_guard_trg on public.fam_entries;
create trigger fam_entries_guard_trg
  before insert or update on public.fam_entries
  for each row execute function public.fam_entries_guard();

drop trigger if exists fam_entries_invoice_total_trg on public.fam_entries;
create trigger fam_entries_invoice_total_trg
  after insert or update or delete on public.fam_entries
  for each row execute function public.fam_entries_invoice_total();

drop trigger if exists fam_card_purchases_guard_trg on public.fam_card_purchases;
create trigger fam_card_purchases_guard_trg
  before insert or update on public.fam_card_purchases
  for each row execute function public.fam_card_purchases_guard();

-- ---------------------------------------------------------------------
-- Categorias padrão (interna)
-- ---------------------------------------------------------------------
create or replace function public.fam_seed_default_categories(p_household uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.fam_categories (household_id, name, kind, color) values
    (p_household, 'Salário', 'receita', '#16a34a'),
    (p_household, 'Freelance', 'receita', '#22c55e'),
    (p_household, 'Rendimentos', 'receita', '#14b8a6'),
    (p_household, 'Outras receitas', 'receita', '#0d9488'),
    (p_household, 'Moradia', 'despesa', '#ef4444'),
    (p_household, 'Contas da casa', 'despesa', '#f97316'),
    (p_household, 'Mercado', 'despesa', '#f59e0b'),
    (p_household, 'Restaurantes', 'despesa', '#eab308'),
    (p_household, 'Transporte', 'despesa', '#84cc16'),
    (p_household, 'Saúde', 'despesa', '#06b6d4'),
    (p_household, 'Educação', 'despesa', '#3b82f6'),
    (p_household, 'Lazer', 'despesa', '#8b5cf6'),
    (p_household, 'Assinaturas', 'despesa', '#a855f7'),
    (p_household, 'Vestuário', 'despesa', '#ec4899'),
    (p_household, 'Pets', 'despesa', '#f43f5e'),
    (p_household, 'Impostos e taxas', 'despesa', '#64748b'),
    (p_household, 'Outras despesas', 'despesa', '#6366f1')
  on conflict do nothing
$$;

-- ---------------------------------------------------------------------
-- Bootstrap pelo dono (SOMENTE service role / script local)
-- auth.users é compartilhado: NADA é criado automaticamente no signup.
-- ---------------------------------------------------------------------
create or replace function public.fam_bootstrap_household(p_owner uuid, p_household_name text, p_display_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_household uuid;
begin
  if exists (select 1 from public.fam_household_members where user_id = p_owner) then
    raise exception 'fam: usuário já pertence a uma família';
  end if;
  insert into public.fam_profiles (id, display_name) values (p_owner, p_display_name)
    on conflict (id) do update set display_name = excluded.display_name;
  insert into public.fam_households (name) values (p_household_name) returning id into v_household;
  insert into public.fam_household_members (household_id, user_id, role) values (v_household, p_owner, 'owner');
  perform public.fam_seed_default_categories(v_household);
  return v_household;
end $$;

create or replace function public.fam_bootstrap_add_member(p_household uuid, p_user uuid, p_display_name text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.fam_household_members where household_id = p_household) >= 2 then
    raise exception 'fam: família já tem 2 membros';
  end if;
  insert into public.fam_profiles (id, display_name) values (p_user, p_display_name)
    on conflict (id) do update set display_name = excluded.display_name;
  insert into public.fam_household_members (household_id, user_id, role) values (p_household, p_user, 'member');
end $$;

-- ---------------------------------------------------------------------
-- Convites (dono cria; convidado logado aceita)
-- ---------------------------------------------------------------------
create or replace function public.fam_create_invite()
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_household uuid := public.fam_current_household();
  v_token text;
begin
  if v_household is null or not public.fam_is_owner(v_household) then
    raise exception 'fam: apenas o dono da família pode convidar' using errcode = '42501';
  end if;
  if (select count(*) from public.fam_household_members where household_id = v_household) >= 2 then
    raise exception 'fam: família já tem 2 membros';
  end if;
  -- invalida convites anteriores ainda pendentes
  delete from public.fam_household_invites where household_id = v_household and accepted_at is null;
  v_token := encode(sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text || clock_timestamp()::text, 'UTF8')), 'hex');
  insert into public.fam_household_invites (household_id, token_hash, created_by, expires_at)
    values (v_household, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), auth.uid(), now() + interval '7 days');
  return v_token;
end $$;

create or replace function public.fam_invite_info(p_token text)
returns text language sql stable security definer set search_path = '' as $$
  select h.name
    from public.fam_household_invites i
    join public.fam_households h on h.id = i.household_id
   where i.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
     and i.accepted_at is null and i.expires_at > now()
$$;

create or replace function public.fam_accept_invite(p_token text, p_display_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_invite public.fam_household_invites%rowtype;
begin
  if auth.uid() is null then
    raise exception 'fam: login necessário' using errcode = '42501';
  end if;
  if exists (select 1 from public.fam_household_members where user_id = auth.uid()) then
    raise exception 'fam: usuário já pertence a uma família';
  end if;
  select * into v_invite from public.fam_household_invites
   where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
     and accepted_at is null and expires_at > now()
   for update;
  if not found then
    raise exception 'fam: convite inválido ou expirado' using errcode = '42501';
  end if;
  if (select count(*) from public.fam_household_members where household_id = v_invite.household_id) >= 2 then
    raise exception 'fam: família já tem 2 membros';
  end if;
  insert into public.fam_profiles (id, display_name) values (auth.uid(), p_display_name)
    on conflict (id) do update set display_name = excluded.display_name;
  insert into public.fam_household_members (household_id, user_id, role)
    values (v_invite.household_id, auth.uid(), 'member');
  update public.fam_household_invites set accepted_by = auth.uid(), accepted_at = now() where id = v_invite.id;
  return v_invite.household_id;
end $$;

-- ---------------------------------------------------------------------
-- Limite de tentativas de login (chave = HMAC calculado no servidor)
-- ---------------------------------------------------------------------
create or replace function public.fam_login_failures(p_key text, p_window_seconds integer)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.fam_login_attempts
   where key_hash = p_key and success = false
     and created_at > now() - make_interval(secs => least(greatest(p_window_seconds, 1), 86400))
$$;

create or replace function public.fam_record_login_attempt(p_key text, p_success boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_key is null or char_length(p_key) <> 64 then
    raise exception 'fam: chave inválida';
  end if;
  insert into public.fam_login_attempts (key_hash, success) values (p_key, p_success);
  if p_success then
    delete from public.fam_login_attempts where key_hash = p_key and success = false;
  end if;
  delete from public.fam_login_attempts where created_at < now() - interval '2 days';
end $$;

-- ---------------------------------------------------------------------
-- Gmail
-- ---------------------------------------------------------------------
create or replace function public.fam_store_gmail_token(p_refresh_token_enc text, p_email text, p_scope text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.fam_current_household() is null then
    raise exception 'fam: usuário sem família' using errcode = '42501';
  end if;
  insert into public.fam_oauth_tokens (user_id, provider, refresh_token_enc, scope, updated_at)
    values (auth.uid(), 'gmail', p_refresh_token_enc, p_scope, now())
    on conflict (user_id, provider) do update
      set refresh_token_enc = excluded.refresh_token_enc, scope = excluded.scope, updated_at = now();
  insert into public.fam_gmail_connections (user_id, email, status, last_error)
    values (auth.uid(), p_email, 'conectado', null)
    on conflict (user_id) do update set email = excluded.email, status = 'conectado', last_error = null;
end $$;

create or replace function public.fam_disconnect_gmail()
returns void language sql security definer set search_path = '' as $$
  delete from public.fam_oauth_tokens where user_id = auth.uid() and provider = 'gmail';
  update public.fam_gmail_connections set status = 'desconectado' where user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- WhatsApp
-- ---------------------------------------------------------------------
create or replace function public.fam_set_member_phone(p_user uuid, p_phone text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_household uuid := public.fam_current_household();
begin
  if v_household is null then
    raise exception 'fam: usuário sem família' using errcode = '42501';
  end if;
  if p_user <> auth.uid() and not public.fam_is_owner(v_household) then
    raise exception 'fam: apenas o dono pode definir o telefone de outro membro' using errcode = '42501';
  end if;
  if not exists (select 1 from public.fam_household_members where household_id = v_household and user_id = p_user) then
    raise exception 'fam: usuário não é membro desta família' using errcode = '42501';
  end if;
  if p_phone is null or p_phone = '' then
    delete from public.fam_whatsapp_numbers where user_id = p_user;
  else
    insert into public.fam_whatsapp_numbers (user_id, household_id, phone_e164)
      values (p_user, v_household, p_phone)
      on conflict (user_id) do update set phone_e164 = excluded.phone_e164;
  end if;
end $$;

create or replace function public.fam_set_whatsapp_secrets(p_evolution_token_enc text, p_meta_access_token_enc text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_household uuid := public.fam_current_household();
begin
  if v_household is null or not public.fam_is_owner(v_household) then
    raise exception 'fam: apenas o dono pode alterar segredos' using errcode = '42501';
  end if;
  insert into public.fam_whatsapp_secrets (household_id, evolution_token_enc, meta_access_token_enc, updated_at)
    values (v_household, p_evolution_token_enc, p_meta_access_token_enc, now())
    on conflict (household_id) do update set
      evolution_token_enc = coalesce(excluded.evolution_token_enc, public.fam_whatsapp_secrets.evolution_token_enc),
      meta_access_token_enc = coalesce(excluded.meta_access_token_enc, public.fam_whatsapp_secrets.meta_access_token_enc),
      updated_at = now();
end $$;

-- Retorna somente os textos CIFRADOS (decifrados no servidor, nunca enviados ao navegador)
create or replace function public.fam_get_whatsapp_secrets()
returns table (evolution_token_enc text, meta_access_token_enc text)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_household uuid := public.fam_current_household();
begin
  if v_household is null or not public.fam_is_owner(v_household) then
    raise exception 'fam: apenas o dono pode ler segredos' using errcode = '42501';
  end if;
  return query select s.evolution_token_enc, s.meta_access_token_enc
                 from public.fam_whatsapp_secrets s where s.household_id = v_household;
end $$;

-- ---------------------------------------------------------------------
-- Privilégios de execução
-- ---------------------------------------------------------------------
revoke execute on function
  public.fam_current_household(), public.fam_is_member(uuid), public.fam_is_owner(uuid),
  public.fam_shares_household(uuid), public.fam_can_see_card(uuid),
  public.fam_touch_updated_at(), public.fam_entries_guard(), public.fam_card_purchases_guard(),
  public.fam_recompute_invoice_total(uuid), public.fam_entries_invoice_total(),
  public.fam_seed_default_categories(uuid),
  public.fam_bootstrap_household(uuid, text, text), public.fam_bootstrap_add_member(uuid, uuid, text),
  public.fam_create_invite(), public.fam_invite_info(text), public.fam_accept_invite(text, text),
  public.fam_login_failures(text, integer), public.fam_record_login_attempt(text, boolean),
  public.fam_store_gmail_token(text, text, text), public.fam_disconnect_gmail(),
  public.fam_set_member_phone(uuid, text), public.fam_set_whatsapp_secrets(text, text),
  public.fam_get_whatsapp_secrets()
from public, anon, authenticated;

grant execute on function
  public.fam_current_household(), public.fam_is_member(uuid), public.fam_is_owner(uuid),
  public.fam_shares_household(uuid), public.fam_can_see_card(uuid),
  public.fam_create_invite(), public.fam_invite_info(text), public.fam_accept_invite(text, text),
  public.fam_store_gmail_token(text, text, text), public.fam_disconnect_gmail(),
  public.fam_set_member_phone(uuid, text), public.fam_set_whatsapp_secrets(text, text),
  public.fam_get_whatsapp_secrets()
to authenticated;

grant execute on function
  public.fam_invite_info(text), public.fam_login_failures(text, integer), public.fam_record_login_attempt(text, boolean)
to anon, authenticated;

grant execute on function
  public.fam_bootstrap_household(uuid, text, text), public.fam_bootstrap_add_member(uuid, uuid, text),
  public.fam_seed_default_categories(uuid), public.fam_recompute_invoice_total(uuid)
to service_role;
