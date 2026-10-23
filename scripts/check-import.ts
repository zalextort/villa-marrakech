// Vérifie l'import du fichier Excel et compare les soldes à la colonne « Dette » de l'Excel.
// Usage : npx esbuild scripts/check-import.ts --bundle --platform=node --outfile=<tmp>.cjs && node <tmp>.cjs <fichier.xlsx>
import * as XLSX from 'xlsx';
import { readFileSync } from 'node:fs';
import { parseSuiviSheet } from '../src/lib/excel';
import { computeAccounts } from '../src/lib/accounts';
import type { Party, RentalLine } from '../src/lib/types';

const wb = XLSX.read(readFileSync(process.argv[2]), { cellDates: true });
const parties: Party[] = [
  { id: 'sci', name: 'SCI', short_name: 'Banque', kind: 'sci', share_pct: 0, color: '', sort: 0 },
  { id: 'lam', name: 'Louer à Marrakech', short_name: 'LAM', kind: 'administratrice', share_pct: 0, color: '', sort: 1 },
  { id: 'pp', name: 'PP', short_name: 'PP', kind: 'actionnaire', share_pct: 40, color: '', sort: 2 },
];
for (const sheet of wb.SheetNames) {
  const r = parseSuiviSheet(wb, sheet, parties, 20);
  const all = [...r.standalone, ...r.bookings.flatMap((b) => b.lines)];
  const lines = all.map((l, i) => ({ ...l, id: String(i), booking_id: null, ref_date: '', comment: null, sort: i, commission_paid_by: l.commission_paid ? 'sci' : null })) as RentalLine[];
  const acc = computeAccounts(parties, lines, []);
  console.log(`\n== ${sheet}: ${r.bookings.length} locations, ${r.bookings.reduce((s, b) => s + b.lines.length, 0)} lignes rattachées, ${r.standalone.length} lignes isolées`);
  for (const b of r.bookings) console.log(`  ${b.start_date} → ${b.end_date}  ${b.guest.padEnd(20)} ${b.lines.map((l) => `${l.item} ${l.amount_ttc} [${l.collected_by ?? '—'}] com ${l.commission_ttc}${l.excelCommission !== l.commission_ttc ? ` (Excel ${l.excelCommission})` : ''}`).join(' + ')}`);
  for (const l of r.standalone) console.log(`  (sans dates) ${l.label} ${l.amount_ttc} [${l.collected_by}] com ${l.commission_ttc}`);
  r.warnings.forEach((w) => console.log('  ! ' + w));
  for (const a of acc) console.log(`  Solde ${a.party.short_name.padEnd(7)} ${a.balance.toFixed(2).padStart(12)}   (encaissé ${a.collected.toFixed(2)}, com due ${a.commissionDue.toFixed(2)}, com payée ${a.commissionPaid.toFixed(2)})`);
}
