-- Bonnes adresses autour de la villa, classées par rubrique.
-- Tous les membres les consultent, en ajoutent et les modifient ;
-- seuls l'auteur et les administrateurs peuvent en supprimer.

create table addresses (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  name text not null,
  description text,
  address text,
  phone text,
  website text,
  created_by uuid default auth.uid() references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table addresses enable row level security;

create policy addresses_select on addresses for select to authenticated using (is_member());
create policy addresses_insert on addresses for insert to authenticated
  with check (is_member() and created_by = auth.uid());
create policy addresses_update on addresses for update to authenticated
  using (is_member()) with check (is_member());
create policy addresses_delete on addresses for delete to authenticated
  using (is_admin() or created_by = auth.uid());

create trigger addresses_touch before update on addresses
  for each row execute function touch_updated_at();
