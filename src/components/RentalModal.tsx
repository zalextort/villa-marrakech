import { useState, type FormEvent } from 'react';
import Modal from './Modal';
import { useData } from '../data';
import { addDays, diffDays, formatDate, rangesOverlap } from '../lib/dates';
import { formatMAD, ht, round2 } from '../lib/format';
import { errorMessage, supabase } from '../lib/supabase';
import { STATUS_LABELS, type Booking, type RentalLine, type RentalStatus } from '../lib/types';

type Draft = Omit<RentalLine, 'id' | 'booking_id' | 'ref_date' | 'sort'> & { id?: string; key: string; comAuto: boolean };

interface Props {
  booking?: Booking;
  /** Ligne isolée (encaissement sans dates) à modifier, ou true pour en créer une. */
  standalone?: RentalLine | true;
  defaultStart?: string;
  onClose: () => void;
}

const ITEMS = ['Location', 'Jacuzzi', 'Hammam', 'Piscine chauffée', 'Ménage', 'Autre'];
let keySeq = 0;

/** Location (dates + lignes financières) ou encaissement isolé. */
export default function RentalModal({ booking, standalone, defaultStart, onClose }: Props) {
  const { parties, bookings, lines, settings, canManageRentals, partyById, reload } = useData();
  const sci = parties.find((p) => p.kind === 'sci');
  const isStandalone = Boolean(standalone);
  const existingLine = standalone && standalone !== true ? standalone : undefined;

  const [start, setStart] = useState(booking?.start_date ?? defaultStart ?? '');
  const [end, setEnd] = useState(booking?.end_date ?? (defaultStart ? addDays(defaultStart, 3) : ''));
  const [refDate, setRefDate] = useState(existingLine?.ref_date ?? '');
  const [guest, setGuest] = useState(booking?.guest ?? '');
  const [platform, setPlatform] = useState(booking?.platform ?? '');
  const [status, setStatus] = useState<RentalStatus>(booking?.status ?? 'reserve');
  const [comment, setComment] = useState(booking?.comment ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const newLine = (item = 'Location'): Draft => ({
    key: `n${keySeq++}`,
    comAuto: true,
    label: null,
    item,
    amount_ttc: 0,
    vat_rate: settings.default_vat_rate,
    amount_paid: 0,
    paid_on: null,
    collected_by: null,
    commission_ttc: 0,
    commission_paid: 0,
    commission_paid_on: null,
    commission_paid_by: null,
    invoice_ref: null,
    recap_month: null,
    comment: null,
  });
  const toDraft = (l: RentalLine): Draft => ({ ...l, key: l.id, comAuto: false });
  const initial = existingLine
    ? [toDraft(existingLine)]
    : booking
      ? lines.filter((l) => l.booking_id === booking.id).map(toDraft)
      : [newLine()];
  const [drafts, setDrafts] = useState<Draft[]>(initial.length ? initial : [newLine()]);

  const nights = start && end ? diffDays(start, end) : 0;
  const conflict = !isStandalone && start && end && nights > 0
    ? bookings.find((b) => b.id !== booking?.id && rangesOverlap(start, end, b.start_date, b.end_date))
    : undefined;

  function patch(key: string, changes: Partial<Draft>) {
    setDrafts((ds) =>
      ds.map((d) => {
        if (d.key !== key) return d;
        const next = { ...d, ...changes };
        if ('commission_ttc' in changes) next.comAuto = false;
        if (next.comAuto) next.commission_ttc = round2((Number(next.amount_ttc) * settings.commission_rate) / 100);
        if (next.commission_paid && !next.commission_paid_by) next.commission_paid_by = sci?.id ?? null;
        return next;
      }),
    );
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isStandalone && nights <= 0) return setError('La date de départ doit être après la date d’arrivée.');
    if (conflict) return setError('Ces dates chevauchent une occupation existante.');
    if (isStandalone && !refDate) return setError('Indiquez la date de rattachement.');
    const missing = drafts.find((d) => Number(d.amount_paid) > 0 && !d.collected_by);
    if (missing) return setError(`Ligne « ${missing.item} » : précisez qui a encaissé.`);

    setBusy(true);
    try {
      let bookingId = booking?.id ?? null;
      if (!isStandalone) {
        const row = { kind: 'location' as const, start_date: start, end_date: end, guest: guest || null, platform: platform || null, status, comment: comment || null };
        if (booking) {
          const { error } = await supabase.from('bookings').update(row).eq('id', booking.id);
          if (error) throw error;
        } else {
          const { data, error } = await supabase.from('bookings').insert(row).select('id').single();
          if (error) throw error;
          bookingId = data.id;
        }
      }
      const rows = drafts.map(({ key: _k, comAuto: _c, ...d }, i) => ({
        ...d,
        booking_id: bookingId,
        ref_date: isStandalone ? refDate : start,
        label: isStandalone ? d.label : d.label || guest || null,
        sort: i,
        amount_ttc: Number(d.amount_ttc) || 0,
        amount_paid: Number(d.amount_paid) || 0,
        commission_ttc: Number(d.commission_ttc) || 0,
        commission_paid: Number(d.commission_paid) || 0,
      }));
      const before = existingLine ? [existingLine] : booking ? lines.filter((l) => l.booking_id === booking.id) : [];
      const removed = before.filter((l) => !drafts.some((d) => d.id === l.id)).map((l) => l.id);
      if (removed.length) {
        const { error } = await supabase.from('rental_lines').delete().in('id', removed);
        if (error) throw error;
      }
      const updates = rows.filter((r) => r.id);
      const inserts = rows.filter((r) => !r.id).map(({ id: _id, ...r }) => r);
      if (updates.length) {
        const { error } = await supabase.from('rental_lines').upsert(updates);
        if (error) throw error;
      }
      if (inserts.length) {
        const { error } = await supabase.from('rental_lines').insert(inserts);
        if (error) throw error;
      }
      await reload();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(isStandalone ? 'Supprimer cette ligne ?' : 'Supprimer cette location et ses lignes financières ?')) return;
    const { error } = existingLine
      ? await supabase.from('rental_lines').delete().eq('id', existingLine.id)
      : await supabase.from('bookings').delete().eq('id', booking!.id);
    if (error) return setError(errorMessage(error));
    await reload();
    onClose();
  }

  const totals = drafts.reduce(
    (t, d) => ({ ttc: t.ttc + Number(d.amount_ttc || 0), paid: t.paid + Number(d.amount_paid || 0), com: t.com + Number(d.commission_ttc || 0) }),
    { ttc: 0, paid: 0, com: 0 },
  );

  if (!canManageRentals) {
    return (
      <Modal title="Location" onClose={onClose} wide>
        {booking && (
          <>
            <p><strong>{booking.guest || 'Location'}</strong>{booking.platform && ` · ${booking.platform}`} · {STATUS_LABELS[booking.status ?? 'reserve']}</p>
            <p>Du {formatDate(booking.start_date)} au {formatDate(booking.end_date)} · {booking.nights} nuit(s)</p>
            {booking.comment && <p className="muted">{booking.comment}</p>}
          </>
        )}
        <div className="table-wrap">
          <table className="table compact">
            <thead><tr><th>Prestation</th><th className="num">Facturé</th><th className="num">Encaissé</th><th>Par</th><th className="num">Commission</th></tr></thead>
            <tbody>
              {drafts.map((d) => (
                <tr key={d.key}>
                  <td>{d.item}</td>
                  <td className="num">{formatMAD(Number(d.amount_ttc))}</td>
                  <td className="num">{formatMAD(Number(d.amount_paid))}</td>
                  <td>{partyById(d.collected_by)?.short_name ?? '—'}</td>
                  <td className="num">{formatMAD(Number(d.commission_ttc))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>
    );
  }

  const title = isStandalone ? (existingLine ? 'Modifier l’encaissement' : 'Encaissement sans dates') : booking ? 'Modifier la location' : 'Nouvelle location';

  return (
    <Modal title={title} onClose={onClose} wide>
      <form onSubmit={save}>
        {isStandalone ? (
          <div className="row2">
            <label>
              Date de rattachement
              <input type="date" value={refDate} onChange={(e) => setRefDate(e.target.value)} required />
            </label>
            <label>
              Libellé
              <input value={drafts[0].label ?? ''} onChange={(e) => patch(drafts[0].key, { label: e.target.value })} />
            </label>
          </div>
        ) : (
          <>
            <div className="row3">
              <label>
                Arrivée
                <input type="date" value={start} onChange={(e) => setStart(e.target.value)} required />
              </label>
              <label>
                Départ
                <input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} required />
              </label>
              <label>
                Nuits
                <input value={nights > 0 ? nights : ''} readOnly tabIndex={-1} />
              </label>
            </div>
            {conflict && (
              <p className="error-text">
                Période déjà occupée ({conflict.kind === 'location' ? conflict.guest || 'location' : partyById(conflict.party_id)?.name} du{' '}
                {formatDate(conflict.start_date)} au {formatDate(conflict.end_date)}).
              </p>
            )}
            <div className="row3">
              <label>
                Locataire / référence
                <input value={guest} onChange={(e) => setGuest(e.target.value)} required />
              </label>
              <label>
                Plateforme
                <input value={platform} list="platforms" onChange={(e) => setPlatform(e.target.value)} placeholder="Airbnb, Booking, direct…" />
                <datalist id="platforms">
                  <option value="Airbnb" /><option value="Booking" /><option value="Direct" /><option value="Louer à Marrakech" />
                </datalist>
              </label>
              <label>
                Statut
                <select value={status} onChange={(e) => setStatus(e.target.value as RentalStatus)}>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
            </div>
            <label>
              Commentaire
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} />
            </label>
          </>
        )}

        <h3>Lignes financières</h3>
        {drafts.map((d) => (
          <fieldset key={d.key} className="line-card">
            <div className="row4">
              <label>
                Prestation
                <input value={d.item} list="items" onChange={(e) => patch(d.key, { item: e.target.value })} required />
              </label>
              <label>
                Montant facturé TTC
                <input type="number" step="0.01" value={d.amount_ttc} onChange={(e) => patch(d.key, { amount_ttc: e.target.valueAsNumber || 0 })} />
              </label>
              <label>
                TVA %
                <select value={d.vat_rate} onChange={(e) => patch(d.key, { vat_rate: Number(e.target.value) })}>
                  <option value={20}>20 %</option>
                  <option value={10}>10 %</option>
                  <option value={0}>0 %</option>
                </select>
              </label>
              <label>
                HT
                <input value={round2(ht(Number(d.amount_ttc), Number(d.vat_rate)))} readOnly tabIndex={-1} />
              </label>
            </div>
            <div className="row4">
              <label>
                Montant encaissé
                <input type="number" step="0.01" value={d.amount_paid} onChange={(e) => patch(d.key, { amount_paid: e.target.valueAsNumber || 0 })} />
              </label>
              <label>
                Encaissé par
                <select value={d.collected_by ?? ''} onChange={(e) => patch(d.key, { collected_by: e.target.value || null })}>
                  <option value="">—</option>
                  {parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label>
                Date d’encaissement
                <input type="date" value={d.paid_on ?? ''} onChange={(e) => patch(d.key, { paid_on: e.target.value || null })} />
              </label>
              <label>
                Commission TTC
                <input type="number" step="0.01" value={d.commission_ttc} onChange={(e) => patch(d.key, { commission_ttc: e.target.valueAsNumber || 0 })} />
              </label>
            </div>
            <details>
              <summary>Paiement de la commission, facture</summary>
              <div className="row4">
                <label>
                  Commission payée
                  <input type="number" step="0.01" value={d.commission_paid} onChange={(e) => patch(d.key, { commission_paid: e.target.valueAsNumber || 0 })} />
                </label>
                <label>
                  Payée par
                  <select value={d.commission_paid_by ?? ''} onChange={(e) => patch(d.key, { commission_paid_by: e.target.value || null })}>
                    <option value="">—</option>
                    {parties.filter((p) => p.kind !== 'administratrice').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
                <label>
                  Date
                  <input type="date" value={d.commission_paid_on ?? ''} onChange={(e) => patch(d.key, { commission_paid_on: e.target.value || null })} />
                </label>
                <label>
                  Réf. facture
                  <input value={d.invoice_ref ?? ''} onChange={(e) => patch(d.key, { invoice_ref: e.target.value || null })} />
                </label>
              </div>
            </details>
            {!isStandalone && drafts.length > 1 && (
              <button type="button" className="link danger" onClick={() => setDrafts((ds) => ds.filter((x) => x.key !== d.key))}>
                Retirer cette ligne
              </button>
            )}
          </fieldset>
        ))}
        <datalist id="items">{ITEMS.map((i) => <option key={i} value={i} />)}</datalist>
        {!isStandalone && (
          <button type="button" className="link" onClick={() => setDrafts((ds) => [...ds, newLine('Jacuzzi')])}>
            + Ajouter une prestation (jacuzzi, hammam…)
          </button>
        )}
        <p className="totals">
          Facturé {formatMAD(totals.ttc)} · Encaissé {formatMAD(totals.paid)} · Reste {formatMAD(totals.ttc - totals.paid)} · Commission {formatMAD(totals.com)}
        </p>

        {error && <p className="error-text">{error}</p>}
        <div className="actions">
          <button className="primary" type="submit" disabled={busy || Boolean(conflict)}>Enregistrer</button>
          {(booking || existingLine) && <button type="button" className="danger" onClick={remove}>Supprimer</button>}
        </div>
      </form>
    </Modal>
  );
}
