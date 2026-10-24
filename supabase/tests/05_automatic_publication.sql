-- Local PostgreSQL contracts only: no hosted Auth/Storage HTTP or real accounts.
begin;
create function pg_temp.assert_true(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', message; end if; end $$;
create function pg_temp.expect_error(statement text, expected_state text) returns void language plpgsql as $$
declare failed boolean := false;
begin
  begin execute statement;
  exception when others then
    if sqlstate <> expected_state then raise exception 'Expected %, got %: %', expected_state, sqlstate, sqlerrm; end if;
    failed := true;
  end;
  if not failed then raise exception 'FAIL: unexpected success: %', statement; end if;
end $$;

insert into auth.users(id) values
  ('34000000-0000-4000-8000-000000000001'),
  ('34000000-0000-4000-8000-000000000002'),
  ('34000000-0000-4000-8000-000000000003');
insert into public.user_roles(user_id, role) values ('34000000-0000-4000-8000-000000000003','admin');
-- Historical/manual fixtures do not exercise client INSERT privileges.
insert into public.claims(id, author_id, category_id, title, description, address, neighborhood, moderation_status, status)
select ('24000000-0000-4000-8000-0000000000' || suffix)::uuid,
  '34000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
  'Reclamo de prueba ' || suffix, 'Descripción ficticia para verificar permisos', 'Prueba 123', 'Centro',
  moderation::public.moderation_status, management::public.claim_status
from (values ('10','pendiente','publicado'), ('11','rechazado','publicado'),
  ('12','oculto','publicado'), ('13','aprobado','en_tratamiento'), ('14','aprobado','publicado'))
  as fixture(suffix, moderation, management);
insert into private.claim_validations(claim_id, validated, reviewed_by)
values ('24000000-0000-4000-8000-000000000014', true, '34000000-0000-4000-8000-000000000003');
insert into public.claims(id, author_id, category_id, title, description, address, neighborhood, moderation_status)
values ('24000000-0000-4000-8000-000000000015', '34000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001', 'Reclamo de otra persona', 'Descripción ficticia para verificar permisos',
  'Prueba 456', 'Centro', 'aprobado');

select pg_temp.assert_true((select not public and file_size_limit = 5242880
  and allowed_mime_types = array['image/jpeg','image/png','image/webp'] from storage.buckets where id='claim-photos'),
  'private bucket and file constraints remain unchanged');
select pg_temp.assert_true(not has_any_column_privilege('authenticated','public.claims','INSERT'), 'claims have no client column INSERT grants');
select pg_temp.assert_true(not exists(select 1 from pg_policies where schemaname='public' and tablename='claims' and cmd='INSERT'), 'legacy direct claim creation policy removed');
-- A permissive preexisting policy must not override ConectaRos Storage guards.
create policy test_publication_broad_policy on storage.objects for all to anon, authenticated using (true) with check (true);

set local role anon;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.expect_error($s$select public.submit_demo_claim('24000000-0000-4000-8000-000000000001','34000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Título publicado','Descripción ficticia de prueba','Dirección 123','Centro')$s$,'42501');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','34000000-0000-4000-8000-000000000001',true);
select pg_temp.expect_error($s$insert into public.claims(category_id,title,description,address,neighborhood) values ('10000000-0000-4000-8000-000000000001','Título directo','Descripción ficticia de prueba','Dirección 123','Centro')$s$,'42501');
select pg_temp.expect_error($s$select public.submit_demo_claim(gen_random_uuid(),'34000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Título publicado','Descripción ficticia de prueba','Dirección 123','Centro')$s$,'42501');
select pg_temp.expect_error($s$select public.submit_demo_claim(null,auth.uid(),'10000000-0000-4000-8000-000000000001','Título publicado','Descripción ficticia de prueba','Dirección 123','Centro')$s$,'22023');
select pg_temp.expect_error($s$select public.submit_demo_claim(gen_random_uuid(),auth.uid(),gen_random_uuid(),'Título publicado','Descripción ficticia de prueba','Dirección 123','Centro')$s$,'23503');
select pg_temp.expect_error($s$select public.submit_demo_claim(gen_random_uuid(),auth.uid(),'10000000-0000-4000-8000-000000000001',repeat(chr(160),8),'Descripción ficticia de prueba','Dirección 123','Centro')$s$,'22023');
select pg_temp.expect_error($s$select public.submit_demo_claim(gen_random_uuid(),auth.uid(),'10000000-0000-4000-8000-000000000001','Título publicado',repeat('x',5001),'Dirección 123','Centro')$s$,'22023');
select pg_temp.expect_error($s$select public.submit_demo_claim(gen_random_uuid(),auth.uid(),'10000000-0000-4000-8000-000000000001','Título publicado','Descripción ficticia de prueba','  ','Centro')$s$,'22023');
select pg_temp.expect_error($s$select public.submit_demo_claim(gen_random_uuid(),auth.uid(),'10000000-0000-4000-8000-000000000001','Título publicado','Descripción ficticia de prueba','Dirección 123','x')$s$,'22023');

select public.submit_demo_claim('24000000-0000-4000-8000-000000000001',auth.uid(),'10000000-0000-4000-8000-000000000001','  Título publicado  ','Descripción ficticia de prueba','Dirección 123','Centro');
select public.submit_demo_claim('24000000-0000-4000-8000-000000000001',auth.uid(),'10000000-0000-4000-8000-000000000001','Título publicado','Descripción ficticia de prueba','Dirección 123','Centro');
select pg_temp.assert_true((select count(*)=1 from public.claims where id='24000000-0000-4000-8000-000000000001'), 'retry creates exactly one claim');
select pg_temp.assert_true((select author_id=auth.uid() and moderation_status='aprobado' and status='publicado'
  and is_demo and entity_id is null and title='Título publicado' from public.claims where id='24000000-0000-4000-8000-000000000001'),
  'server fixes author, public visibility, management stage, demo flag and no entity');
select pg_temp.expect_error($s$select public.submit_demo_claim('24000000-0000-4000-8000-000000000001',auth.uid(),'10000000-0000-4000-8000-000000000001','Contenido cambiado','Descripción ficticia de prueba','Dirección 123','Centro')$s$,'22023');
select pg_temp.expect_error($s$update public.claims set status='resuelto',moderation_status='aprobado',entity_id=gen_random_uuid() where id='24000000-0000-4000-8000-000000000001'$s$,'42501');
select pg_temp.expect_error($s$insert into public.user_roles(user_id,role) values (auth.uid(),'admin')$s$,'42501');
select pg_temp.expect_error($s$insert into public.user_roles(user_id,role) values (auth.uid(),'ambassador')$s$,'42501');
select pg_temp.assert_true((select count(*)=0 from public.point_movements), 'automatic publication awards no points');
reset role;
select pg_temp.assert_true(not exists(select 1 from private.claim_validations where claim_id='24000000-0000-4000-8000-000000000001'), 'publication is not administrative validation');
select pg_temp.assert_true(not exists(select 1 from public.claim_referrals where claim_id='24000000-0000-4000-8000-000000000001'), 'publication creates no referral');
select pg_temp.assert_true(not exists(select 1 from public.claim_history where claim_id='24000000-0000-4000-8000-000000000001'), 'publication invents no management event');
insert into public.claim_contributions(id,claim_id,author_id,kind,body,observed_at) values
  ('54000000-0000-4000-8000-000000000001','24000000-0000-4000-8000-000000000001','34000000-0000-4000-8000-000000000002','evidencia','Evidencia pendiente de otra persona',now()),
  ('54000000-0000-4000-8000-000000000002','24000000-0000-4000-8000-000000000001','34000000-0000-4000-8000-000000000001','evidencia','Evidencia pendiente de la misma persona',now());
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.assert_true((select count(*)=1 from public.claims where id='24000000-0000-4000-8000-000000000001' and moderation_status='aprobado' and status='publicado'), 'visitor immediately reads newly published claim');
select pg_temp.assert_true((select count(*)=0 from public.claims where id in
  ('24000000-0000-4000-8000-000000000010','24000000-0000-4000-8000-000000000011','24000000-0000-4000-8000-000000000012')),
  'public queries exclude historical pending, rejected and hidden claims');
select pg_temp.expect_error('select author_id from public.claims','42501');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','34000000-0000-4000-8000-000000000001',true);
select pg_temp.assert_true(private.can_upload_claim_photo('34000000-0000-4000-8000-000000000001/24000000-0000-4000-8000-000000000001/claim/74000000-0000-4000-8000-000000000001.jpg'), 'first photo allowed after automatic publication');
select pg_temp.expect_error($s$select public.attach_own_claim_photo('24000000-0000-4000-8000-000000000001',auth.uid(),'34000000-0000-4000-8000-000000000001/24000000-0000-4000-8000-000000000001/claim/74000000-0000-4000-8000-000000000001.jpg')$s$,'P0002');
select pg_temp.expect_error($s$insert into storage.objects(bucket_id,name) values ('claim-photos','34000000-0000-4000-8000-000000000001/24000000-0000-4000-8000-000000000015/claim/74000000-0000-4000-8000-000000000001.jpg')$s$,'42501');
select pg_temp.expect_error($s$insert into storage.objects(bucket_id,name) values ('claim-photos','34000000-0000-4000-8000-000000000001/24000000-0000-4000-8000-000000000001/claim/74000000-0000-4000-8000-000000000001.svg')$s$,'42501');
select pg_temp.expect_error($s$insert into storage.objects(bucket_id,name) values ('claim-photos','34000000-0000-4000-8000-000000000001/24000000-0000-4000-8000-000000000001/54000000-0000-4000-8000-000000000001/74000000-0000-4000-8000-000000000001.jpg')$s$,'42501');
select pg_temp.assert_true(private.can_upload_claim_photo('34000000-0000-4000-8000-000000000001/24000000-0000-4000-8000-000000000001/54000000-0000-4000-8000-000000000002/74000000-0000-4000-8000-000000000002.jpg'), 'independent own contribution authorization is preserved');
insert into storage.objects(bucket_id,name) values ('claim-photos','34000000-0000-4000-8000-000000000001/24000000-0000-4000-8000-000000000001/claim/74000000-0000-4000-8000-000000000001.jpg');
select pg_temp.assert_true(not private.can_read_claim_photo('34000000-0000-4000-8000-000000000001/24000000-0000-4000-8000-000000000001/claim/74000000-0000-4000-8000-000000000001.jpg'), 'unassociated object is not readable');
select public.attach_own_claim_photo('24000000-0000-4000-8000-000000000001',auth.uid(),'34000000-0000-4000-8000-000000000001/24000000-0000-4000-8000-000000000001/claim/74000000-0000-4000-8000-000000000001.jpg');
select public.attach_own_claim_photo('24000000-0000-4000-8000-000000000001',auth.uid(),'34000000-0000-4000-8000-000000000001/24000000-0000-4000-8000-000000000001/claim/74000000-0000-4000-8000-000000000001.jpg');
select pg_temp.assert_true((select count(*)=1 from public.claim_attachments where claim_id='24000000-0000-4000-8000-000000000001'), 'association retry appends no evidence');
select pg_temp.expect_error($s$insert into storage.objects(bucket_id,name) values ('claim-photos','34000000-0000-4000-8000-000000000001/24000000-0000-4000-8000-000000000001/claim/74000000-0000-4000-8000-000000000002.jpg')$s$,'42501');
select pg_temp.expect_error($s$select public.attach_own_claim_photo('24000000-0000-4000-8000-000000000001',auth.uid(),'34000000-0000-4000-8000-000000000001/24000000-0000-4000-8000-000000000001/claim/74000000-0000-4000-8000-000000000002.jpg')$s$,'23505');
select pg_temp.expect_error($s$update public.claim_attachments set storage_path='replacement'$s$,'42501');
update storage.objects set name='replacement' where bucket_id='claim-photos';
delete from storage.objects where bucket_id='claim-photos';
reset role;
select pg_temp.assert_true((select count(*)=1 from storage.objects where bucket_id='claim-photos' and name like '%.jpg'), 'broad policy cannot replace or delete evidence');
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.assert_true((select count(*)=1 from public.claim_attachments where claim_id='24000000-0000-4000-8000-000000000001'), 'approved claim exposes permitted attachment metadata');
select pg_temp.assert_true((select count(*)=1 from storage.objects where bucket_id='claim-photos'), 'approved associated photo is authorized for visitors while bucket stays private');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','34000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_true((select count(*)=1 from public.claims where id='24000000-0000-4000-8000-000000000001'), 'other account sees community claim');
select pg_temp.expect_error($s$select public.attach_own_claim_photo('24000000-0000-4000-8000-000000000001',auth.uid(),'34000000-0000-4000-8000-000000000001/24000000-0000-4000-8000-000000000001/claim/74000000-0000-4000-8000-000000000001.jpg')$s$,'42501');
select pg_temp.expect_error($s$insert into storage.objects(bucket_id,name) values ('claim-photos','34000000-0000-4000-8000-000000000002/24000000-0000-4000-8000-000000000001/claim/74000000-0000-4000-8000-000000000002.jpg')$s$,'42501');
select pg_temp.expect_error($s$select public.submit_demo_claim('24000000-0000-4000-8000-000000000001',auth.uid(),'10000000-0000-4000-8000-000000000001','Título publicado','Descripción ficticia de prueba','Dirección 123','Centro')$s$,'42501');
reset role;

-- Historical pending claims keep private first-photo support.
set local role authenticated;
select set_config('request.jwt.claim.sub','34000000-0000-4000-8000-000000000001',true);
insert into storage.objects(bucket_id,name) values ('claim-photos','34000000-0000-4000-8000-000000000001/24000000-0000-4000-8000-000000000010/claim/74000000-0000-4000-8000-000000000010.jpg');
select public.attach_own_claim_photo('24000000-0000-4000-8000-000000000010',auth.uid(),'34000000-0000-4000-8000-000000000001/24000000-0000-4000-8000-000000000010/claim/74000000-0000-4000-8000-000000000010.jpg');
select pg_temp.assert_true((select count(*)=1 from public.claim_attachments where claim_id='24000000-0000-4000-8000-000000000010'), 'historical pending first photo can be associated');
select pg_temp.assert_true(not private.can_upload_claim_photo('34000000-0000-4000-8000-000000000001/24000000-0000-4000-8000-000000000011/claim/74000000-0000-4000-8000-000000000011.jpg'), 'rejected claim cannot receive photo');
select pg_temp.assert_true(not private.can_upload_claim_photo('34000000-0000-4000-8000-000000000001/24000000-0000-4000-8000-000000000012/claim/74000000-0000-4000-8000-000000000012.jpg'), 'hidden claim cannot receive photo');
select pg_temp.assert_true(not private.can_upload_claim_photo('34000000-0000-4000-8000-000000000001/24000000-0000-4000-8000-000000000013/claim/74000000-0000-4000-8000-000000000013.jpg'), 'advanced management stage cannot receive first photo');
select pg_temp.assert_true(not private.can_upload_claim_photo('34000000-0000-4000-8000-000000000001/24000000-0000-4000-8000-000000000014/claim/74000000-0000-4000-8000-000000000014.jpg'), 'administratively validated evidence stays locked');
select pg_temp.expect_error($s$select public.attach_own_claim_photo('24000000-0000-4000-8000-000000000013',auth.uid(),'34000000-0000-4000-8000-000000000001/24000000-0000-4000-8000-000000000013/claim/74000000-0000-4000-8000-000000000013.jpg')$s$,'42501');
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.assert_true((select count(*)=0 from public.claims where id='24000000-0000-4000-8000-000000000010'), 'historical pending claim is not automatically published by migration');
select pg_temp.assert_true((select count(*)=0 from public.claim_attachments where claim_id='24000000-0000-4000-8000-000000000010'), 'historical pending metadata stays private');
select pg_temp.assert_true((select count(*)=1 from storage.objects), 'only approved photo readable to visitor');
reset role;

update public.claims set moderation_status='oculto' where id='24000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','34000000-0000-4000-8000-000000000001',true);
select public.submit_demo_claim('24000000-0000-4000-8000-000000000001',auth.uid(),'10000000-0000-4000-8000-000000000001','Título publicado','Descripción ficticia de prueba','Dirección 123','Centro');
select pg_temp.assert_true((select moderation_status='oculto' from public.claims where id='24000000-0000-4000-8000-000000000001'), 'submission retry never republishes hidden claim');
select pg_temp.expect_error($s$select public.attach_own_claim_photo('24000000-0000-4000-8000-000000000001',auth.uid(),'34000000-0000-4000-8000-000000000001/24000000-0000-4000-8000-000000000001/claim/74000000-0000-4000-8000-000000000001.jpg')$s$,'42501');
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.assert_true((select count(*)=0 from storage.objects), 'hiding approved claim removes visitor photo access');
reset role;
update public.claims set moderation_status='rechazado' where id='24000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','34000000-0000-4000-8000-000000000001',true);
select pg_temp.expect_error($s$select public.attach_own_claim_photo('24000000-0000-4000-8000-000000000001',auth.uid(),'34000000-0000-4000-8000-000000000001/24000000-0000-4000-8000-000000000001/claim/74000000-0000-4000-8000-000000000001.jpg')$s$,'42501');
reset role;
update public.claims set moderation_status='aprobado',status='en_tratamiento' where id='24000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','34000000-0000-4000-8000-000000000001',true);
select public.attach_own_claim_photo('24000000-0000-4000-8000-000000000001',auth.uid(),'34000000-0000-4000-8000-000000000001/24000000-0000-4000-8000-000000000001/claim/74000000-0000-4000-8000-000000000001.jpg');
select public.submit_demo_claim('24000000-0000-4000-8000-000000000001',auth.uid(),'10000000-0000-4000-8000-000000000001','Título publicado','Descripción ficticia de prueba','Dirección 123','Centro');
select pg_temp.assert_true((select status='en_tratamiento' from public.claims where id='24000000-0000-4000-8000-000000000001'), 'idempotent retries preserve later management stages');
select pg_temp.assert_true((select count(*)=0 from public.point_movements), 'all publication/photo retries remain without points');
reset role;

select pg_temp.assert_true((select count(*)=2 from public.claim_attachments), 'no evidence was replaced, removed or duplicated');
select pg_temp.assert_true(not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and not c.relrowsecurity), 'RLS stays enabled on exposed tables');
select pg_temp.assert_true(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private') and p.prosecdef and not coalesce(p.proconfig @> array['search_path=""'],false)), 'security definers retain fixed search_path');
rollback;
