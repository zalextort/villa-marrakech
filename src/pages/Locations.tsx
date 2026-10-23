import { useState } from 'react';
import { useData } from '../data';
import PeriodFilter from '../components/PeriodFilter';
import RentalModal from '../components/RentalModal';
import { formatDate } from '../lib/dates';
import { exportRows } from '../lib/export';
import { formatAmount } from '../lib/format';
import { exportableRows, periodRange, rentalRows, type Period, type RentalRow } from '../lib/report';
import { STATUS_LABELS, type RentalStatus } from '../lib/types';

export default function Locations() {
  const { bookings, lines, parties, canManageRentals } = useData();
  const [period, setPeriod] = useState<Period>({ year: new Date().getFullYear(), month: 'all' });
  const [status, setStatus] = useState<RentalStatus | 'all'>('all');
  const [open, setOpen] = useState<RentalRow | 'new' | 'standalone' | null>(null);

  const range = periodRange(period, bookings);
  const rows = rentalRows(bookings, lines, parties, range).filter((r) => status === 'all' || r.booking?.status === status);
  const tot = rows.reduce(
    (t, r) => ({ nights: t.nights + (r.booking?.nights ?? 0), billed: t.billed + r.billed, billedHt: t.billedHt + r.billedHt, paid: t.paid + r.paid, com: t.com + r.commission }),
    { nights: 0, billed: 0, billedHt: 0, paid: 0, com: 0 },
  );
  const filename = `locations-${period.year}${period.month === 'all' ? '' : '-' + String(Number(period.month) + 1).padStart(2, '0')}`;

  return (
    <div className="page">
      <div className="page-head">
        <h1>Locations</h1>
        <div className="actions">
          {canManageRentals && <button className="primary" onClick={() => setOpen('new')}>Nouvelle location</button>}
          {canManageRentals && <button onClick={() => setOpen('standalone')}>Encaissement sans dates</button>}
        </div>
      </div>
      <div className="toolbar">
        <PeriodFilter value={period} onChange={setPeriod} />
        <select value={status} onChange={(e) => setStatus(e.target.value as RentalStatus | 'all')}>
          <option value="all">Tous les statuts</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span className="spacer" />
        <button onClick={() => exportRows(exportableRows(rows, parties), filename, 'xlsx')}>Export Excel</button>
        <button onClick={() => exportRows(exportableRows(rows, parties), filename, 'csv')}>Export CSV</button>
      </div>

      <div className="card table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Arrivée</th>
              <th>Départ</th>
              <th className="num">Nuits</th>
              <th>Locataire</th>
              <th>Plateforme</th>
              <th className="num">Facturé TTC</th>
              <th className="num">Facturé HT</th>
              <th className="num">Encaissé</th>
              <th className="num">Reste</th>
              <th>Encaissé par</th>
              <th className="num">Commission</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="clickable" onClick={() => setOpen(r)}>
                <td>{r.booking ? formatDate(r.booking.start_date) : <span className="muted">{formatDate(r.date)}</span>}</td>
                <td>{r.booking ? formatDate(r.booking.end_date) : ''}</td>
                <td className="num">{r.booking?.nights ?? ''}</td>
                <td>
                  {r.label || '—'}
                  {r.lines.length > 1 && <span className="tag">{r.lines.length - 1} prestation(s)</span>}
                  {r.standalone && <span className="tag">sans dates</span>}
                </td>
                <td>{r.booking?.platform ?? ''}</td>
                <td className="num">{formatAmount(r.billed)}</td>
                <td className="num">{formatAmount(r.billedHt)}</td>
                <td className="num">{formatAmount(r.paid)}</td>
                <td className={`num${r.billed - r.paid > 0.009 ? ' warn' : ''}`}>{formatAmount(r.billed - r.paid)}</td>
                <td>{r.collectors.join(', ')}</td>
                <td className="num">{formatAmount(r.commission)}</td>
                <td>{r.booking?.status && <span className={`status ${r.booking.status}`}>{STATUS_LABELS[r.booking.status]}</span>}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={12} className="muted">Aucune location sur la période.</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>Total ({rows.length})</td>
              <td className="num">{tot.nights}</td>
              <td colSpan={2} />
              <td className="num">{formatAmount(tot.billed)}</td>
              <td className="num">{formatAmount(tot.billedHt)}</td>
              <td className="num">{formatAmount(tot.paid)}</td>
              <td className="num">{formatAmount(tot.billed - tot.paid)}</td>
              <td />
              <td className="num">{formatAmount(tot.com)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="muted small">Montants en dirhams (MAD), TTC sauf « Facturé HT ».</p>

      {open === 'new' && <RentalModal onClose={() => setOpen(null)} />}
      {open === 'standalone' && <RentalModal standalone onClose={() => setOpen(null)} />}
      {open && typeof open === 'object' && (
        <RentalModal booking={open.booking} standalone={open.standalone} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}
