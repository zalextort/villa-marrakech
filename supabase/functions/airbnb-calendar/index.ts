// Lit le calendrier Airbnb de la villa (export iCal) pour le comparer au planning.
// Déploiement : supabase functions deploy airbnb-calendar
// Secret : AIRBNB_ICAL_URL (Airbnb > Annonce > Disponibilités > Exporter le calendrier)
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const isoDate = (v: string) => `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  const caller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: isMember, error: memberErr } = await caller.rpc('is_member');
  if (memberErr || !isMember) return json({ error: 'Accès refusé' }, 403);

  const icalUrl = Deno.env.get('AIRBNB_ICAL_URL');
  if (!icalUrl) return json({ error: 'Lien du calendrier Airbnb non configuré' }, 500);

  const res = await fetch(icalUrl);
  if (!res.ok) return json({ error: `Calendrier Airbnb indisponible (${res.status})` }, 502);

  // Les lignes longues sont repliées : une ligne qui commence par une espace prolonge la précédente
  const lines = (await res.text()).replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const events: { start: string; end: string; reserved: boolean; code: string | null; url: string | null }[] = [];
  let cur: Record<string, string> | null = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') cur = {};
    else if (line === 'END:VEVENT' && cur) {
      if (cur.DTSTART && cur.DTEND) {
        // Le numéro de téléphone de la description n'est pas renvoyé
        const url = cur.DESCRIPTION?.match(/https:\/\/\S+?(?=\\n|\s|$)/)?.[0] ?? null;
        events.push({
          start: isoDate(cur.DTSTART),
          end: isoDate(cur.DTEND),
          reserved: /reserved/i.test(cur.SUMMARY ?? ''),
          code: url?.match(/HM[A-Z0-9]+/)?.[0] ?? null,
          url,
        });
      }
      cur = null;
    } else if (cur) {
      const i = line.indexOf(':');
      if (i > 0) cur[line.slice(0, i).split(';')[0]] = line.slice(i + 1);
    }
  }
  return json({ events: events.sort((a, b) => a.start.localeCompare(b.start)) });
});
