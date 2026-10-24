begin;

-- Keep the existing trigger and function identity. Presentation metadata only:
-- never copy roles, email or other user-controlled properties into authority.
create or replace function private.on_auth_user_created() returns trigger
language plpgsql security definer set search_path = '' as $$
declare safe_name text := 'Vecino'; candidate text;
begin
  if jsonb_typeof(new.raw_user_meta_data -> 'display_name') = 'string' then
    candidate := btrim(new.raw_user_meta_data ->> 'display_name');
    if char_length(candidate) between 1 and 80 and candidate !~ '[[:cntrl:]]'
      and candidate !~ ('^[[:space:]' || chr(160) || chr(65279) || ']+$') then
      safe_name := candidate;
    end if;
  end if;
  insert into public.profiles(id, display_name) values (new.id, safe_name)
    on conflict (id) do nothing;
  return new;
end;
$$;
revoke execute on function private.on_auth_user_created() from public, anon, authenticated;
-- No backfill: existing users may have intentionally chosen their names.
commit;
