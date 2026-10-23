import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from './lib/supabase';
import type { Booking, Party, Profile, RentalLine, Settings, Settlement } from './lib/types';
import { useAuth } from './auth';

interface DataState {
  parties: Party[];
  profiles: Profile[];
  bookings: Booking[];
  lines: RentalLine[];
  settlements: Settlement[];
  settings: Settings;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  partyById: (id: string | null | undefined) => Party | undefined;
  myParty: Party | undefined;
  isAdmin: boolean;
  canManageRentals: boolean;
}

const DataContext = createContext<DataState | null>(null);

// Le volume de données est faible (une villa) : on charge tout et on recharge après chaque modification.
export function DataProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [parties, setParties] = useState<Party[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [lines, setLines] = useState<RentalLine[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [settings, setSettings] = useState<Settings>({ commission_rate: 20, default_vat_rate: 20 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [pa, pr, bo, li, se, st] = await Promise.all([
      supabase.from('parties').select('*').order('sort'),
      supabase.from('profiles').select('*').order('email'),
      supabase.from('bookings').select('*').order('start_date'),
      supabase.from('rental_lines').select('*').order('ref_date').order('sort'),
      supabase.from('settlements').select('*').order('date'),
      supabase.from('settings').select('*').single(),
    ]);
    const err = [pa, pr, bo, li, se, st].find((r) => r.error)?.error;
    setError(err ? err.message : null);
    setParties((pa.data ?? []) as Party[]);
    setProfiles((pr.data ?? []) as Profile[]);
    setBookings((bo.data ?? []) as Booking[]);
    setLines((li.data ?? []) as RentalLine[]);
    setSettlements((se.data ?? []) as Settlement[]);
    if (st.data) setSettings(st.data as Settings);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
    // Mise à jour en direct quand un autre utilisateur modifie le planning
    const channel = supabase
      .channel('changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => reload())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [reload]);

  const value = useMemo<DataState>(() => {
    const byId = new Map(parties.map((p) => [p.id, p]));
    const isAdmin = Boolean(profile?.is_admin);
    return {
      parties,
      profiles,
      bookings,
      lines,
      settlements,
      settings,
      loading,
      error,
      reload,
      partyById: (id) => (id ? byId.get(id) : undefined),
      myParty: parties.find((p) => p.profile_id === profile?.id),
      isAdmin,
      canManageRentals: isAdmin || profile?.role === 'gestionnaire',
    };
  }, [parties, profiles, bookings, lines, settlements, settings, loading, error, reload, profile]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData hors DataProvider');
  return ctx;
}
