// Invitation d'un utilisateur par e-mail (réservé aux administrateurs).
// Déploiement : supabase functions deploy invite-user
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

  // resend : renvoi de l'invitation à un compte pas encore activé, sans toucher au profil
  const { email, full_name, role, redirect_to, resend } = await req.json();
  if (!email || (!resend && !['actionnaire', 'gestionnaire'].includes(role))) {
    return json({ error: 'E-mail et rôle obligatoires' }, 400);
  }

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: redirect_to });
  if (error) {
    const already = error.code === 'email_exists' || /already been registered/i.test(error.message);
    return json({ error: already ? 'Ce compte est déjà activé : la personne peut se connecter avec « Recevoir un code par e-mail ».' : error.message }, 400);
  }

  if (!resend) await admin.from('profiles').update({ full_name, role }).eq('id', data.user.id);
  return json({ id: data.user.id });
});
