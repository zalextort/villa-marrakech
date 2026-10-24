-- Notifications par e-mail des changements du planning (séjours et locations).
-- Chaque création, modification de dates ou annulation est journalisée ; toutes les minutes,
-- si plus rien n'a bougé depuis 3 minutes, la fonction notify-bookings envoie un récapitulatif
-- à tous les utilisateurs (sauf à l'auteur pour ses propres changements).
--
-- Secret partagé entre la tâche planifiée et la fonction (à créer une fois, hors du dépôt) :
--   select vault.create_secret('<secret>', 'notify_secret');
--   supabase secrets set NOTIFY_SECRET=<secret>

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- Préférence de chaque utilisateur, modifiable par lui-même dans « Mon compte »
alter table profiles add column notify boolean not null default true;

create function set_my_notify(value boolean) returns void
language sql security definer set search_path = public as $$
  update profiles set notify = value where id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- Journal des changements (lu uniquement par la fonction, avec la clé de service)
-- ---------------------------------------------------------------------------
create table booking_events (
  id bigint generated always as identity primary key,
  booking_id uuid not null,
  old jsonb,                 -- null = création
  new jsonb,                 -- null = annulation
  actor uuid,                -- null = modification faite hors du site (SQL, import)
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index on booking_events (sent_at) where sent_at is null;
alter table booking_events enable row level security;

-- Seuls comptent le type, les dates et l'actionnaire : le nom du client, le statut
-- ou les montants d'une location ne déclenchent pas de notification.
create function booking_snapshot(b bookings) returns jsonb
language sql immutable as $$
  select jsonb_build_object('kind', b.kind, 'start_date', b.start_date, 'end_date', b.end_date, 'party_id', b.party_id)
$$;

create function log_booking_event() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into booking_events (booking_id, new, actor) values (new.id, booking_snapshot(new), auth.uid());
  elsif tg_op = 'DELETE' then
    insert into booking_events (booking_id, old, actor) values (old.id, booking_snapshot(old), auth.uid());
  elsif booking_snapshot(old) is distinct from booking_snapshot(new) then
    insert into booking_events (booking_id, old, new, actor) values (new.id, booking_snapshot(old), booking_snapshot(new), auth.uid());
  end if;
  return null;
end $$;

create trigger bookings_log after insert or update or delete on bookings
  for each row execute function log_booking_event();

-- Réserve les changements à envoyer, une fois le planning calme depuis `quiet`.
-- En cas d'échec d'envoi, la fonction remet sent_at à null pour réessayer.
create function claim_booking_events(quiet interval default '3 minutes') returns setof booking_events
language plpgsql security definer set search_path = public as $$
begin
  if (select max(created_at) from booking_events where sent_at is null) > now() - quiet then
    return;
  end if;
  return query
    update booking_events set sent_at = now() where sent_at is null returning *;
end $$;

revoke execute on function claim_booking_events(interval) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tâche planifiée : appelle la fonction seulement s'il y a quelque chose à envoyer
-- ---------------------------------------------------------------------------
select cron.schedule('notify-bookings', '* * * * *', $$
  select net.http_post(
    url := 'https://orhjvisototqzcxwhmap.supabase.co/functions/v1/notify-bookings',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-notify-secret', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'notify_secret'), '')
    ),
    body := '{}'::jsonb
  )
  where (select max(created_at) from booking_events where sent_at is null) < now() - interval '3 minutes'
$$);
