-- =====================================================================
-- Financeiro Família — log de mensagens do WhatsApp e ajustes para que a
-- importação do Open Finance rode com o CONTEXTO DO PRÓPRIO MEMBRO (RLS),
-- e não com service role. ADITIVA: apenas objetos fam_ novos.
-- =====================================================================

-- Mensagens trocadas com o assistente (auditoria + simulador local).
create table if not exists public.fam_whatsapp_messages (
  id            bigint generated always as identity primary key,
  household_id  uuid references public.fam_households (id) on delete cascade,
  user_id       uuid references public.fam_profiles (id) on delete cascade,
  direction     text not null check (direction in ('in', 'out')),
  phone_e164    text not null,
  body          text not null check (char_length(body) <= 4096),
  provider      text not null check (provider in ('evolution', 'meta', 'simulator')),
  status        text not null default 'ok' check (status in ('ok', 'erro', 'ignorado')),
  error         text,
  created_at    timestamptz not null default now()
);
create index if not exists fam_whatsapp_messages_user on public.fam_whatsapp_messages (user_id, created_at desc);

alter table public.fam_whatsapp_messages enable row level security;
revoke all on public.fam_whatsapp_messages from anon, authenticated;
grant all on public.fam_whatsapp_messages to service_role;
grant select on public.fam_whatsapp_messages to authenticated;
-- cada membro vê apenas a própria conversa
create policy fam_wa_messages_select on public.fam_whatsapp_messages for select to authenticated
  using (user_id = auth.uid() and public.fam_is_member(household_id));

-- Sincronização Pluggy executada como o dono do item
grant update (status, last_sync_at, last_error, connector_name) on public.fam_pluggy_items to authenticated;
create policy fam_pluggy_update on public.fam_pluggy_items for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
