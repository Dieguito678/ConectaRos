begin;

-- Private, MIME-restricted bucket. A conflicting preexisting bucket must be
-- inspected manually, rather than repurposed or made public automatically.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('claim-photos', 'claim-photos', false, 5242880, array['image/jpeg','image/png','image/webp']);

-- Paths: <uid>/<claim uuid>/claim/<file uuid>.<ext>
--     or <uid>/<claim uuid>/<contribution uuid>/<file uuid>.<ext>
create function private.can_upload_claim_photo(p_path text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare parts text[] := string_to_array(p_path, '/');
begin
  if auth.uid() is null or array_length(parts, 1) <> 4 or parts[1] <> auth.uid()::text
    or parts[4] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$' then return false; end if;
  if parts[3] = 'claim' then
    return exists (select 1 from public.claims c where c.id::text = parts[2]
      and c.author_id = auth.uid() and c.moderation_status = 'pendiente'
      and not exists (select 1 from private.claim_validations v where v.claim_id = c.id));
  end if;
  return exists (select 1 from public.claim_contributions cc
    join public.claims c on c.id = cc.claim_id
    where c.id::text = parts[2] and cc.id::text = parts[3] and cc.author_id = auth.uid()
      and cc.moderation_status = 'pendiente' and c.moderation_status = 'aprobado'
      and not exists (select 1 from private.contribution_reviews r where r.contribution_id = cc.id));
end;
$$;
create function private.can_read_claim_photo(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.claim_attachments a
    join public.claims c on c.id = a.claim_id
    left join public.claim_contributions cc on cc.id = a.contribution_id
    where a.storage_path = p_path and (
      a.owner_id = auth.uid() or private.is_admin() or
      (c.moderation_status = 'aprobado' and
        (a.contribution_id is null or cc.moderation_status = 'aprobado'))
    ));
$$;
create function private.check_attachment_binding() returns trigger
language plpgsql security definer set search_path = '' as $$
declare parts text[] := string_to_array(new.storage_path, '/');
begin
  -- Serialize association with administrative review. A photo cannot slip in
  -- between the moderation check and validation of the same submission.
  perform 1 from public.claims where id = new.claim_id for update;
  if new.contribution_id is not null then
    perform 1 from public.claim_contributions where id = new.contribution_id for update;
  end if;
  if auth.uid() is null or new.owner_id <> auth.uid() or parts[2] <> new.claim_id::text
    or parts[3] <> coalesce(new.contribution_id::text, 'claim')
    or not private.can_upload_claim_photo(new.storage_path) then
    raise exception 'Foto no autorizada para este reclamo o aporte' using errcode = '42501';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'claim-photos' and name = new.storage_path) then
    raise exception 'Primero subí el archivo al bucket privado';
  end if;
  return new;
end;
$$;
create trigger attachment_binding before insert on public.claim_attachments
  for each row execute function private.check_attachment_binding();
create policy attachments_insert on public.claim_attachments for insert to authenticated
  with check (owner_id = (select auth.uid()) and private.can_upload_claim_photo(storage_path));

revoke execute on function private.can_upload_claim_photo(text), private.can_read_claim_photo(text),
  private.check_attachment_binding() from public, anon, authenticated;
grant execute on function private.can_upload_claim_photo(text) to authenticated;
grant execute on function private.can_read_claim_photo(text) to anon, authenticated;

create policy conectaros_photo_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'claim-photos' and private.can_upload_claim_photo(name));
create policy conectaros_photo_select on storage.objects for select to anon, authenticated
  using (bucket_id = 'claim-photos' and private.can_read_claim_photo(name));
-- Restrictive guards also constrain any preexisting permissive Storage policies.
create policy conectaros_photo_insert_guard on storage.objects as restrictive for insert to anon, authenticated
  with check (bucket_id <> 'claim-photos' or private.can_upload_claim_photo(name));
create policy conectaros_photo_select_guard on storage.objects as restrictive for select to anon, authenticated
  using (bucket_id <> 'claim-photos' or private.can_read_claim_photo(name));
create policy conectaros_photo_no_replace on storage.objects as restrictive for update to anon, authenticated
  using (bucket_id <> 'claim-photos') with check (bucket_id <> 'claim-photos');
create policy conectaros_photo_no_delete on storage.objects as restrictive for delete to anon, authenticated
  using (bucket_id <> 'claim-photos');

notify pgrst, 'reload schema';
commit;
