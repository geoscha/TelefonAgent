-- OpenAI / LLM credentials for agent generation and call enrichment

alter table public.admin_config
  add column if not exists enrichment_api_key text,
  add column if not exists enrichment_base_url text,
  add column if not exists enrichment_model text;
