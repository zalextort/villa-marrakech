import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth';
import { useData } from '../data';
import { errorMessage, supabase } from '../lib/supabase';

export default function MonCompte() {
  const { profile } = useAuth();
  const { myParty } = useData();
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.updateUser({ password });
    setMsg(error ? errorMessage(error) : 'Mot de passe enregistré.');
    setPassword('');
  }

  const roles = [profile?.is_admin && 'administrateur', profile?.role].filter(Boolean).join(' · ');

  return (
    <div className="page narrow-page">
      <h1>Mon compte</h1>
      <div className="card">
        <p><strong>{profile?.full_name || '—'}</strong> · {profile?.email}</p>
        <p className="muted">
          Rôle : {roles}
          {myParty && <> · partie liée : {myParty.name}</>}
        </p>
      </div>
      <form className="card" onSubmit={save}>
        <h2>Définir un mot de passe</h2>
        <label>
          Nouveau mot de passe
          <input type="password" minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {msg && <p className="muted">{msg}</p>}
        <div className="actions">
          <button className="primary" type="submit">Enregistrer</button>
          <button type="button" onClick={() => supabase.auth.signOut()}>Se déconnecter</button>
        </div>
      </form>
    </div>
  );
}
