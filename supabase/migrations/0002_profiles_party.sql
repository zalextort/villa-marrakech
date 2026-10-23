-- Plusieurs utilisateurs peuvent être liés à une même partie (ex. un actionnaire et son conjoint).
-- Le lien passe de parties.profile_id (un seul compte) à profiles.party_id.

alter table profiles add column party_id uuid references parties (id) on delete set null;

update profiles pr set party_id = pa.id
from parties pa
where pa.profile_id = pr.id;

create or replace function owns_party(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and party_id = p)
$$;

alter table parties drop column profile_id;
