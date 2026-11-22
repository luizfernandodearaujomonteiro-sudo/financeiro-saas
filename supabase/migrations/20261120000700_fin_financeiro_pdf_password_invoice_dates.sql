-- =====================================================================
-- Financeiro Família — revisão 1: senha de PDF por perfil (cifrada) e
-- recálculo de datas de faturas abertas quando o ciclo do cartão muda.
-- ADITIVA: apenas objetos fin_financeiro_.
-- =====================================================================

-- Senha dos PDFs de fatura (muitos bancos protegem com CPF), por perfil.
-- Valor cifrado na aplicação (AES-256-GCM, TOKEN_ENCRYPTION_KEY). Sem acesso
-- para anon/authenticated: gravação/remoção só via RPC do próprio usuário;
-- leitura só pelo job do Gmail (service_role).
create table if not exists public.fin_financeiro_pdf_passwords (
  user_id       uuid primary key references public.fin_financeiro_profiles (id) on delete cascade,
  password_enc  text not null,
  updated_at    timestamptz not null default now()
);
alter table public.fin_financeiro_pdf_passwords enable row level security;
revoke all on public.fin_financeiro_pdf_passwords from anon, authenticated;
grant all on public.fin_financeiro_pdf_passwords to service_role;

create or replace function public.fin_financeiro_set_pdf_password(p_password_enc text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.fin_financeiro_current_household() is null then
    raise exception 'fin_financeiro: usuário sem família' using errcode = '42501';
  end if;
  if p_password_enc is null or p_password_enc = '' then
    delete from public.fin_financeiro_pdf_passwords where user_id = auth.uid();
  else
    insert into public.fin_financeiro_pdf_passwords (user_id, password_enc, updated_at) values (auth.uid(), p_password_enc, now())
      on conflict (user_id) do update set password_enc = excluded.password_enc, updated_at = now();
  end if;
end $$;

create or replace function public.fin_financeiro_has_pdf_password()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.fin_financeiro_pdf_passwords where user_id = auth.uid())
$$;

-- Ajusta fechamento/vencimento de UMA fatura ABERTA, do mês corrente em diante,
-- de um cartão do próprio usuário (usado quando o ciclo do cartão muda).
-- Faturas passadas, fechadas ou pagas não são alteradas.
create or replace function public.fin_financeiro_set_invoice_dates(p_invoice uuid, p_closing date, p_due date, p_current_month date)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_ok boolean;
begin
  if p_due < p_closing then
    raise exception 'fin_financeiro: vencimento antes do fechamento';
  end if;
  update public.fin_financeiro_invoices i
     set closing_date = p_closing, due_date = p_due
    from public.fin_financeiro_cards c
   where i.id = p_invoice and c.id = i.card_id and c.owner_id = auth.uid()
     and i.status = 'aberta' and i.reference_month >= p_current_month
  returning true into v_ok;
  return coalesce(v_ok, false);
end $$;

revoke execute on function public.fin_financeiro_set_pdf_password(text), public.fin_financeiro_has_pdf_password(),
  public.fin_financeiro_set_invoice_dates(uuid, date, date, date) from public, anon;
grant execute on function public.fin_financeiro_set_pdf_password(text), public.fin_financeiro_has_pdf_password(),
  public.fin_financeiro_set_invoice_dates(uuid, date, date, date) to authenticated;
