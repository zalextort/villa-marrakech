import { useState, type FormEvent } from 'react';
import type { WorkBook } from 'xlsx';
import { useData } from '../data';
import { useAuth } from '../auth';
import { formatDate, rangesOverlap, today } from '../lib/dates';
import { largestSheet, parseSuiviSheet, readWorkbook, type ImportResult } from '../lib/excel';
import { formatAmount } from '../lib/format';
import { errorMessage, functionError, supabase } from '../lib/supabase';
import { KIND_LABELS, type Party, type PartyKind, type Profile, type Role } from '../lib/types';

export default function Admin() {
  return (
    <div className="page">
      <h1>Administration</h1>
      <Users />
      <Parties />
      <SettingsCard />
      <ImportCard />
    </div>
  );
}

// ---------------------------------------------------------------------------

function Users() {
  const { profiles, parties, reload } = useData();
  const { profile: me } = useAuth();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('actionnaire');
  const [msg, setMsg] = useState<string | null>(null);

  async function update(p: Profile, changes: Partial<Profile>) {
    const { error } = await supabase.from('profiles').update(changes).eq('id', p.id);
    if (error) setMsg(errorMessage(error));
    await reload();
  }

  async function resend(p: Profile) {
    setMsg(null);
    const { error } = await supabase.functions.invoke('invite-user', {
      body: { email: p.email, resend: true, redirect_to: window.location.origin + window.location.pathname },
    });
    setMsg(error ? `Renvoi impossible (${await functionError(error)}).` : `Invitation renvoyée à ${p.email}.`);
  }

  async function remove(p: Profile) {
    if (!confirm(`Supprimer l'utilisateur ${p.email} ? Il ne pourra plus se connecter ; ses séjours sont conservés.`)) return;
    setMsg(null);
    const { error } = await supabase.functions.invoke('delete-user', { body: { id: p.id } });
    setMsg(error ? `Suppression impossible (${await functionError(error)}).` : `Utilisateur ${p.email} supprimé.`);
    await reload();
  }

  async function invite(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    const { error } = await supabase.functions.invoke('invite-user', {
      body: { email, full_name: name, role, redirect_to: window.location.origin + window.location.pathname },
    });
    if (error) {
      setMsg(`Invitation impossible (${await functionError(error)}). Vous pouvez aussi inviter l'utilisateur depuis Supabase > Authentication, puis lui attribuer un rôle ici.`);
      return;
    }
    setMsg(`Invitation envoyée à ${email}.`);
    setEmail('');
    setName('');
    await reload();
  }

  return (
    <div className="card table-wrap">
      <h2>Utilisateurs</h2>
      <table className="table compact">
        <thead>
          <tr><th>E-mail</th><th>Nom</th><th>Rôle</th><th>Admin</th><th title="Reçoit par e-mail les changements du planning">Notifications</th><th>Partie liée</th><th></th></tr>
        </thead>
        <tbody>
          {profiles.map((p) => (
            <tr key={p.id}>
              <td>
                {p.email}
                {!p.activated_at && (
                  <div className="small muted">
                    Pas encore activé ·{' '}
                    <button type="button" className="link" onClick={() => resend(p)}>Renvoyer l'invitation</button>
                  </div>
                )}
              </td>
              <td>
                <input defaultValue={p.full_name ?? ''} onBlur={(e) => e.target.value !== (p.full_name ?? '') && update(p, { full_name: e.target.value || null })} />
              </td>
              <td>
                <select value={p.role ?? ''} onChange={(e) => update(p, { role: (e.target.value || null) as Role | null })}>
                  <option value="">En attente</option>
                  <option value="actionnaire">Actionnaire</option>
                  <option value="gestionnaire">Gestionnaire</option>
                </select>
              </td>
              <td>
                <input type="checkbox" checked={p.is_admin} disabled={p.id === me?.id} onChange={(e) => update(p, { is_admin: e.target.checked })} />
              </td>
              <td>
                <input type="checkbox" checked={p.notify} onChange={(e) => update(p, { notify: e.target.checked })} />
              </td>
              <td>
                <select value={p.party_id ?? ''} onChange={(e) => update(p, { party_id: e.target.value || null })}>
                  <option value="">—</option>
                  {parties.filter((x) => x.kind !== 'sci').map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </td>
              <td>
                {p.id !== me?.id && (
                  <button type="button" className="link danger" onClick={() => remove(p)}>Supprimer</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form className="inline-form" onSubmit={invite}>
        <input type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input placeholder="Nom" value={name} onChange={(e) => setName(e.target.value)} />
        <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
          <option value="actionnaire">Actionnaire</option>
          <option value="gestionnaire">Gestionnaire</option>
        </select>
        <button className="primary" type="submit">Inviter</button>
      </form>
      {msg && <p className="muted">{msg}</p>}
      <p className="muted small">Un actionnaire doit être lié à sa partie pour pouvoir réserver ses séjours (plusieurs utilisateurs peuvent être liés à la même partie) ; la gestionnaire peut être liée à « Louer à Marrakech ».</p>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Parties() {
  const { parties, reload } = useData();
  const [msg, setMsg] = useState<string | null>(null);

  async function update(p: Party, changes: Partial<Party>) {
    const { error } = await supabase.from('parties').update(changes).eq('id', p.id);
    setMsg(error ? errorMessage(error) : null);
    await reload();
  }

  async function add() {
    const { error } = await supabase
      .from('parties')
      .insert({ name: 'Nouvelle partie', short_name: 'NP', kind: 'actionnaire', sort: (parties.at(-1)?.sort ?? 0) + 10 });
    setMsg(error ? errorMessage(error) : null);
    await reload();
  }

  async function remove(p: Party) {
    if (!confirm(`Supprimer « ${p.name} » ?`)) return;
    const { error } = await supabase.from('parties').delete().eq('id', p.id);
    setMsg(error ? 'Suppression impossible : cette partie est utilisée par des réservations ou des encaissements.' : null);
    await reload();
  }

  const totalShares = parties.filter((p) => p.kind === 'actionnaire').reduce((s, p) => s + Number(p.share_pct), 0);

  return (
    <div className="card table-wrap">
      <h2>Parties (SCI, actionnaires, administratrice)</h2>
      <table className="table compact">
        <thead>
          <tr><th>Nom</th><th>Libellé court</th><th>Type</th><th className="num">Parts %</th><th>Couleur</th><th /></tr>
        </thead>
        <tbody>
          {parties.map((p) => (
            <tr key={p.id}>
              <td><input defaultValue={p.name} onBlur={(e) => e.target.value !== p.name && update(p, { name: e.target.value })} /></td>
              <td><input className="short" defaultValue={p.short_name} onBlur={(e) => e.target.value !== p.short_name && update(p, { short_name: e.target.value })} /></td>
              <td>
                <select value={p.kind} onChange={(e) => update(p, { kind: e.target.value as PartyKind })}>
                  {Object.entries(KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </td>
              <td className="num">
                <input className="short" type="number" step="0.01" defaultValue={p.share_pct} onBlur={(e) => Number(e.target.value) !== Number(p.share_pct) && update(p, { share_pct: Number(e.target.value) })} />
              </td>
              <td><input type="color" defaultValue={p.color} onBlur={(e) => e.target.value !== p.color && update(p, { color: e.target.value })} /></td>
              <td><button className="link danger" onClick={() => remove(p)}>Supprimer</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="actions">
        <button onClick={add}>Ajouter une partie</button>
        <span className={`muted${Math.abs(totalShares - 100) > 0.01 ? ' warn' : ''}`}>Total des parts actionnaires : {totalShares} %</span>
      </div>
      {msg && <p className="error-text">{msg}</p>}
      <p className="muted small">Le libellé court sert à l’import Excel : « Banque », « LAM » et « PP » correspondent aux colonnes du fichier.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------

function SettingsCard() {
  const { settings, reload } = useData();
  const [rate, setRate] = useState(settings.commission_rate);
  const [vat, setVat] = useState(settings.default_vat_rate);
  const [msg, setMsg] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from('settings').update({ commission_rate: rate, default_vat_rate: vat }).eq('id', 1);
    setMsg(error ? errorMessage(error) : 'Paramètres enregistrés.');
    await reload();
  }

  return (
    <form className="card" onSubmit={save}>
      <h2>Paramètres</h2>
      <div className="row2">
        <label>
          Commission administratrice (% du loyer TTC)
          <input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.valueAsNumber || 0)} />
        </label>
        <label>
          TVA par défaut (%)
          <input type="number" step="0.01" value={vat} onChange={(e) => setVat(e.target.valueAsNumber || 0)} />
        </label>
      </div>
      <div className="actions">
        <button className="primary" type="submit">Enregistrer</button>
        {msg && <span className="muted">{msg}</span>}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------

function ImportCard() {
  const { parties, bookings, settings, reload } = useData();
  const [wb, setWb] = useState<WorkBook | null>(null);
  const [sheet, setSheet] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const sci = parties.find((p) => p.kind === 'sci');

  function parse(book: WorkBook, name: string) {
    setSheet(name);
    setError(null);
    try {
      setResult(parseSuiviSheet(book, name, parties, settings.commission_rate));
    } catch (e) {
      setResult(null);
      setError(errorMessage(e));
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setDone(null);
    const book = await readWorkbook(file);
    setWb(book);
    parse(book, largestSheet(book));
  }

  const conflicts = new Set(
    (result?.bookings ?? []).filter((ib) => bookings.some((b) => rangesOverlap(ib.start_date, ib.end_date, b.start_date, b.end_date))).map((b) => b.start_date),
  );

  async function run() {
    if (!result) return;
    setBusy(true);
    setError(null);
    let nb = 0;
    let nl = 0;
    try {
      const toRow = (l: ImportResult['standalone'][number], bookingId: string | null, refDate: string, sort: number) => ({
        booking_id: bookingId,
        ref_date: refDate,
        label: l.label,
        item: l.item,
        amount_ttc: l.amount_ttc,
        vat_rate: l.vat_rate,
        amount_paid: l.amount_paid,
        paid_on: l.paid_on,
        collected_by: l.collected_by,
        commission_ttc: l.commission_ttc,
        commission_paid: l.commission_paid,
        commission_paid_on: l.commission_paid_on,
        commission_paid_by: l.commission_paid ? sci?.id ?? null : null,
        invoice_ref: l.invoice_ref,
        recap_month: l.recap_month,
        comment: `Import Excel (${result.sheet}, ligne ${l.rowNumber})`,
        sort,
      });
      for (const ib of result.bookings) {
        if (conflicts.has(ib.start_date)) continue;
        const now = today();
        const paid = ib.lines.every((l) => l.amount_paid >= l.amount_ttc - 0.01);
        const status = ib.end_date > now ? (ib.start_date <= now ? 'en_cours' : 'reserve') : paid ? 'paye' : 'termine';
        const { data, error } = await supabase
          .from('bookings')
          .insert({ kind: 'location', start_date: ib.start_date, end_date: ib.end_date, guest: ib.guest, status })
          .select('id')
          .single();
        if (error) throw error;
        nb++;
        const { error: e2 } = await supabase.from('rental_lines').insert(ib.lines.map((l, i) => toRow(l, data.id, ib.start_date, i)));
        if (e2) throw e2;
        nl += ib.lines.length;
      }
      if (result.standalone.length) {
        const { error } = await supabase
          .from('rental_lines')
          .insert(result.standalone.map((l, i) => toRow(l, null, l.paid_on ?? l.recap_month ?? `${new Date().getFullYear()}-01-01`, i)));
        if (error) throw error;
        nl += result.standalone.length;
      }
      setDone(`${nb} location(s) et ${nl} ligne(s) financière(s) importées.`);
      setResult(null);
      setWb(null);
    } catch (e) {
      setError(`${errorMessage(e)} (${nb} location(s) déjà importée(s))`);
    } finally {
      setBusy(false);
      await reload();
    }
  }

  const lineCount = (result?.bookings.reduce((s, b) => s + b.lines.length, 0) ?? 0) + (result?.standalone.length ?? 0);

  return (
    <div className="card table-wrap">
      <h2>Import du fichier Excel « Suivi locations »</h2>
      <p className="muted small">
        Colonnes reconnues : arrivée, départ, client, prestation, Loyer TTC, TVA, date d’encaissement, Banque / LAM / PP,
        Com TTC, Recap, facture, Payé, Com Payée. La commission est recalculée au taux des paramètres ({settings.commission_rate} %
        du TTC, logique « Sans erreur »), sauf pour les lignes sans commission (hammam…). Un loyer encaissé sur deux comptes
        est séparé en deux lignes.
      </p>
      <div className="inline-form">
        <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => onFile(e.target.files?.[0])} />
        {wb && (
          <select value={sheet} onChange={(e) => parse(wb, e.target.value)}>
            {wb.SheetNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        )}
      </div>
      {error && <p className="error-text">{error}</p>}
      {done && <p className="ok-text">{done}</p>}
      {result && (
        <>
          <p>
            <strong>{result.bookings.length}</strong> location(s), <strong>{lineCount}</strong> ligne(s) financière(s) dont{' '}
            {result.standalone.length} sans dates.
            {conflicts.size > 0 && <span className="warn"> {conflicts.size} location(s) déjà présente(s) dans le planning seront ignorées.</span>}
          </p>
          {result.warnings.length > 0 && <ul className="warnings">{result.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
          <table className="table compact">
            <thead>
              <tr><th>Ligne</th><th>Dates</th><th>Client</th><th>Prestation</th><th className="num">TTC</th><th className="num">Encaissé</th><th>Par</th><th className="num">Commission</th><th className="num">Com payée</th></tr>
            </thead>
            <tbody>
              {[...result.bookings.flatMap((b) => b.lines.map((l) => ({ l, b }))), ...result.standalone.map((l) => ({ l, b: undefined }))].map(({ l, b }, i) => (
                <tr key={i} className={b && conflicts.has(b.start_date) ? 'skipped' : ''}>
                  <td>{l.rowNumber}</td>
                  <td>{b ? `${formatDate(b.start_date)} → ${formatDate(b.end_date)}` : <span className="muted">sans dates</span>}</td>
                  <td>{l.label}</td>
                  <td>{l.item}</td>
                  <td className="num">{formatAmount(l.amount_ttc)}</td>
                  <td className="num">{formatAmount(l.amount_paid)}</td>
                  <td>{parties.find((p) => p.id === l.collected_by)?.short_name ?? '—'}</td>
                  <td className="num">
                    {formatAmount(l.commission_ttc)}
                    {Math.abs(l.excelCommission - l.commission_ttc) > 0.01 && (
                      <span className="tag warn" title="Montant différent dans l'Excel">Excel {formatAmount(l.excelCommission)}</span>
                    )}
                  </td>
                  <td className="num">{l.commission_paid ? formatAmount(l.commission_paid) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="actions">
            <button className="primary" onClick={run} disabled={busy}>{busy ? 'Import en cours…' : 'Importer'}</button>
          </div>
        </>
      )}
    </div>
  );
}
