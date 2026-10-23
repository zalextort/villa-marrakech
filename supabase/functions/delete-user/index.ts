// Suppression d'un utilisateur (réservé aux administrateurs). Le profil suit par cascade.
// Déploiement : supabase functions deploy delete-user
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  const url = Deno.env.get('SUPABASE_URL')!;
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: isAdmin, error: adminErr } = await caller.rpc('is_admin');
  if (adminErr || !isAdmin) return json({ error: 'Accès réservé aux administrateurs' }, 403);

  const { id } = await req.json();
  if (!id) return json({ error: 'Utilisateur manquant' }, 400);
  const { data: me } = await caller.auth.getUser();
  if (me.user?.id === id) return json({ error: 'Vous ne pouvez pas supprimer votre propre compte' }, 400);

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return json({ error: error.message }, 400);
  return json({ id });
});
