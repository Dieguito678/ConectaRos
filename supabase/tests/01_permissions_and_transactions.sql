-- Isolated test database only. Fixtures are rolled back; no passwords or remote
-- accounts are created. The local WASM runner provides a minimal auth.users.
begin;
create function pg_temp.assert_true(ok boolean, message text) returns void
language plpgsql as $$ begin
  if ok is distinct from true then raise exception 'FAIL: %', message; end if;
end $$;
create function pg_temp.expect_error(statement text, expected_state text default null) returns void
language plpgsql as $$
declare did_fail boolean := false;
begin
  begin execute statement;
  exception when others then
    if expected_state is not null and sqlstate <> expected_state then
      raise exception 'Expected SQLSTATE %, got %: %', expected_state, sqlstate, sqlerrm;
    end if;
    did_fail := true;
  end;
  if not did_fail then raise exception 'FAIL: operation unexpectedly succeeded: %', statement; end if;
end $$;

insert into auth.users(id) values
  ('30000000-0000-4000-8000-000000000001'), -- vecino
  ('30000000-0000-4000-8000-000000000002'), -- merchant A
  ('30000000-0000-4000-8000-000000000003'), -- merchant B
  ('30000000-0000-4000-8000-000000000004'); -- admin
insert into public.user_roles(user_id, role) values ('30000000-0000-4000-8000-000000000004', 'admin');
select pg_temp.assert_true((select count(*) = 4 from public.profiles), 'Auth trigger creates profiles without metadata roles');

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.assert_true((select count(*) = 9 from public.claims where is_demo), 'anon reads seeded visible claims');
select pg_temp.expect_error('select * from public.profiles', '42501');
select pg_temp.expect_error('select * from public.redemptions', '42501');
select pg_temp.expect_error('select * from public.claim_referrals', '42501');
select pg_temp.expect_error('select author_id from public.claims', '42501');
select pg_temp.expect_error('insert into public.categories(slug, name) values (''otros'', ''forged'')', '42501');
select pg_temp.expect_error('select public.get_my_balance()', '42501');
select pg_temp.expect_error('select * from private.point_rules', '42501');
select pg_temp.expect_error('select private.award_points(null, 99, ''claim_validated'', gen_random_uuid())', '42501');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000001', true);
select pg_temp.assert_true((select count(*) = 1 from public.profiles), 'profiles private to self');
select pg_temp.expect_error('update public.profiles set id = ''30000000-0000-4000-8000-000000000003''', '42501');
select pg_temp.expect_error('insert into public.user_roles values (auth.uid(), ''admin'', now())', '42501');
select pg_temp.expect_error('insert into public.point_movements(user_id,amount,reason,event_id) values (auth.uid(),100,''claim_validated'',gen_random_uuid())', '42501');
select pg_temp.expect_error('update public.claims set status = ''resuelto''', '42501');
select pg_temp.expect_error('insert into public.claims(author_id,category_id,title,description,address,neighborhood) values (''30000000-0000-4000-8000-000000000002'',''10000000-0000-4000-8000-000000000001'',''Reclamo ajeno'',''Descripción ficticia de prueba'',''Prueba 123'',''Centro'')', '42501');
insert into public.claims(category_id,title,description,address,neighborhood) values
  ('10000000-0000-4000-8000-000000000001','Reclamo de prueba propio','Descripción ficticia para la prueba local','Prueba 123','Centro');
select pg_temp.expect_error('select public.review_claim((select id from public.claims where title = ''Reclamo de prueba propio''), true)', '42501');
insert into public.claim_supports(claim_id) values ('20000000-0000-4000-8000-000000000001');
select pg_temp.expect_error('insert into public.claim_supports(claim_id) values (''20000000-0000-4000-8000-000000000001'')', '23505');
select pg_temp.assert_true(public.get_my_balance() = 0, 'supports do not earn points');
reset role;

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.assert_true((select count(*) = 9 from public.claims), 'pending claim invisible');
select pg_temp.assert_true((select support_count = 1 from public.get_claim_support_counts(array['20000000-0000-4000-8000-000000000001'::uuid])), 'support aggregates public');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000004', true);
select public.review_claim((select id from public.claims where title = 'Reclamo de prueba propio'), true);
select public.review_claim((select id from public.claims where title = 'Reclamo de prueba propio'), true);
select public.review_claim((select id from public.claims where title = 'Reclamo de prueba propio'), false);
select public.review_claim((select id from public.claims where title = 'Reclamo de prueba propio'), true);
reset role;
select pg_temp.assert_true((select count(*) = 1 and sum(amount) = 20 from public.point_movements), 'review retries/revocation never duplicate award');

set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000001', true);
insert into public.claim_contributions(claim_id,kind,body,observed_at)
  select id, 'evidencia', 'Observación de prueba número ' || n, now() from public.claims
  cross join generate_series(1,4) n where title = 'Reclamo de prueba propio';
select pg_temp.expect_error('insert into public.claim_contributions(claim_id,kind,body,observed_at) select id,''evidencia'',''Observación de prueba número 1'',now() from public.claims where title = ''Reclamo de prueba propio''', '23505');
insert into public.businesses(name,description,address,neighborhood) values ('Comercio pendiente','Comercio ficticio de prueba','Prueba 456','Centro');
select pg_temp.expect_error('select public.save_reward((select id from public.businesses where name = ''Comercio pendiente''),''Beneficio'',''Descripción ficticia'',''Condiciones de prueba'',10,1,now(),now()+interval ''1 day'',true)', '42501');
select pg_temp.expect_error('update public.rewards set stock = 999', '42501');
select pg_temp.expect_error('insert into public.redemptions(user_id) values (auth.uid())', '42501');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000004', true);
select public.review_contribution(id, true) from public.claim_contributions order by id;
select public.review_contribution(id, true) from public.claim_contributions order by id;
-- Admin is also a vecino; their own claim/contribution/business cannot be approved.
insert into public.claims(category_id,title,description,address,neighborhood) values
  ('10000000-0000-4000-8000-000000000001','Reclamo del administrador','Descripción de prueba del administrador','Prueba 789','Centro');
select pg_temp.expect_error('select public.review_claim((select id from public.claims where title = ''Reclamo del administrador''), true)', '42501');
insert into public.claim_contributions(claim_id,kind,body,observed_at) values
  ('20000000-0000-4000-8000-000000000001','experiencia','Experiencia ficticia del administrador',now());
select pg_temp.expect_error('select public.review_contribution((select id from public.claim_contributions where body = ''Experiencia ficticia del administrador''), true)', '42501');
insert into public.businesses(name,description,address,neighborhood) values ('Comercio propio del admin','Comercio ficticio de prueba','Prueba 789','Centro');
select pg_temp.expect_error('select public.review_business((select id from public.businesses where name = ''Comercio propio del admin''), true)', '42501');
select public.review_business((select id from public.businesses where name = 'Comercio pendiente'), true);
select pg_temp.expect_error('select public.update_claim_status((select id from public.claims where title = ''Reclamo de prueba propio''),''resuelto'',''Cierre prematuro'')');
select public.update_claim_status((select id from public.claims where title = 'Reclamo de prueba propio'),'presentado','Presentación ficticia de prueba');
select public.update_claim_status((select id from public.claims where title = 'Reclamo de prueba propio'),'recepcion_confirmada','Recepción ficticia de prueba');
select public.update_claim_status((select id from public.claims where title = 'Reclamo de prueba propio'),'en_tratamiento','Tratamiento ficticio de prueba');
select public.update_claim_status((select id from public.claims where title = 'Reclamo de prueba propio'),'solucion_informada','Solución ficticia de prueba');
select public.update_claim_status((select id from public.claims where title = 'Reclamo de prueba propio'),'resuelto','Resolución ficticia de prueba');
select public.update_claim_status((select id from public.claims where title = 'Reclamo de prueba propio'),'en_revision','Reapertura ficticia de prueba');
select public.update_claim_status((select id from public.claims where title = 'Reclamo de prueba propio'),'presentado','Presentación ficticia de prueba');
select public.update_claim_status((select id from public.claims where title = 'Reclamo de prueba propio'),'recepcion_confirmada','Recepción ficticia de prueba');
select public.update_claim_status((select id from public.claims where title = 'Reclamo de prueba propio'),'en_tratamiento','Tratamiento ficticio de prueba');
select public.update_claim_status((select id from public.claims where title = 'Reclamo de prueba propio'),'solucion_informada','Solución ficticia de prueba');
select public.update_claim_status((select id from public.claims where title = 'Reclamo de prueba propio'),'resuelto','Segundo cierre ficticio de prueba');
reset role;
select pg_temp.assert_true((select sum(amount) = 60 and count(*) = 5 from public.point_movements), '20 + max 3x10 + one resolution award');
select pg_temp.assert_true((select count(*) = 11 from public.claim_history where claim_id = (select id from public.claims where title = 'Reclamo de prueba propio')), 'state history atomically recorded');

set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000002', true);
insert into public.businesses(name,description,address,neighborhood) values ('Comercio A','Comercio ficticio de prueba','Prueba 111','Centro');
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000003', true);
insert into public.businesses(name,description,address,neighborhood) values ('Comercio B','Comercio ficticio de prueba','Prueba 222','Centro');
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000004', true);
select public.review_business(id, true) from public.businesses where name in ('Comercio A','Comercio B');
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000002', true);
select public.save_reward((select id from public.businesses where name = 'Comercio A'),'Beneficio válido','Descripción ficticia','Condiciones originales',10,1,now()-interval '1 hour',now()+interval '1 day',true);
select public.save_reward((select id from public.businesses where name = 'Comercio A'),'Beneficio vencido','Descripción ficticia','Condiciones ficticias',10,1,now()-interval '2 days',now()-interval '1 day',true);
select public.save_reward((select id from public.businesses where name = 'Comercio A'),'Beneficio costoso','Descripción ficticia','Condiciones ficticias',1000,1,now()-interval '1 hour',now()+interval '1 day',true);
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000003', true);
select pg_temp.expect_error('select public.save_reward((select id from public.businesses where name = ''Comercio A''),''Invasión'',''Descripción ficticia'',''Condiciones ficticias'',10,1,now(),now()+interval ''1 day'',true)', '42501');
reset role;

-- Fix reward IDs for tests without exposing any merchant access to others' coupons.
update public.rewards set id = '40000000-0000-4000-8000-000000000001' where title = 'Beneficio válido';
update public.rewards set id = '40000000-0000-4000-8000-000000000002' where title = 'Beneficio vencido';
update public.rewards set id = '40000000-0000-4000-8000-000000000003' where title = 'Beneficio costoso';
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000003', true);
select pg_temp.expect_error('select public.redeem_reward(''40000000-0000-4000-8000-000000000001'',''50000000-0000-4000-8000-000000000001'')');
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000001', true);
select pg_temp.expect_error('select public.redeem_reward(''40000000-0000-4000-8000-000000000002'',''50000000-0000-4000-8000-000000000002'')');
select pg_temp.expect_error('select public.redeem_reward(''40000000-0000-4000-8000-000000000003'',''50000000-0000-4000-8000-000000000003'')');
select public.redeem_reward('40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000004');
select public.redeem_reward('40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000004');
select pg_temp.assert_true(public.get_my_balance() = 50, 'retry debits once');
select pg_temp.assert_true((select count(*) = 1 from public.redemptions), 'retry emits one coupon');
select pg_temp.expect_error('select public.redeem_reward(''40000000-0000-4000-8000-000000000001'',''50000000-0000-4000-8000-000000000005'')');
select pg_temp.expect_error('select public.redeem_reward(''40000000-0000-4000-8000-000000000003'',''50000000-0000-4000-8000-000000000004'')');
reset role;
select pg_temp.assert_true((select stock = 0 from public.rewards where id = '40000000-0000-4000-8000-000000000001'), 'stock decremented once');
update public.redemptions set coupon = '60000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000003', true);
select pg_temp.assert_true((select count(*) = 0 from public.redemptions), 'merchant cannot enumerate others redemptions');
select pg_temp.expect_error('select public.inspect_coupon(''60000000-0000-4000-8000-000000000001'')', '42501');
select pg_temp.expect_error('select public.use_coupon(''60000000-0000-4000-8000-000000000001'')', '42501');
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000002', true);
select public.save_reward((select id from public.businesses where name = 'Comercio A'),'Beneficio cambiado','Descripción ficticia','Condiciones cambiadas',20,0,now(),now()+interval '2 days',false,'40000000-0000-4000-8000-000000000001');
select pg_temp.assert_true((select conditions = 'Condiciones originales' from public.inspect_coupon('60000000-0000-4000-8000-000000000001')), 'coupon snapshot survives reward changes');
select public.use_coupon('60000000-0000-4000-8000-000000000001');
select pg_temp.expect_error('select public.use_coupon(''60000000-0000-4000-8000-000000000001'')');
reset role;
update public.redemptions set status = 'emitido', used_at = null,
  created_at = now() - interval '2 days', expires_at = now() - interval '1 day';
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000002', true);
select pg_temp.expect_error('select public.use_coupon(''60000000-0000-4000-8000-000000000001'')');
select pg_temp.assert_true((select status = 'vencido' from public.inspect_coupon('60000000-0000-4000-8000-000000000001')), 'expired coupon is labelled expired');
reset role;
update public.redemptions set status = 'cancelado', expires_at = now() + interval '1 day';
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000002', true);
select pg_temp.expect_error('select public.use_coupon(''60000000-0000-4000-8000-000000000001'')');
reset role;
select pg_temp.assert_true((select count(*) > 0 from private.admin_audit), 'admin actions audited');
select pg_temp.assert_true((select min(stock) >= 0 from public.rewards), 'stock nonnegative');
select pg_temp.assert_true(not exists(select user_id from public.point_movements group by user_id having sum(amount) < 0), 'ledger balances nonnegative');
rollback;
