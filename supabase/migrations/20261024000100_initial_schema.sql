begin;

-- Initial installation only. Existing conflicting tables deliberately cause an
-- error so an incompatible remote schema is never silently overwritten.
create schema private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to anon, authenticated;

create type public.claim_status as enum (
  'publicado', 'en_revision', 'presentado', 'recepcion_confirmada',
  'en_tratamiento', 'solucion_informada', 'resuelto'
);
create type public.moderation_status as enum ('pendiente', 'aprobado', 'rechazado', 'oculto');
create type public.business_status as enum ('pendiente', 'aprobado', 'rechazado');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  display_name text not null default 'Vecino' check (char_length(display_name) between 1 and 80),
  neighborhood text check (char_length(neighborhood) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.user_roles (
  user_id uuid not null references public.profiles(id) on delete restrict,
  role text not null check (role in ('admin', 'ambassador')),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug in ('alumbrado','residuos','baches','veredas','arbolado','agua','electricidad','gas','otros')),
  name text not null check (char_length(name) between 1 and 80)
);
create table public.entities (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 160),
  website text check (website is null or (char_length(website) <= 500 and website ~ '^https://')),
  public_contact text check (char_length(public_contact) <= 200)
);
create table public.entity_categories (
  entity_id uuid not null references public.entities(id) on delete restrict,
  category_id uuid not null references public.categories(id) on delete restrict,
  primary key (entity_id, category_id)
);
create table public.claims (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references public.profiles(id) on delete restrict default auth.uid(),
  category_id uuid not null references public.categories(id) on delete restrict,
  entity_id uuid references public.entities(id) on delete restrict,
  title text not null check (char_length(title) between 5 and 160),
  description text not null check (char_length(description) between 10 and 5000),
  address text not null check (char_length(address) between 3 and 240),
  neighborhood text not null check (char_length(neighborhood) between 2 and 100),
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  status public.claim_status not null default 'publicado',
  moderation_status public.moderation_status not null default 'pendiente',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((latitude is null) = (longitude is null)),
  check (author_id is not null or is_demo)
);
create table public.claim_supports (
  claim_id uuid not null references public.claims(id) on delete restrict,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (claim_id, user_id)
);
create table public.claim_contributions (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims(id) on delete restrict,
  author_id uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  kind text not null check (kind in ('experiencia','evidencia','actualizacion')),
  body text not null check (char_length(body) between 20 and 4000),
  observed_at timestamptz not null check (observed_at <= now()),
  moderation_status public.moderation_status not null default 'pendiente',
  created_at timestamptz not null default now(),
  unique (id, claim_id)
);
-- Fingerprint of normalized text: repeating the same text cannot farm awards.
create unique index contribution_no_repeated_body on public.claim_contributions
  (claim_id, author_id, md5(lower(regexp_replace(btrim(body), '\s+', ' ', 'g'))));
create table public.claim_attachments (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims(id) on delete restrict,
  contribution_id uuid,
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  storage_path text not null unique check (char_length(storage_path) between 10 and 220),
  created_at timestamptz not null default now(),
  foreign key (contribution_id, claim_id) references public.claim_contributions(id, claim_id) on delete restrict
);
create table public.claim_history (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims(id) on delete restrict,
  previous_status public.claim_status,
  new_status public.claim_status not null,
  public_note text not null check (char_length(public_note) between 5 and 1000),
  created_at timestamptz not null default now()
);
-- Entire table is internal: no public row grants, including case numbers.
create table public.claim_referrals (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims(id) on delete restrict,
  entity_id uuid not null references public.entities(id) on delete restrict,
  referred_at timestamptz not null,
  channel text not null check (char_length(channel) between 2 and 100),
  case_number text check (char_length(case_number) <= 160),
  private_note text check (char_length(private_note) <= 4000),
  receipt_reference text check (char_length(receipt_reference) <= 500),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  name text not null check (char_length(name) between 2 and 160),
  description text not null check (char_length(description) between 10 and 2000),
  address text not null check (char_length(address) between 3 and 240),
  neighborhood text not null check (char_length(neighborhood) between 2 and 100),
  status public.business_status not null default 'pendiente',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.rewards (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  title text not null check (char_length(title) between 3 and 160),
  description text not null check (char_length(description) between 10 and 2000),
  conditions text not null check (char_length(conditions) between 5 and 3000),
  points_cost integer not null check (points_cost between 1 and 1000000),
  stock integer not null check (stock between 0 and 1000000),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create table public.redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  reward_id uuid not null references public.rewards(id) on delete restrict,
  business_id uuid not null references public.businesses(id) on delete restrict,
  coupon uuid not null unique default gen_random_uuid(),
  idempotency_key uuid not null,
  points_cost integer not null check (points_cost > 0),
  reward_title text not null,
  reward_conditions text not null,
  expires_at timestamptz not null,
  status text not null default 'emitido' check (status in ('emitido','usado','cancelado')),
  created_at timestamptz not null default now(),
  used_at timestamptz,
  unique (user_id, idempotency_key),
  check ((status = 'usado') = (used_at is not null)),
  check (expires_at > created_at)
);
create table public.point_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  amount integer not null check (amount <> 0),
  reason text not null check (reason in ('claim_validated','contribution_validated','claim_resolved','redemption')),
  event_id uuid not null,
  created_at timestamptz not null default now(),
  unique (reason, event_id),
  check ((reason = 'redemption' and amount < 0) or (reason <> 'redemption' and amount > 0))
);

create table private.point_rules (
  singleton boolean primary key default true check (singleton),
  claim_validated integer not null check (claim_validated > 0),
  contribution_validated integer not null check (contribution_validated > 0),
  claim_resolved integer not null check (claim_resolved > 0),
  contribution_limit integer not null check (contribution_limit between 1 and 100)
);
insert into private.point_rules values (true, 20, 10, 10, 3);
create table private.claim_validations (
  claim_id uuid primary key references public.claims(id) on delete restrict,
  validated boolean not null,
  reviewed_by uuid not null references public.profiles(id) on delete restrict,
  reviewed_at timestamptz not null default now()
);
create table private.admin_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null,
  subject_id uuid not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create table private.contribution_reviews (
  contribution_id uuid primary key references public.claim_contributions(id) on delete restrict,
  reviewed_by uuid not null references public.profiles(id) on delete restrict,
  reviewed_at timestamptz not null default now()
);

create index claims_category_idx on public.claims(category_id);
create index claims_entity_idx on public.claims(entity_id);
create index claims_author_idx on public.claims(author_id);
create index claims_listing_idx on public.claims(moderation_status, created_at desc, id);
create index claims_neighborhood_status_idx on public.claims(neighborhood, status);
create index entity_categories_category_idx on public.entity_categories(category_id);
create index supports_user_idx on public.claim_supports(user_id);
create index contributions_claim_idx on public.claim_contributions(claim_id, moderation_status);
create index contributions_author_idx on public.claim_contributions(author_id);
create index attachments_claim_idx on public.claim_attachments(claim_id);
create index attachments_contribution_idx on public.claim_attachments(contribution_id, claim_id);
create index attachments_owner_idx on public.claim_attachments(owner_id);
create index history_claim_idx on public.claim_history(claim_id, created_at);
create index referrals_claim_idx on public.claim_referrals(claim_id);
create index referrals_entity_idx on public.claim_referrals(entity_id);
create index referrals_actor_idx on public.claim_referrals(created_by);
create index businesses_owner_idx on public.businesses(owner_id, status);
create index rewards_business_idx on public.rewards(business_id);
create index rewards_listing_idx on public.rewards(active, ends_at);
create index redemptions_reward_idx on public.redemptions(reward_id);
create index redemptions_business_idx on public.redemptions(business_id);
create index movements_user_idx on public.point_movements(user_id, created_at);
create index validations_reviewer_idx on private.claim_validations(reviewed_by);
create index reviews_reviewer_idx on private.contribution_reviews(reviewed_by);
create index audit_actor_idx on private.admin_audit(actor_id);

create function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end;
$$;
create trigger profiles_updated before update on public.profiles for each row execute function private.touch_updated_at();
create trigger claims_updated before update on public.claims for each row execute function private.touch_updated_at();
create trigger businesses_updated before update on public.businesses for each row execute function private.touch_updated_at();
create trigger rewards_updated before update on public.rewards for each row execute function private.touch_updated_at();

-- No metadata is used for authority. Every Auth account is implicitly a vecino.
create function private.on_auth_user_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin insert into public.profiles(id) values (new.id); return new; end;
$$;
create trigger conectaros_auth_profile after insert on auth.users
for each row execute function private.on_auth_user_created();
-- Support accounts that already exist without changing their information.
insert into public.profiles(id) select id from auth.users on conflict (id) do nothing;

-- Lock down immediately; subsequent migrations only open specific operations.
do $$ declare t text; begin
  foreach t in array array['profiles','user_roles','categories','entities','entity_categories',
    'claims','claim_supports','claim_contributions','claim_attachments','claim_history',
    'claim_referrals','businesses','rewards','redemptions','point_movements'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
  end loop;
end $$;
revoke all on all tables in schema private from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
commit;
