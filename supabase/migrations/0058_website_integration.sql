-- Betreiber-Website: URL + gescrapte Wissensdatenbank pro Nutzer

create table if not exists public.website_integrations (
  user_id uuid primary key references auth.users (id) on delete cascade,
  connected boolean not null default false,
  url text,
  account_label text,
  knowledge_text text,
  elevenlabs_doc_id text,
  elevenlabs_doc_name text,
  pages_scraped integer,
  last_synced_at timestamptz,
  sync_status text check (sync_status in ('pending', 'ok', 'error')),
  sync_error text,
  connected_at timestamptz
);

alter table public.website_integrations enable row level security;

drop policy if exists "website_integrations_all_own" on public.website_integrations;
create policy "website_integrations_all_own"
  on public.website_integrations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
