import { useData } from '../data';
import { MONTHS } from '../lib/dates';
import type { Period } from '../lib/report';

export default function PeriodFilter({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const { bookings, lines } = useData();
  const years = new Set<number>([new Date().getFullYear()]);
  bookings.forEach((b) => years.add(Number(b.start_date.slice(0, 4))));
  lines.forEach((l) => years.add(Number(l.ref_date.slice(0, 4))));

  return (
    <div className="filters">
      <select
        value={value.year}
        onChange={(e) => {
          const year = e.target.value === 'all' ? 'all' : Number(e.target.value);
          onChange({ year, month: year === 'all' ? 'all' : value.month });
        }}
      >
        <option value="all">Toutes les années</option>
        {[...years].sort().map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
      <select
        value={value.month}
        disabled={value.year === 'all'}
        onChange={(e) => onChange({ ...value, month: e.target.value === 'all' ? 'all' : Number(e.target.value) })}
      >
        <option value="all">Toute l’année</option>
        {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
      </select>
    </div>
  );
}
