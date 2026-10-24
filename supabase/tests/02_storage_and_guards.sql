begin;
create function pg_temp.assert_true(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', message; end if; end $$;
create function pg_temp.expect_error(statement text, expected_state text default null) returns void language plpgsql as $$
declare did_fail boolean := false;
begin
  begin execute statement;
  exception when others then
    if expected_state is not null and sqlstate <> expected_state then raise exception 'Expected %, got %: %', expected_state, sqlstate, sqlerrm; end if;
    did_fail := true;
  end;
  if not did_fail then raise exception 'FAIL: operation unexpectedly succeeded: %', statement; end if;
end $$;

insert into auth.users(id) values
  ('31000000-0000-4000-8000-000000000001'),
  ('31000000-0000-4000-8000-000000000002'),
  ('31000000-0000-4000-8000-000000000003');
insert into public.user_roles(user_id, role) values ('31000000-0000-4000-8000-000000000003','admin');
select pg_temp.assert_true((select not public and file_size_limit = 5242880
  and allowed_mime_types = array['image/jpeg','image/png','image/webp'] from storage.buckets where id = 'claim-photos'), 'private bucket, 5MB, 3 MIME types');
-- Deliberately broad existing policy must not bypass this bucket's guards.
create policy test_broad_policy on storage.objects for all to anon, authenticated using (true) with check (true);
insert into public.claims(id,author_id,category_id,title,description,address,neighborhood) values
  ('21000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001','Reclamo con fotografía','Descripción ficticia de prueba','Prueba 123','Centro');

set local role authenticated;
select set_config('request.jwt.claim.sub','31000000-0000-4000-8000-000000000001',true);
insert into storage.objects(bucket_id,name) values ('claim-photos','31000000-0000-4000-8000-000000000001/21000000-0000-4000-8000-000000000001/claim/71000000-0000-4000-8000-000000000001.jpg');
insert into public.claim_attachments(claim_id,storage_path) values
  ('21000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001/21000000-0000-4000-8000-000000000001/claim/71000000-0000-4000-8000-000000000001.jpg');
select pg_temp.assert_true((select count(*) = 1 from storage.objects where bucket_id = 'claim-photos'), 'owner can read attached pending photo');
select pg_temp.expect_error('insert into storage.objects(bucket_id,name) values (''claim-photos'',''31000000-0000-4000-8000-000000000001/21000000-0000-4000-8000-000000000001/claim/71000000-0000-4000-8000-000000000002.svg'')','42501');
select pg_temp.expect_error('update public.claim_attachments set storage_path = ''forged''','42501');
-- Restrictive policies hide rows from UPDATE/DELETE even with broad permissive policy.
update storage.objects set name = 'replacement' where bucket_id = 'claim-photos';
delete from storage.objects where bucket_id = 'claim-photos';
reset role;
select pg_temp.assert_true((select count(*) = 1 from storage.objects where name like '%.jpg'), 'evidence cannot be replaced or removed');

set local role anon;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.assert_true((select count(*) = 0 from storage.objects where bucket_id = 'claim-photos'), 'visitors cannot read pending photo');
select pg_temp.expect_error('insert into storage.objects(bucket_id,name) values (''claim-photos'',''forged.jpg'')','42501');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','31000000-0000-4000-8000-000000000002',true);
select pg_temp.expect_error('insert into public.claim_attachments(claim_id,storage_path) values (''21000000-0000-4000-8000-000000000001'',''31000000-0000-4000-8000-000000000001/21000000-0000-4000-8000-000000000001/claim/71000000-0000-4000-8000-000000000001.jpg'')','42501');
select pg_temp.expect_error('insert into storage.objects(bucket_id,name) values (''claim-photos'',''31000000-0000-4000-8000-000000000002/21000000-0000-4000-8000-000000000001/claim/71000000-0000-4000-8000-000000000002.jpg'')','42501');
select set_config('request.jwt.claim.sub','31000000-0000-4000-8000-000000000003',true);
select public.review_claim('21000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.sub','31000000-0000-4000-8000-000000000001',true);
select pg_temp.expect_error('insert into storage.objects(bucket_id,name) values (''claim-photos'',''31000000-0000-4000-8000-000000000001/21000000-0000-4000-8000-000000000001/claim/71000000-0000-4000-8000-000000000002.jpg'')','42501');
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.assert_true((select count(*) = 1 from storage.objects where bucket_id = 'claim-photos'), 'public visible claim photo can be authorized');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','31000000-0000-4000-8000-000000000003',true);
select public.hide_claim('21000000-0000-4000-8000-000000000001','Oculto para la prueba de privacidad');
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.assert_true((select count(*) = 0 from storage.objects where bucket_id = 'claim-photos'), 'hidden photo no longer visible even with broad policy');
select pg_temp.assert_true((select count(*) = 0 from public.claim_attachments), 'hidden attachment metadata private');
select pg_temp.assert_true((select count(*) = 0 from public.get_claim_support_counts(array['21000000-0000-4000-8000-000000000001'::uuid])), 'hidden supports not exposed');
reset role;

-- Every exposed table has RLS and privileged functions have a fixed search_path.
select pg_temp.assert_true(not exists(select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity), 'all exposed tables have RLS');
select pg_temp.assert_true(not exists(select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public','private') and p.prosecdef and not coalesce(p.proconfig @> array['search_path=""'], false)), 'definers have fixed empty search_path');
rollback;
