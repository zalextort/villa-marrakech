// Envoie par e-mail le récapitulatif des changements du planning (appelée par la tâche planifiée).
// Déploiement : supabase functions deploy notify-bookings --no-verify-jwt
// Secrets : NOTIFY_SECRET, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS (expéditeur = SMTP_USER)
import { createClient } from 'npm:@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6.9.16';

interface Snapshot { kind: 'sejour' | 'location'; start_date: string; end_date: string; party_id: string | null }
interface Event { id: number; booking_id: string; old: Snapshot | null; new: Snapshot | null; actor: string | null; created_at: string }
interface Change { before: Snapshot | null; after: Snapshot | null; actors: Set<string | null>; at: string }

const SITE = 'https://villa-sahbi.com/planning';

const fmt = (d: string) => d.split('-').reverse().join('/');
const nights = (s: Snapshot) => Math.round((Date.parse(s.end_date) - Date.parse(s.start_date)) / 86_400_000);
const period = (s: Snapshot) => `${fmt(s.start_date)} → ${fmt(s.end_date)} (${nights(s)} nuit${nights(s) > 1 ? 's' : ''})`;
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

Deno.serve(async (req) => {
  const secret = Deno.env.get('NOTIFY_SECRET');
  if (!secret || req.headers.get('x-notify-secret') !== secret) return new Response('Accès refusé', { status: 403 });

  // Test : { "only": "adresse@exemple.fr" } n'envoie qu'à ce destinataire
  const { only } = await req.json().catch(() => ({}));
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: events, error } = await db.rpc('claim_booking_events');
  if (error) return new Response(error.message, { status: 500 });
  if (!events?.length) return new Response('Rien à envoyer');

  try {
    const [{ data: parties }, { data: profiles }] = await Promise.all([
      db.from('parties').select('id, name'),
      db.from('profiles').select('id, email, full_name, role, is_admin, notify, activated_at'),
    ]);
    const partyName = new Map((parties ?? []).map((p) => [p.id, p.name as string]));
    const userName = new Map((profiles ?? []).map((p) => [p.id, ((p.full_name as string | null)?.trim() || p.email) as string]));

    // Plusieurs changements sur une même réservation n'en font qu'un : état de départ → état final
    const changes = new Map<string, Change>();
    for (const e of (events as Event[]).sort((a, b) => a.id - b.id)) {
      const c = changes.get(e.booking_id);
      if (c) {
        c.after = e.new;
        c.actors.add(e.actor);
        c.at = e.created_at;
      } else changes.set(e.booking_id, { before: e.old, after: e.new, actors: new Set([e.actor]), at: e.created_at });
    }
    const list = [...changes.values()]
      .filter((c) => (c.before || c.after) && JSON.stringify(c.before) !== JSON.stringify(c.after))
      .sort((a, b) => (a.after ?? a.before)!.start_date.localeCompare((b.after ?? b.before)!.start_date));

    const describe = (c: Change) => {
      const s = (c.after ?? c.before)!;
      const what = s.kind === 'sejour' ? `Séjour de ${partyName.get(s.party_id!) ?? '?'}` : 'Location';
      const by = [...c.actors].filter(Boolean).map((a) => userName.get(a!) ?? '?').join(', ');
      if (!c.before) return { title: `${what} – nouvelle réservation`, lines: [period(c.after!)], by };
      if (!c.after) return { title: `${what} – annulé${s.kind === 'location' ? 'e' : ''}`, lines: [`<s>${period(c.before)}</s>`], by };
      const lines = [`Avant : ${period(c.before)}`, `<strong>Maintenant : ${period(c.after)}</strong>`];
      if (c.before.kind === 'sejour' && c.after.party_id !== c.before.party_id) {
        lines.unshift(`Avant au nom de ${partyName.get(c.before.party_id!) ?? '?'}`);
      }
      return { title: `${what} – modifié${s.kind === 'location' ? 'e' : ''}`, lines, by };
    };

    const transport = nodemailer.createTransport({
      host: Deno.env.get('SMTP_HOST'),
      port: Number(Deno.env.get('SMTP_PORT') ?? 465),
      secure: true,
      auth: { user: Deno.env.get('SMTP_USER'), pass: Deno.env.get('SMTP_PASS') },
    });
    const from = `Villa Sahbi <${Deno.env.get('SMTP_USER')}>`;

    const recipients = (profiles ?? []).filter((p) => (only ? p.email === only : p.notify && p.activated_at && (p.role || p.is_admin)));
    let sent = 0;
    for (const r of recipients) {
      // On ne prévient pas quelqu'un de ses propres changements
      const mine = list.filter((c) => !(c.actors.size === 1 && c.actors.has(r.id)));
      if (!mine.length) continue;
      const items = mine.map(describe);
      const subject = items.length === 1
        ? `Planning de la villa : ${items[0].title}`
        : `Planning de la villa : ${items.length} changements`;
      const html = `<div style="font-family: Arial, Helvetica, sans-serif; color: #1f2937; max-width: 520px; margin: 0 auto; line-height: 1.5;">
  <h2 style="color: #c2410c; margin-bottom: 4px;">Villa Sahbi – Marrakech</h2>
  <p style="color: #6b7280; margin-top: 0;">Changement${items.length > 1 ? 's' : ''} au planning</p>
  ${items.map((i) => `<div style="border-left: 3px solid #c2410c; padding: 4px 12px; margin: 16px 0;">
    <strong>${esc(i.title)}</strong><br>${i.lines.join('<br>')}
    ${i.by ? `<br><span style="color: #6b7280; font-size: 13px;">par ${esc(i.by)}</span>` : ''}
  </div>`).join('\n  ')}
  <p style="text-align: center; margin: 24px 0;">
    <a href="${SITE}" style="background: #c2410c; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">Voir le planning</a>
  </p>
  <p style="color: #6b7280; font-size: 13px; margin-top: 32px; border-top: 1px solid #e5e7eb; padding-top: 12px;">
    Pour ne plus recevoir ces e-mails, décochez « Recevoir les notifications » dans « Mon compte ».<br>
    Villa Sahbi · contact@villa-sahbi.com
  </p>
</div>`;
      const text = items.map((i) => `${i.title}\n${i.lines.map((l) => l.replace(/<[^>]+>/g, '')).join('\n')}${i.by ? `\npar ${i.by}` : ''}`).join('\n\n')
        + `\n\nVoir le planning : ${SITE}`;
      await transport.sendMail({ from, to: r.email, subject, html, text });
      sent++;
    }
    return new Response(`${sent} e-mail(s) envoyé(s) pour ${list.length} changement(s)`);
  } catch (err) {
    // Échec : les changements seront renvoyés au prochain passage
    await db.from('booking_events').update({ sent_at: null }).in('id', (events as Event[]).map((e) => e.id));
    return new Response(String(err), { status: 500 });
  }
});
