-- Date d'activation du compte (lien d'invitation ouvert ou première connexion par code),
-- recopiée depuis auth.users pour afficher le bouton « Renvoyer » sur les comptes en attente.

alter table profiles add column activated_at timestamptz;

update profiles pr set activated_at = u.email_confirmed_at
from auth.users u
where u.id = pr.id;

create function sync_profile_activation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update profiles set activated_at = new.email_confirmed_at where id = new.id;
  return new;
end $$;

create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row execute function sync_profile_activation();
