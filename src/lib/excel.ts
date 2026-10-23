import * as XLSX from 'xlsx';
import type { Party } from './types';
import { toISO } from './dates';
import { round2 } from './format';

// ---------------------------------------------------------------------------
// Import du fichier « Suivi locations.xlsx »
// En-têtes attendus en ligne 1 : Loyer TTC, Loyer HT, Banque, LAM, PP, Com TTC, Com HT, Recap,
// Payé, Com Payée, Dette, Cumul. Les colonnes sans en-tête sont repérées par leur position
// relative (arrivée, départ, client, prestation, TVA, date d'encaissement, réf. facture).
// ---------------------------------------------------------------------------

export interface ImportedLine {
  rowNumber: number;
  item: string;
  amount_ttc: number;
  vat_rate: number;
  amount_paid: number;
  paid_on: string | null;
  collected_by: string | null;
  commission_ttc: number;
  commission_paid: number;
  commission_paid_on: string | null;
  invoice_ref: string | null;
  recap_month: string | null;
  label: string | null;
  /** Commission telle que saisie dans l'Excel, si elle diffère du calcul à 20 %. */
  excelCommission: number;
}

export interface ImportedBooking {
  start_date: string;
  end_date: string;
  guest: string;
  lines: ImportedLine[];
}

export interface ImportResult {
  sheet: string;
  bookings: ImportedBooking[];
  standalone: ImportedLine[]; // lignes sans dates (encaissements globaux)
  warnings: string[];
}

const norm = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

function cellDate(v: unknown): string | null {
  if (v instanceof Date) return toISO(new Date(v.getTime() + 12 * 3600_000)); // évite les décalages de fuseau
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    return d ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : null;
  }
  if (typeof v === 'string') {
    const m = v.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
    if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  }
  return null;
}

const num = (v: unknown) => (typeof v === 'number' ? v : Number(String(v ?? '').replace(/\s/g, '').replace(',', '.')) || 0);
const text = (v: unknown) => (v == null || String(v).trim() === '' ? null : String(v).trim());

export async function readWorkbook(file: File) {
  return XLSX.read(await file.arrayBuffer(), { cellDates: true });
}

/** Feuille la plus longue : celle qui contient l'historique le plus complet. */
export function largestSheet(wb: XLSX.WorkBook): string {
  const rows = (n: string) => XLSX.utils.decode_range(wb.Sheets[n]['!ref'] ?? 'A1').e.r;
  return [...wb.SheetNames].sort((a, b) => rows(b) - rows(a))[0];
}

export function parseSuiviSheet(wb: XLSX.WorkBook, sheetName: string, parties: Party[], commissionRate: number): ImportResult {
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
  const header = (rows[0] ?? []).map(norm);
  const col = (name: string) => header.indexOf(name);

  const cTTC = col('loyer ttc');
  const cBank = col('banque');
  const cLam = col('lam');
  const cPP = col('pp');
  const cCom = col('com ttc');
  const cRecap = col('recap');
  const cComPaidOn = col('paye');
  const cComPaid = col('com payee');
  if (cTTC < 0 || cCom < 0) throw new Error(`Feuille « ${sheetName} » : colonnes « Loyer TTC » et « Com TTC » introuvables.`);

  // Colonnes sans en-tête : A arrivée, B départ, C client, D prestation, F TVA, I date d'encaissement, R facture
  const cStart = cTTC - 4;
  const cEnd = cTTC - 3;
  const cClient = cTTC - 2;
  const cItem = cTTC - 1;
  const cVat = cTTC + 1;
  const cPaidOn = cBank - 1;
  const cInvoice = cRecap + 1;

  const byShort = (s: string) => parties.find((p) => norm(p.short_name) === s)?.id ?? null;
  const collectors: [number, string | null, string][] = [
    [cBank, byShort('banque') ?? parties.find((p) => p.kind === 'sci')?.id ?? null, 'Banque'],
    [cLam, byShort('lam') ?? parties.find((p) => p.kind === 'administratrice')?.id ?? null, 'LAM'],
    [cPP, byShort('pp'), 'PP'],
  ];

  const warnings: string[] = [];
  for (const [c, id, name] of collectors) {
    if (c >= 0 && !id) warnings.push(`Aucune partie avec le libellé court « ${name} » : les montants de cette colonne seront ignorés.`);
  }

  const bookings: ImportedBooking[] = [];
  const standalone: ImportedLine[] = [];

  rows.forEach((r, i) => {
    if (i === 0 || !r) return;
    const ttc = num(r[cTTC]);
    if (!ttc) return;
    const start = cellDate(r[cStart]);
    const end = cellDate(r[cEnd]);
    const client = text(r[cClient]);
    if (!start && !client && !text(r[cItem])) return; // ligne de totaux
    const item = text(r[cItem]) ?? 'Location';
    const vat = round2(num(r[cVat]) * 100);
    const excelCom = num(r[cCom]);
    // Logique « Sans erreur » : commission = taux × loyer TTC, sauf si l'Excel n'en prévoit pas (hammam…)
    const commission = excelCom ? round2((ttc * commissionRate) / 100) : 0;

    const base = {
      rowNumber: i + 1,
      item,
      amount_ttc: ttc,
      vat_rate: vat,
      paid_on: cellDate(r[cPaidOn]),
      commission_paid: cComPaid >= 0 ? round2(num(r[cComPaid])) : 0,
      commission_paid_on: cComPaidOn >= 0 ? cellDate(r[cComPaidOn]) : null,
      invoice_ref: text(r[cInvoice]),
      recap_month: cellDate(r[cRecap]),
      label: client,
      excelCommission: round2(excelCom),
    };

    // Un même loyer peut être encaissé en partie sur plusieurs comptes (ex. Banque + LAM) :
    // on crée alors une ligne par encaissement, la commission étant répartie au prorata.
    const paidParts = collectors
      .filter(([c, id]) => c >= 0 && id && num(r[c]))
      .map(([c, id]) => ({ id, amount: round2(num(r[c])) }));
    const parts: ImportedLine[] =
      paidParts.length <= 1
        ? [{ ...base, amount_paid: paidParts[0]?.amount ?? 0, collected_by: paidParts[0]?.id ?? null, commission_ttc: commission }]
        : paidParts.map((p, k) => ({
            ...base,
            amount_ttc: p.amount,
            amount_paid: p.amount,
            collected_by: p.id,
            commission_ttc: round2((commission * p.amount) / ttc),
            commission_paid: k === 0 ? base.commission_paid : 0,
            excelCommission: round2((excelCom * p.amount) / ttc),
          }));
    if (paidParts.length > 1) {
      const total = round2(paidParts.reduce((s, p) => s + p.amount, 0));
      if (Math.abs(total - ttc) > 0.01) warnings.push(`Ligne ${i + 1} : encaissements (${total}) ≠ loyer TTC (${ttc}).`);
    }

    if (start && end) {
      bookings.push({ start_date: start, end_date: end, guest: client ?? '', lines: parts });
    } else if (text(r[cItem]) && bookings.length) {
      // Prestation annexe sans dates : rattachée à la location précédente
      const prev = bookings[bookings.length - 1];
      if (client && norm(client) !== norm(prev.guest)) warnings.push(`Ligne ${i + 1} : « ${item} » rattachée à ${prev.guest}.`);
      prev.lines.push(...parts.map((p) => ({ ...p, label: p.label ?? prev.guest })));
    } else {
      standalone.push(...parts);
    }
  });

  return { sheet: sheetName, bookings, standalone, warnings };
}
