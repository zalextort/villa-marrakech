const mad = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 });

export const formatMAD = (n: number) => `${mad.format(n)} MAD`;
export const formatAmount = (n: number) => mad.format(n);
export const formatPct = (n: number) => pct.format(n);

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Montant HT à partir du TTC et du taux de TVA en %. */
export const ht = (ttc: number, vatRate: number) => ttc / (1 + vatRate / 100);
