// Dates manipulées en chaînes ISO « AAAA-MM-JJ » (pas de fuseau horaire).

export function toISO(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function parseISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: string, n: number): string {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function diffDays(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86_400_000);
}

export function today(): string {
  return toISO(new Date());
}

/** Nuits de [start, end) comprises dans [from, to). */
export function overlapNights(start: string, end: string, from: string, to: string): number {
  const s = start > from ? start : from;
  const e = end < to ? end : to;
  return e > s ? diffDays(s, e) : 0;
}

export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

const fmtShort = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const fmtLong = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtMonth = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });

export const formatDate = (s: string | null) => (s ? fmtLong.format(parseISO(s)) : '');
export const formatDateShort = (s: string) => fmtShort.format(parseISO(s));
export const formatMonth = (s: string) => fmtMonth.format(parseISO(s));

export const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const WEEKDAYS = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];
