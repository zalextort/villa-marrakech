import { useMemo, useState } from 'react';
import { useData } from '../data';
import StayModal from '../components/StayModal';
import RentalModal from '../components/RentalModal';
import Modal from '../components/Modal';
import { addDays, formatDate, MONTHS, parseISO, toISO, today, WEEKDAYS } from '../lib/dates';
import { useHolidays } from '../lib/holidays';
import { RENTAL_COLOR, STATUS_LABELS, type Booking } from '../lib/types';

type Dialog =
  | { type: 'stay'; booking?: Booking; start?: string }
  | { type: 'rental'; booking?: Booking; start?: string }
  | { type: 'choose'; start: string };

export default function Planning() {
  const { bookings, parties, partyById, myParty, isAdmin, canManageRentals } = useData();
  const now = new Date();
  const [month, setMonth] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const canBookStay = isAdmin || myParty?.kind === 'actionnaire';
  const holidays = useHolidays();

  const nightIndex = useMemo(() => {
    const map = new Map<string, Booking>();
    for (const b of bookings) for (let d = b.start_date; d < b.end_date; d = addDays(d, 1)) map.set(d, b);
    return map;
  }, [bookings]);

  const weeks = useMemo(() => {
    const first = new Date(month.y, month.m, 1);
    const offset = (first.getDay() + 6) % 7; // semaine commençant le lundi
    let d = toISO(new Date(month.y, month.m, 1 - offset));
    const rows: string[][] = [];
    for (let w = 0; w < 6; w++) {
      const row: string[] = [];
      for (let i = 0; i < 7; i++) {
        row.push(d);
        d = addDays(d, 1);
      }
      if (w > 3 && parseISO(row[0]).getMonth() !== month.m) break;
      rows.push(row);
    }
    return rows;
  }, [month]);

  const colorOf = (b: Booking) => (b.kind === 'location' ? RENTAL_COLOR : partyById(b.party_id)?.color ?? '#888');
  const labelOf = (b: Booking) => (b.kind === 'location' ? b.guest || 'Location' : partyById(b.party_id)?.name ?? 'Séjour');

  function openDay(day: string) {
    const b = nightIndex.get(day);
    if (b) return setDialog({ type: b.kind === 'location' ? 'rental' : 'stay', booking: b });
    if (day < today() && !isAdmin) return;
    if (canBookStay && canManageRentals) setDialog({ type: 'choose', start: day });
    else if (canManageRentals) setDialog({ type: 'rental', start: day });
    else if (canBookStay) setDialog({ type: 'stay', start: day });
  }

  const shift = (n: number) => setMonth(({ y, m }) => ({ y: m + n < 0 ? y - 1 : m + n > 11 ? y + 1 : y, m: (m + n + 12) % 12 }));
  const upcoming = bookings.filter((b) => b.end_date >= today()).slice(0, 12);
  const t = today();

  return (
    <div className="page">
      <div className="page-head">
        <h1>Planning</h1>
        <div className="actions">
          {canBookStay && <button className="primary" onClick={() => setDialog({ type: 'stay' })}>Réserver un séjour</button>}
          {canManageRentals && <button onClick={() => setDialog({ type: 'rental' })}>Nouvelle location</button>}
        </div>
      </div>

      <div className="card">
        <div className="cal-nav">
          <button onClick={() => shift(-1)} aria-label="Mois précédent">‹</button>
          <h2>{MONTHS[month.m]} {month.y}</h2>
          <button onClick={() => shift(1)} aria-label="Mois suivant">›</button>
          <button className="link" onClick={() => setMonth({ y: now.getFullYear(), m: now.getMonth() })}>Aujourd’hui</button>
        </div>
        <div className="calendar">
          {WEEKDAYS.map((w) => <div key={w} className="cal-weekday">{w}</div>)}
          {weeks.flat().map((day, i) => {
            const b = nightIndex.get(day);
            const prev = nightIndex.get(addDays(day, -1));
            const isStart = b && (b.start_date === day || i % 7 === 0);
            const departure = prev && prev !== b ? prev : undefined;
            const outside = parseISO(day).getMonth() !== month.m;
            const holiday = holidays.get(day);
            // Nom des vacances au premier jour, ou en début de semaine
            const holidayStart = holiday && (holidays.get(addDays(day, -1)) !== holiday || i % 7 === 0);
            const tip = [b ? `${labelOf(b)} · ${formatDate(b.start_date)} → ${formatDate(b.end_date)}` : 'Libre', holiday && `Vacances ${holiday} (zone B)`];
            return (
              <button
                key={day}
                className={`cal-day${outside ? ' outside' : ''}${day === t ? ' today' : ''}${b ? ' busy' : ''}`}
                onClick={() => openDay(day)}
                title={tip.filter(Boolean).join('\n')}
              >
                <span className="cal-num">
                  {parseISO(day).getDate()}
                  {holidayStart && <span className="cal-holiday-label">{holiday}</span>}
                </span>
                {holiday && <span className="cal-holiday" />}
                {departure && <span className="cal-departure" style={{ background: colorOf(departure) }} />}
                {b && (
                  <span
                    className={`cal-bar${b.start_date === day ? ' first' : ''}${addDays(day, 1) === b.end_date ? ' last' : ''}`}
                    style={{ background: colorOf(b) }}
                  >
                    {isStart && <span className="cal-label">{labelOf(b)}</span>}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="legend">
          {parties.filter((p) => p.kind === 'actionnaire').map((p) => (
            <span key={p.id}><i style={{ background: p.color }} />{p.name}</span>
          ))}
          <span><i style={{ background: RENTAL_COLOR }} />Location</span>
          <span><i className="holiday" />Vacances scolaires (zone B)</span>
          <span className="muted">Le jour de départ reste libre pour une nouvelle arrivée.</span>
        </div>
      </div>

      <div className="card">
        <h2>Prochaines occupations</h2>
        {upcoming.length === 0 && <p className="muted">Aucune occupation à venir.</p>}
        <ul className="occ-list">
          {upcoming.map((b) => (
            <li key={b.id} onClick={() => setDialog({ type: b.kind === 'location' ? 'rental' : 'stay', booking: b })}>
              <i style={{ background: colorOf(b) }} />
              <span className="occ-dates">{formatDate(b.start_date)} → {formatDate(b.end_date)}</span>
              <span>{labelOf(b)}</span>
              <span className="muted">
                {b.nights} nuit(s){b.kind === 'location' && b.status ? ` · ${STATUS_LABELS[b.status]}` : ''}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {dialog?.type === 'stay' && <StayModal booking={dialog.booking} defaultStart={dialog.start} onClose={() => setDialog(null)} />}
      {dialog?.type === 'rental' && <RentalModal booking={dialog.booking} defaultStart={dialog.start} onClose={() => setDialog(null)} />}
      {dialog?.type === 'choose' && (
        <Modal title={`Le ${formatDate(dialog.start)}`} onClose={() => setDialog(null)}>
          <div className="actions">
            <button className="primary" onClick={() => setDialog({ type: 'stay', start: dialog.start })}>Séjour actionnaire</button>
            <button onClick={() => setDialog({ type: 'rental', start: dialog.start })}>Location</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
