export type Role = 'actionnaire' | 'gestionnaire';
export type PartyKind = 'sci' | 'actionnaire' | 'administratrice';
export type BookingKind = 'sejour' | 'location';
export type RentalStatus = 'reserve' | 'en_cours' | 'termine' | 'paye';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: Role | null;
  is_admin: boolean;
  party_id: string | null;
  activated_at: string | null;
  notify: boolean;
}

export interface Party {
  id: string;
  name: string;
  short_name: string;
  kind: PartyKind;
  share_pct: number;
  color: string;
  sort: number;
}

export interface Booking {
  id: string;
  kind: BookingKind;
  start_date: string;
  end_date: string;
  nights: number;
  party_id: string | null;
  guest: string | null;
  platform: string | null;
  status: RentalStatus | null;
  comment: string | null;
}

export interface RentalLine {
  id: string;
  booking_id: string | null;
  ref_date: string;
  label: string | null;
  item: string;
  amount_ttc: number;
  vat_rate: number;
  amount_paid: number;
  paid_on: string | null;
  collected_by: string | null;
  commission_ttc: number;
  commission_paid: number;
  commission_paid_on: string | null;
  commission_paid_by: string | null;
  invoice_ref: string | null;
  recap_month: string | null;
  comment: string | null;
  sort: number;
}

export interface Settlement {
  id: string;
  date: string;
  from_party: string;
  to_party: string;
  amount: number;
  label: string | null;
}

export interface Settings {
  commission_rate: number;
  default_vat_rate: number;
}

export const AIRBNB_LISTING = 'https://www.airbnb.fr/rooms/1576802516035406578';

export const STATUS_LABELS: Record<RentalStatus, string> = {
  reserve: 'Réservé',
  en_cours: 'En cours',
  termine: 'Terminé',
  paye: 'Payé',
};

export const KIND_LABELS: Record<PartyKind, string> = {
  sci: 'SCI',
  actionnaire: 'Actionnaire',
  administratrice: 'Administratrice',
};

export const RENTAL_COLOR = '#d97706';
