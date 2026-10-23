import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const configured = Boolean(url && key);

// Retour d'un lien d'invitation : Supabase renvoie les jetons dans le hash (#access_token=…),
// format que le client en mode PKCE refuse et que le routeur prendrait pour une route.
// On les récupère ici, avant tout le reste, puis on nettoie l'adresse.
const hashParams = new URLSearchParams(window.location.hash.slice(1));
const accessToken = hashParams.get('access_token');
const refreshToken = hashParams.get('refresh_token');
export const urlTokens = accessToken && refreshToken ? { access_token: accessToken, refresh_token: refreshToken } : null;
/** Lien d'invitation ou de connexion expiré ou déjà utilisé. */
export const urlAuthError = hashParams.get('error_code') ?? hashParams.get('error');
if (urlTokens || urlAuthError) {
  window.history.replaceState(null, '', window.location.pathname + window.location.search + (urlTokens ? '#/moi' : ''));
}

// Flux PKCE : le lien de connexion revient avec ?code=… et ne gêne pas le routage par hash.
export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing', {
  auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/** Message d'erreur lisible en français. */
export function errorMessage(e: unknown): string {
  const err = e as { code?: string; message?: string } | null;
  if (err?.code === '23P01') return 'Ces dates chevauchent une occupation existante.';
  if (err?.code === '42501') return "Vous n'avez pas les droits pour cette action.";
  if (err?.message === 'Invalid login credentials') return 'E-mail ou mot de passe incorrect.';
  if (err?.message?.startsWith('Signups not allowed')) return "Aucun compte n'existe pour cet e-mail. Demandez une invitation à l'administrateur.";
  return err?.message ?? String(e);
}
