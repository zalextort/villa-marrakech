import type { Booking, Party, RentalLine } from './types';
import { diffDays, overlapNights, today } from './dates';
import { ht, round2 } from './format';
import { STATUS_LABELS } from './types';

export interface Period {
  year: number | 'all';
  month: number | 'all'; // 0–11
}

export function periodRange(p: Period, bookings: Booking[]): [string, string] {
  if (p.year === 'all') {
    const first = bookings[0]?.start_date ?? today();
    const y = new Date().getFullYear();
    return [first.slice(0, 4) + '-01-01', `${y + 1}-01-01`];
  }
  if (p.month === 'all') return [`${p.year}-01-01`, `${p.year + 1}-01-01`];
  const m = p.month + 1;
  const next = m === 12 ? `${p.year + 1}-01-01` : `${p.year}-${String(m + 1).padStart(2, '0')}-01`;
  return [`${p.year}-${String(m).padStart(2, '0')}-01`, next];
}

export const inPeriod = (date: string, [from, to]: [string, string]) => date >= from && date < to;

/** Une ligne du tableau des locations : une location avec ses prestations, ou un encaissement isolé. */
export interface RentalRow {
  key: string;
  booking?: Booking;
  standalone?: RentalLine;
  date: string;
  label: string;
  lines: RentalLine[];
  billed: number;
  billedHt: number;
  paid: number;
  commission: number;
  collectors: string[];
}

export function rentalRows(bookings: Booking[], lines: RentalLine[], parties: Party[], range: [string, string]): RentalRow[] {
  const short = new Map(parties.map((p) => [p.id, p.short_name]));
  const byBooking = new Map<string, RentalLine[]>();
  for (const l of lines) if (l.booking_id) byBooking.set(l.booking_id, [...(byBooking.get(l.booking_id) ?? []), l]);

  const summarize = (ls: RentalLine[]) => ({
    billed: round2(ls.reduce((s, l) => s + Number(l.amount_ttc), 0)),
    billedHt: round2(ls.reduce((s, l) => s + ht(Number(l.amount_ttc), Number(l.vat_rate)), 0)),
    paid: round2(ls.reduce((s, l) => s + Number(l.amount_paid), 0)),
    commission: round2(ls.reduce((s, l) => s + Number(l.commission_ttc), 0)),
    collectors: [...new Set(ls.filter((l) => l.collected_by && Number(l.amount_paid)).map((l) => short.get(l.collected_by!) ?? '?'))],
  });

  const rows: RentalRow[] = bookings
    .filter((b) => b.kind === 'location' && inPeriod(b.start_date, range))
    .map((b) => {
      const ls = byBooking.get(b.id) ?? [];
      return { key: b.id, booking: b, date: b.start_date, label: b.guest ?? '', lines: ls, ...summarize(ls) };
    });
  for (const l of lines) {
    if (!l.booking_id && inPeriod(l.ref_date, range)) {
      rows.push({ key: l.id, standalone: l, date: l.ref_date, label: l.label ?? l.item, lines: [l], ...summarize([l]) });
    }
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

export interface Occupancy {
  days: number;
  rented: number;
  stays: number;
  free: number;
}

export function occupancy(bookings: Booking[], [from, to]: [string, string]): Occupancy {
  let rented = 0;
  let stays = 0;
  for (const b of bookings) {
    const n = overlapNights(b.start_date, b.end_date, from, to);
    if (b.kind === 'location') rented += n;
    else stays += n;
  }
  const days = diffDays(from, to);
  return { days, rented, stays, free: Math.max(0, days - rented - stays) };
}

export function exportableRows(rows: RentalRow[], parties: Party[]) {
  const name = new Map(parties.map((p) => [p.id, p.name]));
  return rows.flatMap((r) =>
    r.lines.length
      ? r.lines.map((l) => ({
          Arrivée: r.booking?.start_date ?? '',
          Départ: r.booking?.end_date ?? '',
          Nuits: r.booking?.nights ?? '',
          'Locataire / référence': r.label,
          Plateforme: r.booking?.platform ?? '',
          Statut: r.booking?.status ? STATUS_LABELS[r.booking.status] : '',
          Prestation: l.item,
          'Montant TTC': Number(l.amount_ttc),
          'TVA %': Number(l.vat_rate),
          'Montant HT': round2(ht(Number(l.amount_ttc), Number(l.vat_rate))),
          'Montant encaissé': Number(l.amount_paid),
          'Date encaissement': l.paid_on ?? '',
          'Encaissé par': l.collected_by ? name.get(l.collected_by) : '',
          'Commission TTC': Number(l.commission_ttc),
          'Commission payée': Number(l.commission_paid),
          'Date paiement commission': l.commission_paid_on ?? '',
          'Réf. facture': l.invoice_ref ?? '',
          Commentaire: r.booking?.comment ?? l.comment ?? '',
        }))
      : [{
          Arrivée: r.booking?.start_date ?? '',
          Départ: r.booking?.end_date ?? '',
          Nuits: r.booking?.nights ?? '',
          'Locataire / référence': r.label,
          Plateforme: r.booking?.platform ?? '',
          Statut: r.booking?.status ? STATUS_LABELS[r.booking.status] : '',
        }],
  );
}
