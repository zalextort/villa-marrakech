-- Villa Marrakech – schéma initial
-- À exécuter dans Supabase > SQL Editor (ou `supabase db push`).

-- ---------------------------------------------------------------------------
-- Profils et rôles
-- ---------------------------------------------------------------------------
create type app_role as enum ('actionnaire', 'gestionnaire');

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role app_role,                       -- null = compte en attente de validation
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- Crée automatiquement le profil à la création d'un compte
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email) values (new.id, new.email);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Parties : SCI, actionnaires, administratrice (Louer à Marrakech)
-- ---------------------------------------------------------------------------
create type party_kind as enum ('sci', 'actionnaire', 'administratrice');

create table parties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_name text not null,            -- libellé court (colonnes Excel : Banque, LAM, PP…)
  kind party_kind not null,
  profile_id uuid unique references profiles (id) on delete set null,
  share_pct numeric(5, 2) not null default 0,
  color text not null default '#8a8a8a',
  sort int not null default 0
);

-- ---------------------------------------------------------------------------
-- Fonctions d'aide pour les règles RLS
-- ---------------------------------------------------------------------------
create function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false)
$$;

create function my_role() returns app_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create function is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or my_role() is not null
$$;

create function can_manage_rentals() returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or my_role() = 'gestionnaire'
$$;

create function owns_party(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from parties where id = p and profile_id = auth.uid())
$$;

-- ---------------------------------------------------------------------------
-- Occupations (planning) : séjours d'actionnaires et locations
-- La date de départ est libre (une arrivée peut avoir lieu le jour d'un départ).
-- ---------------------------------------------------------------------------
create type booking_kind as enum ('sejour', 'location');
create type rental_status as enum ('reserve', 'en_cours', 'termine', 'paye');

create table bookings (
  id uuid primary key default gen_random_uuid(),
  kind booking_kind not null,
  start_date date not null,
  end_date date not null,
  nights int generated always as (end_date - start_date) stored,
  party_id uuid references parties (id),          -- actionnaire (séjours)
  guest text,                                      -- locataire ou référence (locations)
  platform text,
  status rental_status,
  comment text,
  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dates_ok check (end_date > start_date),
  constraint sejour_has_party check (kind <> 'sejour' or party_id is not null),
  constraint location_has_status check (kind <> 'location' or status is not null),
  -- Contrôle des chevauchements : deux occupations ne peuvent pas se recouvrir
  constraint no_overlap exclude using gist (daterange(start_date, end_date, '[)') with &&)
);

-- ---------------------------------------------------------------------------
-- Lignes financières (une ligne = une ligne du tableau Excel)
-- Loyer principal, prestations annexes (jacuzzi, hammam…) ou encaissement global.
-- ---------------------------------------------------------------------------
create table rental_lines (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings (id) on delete cascade,
  ref_date date not null,                          -- date de rattachement (arrivée ou encaissement)
  label text,                                      -- client / libellé
  item text not null default 'Location',           -- prestation
  amount_ttc numeric(12, 2) not null default 0,    -- montant facturé (Loyer TTC)
  vat_rate numeric(5, 2) not null default 0,       -- TVA en % (20 ou 0)
  amount_paid numeric(12, 2) not null default 0,   -- montant encaissé
  paid_on date,
  collected_by uuid references parties (id),       -- Banque SCI / actionnaire / administratrice
  commission_ttc numeric(12, 2) not null default 0,
  commission_paid numeric(12, 2) not null default 0,
  commission_paid_on date,
  commission_paid_by uuid references parties (id), -- en général la SCI
  invoice_ref text,
  recap_month date,
  comment text,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  constraint paid_has_collector check (amount_paid = 0 or collected_by is not null),
  constraint com_paid_has_payer check (commission_paid = 0 or commission_paid_by is not null)
);

create index on rental_lines (booking_id);
create index on rental_lines (ref_date);

-- ---------------------------------------------------------------------------
-- Règlements entre parties (virement LAM → SCI, remboursement d'un actionnaire…)
-- ---------------------------------------------------------------------------
create table settlements (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  from_party uuid not null references parties (id),
  to_party uuid not null references parties (id),
  amount numeric(12, 2) not null check (amount > 0),
  label text,
  created_at timestamptz not null default now(),
  constraint distinct_parties check (from_party <> to_party)
);

-- ---------------------------------------------------------------------------
-- Paramètres (ligne unique)
-- ---------------------------------------------------------------------------
create table settings (
  id int primary key default 1 check (id = 1),
  commission_rate numeric(5, 2) not null default 20,  -- % du loyer TTC
  default_vat_rate numeric(5, 2) not null default 20
);
insert into settings default values;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table profiles enable row level security;
alter table parties enable row level security;
alter table bookings enable row level security;
alter table rental_lines enable row level security;
alter table settlements enable row level security;
alter table settings enable row level security;

create policy profiles_select on profiles for select to authenticated
  using (id = auth.uid() or is_member());
create policy profiles_admin on profiles for update to authenticated
  using (is_admin()) with check (is_admin());
create policy profiles_admin_delete on profiles for delete to authenticated
  using (is_admin());

create policy parties_select on parties for select to authenticated using (is_member());
create policy parties_admin on parties for all to authenticated
  using (is_admin()) with check (is_admin());

create policy bookings_select on bookings for select to authenticated using (is_member());
create policy bookings_insert on bookings for insert to authenticated with check (
  is_admin()
  or (kind = 'sejour' and my_role() = 'actionnaire' and owns_party(party_id))
  or (kind = 'location' and my_role() = 'gestionnaire')
);
create policy bookings_update on bookings for update to authenticated
  using (
    is_admin()
    or (kind = 'sejour' and my_role() = 'actionnaire' and owns_party(party_id))
    or (kind = 'location' and my_role() = 'gestionnaire')
  )
  with check (
    is_admin()
    or (kind = 'sejour' and my_role() = 'actionnaire' and owns_party(party_id))
    or (kind = 'location' and my_role() = 'gestionnaire')
  );
create policy bookings_delete on bookings for delete to authenticated using (
  is_admin()
  or (kind = 'sejour' and my_role() = 'actionnaire' and owns_party(party_id))
  or (kind = 'location' and my_role() = 'gestionnaire')
);

create policy lines_select on rental_lines for select to authenticated using (is_member());
create policy lines_write on rental_lines for all to authenticated
  using (can_manage_rentals()) with check (can_manage_rentals());

create policy settlements_select on settlements for select to authenticated using (is_member());
create policy settlements_write on settlements for all to authenticated
  using (can_manage_rentals()) with check (can_manage_rentals());

create policy settings_select on settings for select to authenticated using (is_member());
create policy settings_admin on settings for update to authenticated
  using (is_admin()) with check (is_admin());

-- Horodatage des modifications
create function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger bookings_touch before update on bookings
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Parties initiales (à renommer / compléter dans l'écran Administration)
-- ---------------------------------------------------------------------------
insert into parties (name, short_name, kind, share_pct, color, sort) values
  ('SCI (compte bancaire)', 'Banque', 'sci', 0, '#475569', 0),
  ('Louer à Marrakech', 'LAM', 'administratrice', 0, '#c2410c', 10),
  ('Philippe Patenotte', 'PP', 'actionnaire', 40, '#2563eb', 20),
  ('Emmanuel Le Hello', 'ELH', 'actionnaire', 20, '#16a34a', 30),
  ('Geoffroy de Lacotte', 'GDL', 'actionnaire', 20, '#9333ea', 40),
  ('Alexandre Tort', 'AT', 'actionnaire', 20, '#db2777', 50);

-- Mise à jour en direct du planning
alter publication supabase_realtime add table bookings;
