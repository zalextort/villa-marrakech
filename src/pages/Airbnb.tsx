import { useEffect, useMemo, useState } from 'react';
import { useData } from '../data';
import { addDays, diffDays, formatDate, rangesOverlap, today } from '../lib/dates';
import { functionError, supabase } from '../lib/supabase';
import { AIRBNB_LISTING, type Booking } from '../lib/types';

interface AirbnbEvent { start: string; end: string; reserved: boolean; code: string | null; url: string | null }

type Status = 'conflict' | 'open' | 'missing' | 'dates' | 'elsewhere' | 'blocked' | 'ok';
interface Row { status: Status; start: string; airbnb?: AirbnbEvent; planning: Booking[]; detail: string }

// Du plus urgent au simple constat
const STATUS: Record<Status, { label: string; className: string }> = {
  conflict: { label: 'Conflit', className: 'danger-text' },
  open: { label: 'Ouvert sur Airbnb', className: 'danger-text' },
  missing: { label: 'Absente du planning', className: 'warn' },
  dates: { label: 'Dates différentes', className: 'warn' },
  elsewhere: { label: 'Hors Airbnb', className: 'muted' },
  blocked: { label: 'Bloqué sur Airbnb', className: 'muted' },
  ok: { label: 'Concordant', className: 'ok-text' },
};

const period = (start: string, end: string) => `${formatDate(start)} → ${formatDate(end)} (${diffDays(start, end)} n.)`;

export default function Airbnb() {
  const { bookings, partyById } = useData();
  const [events, setEvents] = useState<AirbnbEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  async function load() {
    setError(null);
    const { data, error } = await supabase.functions.invoke('airbnb-calendar');
    if (error) setError(await functionError(error));
    else setEvents(data.events);
  }
  useEffect(() => { load(); }, []);

  const labelOf = (b: Booking) => (b.kind === 'location' ? `Location${b.guest ? ` – ${b.guest}` : ''}` : `Séjour ${partyById(b.party_id)?.name ?? ''}`);

  const rows = useMemo(() => {
    if (!events) return [];
    const from = today();
    const evs = events.filter((e) => e.end > from);
    const bks = bookings.filter((b) => b.end_date > from);
    const rows: Row[] = [];
    const seen = new Set<string>();

    // Nuits fermées à la réservation sur Airbnb (réservées ou bloquées)
    const closed = new Set<string>();
    for (const e of evs) for (let d = e.start; d < e.end; d = addDays(d, 1)) closed.add(d);

    for (const e of evs.filter((e) => e.reserved)) {
      const over = bks.filter((b) => rangesOverlap(b.start_date, b.end_date, e.start, e.end));
      over.forEach((b) => seen.add(b.id));
      const stay = over.some((b) => b.kind === 'sejour');
      const same = over.length === 1 && over[0].start_date === e.start && over[0].end_date === e.end;
      rows.push({
        start: e.start, airbnb: e, planning: over,
        ...(stay ? { status: 'conflict', detail: "Séjour d'actionnaire pendant une réservation Airbnb" }
          : same ? { status: 'ok', detail: '' }
          : over.length ? { status: 'dates', detail: 'Les dates ne correspondent pas : à corriger d’un côté ou de l’autre' }
          : { status: 'missing', detail: 'Réservation Airbnb à saisir dans le planning' }),
      });
    }

    for (const b of bks.filter((b) => !seen.has(b.id))) {
      let open = 0;
      for (let d = b.start_date > from ? b.start_date : from; d < b.end_date; d = addDays(d, 1)) if (!closed.has(d)) open++;
      rows.push({
        start: b.start_date, planning: [b],
        ...(open ? { status: 'open', detail: `${open} nuit(s) encore réservable(s) sur Airbnb : risque de double réservation, à bloquer` }
          : b.kind === 'location' ? { status: 'elsewhere', detail: 'Pas une réservation Airbnb (autre plateforme ou location directe ?), dates bien bloquées sur Airbnb' }
          : { status: 'ok', detail: 'Dates bloquées sur Airbnb' }),
      });
    }

    for (const e of evs.filter((e) => !e.reserved)) {
      if (bks.some((b) => rangesOverlap(b.start_date, b.end_date, e.start, e.end))) continue;
      rows.push({ start: e.start, airbnb: e, planning: [], status: 'blocked', detail: 'Bloqué sur Airbnb alors que le planning est libre' });
    }
    return rows.sort((a, b) => a.start.localeCompare(b.start));
  }, [events, bookings]);

  const counts = rows.reduce((c, r) => ({ ...c, [r.status]: (c[r.status] ?? 0) + 1 }), {} as Partial<Record<Status, number>>);
  const shown = showAll ? rows : rows.filter((r) => r.status !== 'ok');

  return (
    <div className="page">
      <div className="page-head">
        <h1>Airbnb</h1>
        <div className="actions">
          <a className="button" href={AIRBNB_LISTING} target="_blank" rel="noopener noreferrer">Voir l'annonce ↗</a>
          <button onClick={load}>Actualiser</button>
        </div>
      </div>

      <div className="card table-wrap">
        <h2>Écarts entre Airbnb et le planning</h2>
        <p className="muted small">Réservations à venir du calendrier Airbnb, comparées aux séjours et locations du planning.</p>
        {error && <p className="danger-text">Calendrier Airbnb illisible : {error}</p>}
        {!events && !error && <p className="muted">Chargement du calendrier Airbnb…</p>}
        {events && (
          <>
            <div className="toolbar">
              {(Object.keys(STATUS) as Status[]).filter((s) => counts[s]).map((s) => (
                <span key={s} className={STATUS[s].className}>{STATUS[s].label} : {counts[s]}</span>
              ))}
              <span className="spacer" />
              <label><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Afficher les lignes concordantes</label>
            </div>
            {shown.length === 0 && <p className="ok-text">Aucun écart : Airbnb et le planning concordent.</p>}
            {shown.length > 0 && (
              <table className="table compact">
                <thead>
                  <tr><th>Statut</th><th>Airbnb</th><th>Planning</th><th>À faire</th></tr>
                </thead>
                <tbody>
                  {shown.map((r, i) => (
                    <tr key={i}>
                      <td className={STATUS[r.status].className}><strong>{STATUS[r.status].label}</strong></td>
                      <td>
                        {r.airbnb ? (
                          <>
                            {period(r.airbnb.start, r.airbnb.end)}
                            <div className="small muted">
                              {r.airbnb.reserved ? 'Réservé' : 'Indisponible'}
                              {r.airbnb.url && <> · <a href={r.airbnb.url} target="_blank" rel="noopener noreferrer">{r.airbnb.code ?? 'Réservation'}</a></>}
                            </div>
                          </>
                        ) : <span className="muted">—</span>}
                      </td>
                      <td>
                        {r.planning.length ? r.planning.map((b) => (
                          <div key={b.id}>
                            {period(b.start_date, b.end_date)}
                            <div className="small muted">{labelOf(b)}</div>
                          </div>
                        )) : <span className="muted">—</span>}
                      </td>
                      <td className="small">{r.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  );
}
