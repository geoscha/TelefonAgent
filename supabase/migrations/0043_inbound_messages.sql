-- Eingehende Nachrichten von verbundenen Kanälen (E-Mail, WhatsApp)

create table if not exists public.inbound_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  channel_type text not null
    check (channel_type in ('gmail', 'outlook', 'apple_mail', 'whatsapp')),
  channel_ref text not null,
  thread_id text not null,
  direction text not null default 'inbound'
    check (direction in ('inbound', 'outbound')),
  sender_label text,
  sender_address text,
  subject text,
  body text not null,
  preview text,
  received_at timestamptz not null default now(),
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists inbound_messages_user_channel_idx
  on public.inbound_messages (user_id, channel_type, channel_ref, received_at desc);

create index if not exists inbound_messages_user_thread_idx
  on public.inbound_messages (user_id, thread_id, received_at asc);

alter table public.inbound_messages enable row level security;

drop policy if exists "inbound_messages_all_own" on public.inbound_messages;
create policy "inbound_messages_all_own" on public.inbound_messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
