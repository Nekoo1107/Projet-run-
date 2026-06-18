# Projet Run — suivi d'entrainement course a pied + coach IA

Application personnelle (mono-utilisateur) pour suivre mon entrainement, rapatrier mes
donnees Strava, suivre un plan sur 12 semaines, et (plus tard) discuter avec un coach IA.

Construit par phases. **Tu es a la Phase 1.**

| Phase | Contenu | Etat |
|---|---|---|
| **1** | Setup + OAuth Strava + affichage des 10 derniers runs (liste + splits/FC) | ✅ ici |
| 2 | Parsing du plan 12 semaines + vue semaine + check-off + matching Strava | a venir |
| 3 | Graphe allure-a-FC + volume vs cible + detection de tendance | a venir |
| 4 | Chat IA (API Anthropic) avec mes donnees en contexte | a venir |
| 5 | Moteur d'adaptation temps reel (regles + propositions IA) | a venir |
| 6 | Module COROS (HRV/sommeil/recup) + correlations + alertes | a venir |

## Stack

- **Backend** : Node.js + Express (ES modules), OAuth Strava cote serveur, stockage **SQLite** (`better-sqlite3`).
- **Frontend** : React + Vite.
- Le frontend parle directement au backend (CORS active). Les tokens Strava restent **cote serveur**, jamais exposes au navigateur.

```
.
├── server/   # API Express + SQLite
│   ├── src/{index.js, config.js, db.js, routes/, services/}
│   └── .env.example
├── web/      # React (Vite)
│   └── src/{App.jsx, api.js, components/}
└── plan/     # plan_12_semaines_machine.md (reference, utilise en Phase 2)
```

---

## Mise en route (Phase 1)

### 1. Creer une application Strava (a faire de ton cote)

1. Va sur **https://www.strava.com/settings/api**.
2. Cree une application (n'importe quel nom / site web).
3. Champ **« Authorization Callback Domain »** : mets exactement `localhost` (pas d'`http`, pas de port).
4. Note le **Client ID** et le **Client Secret**.

### 2. Configurer le backend

```bash
cp server/.env.example server/.env
```

Edite `server/.env` et renseigne :

```
STRAVA_CLIENT_ID=xxxxx
STRAVA_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Laisse le reste par defaut (`STRAVA_REDIRECT_URI=http://localhost:3001/api/auth/strava/callback`).
Le `.env` n'est **jamais** commite (cf. `.gitignore`).

### 3. Installer les dependances

Depuis la racine du projet :

```bash
npm run setup      # installe racine + server + web
```

(ou manuellement : `npm install` puis `npm --prefix server install` puis `npm --prefix web install`)

### 4. Lancer

```bash
npm run dev        # lance backend (3001) + frontend (5173) ensemble
```

Puis ouvre **http://localhost:5173**.

> Variante en deux terminaux : `npm run dev:server` et `npm run dev:web`.

### 5. Tester

1. Clique **« Se connecter avec Strava »** → autorise sur Strava.
2. Tu reviens sur l'app, connecte, et tes **10 derniers runs** s'affichent.
3. Clique un run → detail avec **splits par km, FC moyenne/max, D+, cadence, calories**.

---

## Notes

- **Scopes Strava** demandes : `read,activity:read_all` (lecture des activites, y compris privees).
- L'access token Strava expire toutes les ~6 h ; le backend le **rafraichit automatiquement** via le refresh token.
- Les runs incluent les types `Run`, `TrailRun`, `VirtualRun`. Tes activites COROS deja synchronisees vers Strava remontent donc ici sans l'API COROS.
- **Securite** : aucune cle en dur, tout en variables d'environnement ; tokens stockes dans `server/data/app.db` (git-ignore), exposes nulle part au frontend.

## Depannage

- *« Le backend ne repond pas »* : verifie que `npm run dev:server` tourne et ecoute sur `:3001`.
- *« cles Strava non configurees »* : `server/.env` mal rempli — relance le backend apres modification.
- *Erreur de redirection Strava* : le **Authorization Callback Domain** doit etre `localhost`.
