import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { useData } from '../data';
import { errorMessage, supabase } from '../lib/supabase';

export default function MonCompte() {
  const { profile, refreshProfile } = useAuth();
  const { myParty } = useData();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    // Le formulaire disparaît : sinon un nouvel utilisateur croit que rien ne s'est passé
    navigate('/planning', { state: { notice: 'Mot de passe enregistré. Vous pourrez vous connecter avec votre e-mail et ce mot de passe.' } });
  }

  async function toggleNotify(value: boolean) {
    const { error } = await supabase.rpc('set_my_notify', { value });
    if (error) setError(errorMessage(error));
    else await refreshProfile();
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
        <label className="inline">
          <input type="checkbox" checked={profile?.notify ?? true} onChange={(e) => toggleNotify(e.target.checked)} />
          Recevoir un e-mail à chaque changement du planning
        </label>
      </div>
      <form className="card" onSubmit={save}>
        <h2>Définir un mot de passe</h2>
        <label>
          Nouveau mot de passe
          <input type="password" minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="error-text">{error}</p>}
        <div className="actions">
          <button className="primary" type="submit" disabled={busy}>Enregistrer</button>
          <button type="button" onClick={() => supabase.auth.signOut()}>Se déconnecter</button>
        </div>
      </form>
    </div>
  );
}
