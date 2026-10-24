begin;

-- Keep the existing RPC contract and request UUID for safe client retries.
-- Publication is community visibility, not administrative validation or referral.
create or replace function public.submit_demo_claim(p_request_id uuid, p_expected_user uuid,
  p_category_id uuid, p_title text, p_description text, p_address text, p_neighborhood text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); existing public.claims%rowtype;
  trim_chars text := E' \t\r\n\f' || chr(11) || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
begin
  if actor is null or actor is distinct from p_expected_user then raise exception 'Sesión no válida' using errcode = '42501'; end if;
  if p_request_id is null then raise exception 'Solicitud requerida' using errcode = '22023'; end if;
  p_title := btrim(p_title, trim_chars); p_description := btrim(p_description, trim_chars);
  p_address := btrim(p_address, trim_chars); p_neighborhood := btrim(p_neighborhood, trim_chars);
  if p_title is null or p_description is null or p_address is null or p_neighborhood is null
    or char_length(p_title) not between 5 and 160 or p_title ~ '^\s*$'
    or char_length(p_description) not between 10 and 5000 or p_description ~ '^\s*$'
    or char_length(p_address) not between 3 and 240 or p_address ~ '^\s*$'
    or char_length(p_neighborhood) not between 2 and 100 or p_neighborhood ~ '^\s*$' then
    raise exception 'Campos no válidos' using errcode = '22023';
  end if;
  if not exists (select 1 from public.categories where id = p_category_id) then
    raise exception 'Categoría inexistente' using errcode = '23503';
  end if;
  insert into public.claims(id, author_id, category_id, title, description, address, neighborhood, entity_id,
    is_demo, moderation_status, status)
    values (p_request_id, actor, p_category_id, p_title, p_description, p_address, p_neighborhood, null,
      true, 'aprobado', 'publicado') on conflict (id) do nothing;
  select * into existing from public.claims where id = p_request_id;
  if existing.author_id is distinct from actor then raise exception 'Solicitud no disponible' using errcode = '42501'; end if;
  if (existing.category_id, existing.title, existing.description, existing.address, existing.neighborhood)
    is distinct from (p_category_id, p_title, p_description, p_address, p_neighborhood) then
    raise exception 'La solicitud ya corresponde a otro contenido' using errcode = '22023';
  end if;
  -- Preserve any subsequent moderation/management decision on an idempotent retry.
  -- No entity, history, validation, point movement or role is assigned here.
  return existing.id;
end;
$$;

-- All client claim creation now goes through the fixed server-side RPC. Revoke
-- column grants as well as table grants; table REVOKE alone leaves column grants.
revoke insert on public.claims from public, anon, authenticated;
revoke insert(category_id, title, description, address, neighborhood, latitude, longitude)
  on public.claims from public, anon, authenticated;
drop policy claims_create on public.claims;

-- The first main photograph may follow a newly published claim. It remains an
-- immutable object in the private bucket, subject to the existing read policies.
-- Historical pending claims keep this first-photo path while still unpublished.
create or replace function private.can_upload_claim_photo(p_path text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare parts text[] := string_to_array(p_path, '/');
begin
  if auth.uid() is null or coalesce(array_length(parts, 1), 0) <> 4 or parts[1] <> auth.uid()::text
    or parts[4] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$' then return false; end if;
  if parts[3] = 'claim' then
    return exists (select 1 from public.claims c where c.id::text = parts[2]
      and c.author_id = auth.uid() and c.status = 'publicado'
      and c.moderation_status in ('pendiente', 'aprobado')
      and not exists (select 1 from private.claim_validations v where v.claim_id = c.id)
      and not exists (select 1 from public.claim_attachments a where a.claim_id = c.id and a.contribution_id is null));
  end if;
  -- Contribution evidence keeps its independent moderation and review guards.
  return exists (select 1 from public.claim_contributions cc
    join public.claims c on c.id = cc.claim_id
    where c.id::text = parts[2] and cc.id::text = parts[3] and cc.author_id = auth.uid()
      and cc.moderation_status = 'pendiente' and c.moderation_status = 'aprobado'
      and not exists (select 1 from private.contribution_reviews r where r.contribution_id = cc.id));
end;
$$;

create or replace function public.attach_own_claim_photo(p_claim_id uuid, p_expected_user uuid, p_storage_path text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); c public.claims%rowtype; attachment public.claim_attachments%rowtype;
begin
  if actor is null or actor is distinct from p_expected_user then raise exception 'Sesión no válida' using errcode = '42501'; end if;
  select * into c from public.claims where id = p_claim_id for update;
  if not found or c.author_id is distinct from actor then raise exception 'Reclamo no disponible' using errcode = '42501'; end if;
  if c.moderation_status not in ('pendiente', 'aprobado') then
    raise exception 'Foto no autorizada' using errcode = '42501';
  end if;
  select * into attachment from public.claim_attachments where claim_id = c.id and contribution_id is null;
  if found then
    -- A management advance may follow a successful association whose HTTP reply
    -- was lost. Returning the existing ID never appends or replaces evidence.
    if attachment.owner_id = actor and attachment.storage_path = p_storage_path then return attachment.id; end if;
    raise exception 'Ya existe una fotografía principal' using errcode = '23505';
  end if;
  if not private.can_upload_claim_photo(p_storage_path)
    or split_part(p_storage_path, '/', 2) <> c.id::text
    or split_part(p_storage_path, '/', 3) <> 'claim' then
    raise exception 'Foto no autorizada' using errcode = '42501';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'claim-photos' and name = p_storage_path) then
    raise exception 'Fotografía todavía no subida' using errcode = 'P0002';
  end if;
  insert into public.claim_attachments(claim_id, owner_id, storage_path)
    values (c.id, actor, p_storage_path) returning id into attachment.id;
  return attachment.id;
end;
$$;

-- Existing binding trigger rechecks the helper while holding the claim lock.
-- The unique main-photo index and immutable Storage guards remain in force.
-- No bucket, read policy, RLS or table default changes.
revoke execute on function public.submit_demo_claim(uuid, uuid, uuid, text, text, text, text)
  , public.attach_own_claim_photo(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.submit_demo_claim(uuid, uuid, uuid, text, text, text, text)
  , public.attach_own_claim_photo(uuid, uuid, text) to authenticated;
revoke execute on function private.can_upload_claim_photo(text) from public, anon, authenticated;
grant execute on function private.can_upload_claim_photo(text) to authenticated;

notify pgrst, 'reload schema';
commit;
