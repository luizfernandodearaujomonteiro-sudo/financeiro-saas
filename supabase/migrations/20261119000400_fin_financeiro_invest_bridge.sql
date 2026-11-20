-- =====================================================================
-- Financeiro Família — ponte SOMENTE LEITURA para o app invest-tracker
--
-- Lê as tabelas existentes invest_profiles / invest_holdings / invest_assets /
-- invest_brokers / invest_price_cache / invest_transactions. NÃO cria, altera
-- ou escreve em nenhuma tabela invest_*.
--
-- Vínculo: invest_profiles.id = auth.users.id. Como auth.users é compartilhado,
-- o membro vincula o PRÓPRIO invest_profile (mesmo login). A prova de posse é
-- invest_profile_id = auth.uid(). Ele escolhe 'pessoal' ou 'compartilhado'.
--
-- Funções em plpgsql: o corpo só é resolvido em tempo de execução, então a
-- migration aplica mesmo que o esquema invest_* mude; nesse caso só a consulta falha.
-- Valores numeric são devolvidos como TEXTO para evitar float no cliente.
-- =====================================================================

create or replace function public.fin_financeiro_link_invest_profile(p_visibility text default 'pessoal')
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_household uuid := public.fin_financeiro_current_household();
  v_exists boolean;
begin
  if v_household is null then
    raise exception 'fin_financeiro: usuário sem família' using errcode = '42501';
  end if;
  if p_visibility not in ('pessoal', 'compartilhado') then
    raise exception 'fin_financeiro: visibilidade inválida';
  end if;
  execute 'select exists (select 1 from public.invest_profiles where id = $1)' into v_exists using auth.uid();
  if not v_exists then
    return false;
  end if;
  insert into public.fin_financeiro_invest_links (user_id, household_id, invest_profile_id, visibility)
    values (auth.uid(), v_household, auth.uid(), p_visibility)
    on conflict (user_id) do update set visibility = excluded.visibility;
  return true;
end $$;

create or replace function public.fin_financeiro_invest_positions()
returns table (
  owner_id uuid, owner_name text, holding_id uuid, ticker text, asset_name text, asset_type text,
  currency text, broker_name text, total_quantity text, average_price text, total_invested text,
  current_price text, price_fetched_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_household uuid := public.fin_financeiro_current_household();
begin
  if v_household is null then
    return;
  end if;
  return query
    select l.user_id, p.display_name, h.id, a.ticker::text, a.name::text, a.asset_type::text,
           a.currency::text, b.name::text, h.total_quantity::text, h.average_price::text,
           h.total_invested::text, pc.current_price::text, pc.fetched_at
      from public.fin_financeiro_invest_links l
      join public.fin_financeiro_profiles p on p.id = l.user_id
      join public.invest_holdings h on h.user_id = l.invest_profile_id
      join public.invest_assets a on a.id = h.asset_id
      left join public.invest_brokers b on b.id = h.broker_id
      left join public.invest_price_cache pc on pc.asset_id = h.asset_id
     where l.household_id = v_household
       and (l.user_id = auth.uid() or l.visibility = 'compartilhado')
     order by p.display_name, a.ticker;
end $$;

create or replace function public.fin_financeiro_invest_transactions()
returns table (holding_id uuid, type text, quantity text, total_value text, fees text, executed_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_household uuid := public.fin_financeiro_current_household();
begin
  if v_household is null then
    return;
  end if;
  return query
    select t.holding_id, t.type::text, t.quantity::text, t.total_value::text,
           coalesce(t.fees, 0)::text, t.executed_at
      from public.fin_financeiro_invest_links l
      join public.invest_transactions t on t.user_id = l.invest_profile_id
     where l.household_id = v_household
       and (l.user_id = auth.uid() or l.visibility = 'compartilhado')
     order by t.executed_at;
end $$;

revoke execute on function public.fin_financeiro_link_invest_profile(text), public.fin_financeiro_invest_positions(), public.fin_financeiro_invest_transactions()
  from public, anon;
grant execute on function public.fin_financeiro_link_invest_profile(text), public.fin_financeiro_invest_positions(), public.fin_financeiro_invest_transactions()
  to authenticated;
