import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const configured = Boolean(url && key);

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
