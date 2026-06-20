-- Dedupe synced provider messages (Gmail, Outlook, …)

alter table public.inbound_messages
  add column if not exists provider_message_id text;

create unique index if not exists inbound_messages_provider_message_uidx
  on public.inbound_messages (user_id, channel_type, channel_ref, provider_message_id)
  where provider_message_id is not null;
