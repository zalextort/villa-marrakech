import { useState } from 'react';
import { useData } from '../data';
import PeriodFilter from '../components/PeriodFilter';
import { MONTHS } from '../lib/dates';
import { exportRows } from '../lib/export';
import { formatAmount, formatMAD, formatPct } from '../lib/format';
import { exportableRows, occupancy, periodRange, rentalRows, type Period } from '../lib/report';
import { RENTAL_COLOR } from '../lib/types';

const STAY_COLOR = '#2563eb';

export default function Finances() {
  const { bookings, lines, parties } = useData();
  const [period, setPeriod] = useState<Period>({ year: new Date().getFullYear(), month: 'all' });

  const range = periodRange(period, bookings);
  const rows = rentalRows(bookings, lines, parties, range);
  const billed = rows.reduce((s, r) => s + r.billed, 0);
  const paid = rows.reduce((s, r) => s + r.paid, 0);
  const commission = rows.reduce((s, r) => s + r.commission, 0);
  const occ = occupancy(bookings, range);
  const pct = (n: number) => (occ.days ? n / occ.days : 0);

  const monthly =
    period.year !== 'all' && period.month === 'all'
      ? MONTHS.map((name, m) => {
          const r = periodRange({ year: period.year, month: m }, bookings);
          const rs = rentalRows(bookings, lines, parties, r);
          const o = occupancy(bookings, r);
          return {
            name,
            rented: o.rented,
            stays: o.stays,
            billed: rs.reduce((s, x) => s + x.billed, 0),
            paid: rs.reduce((s, x) => s + x.paid, 0),
            days: o.days,
          };
        })
      : null;

  return (
    <div className="page">
      <div className="page-head">
        <h1>Tableau de bord</h1>
      </div>
      <div className="toolbar">
        <PeriodFilter value={period} onChange={setPeriod} />
        <span className="spacer" />
        <button onClick={() => exportRows(exportableRows(rows, parties), `tableau-de-bord-${period.year}`, 'xlsx')}>Export Excel</button>
        <button onClick={() => exportRows(exportableRows(rows, parties), `tableau-de-bord-${period.year}`, 'csv')}>Export CSV</button>
      </div>

      <div className="kpis">
        <div className="kpi"><span>Nuits louées</span><strong>{occ.rented}</strong></div>
        <div className="kpi"><span>Montant facturé</span><strong>{formatMAD(billed)}</strong></div>
        <div className="kpi"><span>Montant encaissé</span><strong>{formatMAD(paid)}</strong></div>
        <div className="kpi"><span>Reste à encaisser</span><strong className={billed - paid > 0.009 ? 'warn' : ''}>{formatMAD(billed - paid)}</strong></div>
        <div className="kpi"><span>Commissions administratrice</span><strong>{formatMAD(commission)}</strong></div>
      </div>

      <div className="card">
        <h2>Taux d’occupation</h2>
        <div className="occ-bar" aria-label="Répartition des jours">
          <span style={{ width: `${pct(occ.rented) * 100}%`, background: RENTAL_COLOR }} />
          <span style={{ width: `${pct(occ.stays) * 100}%`, background: STAY_COLOR }} />
        </div>
        <div className="legend">
          <span><i style={{ background: RENTAL_COLOR }} />Locations : {occ.rented} j ({formatPct(pct(occ.rented))})</span>
          <span><i style={{ background: STAY_COLOR }} />Séjours actionnaires : {occ.stays} j ({formatPct(pct(occ.stays))})</span>
          <span><i className="free" />Jours libres : {occ.free} j ({formatPct(pct(occ.free))})</span>
          <span className="muted">sur {occ.days} jours</span>
        </div>
      </div>

      {monthly && (
        <div className="card table-wrap">
          <h2>Par mois – {period.year}</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Mois</th>
                <th className="num">Nuits louées</th>
                <th className="num">Séjours actionnaires</th>
                <th className="num">Occupation</th>
                <th className="num">Facturé</th>
                <th className="num">Encaissé</th>
                <th className="num">Reste</th>
              </tr>
            </thead>
            <tbody>
              {monthly.map((m) => (
                <tr key={m.name}>
                  <td>{m.name}</td>
                  <td className="num">{m.rented}</td>
                  <td className="num">{m.stays}</td>
                  <td className="num">{formatPct((m.rented + m.stays) / m.days)}</td>
                  <td className="num">{formatAmount(m.billed)}</td>
                  <td className="num">{formatAmount(m.paid)}</td>
                  <td className="num">{formatAmount(m.billed - m.paid)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small">
        Les montants sont rattachés au mois d’arrivée (ou à la date de rattachement pour les encaissements sans dates).
        Les nuits sont comptées dans le mois où elles ont lieu.
      </p>
    </div>
  );
}
