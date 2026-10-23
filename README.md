# Villa Marrakech – site de gestion

Site privé de gestion de la villa : planning partagé (séjours des actionnaires et locations), suivi des
locations, tableau de bord financier et comptes entre parties (SCI, actionnaires, Louer à Marrakech).

- Front-end : React + TypeScript (Vite), sans serveur, publié sur GitHub Pages
- Données, comptes et droits : Supabase (région UE), Row Level Security par rôle
- Interface en français, montants en dirhams (MAD)

## Mise en route

### 1. Supabase

1. Créer un projet Supabase en **région UE** (ex. Frankfurt `eu-central-1`).
2. *SQL Editor* : exécuter `supabase/migrations/0001_init.sql`.
3. *Authentication > URL Configuration* : mettre l'adresse GitHub Pages
   (`https://<compte>.github.io/<depot>/`) dans **Site URL** et dans **Redirect URLs**
   (ajouter aussi `http://localhost:5173/` pour le développement).
4. *Authentication > Providers > Email* : désactiver **Allow new users to sign up** (seul l'admin invite).
5. Inviter votre propre compte (*Authentication > Users > Invite*), vous connecter une première fois sur le site,
   puis vous nommer administrateur dans le SQL Editor :
   ```sql
   update profiles set is_admin = true, role = 'actionnaire', full_name = 'Alexandre Tort' where email = 'votre@email';
   update parties set profile_id = (select id from profiles where email = 'votre@email') where short_name = 'AT';
   ```
6. (Facultatif) Fonction d'invitation depuis le site :
   `supabase functions deploy invite-user --project-ref <ref>`.
   Sans elle, inviter depuis le tableau de bord Supabase puis attribuer le rôle dans *Administration*.

### 2. En local

```bash
cp .env.example .env.local   # renseigner l'URL et la clé « anon » du projet
npm install
npm run dev
```

### 3. GitHub Pages

1. Créer le dépôt, y pousser le code.
2. *Settings > Secrets and variables > Actions* : ajouter `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`.
3. *Settings > Pages* : Source = **GitHub Actions**.
4. Chaque push sur `main` déploie le site (`.github/workflows/deploy.yml`).

La clé « anon » est publique par nature : la sécurité repose sur les règles RLS de la base.
Le fichier Excel (noms des clients) est exclu du dépôt par `.gitignore`.

### 4. Paramétrage dans *Administration*

1. **Parties** : les parts sont préremplies (Philippe Patenotte 40 %, Emmanuel Le Hello, Geoffroy de Lacotte et
   Alexandre Tort 20 % chacun) ; ajuster les couleurs si besoin.
   Les libellés courts « Banque », « LAM », « PP » servent à l'import Excel.
2. **Utilisateurs** : inviter les actionnaires et la gestionnaire, leur donner un rôle et lier chaque
   actionnaire à sa partie (indispensable pour qu'il puisse réserver).
3. **Import** : charger `Suivi locations.xlsx`, choisir la feuille, vérifier l'aperçu, importer.

## Rôles

| | Planning | Séjours | Locations | Comptes / règlements | Administration |
|---|---|---|---|---|---|
| Actionnaire | voit tout | réserve, modifie, annule les siens | lecture | lecture | – |
| Gestionnaire | voit tout | – | saisit, modifie | lecture + règlements | – |
| Administrateur | voit tout | tous | tous | tous | oui |

## Logique de calcul (reprise du fichier Excel)

Chaque location comporte une ou plusieurs **lignes financières** (loyer, jacuzzi, hammam…), comme les lignes de l'Excel :

| Excel | Site |
|---|---|
| Loyer TTC, TVA, Loyer HT | Montant facturé TTC, TVA %, HT calculé |
| Banque / LAM / PP + date | Montant encaissé, **Encaissé par**, date d'encaissement |
| Com TTC (= 20 % du TTC), Com HT | Commission TTC (calculée au taux des paramètres, modifiable) |
| Payé, Com Payée, facture | Commission payée, date, payée par, réf. facture |
| Dette, Cumul | Page *Comptes*, tableau de l'administratrice |

Comptes courants, tous exprimés par rapport à la SCI (propriétaire des loyers) :

- un loyer encaissé par une autre partie que la SCI est dû à la SCI ;
- la SCI doit les commissions à l'administratrice ; les commissions payées viennent en déduction ;
- **Dette administratrice = Com TTC − Com payée − loyers encaissés par LAM** (colonne « Dette » de l'Excel) ;
- les règlements (virement LAM → SCI, etc.) se saisissent dans *Comptes* et viennent en déduction.

Vérification : `scripts/check-import.ts` relit l'Excel et recalcule les soldes. Sur la feuille « Sans erreur »,
le solde de Louer à Marrakech ressort à −5 829,36 MAD, identique à la colonne Dette de l'Excel.

```bash
npx esbuild scripts/check-import.ts --bundle --platform=node --outfile=check.cjs && node check.cjs "Dossier/Suivi locations.xlsx"
```

## Évolutions prévues

Notifications (WhatsApp / e-mail), quotas d'occupation par actionnaire, dépenses de la maison et répartition
entre actionnaires, connexion à Odoo (factures et paiements).
