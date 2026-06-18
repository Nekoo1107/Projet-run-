# Projet Run — suivi d'entrainement course a pied + coach IA

Application personnelle (mono-utilisateur) pour suivre mon entrainement, rapatrier mes
donnees Strava, suivre un plan sur 12 semaines, analyser mes tendances, adapter le plan en
temps reel, et discuter avec un coach IA ancre dans mes donnees.

Construit par phases — **les 6 phases sont implementees.**

| Phase | Contenu | Etat |
|---|---|---|
| **1** | Setup + OAuth Strava + affichage des 10 derniers runs (liste + splits/FC) | ✅ |
| **2** | Parsing du plan 12 semaines + vue semaine + check-off + matching Strava + adherence | ✅ ici |
| **3** | Graphe allure-a-FC + volume vs cible + detection de tendance | ✅ |
| **4** | Chat IA (API Anthropic) avec mes donnees en contexte | ✅ ici |
| **5** | Moteur d'adaptation temps reel (regles + propositions IA) | ✅ ici |
| **6** | Module COROS (HRV/sommeil/recup) + correlations + alertes | ✅ ici |

## Stack

- **Backend** : Node.js + Express (ES modules), OAuth Strava cote serveur, stockage **SQLite** via le module integre `node:sqlite` (aucune compilation native, aucune dependance a installer). **Node >= 22.5 requis** (teste sur Node 24).
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

## Phase 2 — le plan 12 semaines

Onglet **« Plan 12 semaines »** :

1. **Date de depart** : choisis le lundi de la semaine 1 (la date est automatiquement calee sur le lundi). Chaque seance est alors alignee sur le calendrier.
2. **Vue semaine** : selecteur S1→S12 (les deloads S5 & S9 sont en pointilles, la semaine en cours a un point vert). Chaque jour affiche la seance prevue : type (easy/seuil/VO2max/long/escalade/repos), distance & allure & zone FC cibles, + notes (strides, renfo du soir, double, finition tempo…).
3. **Check-off** : pour chaque seance, bouton **Faite / Modifiee / Sautee**.
4. **Matching Strava** : pour chaque jour de course, le run Strava correspondant (meme date) est rapatrie automatiquement et affiche en **reel vs prevu** (distance, allure, FC).
5. **Adherence** : volume reel vs cible, par **semaine** et par **phase** (barres de progression).

> Le plan est genere a partir de `plan/plan_12_semaines_machine.md` (les tables de chaque phase + le schema de semaine type). Les distances marquees `≈` sont estimees pour atteindre le volume hebdo cible (les jours easy non chiffres dans le plan) ; le **volume cible hebdo** reste, lui, exactement celui du document.

## Phase 3 — Stats

Onglet **Stats** (Strava connecte requis) : allure à FC comparable (~145 bpm) dans le temps avec verdict **progression / stagnation / régression**, volume hebdo réel, efficacité aérobie. Sélecteur de période 60/120/180 j. Graphes SVG maison (aucune dépendance).

## Phase 4 — Coach IA

Onglet **Coach IA** : chat **streamé** où le backend envoie en contexte **ton plan + ta semaine en cours + tes runs Strava récents + tes tendances**, et impose les règles de coaching non négociables. Pose des questions du type « est-ce que je progresse ? », « pourquoi ma FC a dérivé hier ? ».

Deux fournisseurs possibles (le coach utilise Gemini si sa clé est présente, sinon Anthropic) :
- **Gemini** (`GEMINI_API_KEY`) — **gratuit** via https://aistudio.google.com/ (modèle `gemini-2.5-flash`). Recommandé.
- **Anthropic** (`ANTHROPIC_API_KEY`) — Claude `claude-opus-4-8`, facturé au token.

Sans aucune clé, l'onglet l'indique. Les clés ne sont **jamais** en dur ni exposées au frontend (lues côté serveur).

**Voix temps réel (Gemini Live)** — dans l'onglet Coach, bascule **🎙 Vocal (Live)** : tu parles au micro, le coach répond de vive voix, en direct. Nécessite `GEMINI_API_KEY`, fonctionne le mieux sur **Chrome** (autoriser le micro). Le backend relaie l'audio via un WebSocket (`/api/live`) — la clé reste côté serveur. Modèle surchageable via `GEMINI_LIVE_MODEL` (défaut `gemini-2.0-flash-live-001`) ; pour une voix plus naturelle, essaie un modèle *native-audio* quand il est dispo sur ta clé.

## Phase 5 — Adaptation temps réel

Onglet **Adaptation** : un moteur de règles **déterministe** analyse ta semaine en cours (réels Strava + statuts + douleur) et propose des **ajustements validables** (Valider / Refuser) qui ne violent JAMAIS les règles de coaching :

- **Surplus** : couru 10 km au lieu de 5 → réduit les séances faciles restantes pour ne pas dépasser le volume hebdo cible.
- **Séance sautée** : le volume manquant n'est PAS reporté (pas de pic) — progression douce préservée.
- **Douleur signalée** : course mise en pause (repos/cross-training), reprise seulement après « résolue » confirmé.
- **Garde-fous** : montée ≤ 15 %/sem après un déficit, deloads S5/S9 sacrés, jamais 3 jours durs d'affilée, alerte si les jours faciles dérivent > 150 bpm.

Les ajustements acceptés deviennent des **overrides** (la vue Plan affiche la cible adaptée + le plan d'origine). « Tout réinitialiser » revient au plan de référence. Pour une analyse en langage naturel, l'onglet Coach IA lit les mêmes données.

## Phase 6 — Santé, corrélations & alertes

Onglet **Santé** :

- **Module COROS branchable mais optionnel** : l'API COROS exige un accès partenaire (pas garanti), donc l'app n'en dépend pas. Le point d'intégration est prêt (`server/src/services/coros.js`, vars `COROS_*`) ; en attendant, tu **saisis à la main** HRV / FC repos / sommeil / récup / VO2max.
- **Corrélations** entre tes métriques santé et tes runs : chaleur → FC (dérive thermique), sommeil → efficacité aérobie, HRV → volume hebdo, récup → volume hebdo (coefficient de Pearson + interprétation, dès ~4 points).
- **Alertes** : volume qui monte > 15 %/sem, deload qui approche, FC élevée récurrente sur les runs.

## Notes

- **Scopes Strava** demandes : `read,activity:read_all` (lecture des activites, y compris privees).
- Le **plan de reference** (`plan/...md`) n'est jamais modifie ; le suivi (statuts, date de depart, overrides d'adaptation, flags de douleur, metriques sante) est stocke a cote dans SQLite.
- L'access token Strava expire toutes les ~6 h ; le backend le **rafraichit automatiquement** via le refresh token.
- Les runs incluent les types `Run`, `TrailRun`, `VirtualRun`. Tes activites COROS deja synchronisees vers Strava remontent donc ici sans l'API COROS.
- **Securite** : aucune cle en dur, tout en variables d'environnement ; tokens stockes dans `server/data/app.db` (git-ignore), exposes nulle part au frontend.

## Depannage

- *« Le backend ne repond pas »* : verifie que `npm run dev:server` tourne et ecoute sur `:3001`.
- *« cles Strava non configurees »* : `server/.env` mal rempli — relance le backend apres modification.
- *Erreur de redirection Strava* : le **Authorization Callback Domain** doit etre `localhost`.
