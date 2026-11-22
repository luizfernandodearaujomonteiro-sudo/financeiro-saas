-- =====================================================================
-- Financeiro Família — onboarding pelo próprio app ("Criar minha família").
-- ADITIVA: só cria uma função nova no schema fin_financeiro_private.
--
-- Um usuário LOGADO que ainda não pertence a nenhuma família cria a sua e vira
-- dono (owner). Mesmo efeito de fin_financeiro_bootstrap_household + configurações
-- da família + categorias padrão, numa única chamada atômica.
--
-- Fica no schema fin_financeiro_private (não exposto pela Data API do Supabase):
-- como o auth.users é compartilhado com outros apps, usuários desses apps não
-- conseguem chamá-la pela API REST; só o painel (como `authenticated`) a usa.
-- =====================================================================

create or replace function fin_financeiro_private.fin_financeiro_create_my_household(p_name text, p_display_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_display text := btrim(coalesce(p_display_name, ''));
  v_household uuid;
begin
  if v_uid is null then
    raise exception 'fin_financeiro: login necessário' using errcode = '42501';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 80 then
    raise exception 'fin_financeiro: o nome da família deve ter de 1 a 80 caracteres' using errcode = '22023';
  end if;
  if char_length(v_display) < 1 or char_length(v_display) > 60 then
    raise exception 'fin_financeiro: seu nome deve ter de 1 a 60 caracteres' using errcode = '22023';
  end if;

  -- serializa chamadas simultâneas do mesmo usuário (além do unique(user_id) dos membros)
  perform pg_advisory_xact_lock(hashtextextended('fin_financeiro_onboarding:' || v_uid::text, 0));
  if exists (select 1 from public.fin_financeiro_household_members where user_id = v_uid) then
    raise exception 'fin_financeiro: usuário já pertence a uma família' using errcode = '42501';
  end if;

  insert into public.fin_financeiro_profiles (id, display_name) values (v_uid, v_display)
    on conflict (id) do update set display_name = excluded.display_name;
  insert into public.fin_financeiro_households (name) values (v_name) returning id into v_household;
  insert into public.fin_financeiro_household_members (household_id, user_id, role) values (v_household, v_uid, 'owner');
  perform public.fin_financeiro_seed_default_categories(v_household);
  insert into public.fin_financeiro_household_settings (household_id) values (v_household) on conflict (household_id) do nothing;
  return v_household;
end $$;

revoke execute on function fin_financeiro_private.fin_financeiro_create_my_household(text, text) from public, anon;
grant execute on function fin_financeiro_private.fin_financeiro_create_my_household(text, text) to authenticated;
