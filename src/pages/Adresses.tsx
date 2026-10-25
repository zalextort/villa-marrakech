import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '../auth';
import { useData } from '../data';
import Modal from '../components/Modal';
import { errorMessage, supabase } from '../lib/supabase';

interface Address {
  id: string;
  category: string;
  name: string;
  description: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  created_by: string | null;
}

// Rubriques proposées ; on peut en saisir d'autres
const CATEGORIES = [
  'Restaurants', 'Bars et cafés', 'Courses et marchés', 'Visites et activités', 'Hammams et bien-être',
  'Shopping', 'Transport', 'Artisans et dépannage', 'Santé',
];

const mapsUrl = (a: Address) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${a.name} ${a.address ?? ''} Marrakech`)}`;
const webUrl = (s: string) => (/^https?:\/\//i.test(s) ? s : `https://${s}`);

export default function Adresses() {
  const { profile } = useAuth();
  const { profiles, isAdmin } = useData();
  const [list, setList] = useState<Address[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<Address | 'new' | null>(null);

  async function load() {
    const { data, error } = await supabase.from('addresses').select('*').order('name');
    if (error) setError(errorMessage(error));
    else setList(data);
  }
  useEffect(() => { load(); }, []);

  const categories = useMemo(
    () => [...new Set((list ?? []).map((a) => a.category))].sort((a, b) => a.localeCompare(b, 'fr')),
    [list],
  );
  const q = search.trim().toLowerCase();
  const shown = (list ?? []).filter(
    (a) => (category === 'all' || a.category === category)
      && (!q || [a.name, a.description, a.address].some((s) => s?.toLowerCase().includes(q))),
  );
  const groups = categories.map((c) => ({ c, items: shown.filter((a) => a.category === c) })).filter((g) => g.items.length);
  const authorOf = (id: string | null) => {
    const p = profiles.find((x) => x.id === id);
    return p ? p.full_name?.trim() || p.email : null;
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Adresses</h1>
        <div className="actions">
          <button className="primary" onClick={() => setOpen('new')}>Ajouter une adresse</button>
        </div>
      </div>
      <div className="toolbar">
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="all">Toutes les rubriques</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input type="search" placeholder="Rechercher…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {error && <p className="error-text">{error}</p>}
      {!list && !error && <p className="muted">Chargement…</p>}
      {list && groups.length === 0 && (
        <p className="muted">{list.length ? 'Aucune adresse ne correspond.' : 'Aucune adresse pour l’instant : ajoutez la première !'}</p>
      )}
      {groups.map((g) => (
        <div key={g.c} className="card">
          <h2>{g.c}</h2>
          <ul className="address-list">
            {g.items.map((a) => (
              <li key={a.id}>
                <div className="address-head">
                  <strong>{a.name}</strong>
                  <button className="link" onClick={() => setOpen(a)}>Modifier</button>
                </div>
                {a.description && <p className="address-desc">{a.description}</p>}
                <div className="small address-links">
                  {a.address && <a href={mapsUrl(a)} target="_blank" rel="noopener noreferrer">{a.address}</a>}
                  {!a.address && <a href={mapsUrl(a)} target="_blank" rel="noopener noreferrer">Voir sur la carte</a>}
                  {a.phone && <a href={`tel:${a.phone.replace(/\s/g, '')}`}>{a.phone}</a>}
                  {a.website && <a href={webUrl(a.website)} target="_blank" rel="noopener noreferrer">Site web</a>}
                  {authorOf(a.created_by) && <span className="muted">Ajoutée par {authorOf(a.created_by)}</span>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {open && (
        <AddressModal
          address={open === 'new' ? undefined : open}
          categories={[...new Set([...CATEGORIES, ...categories])]}
          defaultCategory={category === 'all' ? '' : category}
          canDelete={open !== 'new' && (isAdmin || open.created_by === profile?.id)}
          onClose={() => setOpen(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}

function AddressModal({ address, categories, defaultCategory, canDelete, onClose, onSaved }: {
  address?: Address;
  categories: string[];
  defaultCategory: string;
  canDelete: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    category: address?.category ?? defaultCategory,
    name: address?.name ?? '',
    description: address?.description ?? '',
    address: address?.address ?? '',
    phone: address?.phone ?? '',
    website: address?.website ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const row = {
      category: form.category.trim(),
      name: form.name.trim(),
      description: form.description.trim() || null,
      address: form.address.trim() || null,
      phone: form.phone.trim() || null,
      website: form.website.trim() || null,
    };
    const { error } = address
      ? await supabase.from('addresses').update(row).eq('id', address.id)
      : await supabase.from('addresses').insert(row);
    setBusy(false);
    if (error) return setError(errorMessage(error));
    await onSaved();
    onClose();
  }

  async function remove() {
    if (!address || !confirm(`Supprimer « ${address.name} » ?`)) return;
    const { error } = await supabase.from('addresses').delete().eq('id', address.id);
    if (error) return setError(errorMessage(error));
    await onSaved();
    onClose();
  }

  return (
    <Modal title={address ? 'Modifier l’adresse' : 'Nouvelle adresse'} onClose={onClose}>
      <form onSubmit={save}>
        <div className="row2">
          <label>
            Rubrique
            <input list="address-categories" value={form.category} onChange={set('category')} required />
            <datalist id="address-categories">
              {categories.map((c) => <option key={c} value={c} />)}
            </datalist>
          </label>
          <label>
            Nom
            <input value={form.name} onChange={set('name')} required />
          </label>
        </div>
        <label>
          Pourquoi on l’aime, conseils
          <textarea value={form.description} onChange={set('description')} rows={3} />
        </label>
        <label>
          Adresse
          <input value={form.address} onChange={set('address')} placeholder="Quartier, rue…" />
        </label>
        <div className="row2">
          <label>
            Téléphone
            <input type="tel" value={form.phone} onChange={set('phone')} />
          </label>
          <label>
            Site web
            <input value={form.website} onChange={set('website')} placeholder="www…" />
          </label>
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="actions">
          <button className="primary" type="submit" disabled={busy}>Enregistrer</button>
          {canDelete && <button type="button" className="danger" onClick={remove}>Supprimer</button>}
        </div>
      </form>
    </Modal>
  );
}
