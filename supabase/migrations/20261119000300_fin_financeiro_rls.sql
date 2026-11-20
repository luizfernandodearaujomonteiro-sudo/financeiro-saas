-- =====================================================================
-- Financeiro Família — Row Level Security (prefixo fin_financeiro_)
--
-- Regra geral: um usuário só enxerga dados por meio de fin_financeiro_household_members.
-- Ter conta em auth.users (compartilhado com outros apps) não dá acesso a nada.
-- Lançamentos/contas/cartões: 'compartilhado' = família vê; 'pessoal' = só o dono.
-- anon não recebe privilégio em nenhuma tabela fin_financeiro_.
-- =====================================================================

-- Habilita RLS em TODAS as tabelas fin_financeiro_
alter table public.fin_financeiro_households         enable row level security;
alter table public.fin_financeiro_profiles           enable row level security;
alter table public.fin_financeiro_household_members  enable row level security;
alter table public.fin_financeiro_household_invites  enable row level security;
alter table public.fin_financeiro_categories         enable row level security;
alter table public.fin_financeiro_bank_accounts      enable row level security;
alter table public.fin_financeiro_cards              enable row level security;
alter table public.fin_financeiro_invoices           enable row level security;
alter table public.fin_financeiro_card_purchases     enable row level security;
alter table public.fin_financeiro_entries            enable row level security;
alter table public.fin_financeiro_invoice_documents  enable row level security;
alter table public.fin_financeiro_review_queue       enable row level security;
alter table public.fin_financeiro_gmail_connections  enable row level security;
alter table public.fin_financeiro_oauth_tokens       enable row level security;
alter table public.fin_financeiro_pluggy_items       enable row level security;
alter table public.fin_financeiro_whatsapp_config    enable row level security;
alter table public.fin_financeiro_whatsapp_secrets   enable row level security;
alter table public.fin_financeiro_whatsapp_numbers   enable row level security;
alter table public.fin_financeiro_whatsapp_inbound   enable row level security;
alter table public.fin_financeiro_notification_log   enable row level security;
alter table public.fin_financeiro_login_attempts     enable row level security;
alter table public.fin_financeiro_invest_links       enable row level security;

-- Zera privilégios herdados (default privileges do Supabase) para anon/authenticated
revoke all on
  public.fin_financeiro_households, public.fin_financeiro_profiles, public.fin_financeiro_household_members, public.fin_financeiro_household_invites,
  public.fin_financeiro_categories, public.fin_financeiro_bank_accounts, public.fin_financeiro_cards, public.fin_financeiro_invoices,
  public.fin_financeiro_card_purchases, public.fin_financeiro_entries, public.fin_financeiro_invoice_documents, public.fin_financeiro_review_queue,
  public.fin_financeiro_gmail_connections, public.fin_financeiro_oauth_tokens, public.fin_financeiro_pluggy_items, public.fin_financeiro_whatsapp_config,
  public.fin_financeiro_whatsapp_secrets, public.fin_financeiro_whatsapp_numbers, public.fin_financeiro_whatsapp_inbound,
  public.fin_financeiro_notification_log, public.fin_financeiro_login_attempts, public.fin_financeiro_invest_links
from anon, authenticated;

-- service_role (jobs/webhooks) tem acesso total; já ignora RLS no Supabase.
grant all on
  public.fin_financeiro_households, public.fin_financeiro_profiles, public.fin_financeiro_household_members, public.fin_financeiro_household_invites,
  public.fin_financeiro_categories, public.fin_financeiro_bank_accounts, public.fin_financeiro_cards, public.fin_financeiro_invoices,
  public.fin_financeiro_card_purchases, public.fin_financeiro_entries, public.fin_financeiro_invoice_documents, public.fin_financeiro_review_queue,
  public.fin_financeiro_gmail_connections, public.fin_financeiro_oauth_tokens, public.fin_financeiro_pluggy_items, public.fin_financeiro_whatsapp_config,
  public.fin_financeiro_whatsapp_secrets, public.fin_financeiro_whatsapp_numbers, public.fin_financeiro_whatsapp_inbound,
  public.fin_financeiro_notification_log, public.fin_financeiro_login_attempts, public.fin_financeiro_invest_links
to service_role;

-- ---------------------------------------------------------------------
-- Famílias / perfis / membros / convites
-- ---------------------------------------------------------------------
grant select on public.fin_financeiro_households to authenticated;
grant update (name) on public.fin_financeiro_households to authenticated;
create policy fin_financeiro_households_select on public.fin_financeiro_households
  for select to authenticated using (public.fin_financeiro_is_member(id));
create policy fin_financeiro_households_update on public.fin_financeiro_households
  for update to authenticated using (public.fin_financeiro_is_owner(id)) with check (public.fin_financeiro_is_owner(id));

grant select on public.fin_financeiro_profiles to authenticated;
grant update (display_name) on public.fin_financeiro_profiles to authenticated;
create policy fin_financeiro_profiles_select on public.fin_financeiro_profiles
  for select to authenticated using (id = auth.uid() or public.fin_financeiro_shares_household(id));
create policy fin_financeiro_profiles_update on public.fin_financeiro_profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Membros: somente leitura. Inserções SOMENTE via RPC (convite/bootstrap).
grant select on public.fin_financeiro_household_members to authenticated;
create policy fin_financeiro_members_select on public.fin_financeiro_household_members
  for select to authenticated using (public.fin_financeiro_is_member(household_id));

grant select on public.fin_financeiro_household_invites to authenticated;
create policy fin_financeiro_invites_select on public.fin_financeiro_household_invites
  for select to authenticated using (public.fin_financeiro_is_owner(household_id));

-- ---------------------------------------------------------------------
-- Categorias (recurso compartilhado da família)
-- ---------------------------------------------------------------------
grant select, insert, update, delete on public.fin_financeiro_categories to authenticated;
create policy fin_financeiro_categories_select on public.fin_financeiro_categories
  for select to authenticated using (public.fin_financeiro_is_member(household_id));
create policy fin_financeiro_categories_insert on public.fin_financeiro_categories
  for insert to authenticated with check (public.fin_financeiro_is_member(household_id));
create policy fin_financeiro_categories_update on public.fin_financeiro_categories
  for update to authenticated using (public.fin_financeiro_is_member(household_id)) with check (public.fin_financeiro_is_member(household_id));
create policy fin_financeiro_categories_delete on public.fin_financeiro_categories
  for delete to authenticated using (public.fin_financeiro_is_member(household_id));

-- ---------------------------------------------------------------------
-- Tabelas com dono + visibilidade
-- ---------------------------------------------------------------------
-- Contas bancárias
grant select, insert, update, delete on public.fin_financeiro_bank_accounts to authenticated;
create policy fin_financeiro_bank_accounts_select on public.fin_financeiro_bank_accounts for select to authenticated
  using (public.fin_financeiro_is_member(household_id) and (visibility = 'compartilhado' or owner_id = auth.uid()));
create policy fin_financeiro_bank_accounts_insert on public.fin_financeiro_bank_accounts for insert to authenticated
  with check (public.fin_financeiro_is_member(household_id) and owner_id = auth.uid());
create policy fin_financeiro_bank_accounts_update on public.fin_financeiro_bank_accounts for update to authenticated
  using (owner_id = auth.uid()) with check (public.fin_financeiro_is_member(household_id) and owner_id = auth.uid());
create policy fin_financeiro_bank_accounts_delete on public.fin_financeiro_bank_accounts for delete to authenticated
  using (owner_id = auth.uid());

-- Cartões
grant select, insert, update, delete on public.fin_financeiro_cards to authenticated;
create policy fin_financeiro_cards_select on public.fin_financeiro_cards for select to authenticated
  using (public.fin_financeiro_is_member(household_id) and (visibility = 'compartilhado' or owner_id = auth.uid()));
create policy fin_financeiro_cards_insert on public.fin_financeiro_cards for insert to authenticated
  with check (public.fin_financeiro_is_member(household_id) and owner_id = auth.uid());
create policy fin_financeiro_cards_update on public.fin_financeiro_cards for update to authenticated
  using (owner_id = auth.uid()) with check (public.fin_financeiro_is_member(household_id) and owner_id = auth.uid());
create policy fin_financeiro_cards_delete on public.fin_financeiro_cards for delete to authenticated
  using (owner_id = auth.uid());

-- Faturas: visíveis se o cartão é visível. total_cents só muda via trigger.
grant select, delete on public.fin_financeiro_invoices to authenticated;
grant insert (household_id, card_id, reference_month, closing_date, due_date) on public.fin_financeiro_invoices to authenticated;
grant update (status, paid_at) on public.fin_financeiro_invoices to authenticated;
create policy fin_financeiro_invoices_select on public.fin_financeiro_invoices for select to authenticated
  using (public.fin_financeiro_can_see_card(card_id));
create policy fin_financeiro_invoices_insert on public.fin_financeiro_invoices for insert to authenticated
  with check (public.fin_financeiro_is_member(household_id) and public.fin_financeiro_can_see_card(card_id));
create policy fin_financeiro_invoices_update on public.fin_financeiro_invoices for update to authenticated
  using (public.fin_financeiro_can_see_card(card_id)) with check (public.fin_financeiro_can_see_card(card_id));
create policy fin_financeiro_invoices_delete on public.fin_financeiro_invoices for delete to authenticated
  using (exists (select 1 from public.fin_financeiro_cards c where c.id = card_id and c.owner_id = auth.uid()));

-- Compras parceladas
grant select, insert, update, delete on public.fin_financeiro_card_purchases to authenticated;
create policy fin_financeiro_card_purchases_select on public.fin_financeiro_card_purchases for select to authenticated
  using (public.fin_financeiro_is_member(household_id) and (visibility = 'compartilhado' or owner_id = auth.uid()));
create policy fin_financeiro_card_purchases_insert on public.fin_financeiro_card_purchases for insert to authenticated
  with check (public.fin_financeiro_is_member(household_id) and owner_id = auth.uid());
create policy fin_financeiro_card_purchases_update on public.fin_financeiro_card_purchases for update to authenticated
  using (owner_id = auth.uid()) with check (public.fin_financeiro_is_member(household_id) and owner_id = auth.uid());
create policy fin_financeiro_card_purchases_delete on public.fin_financeiro_card_purchases for delete to authenticated
  using (owner_id = auth.uid());

-- Lançamentos
grant select, insert, update, delete on public.fin_financeiro_entries to authenticated;
create policy fin_financeiro_entries_select on public.fin_financeiro_entries for select to authenticated
  using (public.fin_financeiro_is_member(household_id) and (visibility = 'compartilhado' or owner_id = auth.uid()));
create policy fin_financeiro_entries_insert on public.fin_financeiro_entries for insert to authenticated
  with check (public.fin_financeiro_is_member(household_id) and owner_id = auth.uid());
create policy fin_financeiro_entries_update on public.fin_financeiro_entries for update to authenticated
  using (owner_id = auth.uid()) with check (public.fin_financeiro_is_member(household_id) and owner_id = auth.uid());
create policy fin_financeiro_entries_delete on public.fin_financeiro_entries for delete to authenticated
  using (owner_id = auth.uid());

-- ---------------------------------------------------------------------
-- Importação (somente o dono enxerga sua fila e seus PDFs)
-- ---------------------------------------------------------------------
grant select, insert, delete on public.fin_financeiro_invoice_documents to authenticated;
create policy fin_financeiro_invoice_documents_select on public.fin_financeiro_invoice_documents for select to authenticated
  using (owner_id = auth.uid() and public.fin_financeiro_is_member(household_id));
create policy fin_financeiro_invoice_documents_insert on public.fin_financeiro_invoice_documents for insert to authenticated
  with check (owner_id = auth.uid() and public.fin_financeiro_is_member(household_id));
create policy fin_financeiro_invoice_documents_delete on public.fin_financeiro_invoice_documents for delete to authenticated
  using (owner_id = auth.uid());

grant select, insert, delete on public.fin_financeiro_review_queue to authenticated;
grant update (status, reviewed_at, entry_id, description, amount_cents, occurred_on, card_id, suggested_category, kind)
  on public.fin_financeiro_review_queue to authenticated;
create policy fin_financeiro_review_select on public.fin_financeiro_review_queue for select to authenticated
  using (owner_id = auth.uid() and public.fin_financeiro_is_member(household_id));
create policy fin_financeiro_review_insert on public.fin_financeiro_review_queue for insert to authenticated
  with check (owner_id = auth.uid() and public.fin_financeiro_is_member(household_id));
create policy fin_financeiro_review_update on public.fin_financeiro_review_queue for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid() and public.fin_financeiro_is_member(household_id));
create policy fin_financeiro_review_delete on public.fin_financeiro_review_queue for delete to authenticated
  using (owner_id = auth.uid());

-- ---------------------------------------------------------------------
-- Integrações
-- ---------------------------------------------------------------------
grant select on public.fin_financeiro_gmail_connections to authenticated;
create policy fin_financeiro_gmail_select on public.fin_financeiro_gmail_connections for select to authenticated
  using (user_id = auth.uid());

-- fin_financeiro_oauth_tokens, fin_financeiro_whatsapp_secrets, fin_financeiro_whatsapp_inbound, fin_financeiro_notification_log,
-- fin_financeiro_login_attempts: RLS habilitado, NENHUMA política e nenhum grant => inacessíveis
-- para anon/authenticated; acesso apenas por service role ou funções SECURITY DEFINER.

grant select, insert, delete on public.fin_financeiro_pluggy_items to authenticated;
create policy fin_financeiro_pluggy_select on public.fin_financeiro_pluggy_items for select to authenticated
  using (user_id = auth.uid());
create policy fin_financeiro_pluggy_insert on public.fin_financeiro_pluggy_items for insert to authenticated
  with check (user_id = auth.uid() and public.fin_financeiro_is_member(household_id));
create policy fin_financeiro_pluggy_delete on public.fin_financeiro_pluggy_items for delete to authenticated
  using (user_id = auth.uid());

grant select on public.fin_financeiro_whatsapp_config to authenticated;
grant insert (household_id, provider, display_number, evolution_base_url, evolution_instance, meta_phone_number_id, updated_by)
  on public.fin_financeiro_whatsapp_config to authenticated;
grant update (provider, display_number, evolution_base_url, evolution_instance, meta_phone_number_id, updated_by, updated_at)
  on public.fin_financeiro_whatsapp_config to authenticated;
create policy fin_financeiro_wa_config_select on public.fin_financeiro_whatsapp_config for select to authenticated
  using (public.fin_financeiro_is_member(household_id));
create policy fin_financeiro_wa_config_insert on public.fin_financeiro_whatsapp_config for insert to authenticated
  with check (public.fin_financeiro_is_owner(household_id));
create policy fin_financeiro_wa_config_update on public.fin_financeiro_whatsapp_config for update to authenticated
  using (public.fin_financeiro_is_owner(household_id)) with check (public.fin_financeiro_is_owner(household_id));

grant select on public.fin_financeiro_whatsapp_numbers to authenticated;
create policy fin_financeiro_wa_numbers_select on public.fin_financeiro_whatsapp_numbers for select to authenticated
  using (public.fin_financeiro_is_member(household_id));

grant select, update (visibility), delete on public.fin_financeiro_invest_links to authenticated;
create policy fin_financeiro_invest_links_select on public.fin_financeiro_invest_links for select to authenticated
  using (public.fin_financeiro_is_member(household_id) and (user_id = auth.uid() or visibility = 'compartilhado'));
create policy fin_financeiro_invest_links_update on public.fin_financeiro_invest_links for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy fin_financeiro_invest_links_delete on public.fin_financeiro_invest_links for delete to authenticated
  using (user_id = auth.uid());
