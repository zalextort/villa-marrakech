import { useState, type FormEvent } from 'react';
import { errorMessage, supabase } from '../lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(errorMessage(error));
    setBusy(false);
  }

  async function sendLink() {
    if (!email) return setError('Saisissez votre e-mail.');
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: window.location.origin + window.location.pathname },
    });
    if (error) setError(errorMessage(error));
    else setMessage('Un lien de connexion vous a été envoyé par e-mail.');
    setBusy(false);
  }

  return (
    <div className="center-page">
      <form className="card narrow" onSubmit={signIn}>
        <h1>Villa Marrakech</h1>
        <p className="muted">Espace privé des actionnaires</p>
        <label>
          E-mail
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Mot de passe
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="error-text">{error}</p>}
        {message && <p className="ok-text">{message}</p>}
        <div className="actions">
          <button type="submit" className="primary" disabled={busy || !password}>Se connecter</button>
          <button type="button" onClick={sendLink} disabled={busy}>Recevoir un lien par e-mail</button>
        </div>
      </form>
    </div>
  );
}
