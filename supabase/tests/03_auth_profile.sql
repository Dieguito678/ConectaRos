begin;
create function pg_temp.assert_true(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', message; end if; end $$;

-- Synthetic local auth rows only. Never passwords and never remote accounts.
insert into auth.users(id, raw_user_meta_data) values
 ('32000000-0000-4000-8000-000000000001','{"display_name":"  Vecina de prueba  ","role":"admin","roles":["admin","ambassador"]}'),
 ('32000000-0000-4000-8000-000000000002','{"display_name":"  "}'),
 ('32000000-0000-4000-8000-000000000003','{"display_name":123}'),
 ('32000000-0000-4000-8000-000000000004','{"display_name":null}'),
 ('32000000-0000-4000-8000-000000000005',jsonb_build_object('display_name', repeat('a',81))),
 ('32000000-0000-4000-8000-000000000006',jsonb_build_object('display_name', E'nombre\ninvalido')),
 ('32000000-0000-4000-8000-000000000007',jsonb_build_object('display_name', repeat('ñ',80))),
 ('32000000-0000-4000-8000-000000000008','{}'),
 ('32000000-0000-4000-8000-000000000009',jsonb_build_object('display_name', chr(160) || chr(65279)));
select pg_temp.assert_true((select display_name = 'Vecina de prueba' from public.profiles where id = '32000000-0000-4000-8000-000000000001'), 'presentation name copied and trimmed');
select pg_temp.assert_true((select count(*) = 7 from public.profiles where display_name = 'Vecino' and id::text like '32000000-%'), 'invalid, missing, long, whitespace-only or control names use fallback');
select pg_temp.assert_true((select char_length(display_name) = 80 from public.profiles where id = '32000000-0000-4000-8000-000000000007'), '80 unicode characters accepted');
select pg_temp.assert_true((select count(*) = 9 from public.profiles), 'exactly one profile per user');
select pg_temp.assert_true((select count(*) = 0 from public.user_roles), 'metadata never assigns admin or ambassador');
select pg_temp.assert_true(not has_function_privilege('anon','private.on_auth_user_created()','execute') and not has_function_privilege('authenticated','private.on_auth_user_created()','execute'), 'trigger helper not client executable');
set local role authenticated;
select set_config('request.jwt.claim.sub','32000000-0000-4000-8000-000000000001',true);
select pg_temp.assert_true((select count(*) = 1 from public.profiles), 'profile own read only');
select pg_temp.assert_true((select count(*) = 0 from public.user_roles), 'spoofed role absent in RLS query');
reset role;
rollback;
