-- Suppression d'un utilisateur : ses séjours restent, seul l'auteur est effacé.

alter table bookings drop constraint bookings_created_by_fkey;
alter table bookings add constraint bookings_created_by_fkey
  foreign key (created_by) references profiles (id) on delete set null;
