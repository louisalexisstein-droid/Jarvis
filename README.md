# Prépa AI — V3 synchronisée

Assistant de révision pour CPGE : cours → flashcards IA → révision → professeur IA, avec **compte utilisateur et synchronisation PC/téléphone via Supabase**.

## Ce que cette version fait

- PWA installable sur téléphone.
- Compte utilisateur avec e-mail + mot de passe.
- Cours stockés dans Supabase.
- Paquets de flashcards stockés dans Supabase.
- Progression des cartes synchronisée entre appareils.
- RLS Supabase : chaque utilisateur ne voit que ses propres cours/cartes.
- IA protégée côté serveur : la clé OpenAI n'est jamais envoyée au navigateur.
- Assistant IA basé sur le cours actuellement sélectionné.
- Import de PDF ou texte.

## 1. Créer le projet Supabase

1. Va sur `https://supabase.com/` et crée un projet.
2. Dans **SQL Editor**, ouvre `supabase/schema.sql`, copie tout et exécute-le.
3. Dans **Project Settings → API**, récupère :
   - **Project URL**
   - **Publishable/anon key**
   - **service_role key** (à utiliser uniquement côté serveur, jamais dans le client).
4. Dans **Authentication → Providers → Email**, garde Email activé. Pour commencer sans confirmation par e-mail, tu peux désactiver temporairement **Confirm email** ; tu pourras le réactiver ensuite.

## 2. Configurer le client

Dans `client/`, crée un fichier `.env` :

```env
VITE_SUPABASE_URL=https://TON-PROJET.supabase.co
VITE_SUPABASE_ANON_KEY=TA_CLE_ANON
```

Ces deux valeurs peuvent être présentes dans le navigateur : les règles RLS empêchent l'accès aux données des autres utilisateurs.

## 3. Configurer le serveur

Crée `server/.env` :

```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.5
PORT=3001
CORS_ORIGIN=http://localhost:5173
SUPABASE_URL=https://TON-PROJET.supabase.co
SUPABASE_SERVICE_ROLE_KEY=TA_SERVICE_ROLE_KEY
```

**Ne partage jamais `server/.env` ni la service role key.**

## 4. Installer et lancer

À la racine :

```bash
npm install
npm run dev
```

Puis ouvre : `http://localhost:5173`

Tu crées ton compte, puis les cours/cartes créés avec ce compte sont stockés dans Supabase.

## 5. Tester sur téléphone

En local, le téléphone ne doit pas utiliser `localhost` de son propre appareil. Pour tester facilement depuis le même Wi-Fi, lance Vite avec `--host 0.0.0.0` ou utilise un déploiement HTTPS.

Pour une vraie utilisation quotidienne sur PC + téléphone, déploie le projet en HTTPS. Le serveur Express sert alors le build React et les routes `/api/*` sur le même domaine.

```bash
npm run build
NODE_ENV=production npm start
```

## Structure des données

```text
Supabase
├── auth.users
├── courses
│   ├── user_id
│   ├── title
│   └── text
├── decks
│   ├── user_id
│   ├── course_id
│   └── name
└── cards
    ├── user_id
    ├── deck_id
    ├── question
    ├── answer
    └── level
```

## Sécurité

- Le client utilise uniquement la clé publique Supabase.
- Les tables sont protégées par Row Level Security.
- Le serveur vérifie le JWT Supabase avant chaque appel IA.
- La clé OpenAI et la service role key restent côté serveur.

## Prochaines évolutions

- répétition espacée de type FSRS ;
- OCR des photos de cours manuscrits ;
- exercices guidés avec système d'indices ;
- statistiques par chapitre ;
- planning de révision ;
- notifications de cartes à revoir.
