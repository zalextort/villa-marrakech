import { useState, type FormEvent } from 'react';
import Modal from './Modal';
import { useData } from '../data';
import { addDays, diffDays, formatDate, rangesOverlap } from '../lib/dates';
import { errorMessage, supabase } from '../lib/supabase';
import type { Booking } from '../lib/types';

interface Props {
  booking?: Booking;
  defaultStart?: string;
  onClose: () => void;
}

/** Séjour d'un actionnaire : création, modification, annulation. */
export default function StayModal({ booking, defaultStart, onClose }: Props) {
  const { parties, bookings, myParty, isAdmin, partyById, reload } = useData();
  const shareholders = parties.filter((p) => p.kind === 'actionnaire');
  const [partyId, setPartyId] = useState(booking?.party_id ?? myParty?.id ?? shareholders[0]?.id ?? '');
  const [start, setStart] = useState(booking?.start_date ?? defaultStart ?? '');
  const [end, setEnd] = useState(booking?.end_date ?? (defaultStart ? addDays(defaultStart, 3) : ''));
  const [comment, setComment] = useState(booking?.comment ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canEdit = isAdmin || (myParty?.kind === 'actionnaire' && (!booking || booking.party_id === myParty.id));
  const nights = start && end ? diffDays(start, end) : 0;
  const conflict = start && end && nights > 0
    ? bookings.find((b) => b.id !== booking?.id && rangesOverlap(start, end, b.start_date, b.end_date))
    : undefined;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (nights <= 0) return setError('La date de départ doit être après la date d’arrivée.');
    if (conflict) return setError('Ces dates chevauchent une occupation existante.');
    setBusy(true);
    const row = { kind: 'sejour' as const, party_id: partyId, start_date: start, end_date: end, comment: comment || null };
    const { error } = booking
      ? await supabase.from('bookings').update(row).eq('id', booking.id)
      : await supabase.from('bookings').insert(row);
    setBusy(false);
    if (error) return setError(errorMessage(error));
    await reload();
    onClose();
  }

  async function remove() {
    if (!booking || !confirm('Annuler ce séjour ?')) return;
    const { error } = await supabase.from('bookings').delete().eq('id', booking.id);
    if (error) return setError(errorMessage(error));
    await reload();
    onClose();
  }

  if (!canEdit && booking) {
    return (
      <Modal title="Séjour actionnaire" onClose={onClose}>
        <p><strong>{partyById(booking.party_id)?.name}</strong></p>
        <p>Du {formatDate(booking.start_date)} au {formatDate(booking.end_date)} · {booking.nights} nuit(s)</p>
        {booking.comment && <p className="muted">{booking.comment}</p>}
      </Modal>
    );
  }

  return (
    <Modal title={booking ? 'Modifier le séjour' : 'Réserver un séjour'} onClose={onClose}>
      <form onSubmit={save}>
        <label>
          Actionnaire
          <select value={partyId} onChange={(e) => setPartyId(e.target.value)} disabled={!isAdmin}>
            {shareholders.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <div className="row2">
          <label>
            Arrivée
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} required />
          </label>
          <label>
            Départ
            <input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} required />
          </label>
        </div>
        <p className="muted">{nights > 0 ? `${nights} nuit(s)` : '—'}</p>
        {conflict && (
          <p className="error-text">
            Période déjà occupée ({conflict.kind === 'location' ? 'location' : partyById(conflict.party_id)?.name} du{' '}
            {formatDate(conflict.start_date)} au {formatDate(conflict.end_date)}).
          </p>
        )}
        <label>
          Commentaire
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} />
        </label>
        {error && <p className="error-text">{error}</p>}
        <div className="actions">
          <button className="primary" type="submit" disabled={busy || Boolean(conflict)}>Enregistrer</button>
          {booking && <button type="button" className="danger" onClick={remove}>Annuler le séjour</button>}
        </div>
      </form>
    </Modal>
  );
}
