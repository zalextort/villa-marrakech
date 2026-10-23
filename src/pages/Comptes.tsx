import { useState, type FormEvent } from 'react';
import { useData } from '../data';
import Modal from '../components/Modal';
import { computeAccounts, lineDebt } from '../lib/accounts';
import { formatDate, today } from '../lib/dates';
import { formatAmount, formatMAD } from '../lib/format';
import { errorMessage, supabase } from '../lib/supabase';
import { KIND_LABELS, type Settlement } from '../lib/types';

export default function Comptes() {
  const { parties, lines, bookings, settlements, canManageRentals, partyById } = useData();
  const [editing, setEditing] = useState<Settlement | 'new' | null>(null);
  const accounts = computeAccounts(parties, lines, settlements);
  const sci = parties.find((p) => p.kind === 'sci');
  const admin = parties.find((p) => p.kind === 'administratrice');
  const adminAcc = accounts.find((a) => a.party.id === admin?.id);

  const bookingOf = new Map(bookings.map((b) => [b.id, b]));
  let cumul = 0;
  const ledger = lines
    .filter((l) => Number(l.commission_ttc) || Number(l.commission_paid) || l.collected_by === admin?.id)
    .map((l) => {
      const debt = lineDebt(l, admin?.id);
      cumul += debt;
      return { l, debt, cumul, booking: l.booking_id ? bookingOf.get(l.booking_id) : undefined };
    });

  return (
    <div className="page">
      <div className="page-head">
        <h1>Comptes entre parties</h1>
        {canManageRentals && <button className="primary" onClick={() => setEditing('new')}>Enregistrer un règlement</button>}
      </div>

      <div className="card">
        <h2>Qui doit combien à qui</h2>
        <ul className="balances">
          {accounts
            .filter((a) => a.party.kind !== 'sci')
            .map((a) => (
              <li key={a.party.id}>
                <i style={{ background: a.party.color }} />
                <span className="who">{a.party.name} <span className="muted">· {KIND_LABELS[a.party.kind]}</span></span>
                {Math.abs(a.balance) < 0.01 ? (
                  <span className="muted">à jour</span>
                ) : a.balance < 0 ? (
                  <span><strong className="neg">{formatMAD(-a.balance)}</strong> dus à la SCI</span>
                ) : (
                  <span>la SCI lui doit <strong className="pos">{formatMAD(a.balance)}</strong></span>
                )}
              </li>
            ))}
        </ul>
        <p className="muted small">
          Les loyers appartiennent à la SCI : une partie qui encaisse un loyer le doit à la SCI ; la SCI doit les
          commissions à l’administratrice. Les règlements enregistrés ci-dessous viennent en déduction.
        </p>
      </div>

      <div className="card table-wrap">
        <h2>Détail par partie</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Partie</th>
              <th className="num">Loyers encaissés</th>
              <th className="num">Commissions dues</th>
              <th className="num">Commissions reçues</th>
              <th className="num">Com. avancées</th>
              <th className="num">Règlements versés</th>
              <th className="num">Règlements reçus</th>
              <th className="num">Solde</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.party.id}>
                <td>{a.party.name}</td>
                <td className="num">{formatAmount(a.collected)}</td>
                <td className="num">{a.party.kind === 'administratrice' ? formatAmount(a.commissionDue) : ''}</td>
                <td className="num">{a.party.kind === 'administratrice' ? formatAmount(a.commissionPaid) : ''}</td>
                <td className="num">{a.commissionAdvanced ? formatAmount(a.commissionAdvanced) : ''}</td>
                <td className="num">{formatAmount(a.settlementsOut)}</td>
                <td className="num">{formatAmount(a.settlementsIn)}</td>
                <td className={`num ${a.balance < 0 ? 'neg' : a.balance > 0 ? 'pos' : ''}`}>{formatAmount(a.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">
          Solde positif : la SCI doit ce montant à la partie. Solde négatif : la partie le doit à la SCI. Pour la SCI, le
          solde est la somme nette de ce que les autres parties lui doivent.
        </p>
      </div>

      {admin && adminAcc && (
        <div className="card table-wrap">
          <h2>{admin.name} : commissions et loyers encaissés</h2>
          <div className="kpis">
            <div className="kpi"><span>Commissions dues</span><strong>{formatMAD(adminAcc.commissionDue)}</strong></div>
            <div className="kpi"><span>Commissions payées</span><strong>{formatMAD(adminAcc.commissionPaid)}</strong></div>
            <div className="kpi"><span>Loyers encaissés par elle</span><strong>{formatMAD(adminAcc.collected)}</strong></div>
            <div className="kpi"><span>Solde net</span><strong className={adminAcc.balance < 0 ? 'neg' : 'pos'}>{formatMAD(adminAcc.balance)}</strong></div>
          </div>
          <table className="table compact">
            <thead>
              <tr>
                <th>Date</th>
                <th>Client</th>
                <th>Prestation</th>
                <th className="num">Com TTC</th>
                <th className="num">Com payée</th>
                <th className="num">Encaissé LAM</th>
                <th className="num">Dette</th>
                <th className="num">Cumul</th>
                <th>Facture</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map(({ l, debt, cumul, booking }) => (
                <tr key={l.id}>
                  <td>{formatDate(booking?.start_date ?? l.ref_date)}</td>
                  <td>{l.label ?? booking?.guest ?? ''}</td>
                  <td>{l.item}</td>
                  <td className="num">{formatAmount(Number(l.commission_ttc))}</td>
                  <td className="num">{Number(l.commission_paid) ? formatAmount(Number(l.commission_paid)) : ''}</td>
                  <td className="num">{l.collected_by === admin.id ? formatAmount(Number(l.amount_paid)) : ''}</td>
                  <td className="num">{formatAmount(debt)}</td>
                  <td className="num">{formatAmount(cumul)}</td>
                  <td>{l.invoice_ref ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">
            Reprise des colonnes « Dette » et « Cumul » de l’Excel : Dette = Com TTC − Com payée − encaissé par LAM
            (positif : la SCI doit à LAM). Les règlements ne figurent pas dans ce cumul mais dans le solde net.
          </p>
        </div>
      )}

      <div className="card table-wrap">
        <h2>Règlements</h2>
        <table className="table compact">
          <thead>
            <tr><th>Date</th><th>De</th><th>À</th><th className="num">Montant</th><th>Libellé</th></tr>
          </thead>
          <tbody>
            {settlements.map((s) => (
              <tr key={s.id} className={canManageRentals ? 'clickable' : ''} onClick={() => canManageRentals && setEditing(s)}>
                <td>{formatDate(s.date)}</td>
                <td>{partyById(s.from_party)?.name}</td>
                <td>{partyById(s.to_party)?.name}</td>
                <td className="num">{formatAmount(Number(s.amount))}</td>
                <td>{s.label}</td>
              </tr>
            ))}
            {settlements.length === 0 && <tr><td colSpan={5} className="muted">Aucun règlement enregistré.</td></tr>}
          </tbody>
        </table>
      </div>

      {editing && (
        <SettlementModal settlement={editing === 'new' ? undefined : editing} defaultTo={sci?.id} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function SettlementModal({ settlement, defaultTo, onClose }: { settlement?: Settlement; defaultTo?: string; onClose: () => void }) {
  const { parties, reload } = useData();
  const [date, setDate] = useState(settlement?.date ?? today());
  const [from, setFrom] = useState(settlement?.from_party ?? parties.find((p) => p.kind === 'administratrice')?.id ?? '');
  const [to, setTo] = useState(settlement?.to_party ?? defaultTo ?? '');
  const [amount, setAmount] = useState<number>(settlement ? Number(settlement.amount) : 0);
  const [label, setLabel] = useState(settlement?.label ?? '');
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (from === to) return setError('Les deux parties doivent être différentes.');
    const row = { date, from_party: from, to_party: to, amount, label: label || null };
    const { error } = settlement
      ? await supabase.from('settlements').update(row).eq('id', settlement.id)
      : await supabase.from('settlements').insert(row);
    if (error) return setError(errorMessage(error));
    await reload();
    onClose();
  }

  async function remove() {
    if (!settlement || !confirm('Supprimer ce règlement ?')) return;
    const { error } = await supabase.from('settlements').delete().eq('id', settlement.id);
    if (error) return setError(errorMessage(error));
    await reload();
    onClose();
  }

  return (
    <Modal title={settlement ? 'Modifier le règlement' : 'Nouveau règlement'} onClose={onClose}>
      <form onSubmit={save}>
        <div className="row2">
          <label>
            Payé par
            <select value={from} onChange={(e) => setFrom(e.target.value)} required>
              {parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label>
            À
            <select value={to} onChange={(e) => setTo(e.target.value)} required>
              {parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        </div>
        <div className="row2">
          <label>
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label>
            Montant (MAD)
            <input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.valueAsNumber || 0)} required />
          </label>
        </div>
        <label>
          Libellé
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Virement récap mars…" />
        </label>
        {error && <p className="error-text">{error}</p>}
        <div className="actions">
          <button className="primary" type="submit">Enregistrer</button>
          {settlement && <button type="button" className="danger" onClick={remove}>Supprimer</button>}
        </div>
      </form>
    </Modal>
  );
}
