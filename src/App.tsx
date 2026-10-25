import { lazy, Suspense } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import { DataProvider, useData } from './data';
import { configured, supabase } from './lib/supabase';
import Login from './pages/Login';
import Planning from './pages/Planning';
import Locations from './pages/Locations';
import Finances from './pages/Finances';
import Comptes from './pages/Comptes';
import MonCompte from './pages/MonCompte';
import Airbnb from './pages/Airbnb';
import Adresses from './pages/Adresses';

// Chargée à la demande : embarque la bibliothèque Excel pour l'import
const Admin = lazy(() => import('./pages/Admin'));

export default function App() {
  const { session, profile, loading } = useAuth();

  if (!configured) {
    return (
      <div className="center-page">
        <div className="card narrow">
          <h1>Configuration manquante</h1>
          <p>Renseignez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY (voir README).</p>
        </div>
      </div>
    );
  }
  if (loading) return <div className="center-page muted">Chargement…</div>;
  if (!session) return <Login />;
  if (!profile || (!profile.role && !profile.is_admin)) {
    return (
      <div className="center-page">
        <div className="card narrow">
          <h1>Compte en attente</h1>
          <p>Votre compte ({session.user.email}) doit être activé par l'administrateur.</p>
          <button onClick={() => supabase.auth.signOut()}>Se déconnecter</button>
        </div>
      </div>
    );
  }
  return (
    <DataProvider>
      <Shell />
    </DataProvider>
  );
}

function Shell() {
  const { profile } = useAuth();
  const { isAdmin, error } = useData();
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">Villa Marrakech</div>
        <nav>
          <NavLink to="/planning">Planning</NavLink>
          <NavLink to="/locations">Locations</NavLink>
          <NavLink to="/airbnb">Airbnb</NavLink>
          <NavLink to="/adresses">Adresses</NavLink>
          {/* Tableau de bord et Comptes réservés aux administrateurs pour l'instant */}
          {isAdmin && <NavLink to="/finances">Tableau de bord</NavLink>}
          {isAdmin && <NavLink to="/comptes">Comptes</NavLink>}
          {isAdmin && <NavLink to="/admin">Administration</NavLink>}
        </nav>
        <NavLink to="/moi" className="me" title={profile?.email}>
          {profile?.full_name || profile?.email}
        </NavLink>
      </header>
      {error && <div className="banner error">Erreur de chargement : {error}</div>}
      {notice && <div className="banner ok">{notice}</div>}
      <main>
        <Routes>
          <Route path="/planning" element={<Planning />} />
          <Route path="/locations" element={<Locations />} />
          <Route path="/airbnb" element={<Airbnb />} />
          <Route path="/adresses" element={<Adresses />} />
          {isAdmin && <Route path="/finances" element={<Finances />} />}
          {isAdmin && <Route path="/comptes" element={<Comptes />} />}
          {isAdmin && <Route path="/admin" element={<Suspense fallback={<p className="muted">Chargement…</p>}><Admin /></Suspense>} />}
          <Route path="/moi" element={<MonCompte />} />
          <Route path="*" element={<Navigate to="/planning" replace />} />
        </Routes>
      </main>
    </div>
  );
}
