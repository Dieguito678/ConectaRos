begin;

create function private.require_admin() returns uuid language plpgsql
security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Administrador requerido' using errcode = '42501'; end if;
  return auth.uid();
end;
$$;
create function private.award_points(p_user uuid, p_amount integer, p_reason text, p_event uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_user is null then return; end if; -- Authorless seed records never earn points.
  perform 1 from public.profiles where id = p_user for update;
  insert into public.point_movements(user_id, amount, reason, event_id)
    values (p_user, p_amount, p_reason, p_event) on conflict (reason, event_id) do nothing;
end;
$$;

create function public.review_business(p_business_id uuid, p_approved boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_admin(); b public.businesses%rowtype;
begin
  if p_approved is null then raise exception 'Falta decisión'; end if;
  select * into b from public.businesses where id = p_business_id for update;
  if not found then raise exception 'Comercio inexistente'; end if;
  if b.owner_id = actor then raise exception 'No se puede revisar el propio comercio' using errcode = '42501'; end if;
  -- Serialize all approvals for one owner, including different businesses.
  perform pg_advisory_xact_lock(hashtextextended(b.owner_id::text, 17));
  update public.businesses set status = case when p_approved then 'aprobado'::public.business_status else 'rechazado'::public.business_status end
    where id = b.id;
  if exists (select 1 from public.businesses where owner_id = b.owner_id and status = 'aprobado') then
    insert into public.user_roles(user_id, role) values (b.owner_id, 'ambassador') on conflict do nothing;
  else
    delete from public.user_roles where user_id = b.owner_id and role = 'ambassador';
  end if;
  insert into private.admin_audit(actor_id, action, subject_id, details)
    values (actor, 'review_business', b.id, jsonb_build_object('approved', p_approved));
end;
$$;

create function public.review_claim(p_claim_id uuid, p_approved boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_admin(); c public.claims%rowtype; award integer;
begin
  if p_approved is null then raise exception 'Falta decisión'; end if;
  select * into c from public.claims where id = p_claim_id for update;
  if not found then raise exception 'Reclamo inexistente'; end if;
  if c.author_id = actor then raise exception 'No se puede validar el propio reclamo' using errcode = '42501'; end if;
  if p_approved and c.status = 'resuelto' and not exists (
    select 1 from private.claim_validations where claim_id = c.id
  ) then raise exception 'Reabrir el reclamo antes de su primera validación'; end if;
  insert into private.claim_validations(claim_id, validated, reviewed_by)
    values (c.id, p_approved, actor) on conflict (claim_id) do update
      set validated = excluded.validated, reviewed_by = excluded.reviewed_by, reviewed_at = now();
  update public.claims set moderation_status = case when p_approved then 'aprobado'::public.moderation_status else 'rechazado'::public.moderation_status end where id = c.id;
  if p_approved and not c.is_demo then
    select claim_validated into award from private.point_rules where singleton;
    perform private.award_points(c.author_id, award, 'claim_validated', c.id);
  end if;
  -- Revocation hides the record; past earned credits stay in the immutable ledger.
  insert into private.admin_audit(actor_id, action, subject_id, details)
    values (actor, 'review_claim', c.id, jsonb_build_object('approved', p_approved));
end;
$$;

create function public.hide_claim(p_claim_id uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_admin(); c public.claims%rowtype;
begin
  if p_note is null or char_length(p_note) not between 5 and 1000 then raise exception 'Motivo requerido (5-1000 caracteres)'; end if;
  select * into c from public.claims where id = p_claim_id for update;
  if not found then raise exception 'Reclamo inexistente'; end if;
  if c.author_id = actor then raise exception 'Requiere otro administrador' using errcode = '42501'; end if;
  update public.claims set moderation_status = 'oculto' where id = c.id;
  insert into private.admin_audit(actor_id, action, subject_id, details)
    values (actor, 'hide_claim', c.id, jsonb_build_object('private_note', p_note));
end;
$$;

create function public.review_contribution(p_contribution_id uuid, p_approved boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_admin(); v public.claim_contributions%rowtype;
  claim_uuid uuid; awarded_count integer; rules private.point_rules%rowtype;
begin
  if p_approved is null then raise exception 'Falta decisión'; end if;
  select claim_id into claim_uuid from public.claim_contributions where id = p_contribution_id;
  if not found then raise exception 'Aporte inexistente'; end if;
  -- Same order as claim review: claim, contribution, then user's ledger lock.
  perform 1 from public.claims where id = claim_uuid for update;
  select * into v from public.claim_contributions where id = p_contribution_id for update;
  if v.author_id = actor then raise exception 'No se puede validar el propio aporte' using errcode = '42501'; end if;
  if p_approved and not private.claim_is_visible(v.claim_id) then raise exception 'Reclamo no visible'; end if;
  perform 1 from public.profiles where id = v.author_id for update;
  update public.claim_contributions set moderation_status = case when p_approved then 'aprobado'::public.moderation_status else 'rechazado'::public.moderation_status end where id = v.id;
  insert into private.contribution_reviews(contribution_id, reviewed_by) values (v.id, actor)
    on conflict (contribution_id) do update set reviewed_by = excluded.reviewed_by, reviewed_at = now();
  if p_approved then
    select * into rules from private.point_rules where singleton;
    select count(*) into awarded_count from public.point_movements m
      join public.claim_contributions cc on cc.id = m.event_id
      where m.user_id = v.author_id and m.reason = 'contribution_validated' and cc.claim_id = v.claim_id;
    if awarded_count < rules.contribution_limit then
      perform private.award_points(v.author_id, rules.contribution_validated, 'contribution_validated', v.id);
    end if;
  end if;
  insert into private.admin_audit(actor_id, action, subject_id, details)
    values (actor, 'review_contribution', v.id, jsonb_build_object('approved', p_approved));
end;
$$;

create function public.update_claim_status(p_claim_id uuid, p_status public.claim_status, p_public_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_admin(); c public.claims%rowtype; allowed boolean; award integer;
begin
  if p_status is null or p_public_note is null or char_length(p_public_note) not between 5 and 1000 then
    raise exception 'Estado y nota pública (5-1000 caracteres) requeridos';
  end if;
  select * into c from public.claims where id = p_claim_id for update;
  if not found then raise exception 'Reclamo inexistente'; end if;
  if c.author_id = actor then raise exception 'Requiere otro administrador' using errcode = '42501'; end if;
  if c.moderation_status <> 'aprobado' then raise exception 'Reclamo no visible'; end if;
  allowed := case c.status
    when 'publicado' then p_status in ('en_revision','presentado')
    when 'en_revision' then p_status = 'presentado'
    when 'presentado' then p_status in ('recepcion_confirmada','en_revision')
    when 'recepcion_confirmada' then p_status in ('en_tratamiento','en_revision')
    when 'en_tratamiento' then p_status in ('solucion_informada','en_revision')
    when 'solucion_informada' then p_status in ('resuelto','en_tratamiento')
    when 'resuelto' then p_status = 'en_revision'
    else false end;
  if not allowed then raise exception 'Transición de estado no permitida'; end if;
  if p_status = 'resuelto' and not exists (
    select 1 from private.claim_validations where claim_id = c.id and validated
  ) then raise exception 'La resolución requiere un reclamo validado'; end if;
  update public.claims set status = p_status where id = c.id;
  insert into public.claim_history(claim_id, previous_status, new_status, public_note)
    values (c.id, c.status, p_status, p_public_note);
  if p_status = 'resuelto' and not c.is_demo then
    select claim_resolved into award from private.point_rules where singleton;
    perform private.award_points(c.author_id, award, 'claim_resolved', c.id);
  end if;
  insert into private.admin_audit(actor_id, action, subject_id, details)
    values (actor, 'update_claim_status', c.id, jsonb_build_object('from', c.status, 'to', p_status));
end;
$$;

create function public.record_claim_referral(p_claim_id uuid, p_entity_id uuid,
  p_referred_at timestamptz, p_channel text, p_case_number text default null,
  p_private_note text default null, p_receipt_reference text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_admin(); referral_uuid uuid;
begin
  perform 1 from public.claims where id = p_claim_id for update;
  if not found then raise exception 'Reclamo inexistente'; end if;
  if p_referred_at > now() then raise exception 'La derivación no puede ser futura'; end if;
  insert into public.claim_referrals(claim_id, entity_id, referred_at, channel, case_number, private_note, receipt_reference, created_by)
    values (p_claim_id, p_entity_id, p_referred_at, p_channel, p_case_number, p_private_note, p_receipt_reference, actor)
    returning id into referral_uuid;
  update public.claims set entity_id = p_entity_id where id = p_claim_id;
  -- Private receipt_reference is an internal document reference, never a public URL.
  insert into private.admin_audit(actor_id, action, subject_id, details)
    values (actor, 'record_referral', p_claim_id, jsonb_build_object('referral_id', referral_uuid));
  return referral_uuid;
end;
$$;

-- All stock changes, including replenishment, go through a locked RPC.
create function public.save_reward(p_business_id uuid, p_title text, p_description text,
  p_conditions text, p_points_cost integer, p_stock integer, p_starts_at timestamptz,
  p_ends_at timestamptz, p_active boolean, p_reward_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare b public.businesses%rowtype; result_id uuid;
begin
  if auth.uid() is null then raise exception 'Iniciá sesión' using errcode = '42501'; end if;
  select * into b from public.businesses where id = p_business_id for update;
  if not found or b.owner_id <> auth.uid() or b.status <> 'aprobado' then
    raise exception 'Comercio no autorizado' using errcode = '42501';
  end if;
  if p_reward_id is null then
    insert into public.rewards(business_id, title, description, conditions, points_cost, stock, starts_at, ends_at, active)
      values (b.id, p_title, p_description, p_conditions, p_points_cost, p_stock, p_starts_at, p_ends_at, p_active)
      returning id into result_id;
  else
    update public.rewards set title = p_title, description = p_description, conditions = p_conditions,
      points_cost = p_points_cost, stock = p_stock, starts_at = p_starts_at, ends_at = p_ends_at, active = p_active
      where id = p_reward_id and business_id = b.id returning id into result_id;
    if not found then raise exception 'Beneficio no autorizado' using errcode = '42501'; end if;
  end if;
  return result_id;
end;
$$;

create function public.redeem_reward(p_reward_id uuid, p_idempotency_key uuid)
returns public.redemptions language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); r public.rewards%rowtype; b public.businesses%rowtype;
  prior public.redemptions%rowtype; result_row public.redemptions%rowtype; balance bigint; business_uuid uuid;
begin
  if actor is null then raise exception 'Iniciá sesión' using errcode = '42501'; end if;
  if p_idempotency_key is null then raise exception 'Clave de idempotencia requerida'; end if;
  -- One ledger lock per user serializes spending and earning; no stored balance to drift.
  perform 1 from public.profiles where id = actor for update;
  if not found then raise exception 'Perfil inexistente'; end if;
  select * into prior from public.redemptions where user_id = actor and idempotency_key = p_idempotency_key;
  if found then
    if prior.reward_id <> p_reward_id then raise exception 'La clave ya se usó para otro beneficio'; end if;
    return prior;
  end if;
  select business_id into business_uuid from public.rewards where id = p_reward_id;
  if not found then raise exception 'Beneficio no disponible'; end if;
  select * into b from public.businesses where id = business_uuid for update;
  select * into r from public.rewards where id = p_reward_id for update;
  if b.status <> 'aprobado' or not r.active or r.starts_at > clock_timestamp() or r.ends_at <= clock_timestamp() then
    raise exception 'Beneficio no disponible o vencido';
  end if;
  if r.stock < 1 then raise exception 'Sin stock'; end if;
  select coalesce(sum(amount), 0) into balance from public.point_movements where user_id = actor;
  if balance < r.points_cost then raise exception 'Saldo insuficiente'; end if;
  insert into public.redemptions(user_id, reward_id, business_id, idempotency_key,
      points_cost, reward_title, reward_conditions, expires_at)
    values (actor, r.id, b.id, p_idempotency_key, r.points_cost, r.title, r.conditions, r.ends_at)
    returning * into result_row;
  insert into public.point_movements(user_id, amount, reason, event_id)
    values (actor, -r.points_cost, 'redemption', result_row.id);
  update public.rewards set stock = stock - 1 where id = r.id;
  return result_row;
end;
$$;

-- Possession of an unguessable UUID and ownership of the associated approved
-- business are both required. No merchant can SELECT the redemptions table.
create function public.inspect_coupon(p_coupon uuid)
returns table(redemption_id uuid, title text, conditions text, expires_at timestamptz, status text)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Iniciá sesión' using errcode = '42501'; end if;
  return query select d.id, d.reward_title, d.reward_conditions, d.expires_at,
    case when d.status = 'emitido' and d.expires_at <= clock_timestamp() then 'vencido' else d.status end
    from public.redemptions d join public.businesses b on b.id = d.business_id
    where d.coupon = p_coupon and b.owner_id = auth.uid() and b.status = 'aprobado';
  if not found then raise exception 'Cupón no disponible' using errcode = '42501'; end if;
end;
$$;
create function public.use_coupon(p_coupon uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare business_uuid uuid; b public.businesses%rowtype; d public.redemptions%rowtype;
begin
  if auth.uid() is null then raise exception 'Iniciá sesión' using errcode = '42501'; end if;
  select business_id into business_uuid from public.redemptions where coupon = p_coupon;
  if not found then raise exception 'Cupón no disponible' using errcode = '42501'; end if;
  select * into b from public.businesses where id = business_uuid for update;
  if b.owner_id <> auth.uid() or b.status <> 'aprobado' then raise exception 'Cupón no disponible' using errcode = '42501'; end if;
  select * into d from public.redemptions where coupon = p_coupon for update;
  if d.status <> 'emitido' or d.expires_at <= clock_timestamp() then raise exception 'Cupón utilizado, cancelado o vencido'; end if;
  update public.redemptions set status = 'usado', used_at = clock_timestamp() where id = d.id;
end;
$$;

create function public.get_my_balance() returns bigint language plpgsql stable
security definer set search_path = '' as $$
declare result_balance bigint;
begin
  if auth.uid() is null then raise exception 'Iniciá sesión' using errcode = '42501'; end if;
  select coalesce(sum(amount), 0) into result_balance from public.point_movements where user_id = auth.uid();
  return result_balance;
end;
$$;
create function public.get_claim_support_counts(p_claim_ids uuid[])
returns table(claim_id uuid, support_count bigint) language plpgsql stable
security definer set search_path = '' as $$
begin
  if coalesce(cardinality(p_claim_ids), 0) > 200 then raise exception 'Máximo 200 reclamos por consulta'; end if;
  return query select c.id, count(s.user_id) from public.claims c
    left join public.claim_supports s on s.claim_id = c.id
    where c.id = any(p_claim_ids) and c.moderation_status = 'aprobado' group by c.id;
end;
$$;

revoke execute on function private.require_admin(), private.award_points(uuid, integer, text, uuid) from public, anon, authenticated;
revoke execute on function public.review_business(uuid, boolean), public.review_claim(uuid, boolean),
  public.hide_claim(uuid, text), public.review_contribution(uuid, boolean),
  public.update_claim_status(uuid, public.claim_status, text),
  public.record_claim_referral(uuid, uuid, timestamptz, text, text, text, text),
  public.save_reward(uuid, text, text, text, integer, integer, timestamptz, timestamptz, boolean, uuid),
  public.redeem_reward(uuid, uuid), public.inspect_coupon(uuid), public.use_coupon(uuid),
  public.get_my_balance(), public.get_claim_support_counts(uuid[]) from public, anon, authenticated;
grant execute on function public.review_business(uuid, boolean), public.review_claim(uuid, boolean),
  public.hide_claim(uuid, text), public.review_contribution(uuid, boolean),
  public.update_claim_status(uuid, public.claim_status, text),
  public.record_claim_referral(uuid, uuid, timestamptz, text, text, text, text),
  public.save_reward(uuid, text, text, text, integer, integer, timestamptz, timestamptz, boolean, uuid),
  public.redeem_reward(uuid, uuid), public.inspect_coupon(uuid), public.use_coupon(uuid),
  public.get_my_balance() to authenticated;
grant execute on function public.get_claim_support_counts(uuid[]) to anon, authenticated;
commit;
