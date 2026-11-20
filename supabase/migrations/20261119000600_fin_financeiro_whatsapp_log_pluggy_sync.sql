-- =====================================================================
-- Financeiro Família — log de mensagens do WhatsApp e ajustes para que a
-- importação do Open Finance rode com o CONTEXTO DO PRÓPRIO MEMBRO (RLS),
-- e não com service role. ADITIVA: apenas objetos fin_financeiro_ novos.
-- =====================================================================

-- Mensagens trocadas com o assistente (auditoria + simulador local).
create table if not exists public.fin_financeiro_whatsapp_messages (
  id            bigint generated always as identity primary key,
  household_id  uuid references public.fin_financeiro_households (id) on delete cascade,
  user_id       uuid references public.fin_financeiro_profiles (id) on delete cascade,
  direction     text not null check (direction in ('in', 'out')),
  phone_e164    text not null,
  body          text not null check (char_length(body) <= 4096),
  provider      text not null check (provider in ('evolution', 'meta', 'simulator')),
  status        text not null default 'ok' check (status in ('ok', 'erro', 'ignorado')),
  error         text,
  created_at    timestamptz not null default now()
);
create index if not exists fin_financeiro_whatsapp_messages_user on public.fin_financeiro_whatsapp_messages (user_id, created_at desc);

alter table public.fin_financeiro_whatsapp_messages enable row level security;
revoke all on public.fin_financeiro_whatsapp_messages from anon, authenticated;
grant all on public.fin_financeiro_whatsapp_messages to service_role;
grant select on public.fin_financeiro_whatsapp_messages to authenticated;
-- cada membro vê apenas a própria conversa
create policy fin_financeiro_wa_messages_select on public.fin_financeiro_whatsapp_messages for select to authenticated
  using (user_id = auth.uid() and public.fin_financeiro_is_member(household_id));

-- Sincronização Pluggy executada como o dono do item
grant update (status, last_sync_at, last_error, connector_name) on public.fin_financeiro_pluggy_items to authenticated;
create policy fin_financeiro_pluggy_update on public.fin_financeiro_pluggy_items for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Documentos de fatura: o dono atualiza apenas o resultado do processamento
grant update (parsed_items, parse_error) on public.fin_financeiro_invoice_documents to authenticated;
create policy fin_financeiro_invoice_documents_update on public.fin_financeiro_invoice_documents for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
