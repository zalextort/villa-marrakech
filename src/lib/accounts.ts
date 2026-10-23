import type { Party, RentalLine, Settlement } from './types';
import { round2 } from './format';

/*
 * Comptes courants – reprise de la logique du fichier « Suivi locations.xlsx ».
 *
 * Tout est exprimé par rapport à la SCI, propriétaire des loyers.
 * Solde d'une partie > 0 : la SCI lui doit ce montant. Solde < 0 : elle doit ce montant à la SCI.
 *
 *  - Loyer encaissé par une partie autre que la SCI (colonnes LAM, PP) : cette partie doit le montant à la SCI.
 *  - Commission de l'administratrice (colonne « Com TTC ») : la SCI la lui doit.
 *  - Commission payée (colonne « Com Payée ») : réduit ce que la SCI doit à l'administratrice ;
 *    si un actionnaire l'a payée à la place de la SCI, la SCI le lui doit.
 *  - Règlement de A vers B : réduit la dette de A (ou augmente sa créance) et inversement pour B.
 *
 * Pour l'administratrice on retrouve la colonne « Dette » de l'Excel :
 *   Dette = Com TTC − Com payée − encaissé LAM   (cumul de la colonne « Cumul »)
 */

export interface PartyAccount {
  party: Party;
  collected: number;        // loyers encaissés pour le compte de la SCI
  commissionDue: number;    // commissions dues (administratrice)
  commissionPaid: number;   // commissions reçues (administratrice)
  commissionAdvanced: number; // commissions payées à la place de la SCI
  settlementsOut: number;   // règlements versés
  settlementsIn: number;    // règlements reçus
  balance: number;
}

export function computeAccounts(parties: Party[], lines: RentalLine[], settlements: Settlement[]): PartyAccount[] {
  const sci = parties.find((p) => p.kind === 'sci');
  const admin = parties.find((p) => p.kind === 'administratrice');
  const acc = new Map<string, PartyAccount>(
    parties.map((p) => [
      p.id,
      { party: p, collected: 0, commissionDue: 0, commissionPaid: 0, commissionAdvanced: 0, settlementsOut: 0, settlementsIn: 0, balance: 0 },
    ]),
  );

  for (const l of lines) {
    if (l.collected_by && Number(l.amount_paid)) {
      const a = acc.get(l.collected_by);
      if (a) a.collected += Number(l.amount_paid);
    }
    if (admin) {
      const a = acc.get(admin.id)!;
      a.commissionDue += Number(l.commission_ttc);
      a.commissionPaid += Number(l.commission_paid);
    }
    if (l.commission_paid_by && Number(l.commission_paid) && l.commission_paid_by !== sci?.id) {
      const a = acc.get(l.commission_paid_by);
      if (a) a.commissionAdvanced += Number(l.commission_paid);
    }
  }
  for (const s of settlements) {
    const from = acc.get(s.from_party);
    const to = acc.get(s.to_party);
    if (from) from.settlementsOut += Number(s.amount);
    if (to) to.settlementsIn += Number(s.amount);
  }

  for (const a of acc.values()) {
    if (a.party.kind === 'sci') {
      // La SCI est la contrepartie de toutes les autres : son solde est l'opposé de leur somme.
      continue;
    }
    a.balance = round2(
      -a.collected + a.commissionDue - a.commissionPaid + a.commissionAdvanced + a.settlementsOut - a.settlementsIn,
    );
  }
  if (sci) {
    const s = acc.get(sci.id)!;
    s.balance = round2(-[...acc.values()].filter((a) => a !== s).reduce((sum, a) => sum + a.balance, 0));
  }
  return [...acc.values()].sort((a, b) => a.party.sort - b.party.sort);
}

/** Dette de l'administratrice ligne par ligne, avec cumul (colonnes « Dette » et « Cumul » de l'Excel). */
export function lineDebt(line: RentalLine, adminId: string | undefined): number {
  const collectedByAdmin = line.collected_by === adminId ? Number(line.amount_paid) : 0;
  return round2(Number(line.commission_ttc) - Number(line.commission_paid) - collectedByAdmin);
}
