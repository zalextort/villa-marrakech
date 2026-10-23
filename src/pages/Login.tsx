import { useState, type FormEvent } from 'react';
import { errorMessage, supabase, urlAuthError } from '../lib/supabase';

// Connexion par mot de passe, ou par code à usage unique reçu par e-mail.
// On utilise un code plutôt qu'un lien : les antivirus de messagerie (Microsoft Defender…)
// ouvrent les liens à l'arrivée de l'e-mail et les rendent inutilisables.
export default function Login() {
  const [mode, setMode] = useState<'password' | 'code'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(
    urlAuthError
      ? "Ce lien a expiré ou a déjà été utilisé (les antivirus de messagerie l'ouvrent parfois avant vous). Saisissez votre e-mail et recevez un code."
      : null,
  );
  const [busy, setBusy] = useState(false);

  async function signIn(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(errorMessage(error));
    setBusy(false);
  }

  async function sendCode() {
    if (!email) return setError('Saisissez votre e-mail.');
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    if (error) setError(errorMessage(error));
    else {
      setMode('code');
      setMessage(`Un code vous a été envoyé à ${email}. Il peut mettre quelques minutes à arriver (pensez aux indésirables).`);
    }
    setBusy(false);
  }

  async function verifyCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const token = code.replace(/\s/g, '');
    // Code de connexion, ou code reçu dans l'e-mail d'invitation
    let { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    if (error) ({ error } = await supabase.auth.verifyOtp({ email, token, type: 'invite' }));
    if (error) setError('Code incorrect ou expiré. Demandez un nouveau code.');
    setBusy(false);
  }

  if (mode === 'code') {
    return (
      <div className="center-page">
        <form className="card narrow" onSubmit={verifyCode}>
          <h1>Villa Marrakech</h1>
          <p className="muted">Connexion par code</p>
          <label>
            E-mail
            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Code reçu par e-mail
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              required
              autoFocus
            />
          </label>
          {error && <p className="error-text">{error}</p>}
          {message && <p className="ok-text">{message}</p>}
          <div className="actions">
            <button type="submit" className="primary" disabled={busy || code.replace(/\s/g, '').length < 6}>Valider</button>
            <button type="button" onClick={sendCode} disabled={busy}>Renvoyer un code</button>
            <button type="button" className="link" onClick={() => { setMode('password'); setError(null); setMessage(null); }}>
              Retour
            </button>
          </div>
        </form>
      </div>
    );
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
        <div className="actions">
          <button type="submit" className="primary" disabled={busy || !password}>Se connecter</button>
          <button type="button" onClick={sendCode} disabled={busy}>Recevoir un code par e-mail</button>
        </div>
        <p className="small">
          <button type="button" className="link" onClick={() => { setMode('code'); setError(null); setMessage(null); }}>
            J'ai déjà un code (invitation ou e-mail précédent)
          </button>
        </p>
      </form>
    </div>
  );
}
