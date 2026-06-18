-- Signup must never fail because of token billing schema.
-- Welcome tokens are granted in app code (grantWelcomeTokensIfNeeded).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  display_name text;
begin
  display_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'given_name'), ''),
    split_part(coalesce(new.email, ''), '@', 1),
    ''
  );

  insert into public.profiles (id, name, email)
  values (
    new.id,
    display_name,
    coalesce(new.email, '')
  )
  on conflict (id) do nothing;

  insert into public.app_settings (user_id, setup_demo_status)
  values (new.id, 'agent')
  on conflict (user_id) do nothing;

  return new;
end;
$$;
