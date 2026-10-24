begin;

CREATE OR REPLACE FUNCTION private.is_admin() returns boolean language sql stable
security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.user_roles where user_id = auth.uid() and role = 'admin'
  );
$$;
create function private.claim_is_visible(p_id uuid) returns boolean language sql stable
security definer set search_path = '' as $$
  select exists (select 1 from public.claims where id = p_id and moderation_status = 'aprobado');
$$;
create function private.owns_claim(p_id uuid) returns boolean language sql stable
security definer set search_path = '' as $$
  select auth.uid() is not null and exists (select 1 from public.claims where id = p_id and author_id = auth.uid());
$$;
create function private.owns_approved_business(p_id uuid) returns boolean language sql stable
security definer set search_path = '' as $$
  select auth.uid() is not null and exists (select 1 from public.businesses
    where id = p_id and owner_id = auth.uid() and status = 'aprobado');
$$;
create function private.business_is_approved(p_id uuid) returns boolean language sql stable
security definer set search_path = '' as $$
  select exists (select 1 from public.businesses where id = p_id and status = 'aprobado');
$$;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_admin(), private.claim_is_visible(uuid),
  private.owns_claim(uuid), private.owns_approved_business(uuid),
  private.business_is_approved(uuid) to anon, authenticated;

grant select, update(display_name, neighborhood) on public.profiles to authenticated;
create policy profiles_self_read on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_self_update on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
grant select on public.user_roles to authenticated;
create policy roles_self_read on public.user_roles for select to authenticated using (user_id = (select auth.uid()));

grant select on public.categories, public.entities, public.entity_categories to anon, authenticated;
create policy categories_read on public.categories for select to anon, authenticated using (true);
create policy entities_read on public.entities for select to anon, authenticated using (true);
create policy entity_categories_read on public.entity_categories for select to anon, authenticated using (true);

-- Author IDs are not required in the visitor listing. Internal reviews are private.
grant select(id, category_id, entity_id, title, description, address, neighborhood,
  latitude, longitude, status, moderation_status, is_demo, created_at, updated_at)
  on public.claims to anon;
grant select on public.claims to authenticated;
grant insert(category_id, title, description, address, neighborhood, latitude, longitude)
  on public.claims to authenticated;
create policy claims_read on public.claims for select to anon, authenticated
  using (moderation_status = 'aprobado' or author_id = (select auth.uid()) or private.is_admin());
create policy claims_create on public.claims for insert to authenticated
  with check (author_id = (select auth.uid()) and not is_demo
    and moderation_status = 'pendiente' and status = 'publicado');
-- No direct UPDATE, including by administrators: use audited RPCs.

grant select, insert(claim_id), delete on public.claim_supports to authenticated;
create policy supports_self_read on public.claim_supports for select to authenticated using (user_id = (select auth.uid()));
create policy supports_self_insert on public.claim_supports for insert to authenticated
  with check (user_id = (select auth.uid()) and private.claim_is_visible(claim_id));
create policy supports_self_delete on public.claim_supports for delete to authenticated using (user_id = (select auth.uid()));

grant select(id, claim_id, kind, body, observed_at, moderation_status, created_at) on public.claim_contributions to anon;
grant select on public.claim_contributions to authenticated;
grant insert(claim_id, kind, body, observed_at) on public.claim_contributions to authenticated;
create policy contributions_read on public.claim_contributions for select to anon, authenticated using (
  (moderation_status = 'aprobado' and private.claim_is_visible(claim_id))
  or author_id = (select auth.uid()) or private.is_admin());
create policy contributions_insert on public.claim_contributions for insert to authenticated
  with check (author_id = (select auth.uid()) and moderation_status = 'pendiente' and private.claim_is_visible(claim_id));
-- Immutable submissions: corrections are a new contribution reviewed independently.

grant select(id, claim_id, contribution_id, storage_path, created_at) on public.claim_attachments to anon;
grant select on public.claim_attachments to authenticated;
grant insert(claim_id, contribution_id, storage_path) on public.claim_attachments to authenticated;
create policy attachments_read on public.claim_attachments for select to anon, authenticated using (
  owner_id = (select auth.uid()) or private.is_admin() or
  (private.claim_is_visible(claim_id) and (contribution_id is null or exists (
    select 1 from public.claim_contributions c where c.id = contribution_id and c.moderation_status = 'aprobado'
  )))
);
-- INSERT policy and storage binding trigger are added in the storage migration.
grant select on public.claim_history to anon, authenticated;
create policy history_read on public.claim_history for select to anon, authenticated using (private.claim_is_visible(claim_id));
grant select on public.claim_referrals to authenticated;
create policy referrals_admin_read on public.claim_referrals for select to authenticated using (private.is_admin());

grant select(id, name, description, address, neighborhood, status, created_at, updated_at) on public.businesses to anon;
grant select on public.businesses to authenticated;
grant insert(name, description, address, neighborhood) on public.businesses to authenticated;
create policy businesses_read on public.businesses for select to anon, authenticated
  using (status = 'aprobado' or owner_id = (select auth.uid()) or private.is_admin());
create policy businesses_create on public.businesses for insert to authenticated
  with check (owner_id = (select auth.uid()) and status = 'pendiente');
-- Editing public business identity requires another review, so no direct UPDATE.
grant select on public.rewards to anon, authenticated;
create policy rewards_read on public.rewards for select to anon, authenticated using (
  (active and stock > 0 and starts_at <= now() and ends_at > now() and private.business_is_approved(business_id))
  or private.owns_approved_business(business_id) or private.is_admin()
);
grant select on public.redemptions, public.point_movements to authenticated;
create policy redemptions_self_read on public.redemptions for select to authenticated using (user_id = (select auth.uid()));
create policy movements_self_read on public.point_movements for select to authenticated using (user_id = (select auth.uid()));

commit;
