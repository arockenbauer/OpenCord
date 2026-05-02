# 00 — Architecture Générale d'OpenCord

> Fichier de référence pour l'architecture globale du projet. Tous les autres fichiers de spécification s'appuient sur ce document.

---

## 1. Vision et Objectifs

OpenCord est un clone fonctionnel et open-source de Discord, conçu pour être auto-hébergeable, sans dépendances à des services externes, et entièrement maîtrisable par son administrateur.

### Objectifs principaux

- **Auto-hébergement complet** : aucune dépendance à des API tierces (sauf Stripe pour les paiements et éventuellement des fournisseurs OAuth futurs)
- **Expérience utilisateur fidèle à Discord** : interface, comportements, fonctionnalités calqués sur Discord sans copie littérale
- **Extensibilité** : système de plugins officiel côté client et serveur, badges extensibles, rôles et permissions granulaires
- **Performances** : communication temps réel via Socket.IO, pagination curseur pour les messages, recherche FTS5
- **Sécurité** : JWT à courte durée de vie, refresh tokens en base, 2FA TOTP, rate limiting, validation Zod à toutes les entrées
- **Internationalisation** : interface disponible en français et en anglais dès le départ, architecture i18n extensible

### Non-objectifs (hors périmètre initial)

- Fédération ou interopérabilité avec d'autres instances
- Application mobile native
- Appels voix/vidéo (marqués DIFFÉRÉ dans les specs)
- CDN ou stockage cloud (tout est local)

---

## 2. Stack Technique

### Frontend

| Technologie | Version | Rôle |
|---|---|---|
| React | 18+ | UI library |
| Vite | 5+ | Bundler / dev server |
| TypeScript | 5+ | Typage statique |
| Zustand | 4+ | State management global |
| React Router | 6+ | Routing côté client |
| Socket.IO Client | 4+ | WebSocket temps réel |
| i18next + react-i18next | 23+ | Internationalisation |
| markdown-it | 14+ | Rendu Markdown (messages) |
| date-fns | 3+ | Manipulation de dates / timestamps |
| Zod | 3+ | Validation côté client (formulaires) |

### Backend

| Technologie | Version | Rôle |
|---|---|---|
| Node.js | 20+ LTS | Runtime |
| Express | 4+ | Framework HTTP |
| TypeScript | 5+ | Typage statique |
| Prisma | 5+ | ORM + migrations |
| SQLite (via better-sqlite3) | 3+ | Base de données |
| Socket.IO | 4+ | Serveur WebSocket |
| jsonwebtoken | 9+ | Génération et vérification JWT |
| bcrypt | 5+ | Hachage des mots de passe |
| Zod | 3+ | Validation des entrées (routes) |
| sharp | 0.33+ | Traitement d'images (resize, conversion) |
| multer | 1+ | Upload de fichiers multipart |
| express-rate-limit | 7+ | Rate limiting par IP / utilisateur |
| helmet | 7+ | Headers de sécurité HTTP |
| cors | 2+ | Politique CORS |
| otplib | 12+ | Génération et vérification TOTP (2FA) |
| qrcode | 1+ | Génération QR code pour 2FA |
| stripe | 14+ | Intégration paiements (abonnements) |
| concurrently | 8+ | Lancement parallèle client + serveur en dev |

### Partagé (package `shared`)

| Technologie | Rôle |
|---|---|
| TypeScript 5+ | Types partagés entre client et serveur |
| Zod 3+ | Schémas de validation partagés |

---

## 3. Structure du Monorepo

```
opencord/
├── packages/
│   ├── client/                    # Frontend React (Vite)
│   │   ├── src/
│   │   │   ├── components/        # Composants React réutilisables (UI atoms, molecules, organisms)
│   │   │   ├── pages/             # Pages/routes principales (Login, Register, App, Admin…)
│   │   │   ├── hooks/             # Custom hooks (useSocket, useAuth, useGuild…)
│   │   │   ├── stores/            # State management Zustand (authStore, guildStore, messageStore…)
│   │   │   ├── services/          # Couche d'appels API REST (api.ts, auth.service.ts…)
│   │   │   ├── utils/             # Fonctions utilitaires (snowflake, formatting, permissions…)
│   │   │   ├── locales/           # Fichiers de traduction
│   │   │   │   ├── en.json
│   │   │   │   └── fr.json
│   │   │   ├── plugins/           # Système de plugins côté client
│   │   │   │   ├── loader.ts      # Chargement dynamique des plugins
│   │   │   │   ├── registry.ts    # Registre des plugins actifs
│   │   │   │   └── types.ts       # Interfaces de plugin client
│   │   │   ├── styles/            # Design tokens CSS, styles globaux
│   │   │   │   ├── tokens.css     # Variables CSS (couleurs, espacements, typographie)
│   │   │   │   └── global.css     # Reset + styles globaux
│   │   │   └── types/             # Types TypeScript propres au client
│   │   ├── public/                # Assets statiques
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── tsconfig.json
│   │   └── .env                   # Variables d'environnement frontend
│   │
│   ├── server/                    # Backend Express
│   │   ├── src/
│   │   │   ├── routes/            # Déclaration des routes Express (par domaine)
│   │   │   │   ├── auth.routes.ts
│   │   │   │   ├── users.routes.ts
│   │   │   │   ├── guilds.routes.ts
│   │   │   │   ├── channels.routes.ts
│   │   │   │   ├── messages.routes.ts
│   │   │   │   ├── admin.routes.ts
│   │   │   │   └── …
│   │   │   ├── controllers/       # Logique métier (handlers de route)
│   │   │   ├── middleware/        # Middlewares Express
│   │   │   │   ├── auth.middleware.ts        # Vérification JWT
│   │   │   │   ├── rate-limit.middleware.ts  # Rate limiting
│   │   │   │   ├── validate.middleware.ts    # Validation Zod
│   │   │   │   ├── upload.middleware.ts      # Multer config
│   │   │   │   └── error.middleware.ts       # Global error handler
│   │   │   ├── services/          # Services réutilisables (mail, badge, stripe, snowflake…)
│   │   │   ├── gateway/           # Gestionnaires d'événements Socket.IO
│   │   │   │   ├── index.ts       # Setup Socket.IO server
│   │   │   │   ├── message.gateway.ts
│   │   │   │   ├── presence.gateway.ts
│   │   │   │   └── typing.gateway.ts
│   │   │   ├── plugins/           # Système de plugins côté serveur
│   │   │   │   ├── loader.ts
│   │   │   │   ├── registry.ts
│   │   │   │   └── types.ts
│   │   │   ├── utils/             # Utilitaires (snowflake generator, AppError, etc.)
│   │   │   ├── prisma/            # Schéma Prisma + migrations
│   │   │   │   ├── schema.prisma
│   │   │   │   └── seed.ts
│   │   │   └── types/             # Types TypeScript propres au serveur
│   │   ├── uploads/               # Fichiers uploadés (avatars, banners, pièces jointes)
│   │   │   ├── avatars/
│   │   │   ├── banners/
│   │   │   ├── attachments/
│   │   │   ├── emojis/
│   │   │   └── stickers/
│   │   ├── tsconfig.json
│   │   └── .env                   # Variables d'environnement backend
│   │
│   └── shared/                    # Package partagé (types + validateurs)
│       ├── src/
│       │   ├── types/             # Interfaces TypeScript partagées
│       │   │   ├── user.types.ts
│       │   │   ├── guild.types.ts
│       │   │   ├── channel.types.ts
│       │   │   ├── message.types.ts
│       │   │   ├── role.types.ts
│       │   │   └── …
│       │   ├── constants/         # Constantes partagées
│       │   │   ├── permissions.ts # Bitfield de permissions (ADMINISTRATOR = 1n << 3n…)
│       │   │   ├── limits.ts      # Limites (max message length, max channels…)
│       │   │   └── events.ts      # Noms des événements Socket.IO
│       │   └── validators/        # Schémas Zod partagés
│       │       ├── auth.validators.ts
│       │       ├── message.validators.ts
│       │       └── …
│       ├── package.json
│       └── tsconfig.json
│
├── scripts/                       # Scripts de gestion du monorepo
│   ├── dev.ts                     # Lance client + serveur en dev (concurrently)
│   ├── build.ts                   # Build client + serveur
│   ├── install.ts                 # Installation des dépendances (tous les packages)
│   └── seed.ts                    # Seed de la base de données
│
├── package.json                   # Workspace root (npm workspaces)
├── tsconfig.base.json             # tsconfig de base partagé
└── .gitignore
```

---

## 4. Variables d'Environnement

### Backend — `packages/server/.env`

```env
# Serveur
PORT=3001
NODE_ENV=development

# Base de données
DATABASE_URL="file:./prisma/opencord.db"

# JWT
JWT_SECRET=changeme_jwt_secret_very_long_random_string
JWT_REFRESH_SECRET=changeme_refresh_secret_very_long_random_string

# Fichiers
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=8388608         # 8 MB en octets (25MB pour OpenCord+, géré dans le code)

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# CORS
CORS_ORIGIN=http://localhost:5173
```

### Frontend — `packages/client/.env`

```env
VITE_API_URL=http://localhost:3001
VITE_WS_URL=http://localhost:3001
VITE_STRIPE_PUBLIC_KEY=pk_test_...
VITE_DEFAULT_LOCALE=fr
```

> Toutes les variables `VITE_` sont exposées au navigateur. Ne jamais y mettre de secrets.

---

## 5. Scripts NPM

Définis à la racine du monorepo (`package.json`) :

| Commande | Description |
|---|---|
| `npm run dev` | Lance le client (Vite) et le serveur (ts-node/nodemon) en parallèle via `concurrently` |
| `npm run build` | Build TypeScript du serveur + build Vite du client |
| `npm run prod` | Lance le serveur compilé en mode production, sert les fichiers statiques du client |
| `npm run install:all` | Installe les dépendances de tous les packages du workspace |
| `npm run db:migrate` | Exécute `prisma migrate dev` |
| `npm run db:seed` | Exécute le script de seed (badges système, admin par défaut) |
| `npm run db:studio` | Lance Prisma Studio pour inspecter la base |
| `npm run typecheck` | Vérifie les types TypeScript dans tous les packages |
| `npm run lint` | Lint ESLint sur tous les packages |

---

## 6. Base de Données — Vue d'Ensemble des Tables

La base de données est SQLite, gérée via Prisma ORM. Voici la liste exhaustive des tables avec leur rôle.

| Table | Description |
|---|---|
| `users` | Comptes utilisateurs (auth, profil, paramètres) |
| `refresh_tokens` | Tokens de rafraîchissement JWT stockés en base |
| `sessions` | Sessions actives avec infos appareil/IP |
| `guilds` | Serveurs (nom, icône, paramètres, owner) |
| `guild_members` | Appartenance d'un utilisateur à un serveur |
| `channels` | Canaux de tous types (texte, vocal, forum, catégorie…) |
| `messages` | Messages envoyés dans les canaux |
| `attachments` | Fichiers joints à des messages |
| `embeds` | Embeds générés automatiquement ou par bot |
| `reactions` | Réactions emoji sur les messages |
| `pins` | Messages épinglés par canal |
| `read_states` | Dernier message lu par utilisateur et par canal |
| `threads` | Fils de discussion (enfants de canaux texte ou forum) |
| `thread_members` | Membres abonnés à un fil |
| `forum_posts` | Posts dans les canaux forum (= threads enrichis) |
| `forum_tags` | Étiquettes associables aux posts forum |
| `forum_post_tags` | Relation N-N entre posts et tags |
| `roles` | Rôles d'un serveur (nom, couleur, permissions bitfield) |
| `role_members` | Relation N-N entre membres et rôles |
| `permission_overwrites` | Permissions spécifiques à un canal (par rôle ou utilisateur) |
| `invites` | Liens d'invitation vers un serveur |
| `bans` | Bannissements d'utilisateurs d'un serveur |
| `emojis` | Emojis personnalisés uploadés dans un serveur |
| `stickers` | Stickers uploadés dans un serveur |
| `webhooks` | Webhooks entrants pour un canal |
| `audit_logs` | Journal des actions administratives d'un serveur |
| `notifications` | Notifications in-app des utilisateurs |
| `badges` | Définition des badges (nom, icône, description) |
| `user_badges` | Attribution d'un badge à un utilisateur |
| `subscriptions` | Abonnements OpenCord+ (liés à Stripe) |
| `boosts` | Boosts de serveur (liés aux abonnements) |
| `automod_rules` | Règles d'auto-modération par serveur |
| `dm_channels` | Canaux de messages directs (1-1) |
| `dm_members` | Participants d'un DM ou groupe DM |
| `friends` | Relations d'amitié / blocage entre utilisateurs |
| `plugins` | Plugins installés et leur configuration |
| `platform_settings` | Paramètres globaux de la plateforme (admin-configurable, clé/valeur JSON) |
| `subscription_tiers` | Tiers d'abonnement premium (OpenCord+, configurables par admin) |
| `stripe_events` | Log d'idempotence des webhooks Stripe |
| `admin_audit_logs` | Journal d'audit des actions du panneau d'administration |

---

## 7. Conventions de Code

### Nommage

| Élément | Convention | Exemple |
|---|---|---|
| Fichiers | `kebab-case` | `auth.middleware.ts`, `guild-member.service.ts` |
| Composants React | `PascalCase` | `MessageInput.tsx`, `GuildSidebar.tsx` |
| Hooks | `camelCase` préfixé `use` | `useSocket.ts`, `useGuildMembers.ts` |
| Stores Zustand | `camelCase` suffixé `Store` | `authStore.ts`, `messageStore.ts` |
| Types/Interfaces | `PascalCase` | `UserProfile`, `GuildMember` |
| Constantes | `SCREAMING_SNAKE_CASE` | `MAX_MESSAGE_LENGTH`, `PERMISSION_BITS` |
| Variables/fonctions | `camelCase` | `sendMessage()`, `currentUser` |

### Règles générales

- **Zéro commentaire dans le code** — le code doit être auto-documenté par des noms explicites
- **Validation Zod obligatoire** à toutes les entrées HTTP (via `validate.middleware.ts`)
- **Aucune valeur de configuration codée en dur** — tout passe par les variables `.env`
- **Toutes les chaînes UI sont des clés de traduction** — jamais de texte brut dans les composants
- **Typage strict** — `strict: true` dans tous les `tsconfig.json`
- **Pas de `any`** — utiliser `unknown` et type guards si nécessaire

### Gestion des erreurs

Toutes les erreurs métier héritent de la classe `AppError` :

```typescript
class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    public message: string,
    public details?: unknown
  ) {
    super(message)
  }
}
```

Exemples de codes d'erreur standardisés :

| Code | Status HTTP | Description |
|---|---|---|
| `UNAUTHORIZED` | 401 | Token absent ou invalide |
| `FORBIDDEN` | 403 | Droits insuffisants |
| `NOT_FOUND` | 404 | Ressource introuvable |
| `VALIDATION_ERROR` | 422 | Données invalides (détails Zod) |
| `RATE_LIMITED` | 429 | Trop de requêtes |
| `INTERNAL_ERROR` | 500 | Erreur serveur inattendue |

Format de réponse d'erreur standard :

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Les données fournies sont invalides.",
    "details": [
      { "field": "email", "message": "Format d'email invalide" }
    ]
  }
}
```

### Génération des IDs (Snowflake-like)

Les IDs de toutes les entités principales (`users`, `messages`, `guilds`, etc.) sont des snowflakes 64-bit encodés en string (pour éviter les pertes de précision JavaScript). Structure :

```
[timestamp 41 bits][worker_id 5 bits][sequence 18 bits]
```

- Implémenté dans `packages/server/src/utils/snowflake.ts`
- Exposé comme utilitaire partagé dans `packages/shared/src/utils/snowflake.ts`

---

## 8. Architecture Temps Réel (Socket.IO)

Le serveur Socket.IO partage le même processus Node.js qu'Express. Les connexions sont authentifiées via JWT transmis en handshake.

### Authentification WebSocket

À la connexion, le client envoie son `access_token` dans `auth.token`. Le middleware Socket.IO vérifie le JWT avant d'accepter la connexion.

### Rooms (salles)

| Room | Format | Description |
|---|---|---|
| Utilisateur | `user:<userId>` | Événements personnels (DM, notifications) |
| Canal | `channel:<channelId>` | Messages d'un canal |
| Serveur | `guild:<guildId>` | Événements serveur (présence, rôles) |

### Événements principaux

Voir `packages/shared/src/constants/events.ts` pour la liste exhaustive. Exemples :

| Événement | Direction | Description |
|---|---|---|
| `message:create` | Serveur → Client | Nouveau message |
| `message:update` | Serveur → Client | Message édité |
| `message:delete` | Serveur → Client | Message supprimé |
| `typing:start` | Client → Serveur | Début de saisie |
| `typing:stop` | Serveur → Client | Fin de saisie (timeout 10s) |
| `presence:update` | Serveur → Client | Changement de statut d'un utilisateur |
| `guild:member_join` | Serveur → Client | Nouveau membre dans un serveur |
| `notification:new` | Serveur → Client | Nouvelle notification in-app |

---

## 9. Système de Stockage de Fichiers

Tout stockage est local, dans `packages/server/uploads/`. Aucun service cloud n'est utilisé.

### Structure des dossiers

```
uploads/
├── avatars/        # Avatar utilisateur (format: <userId>.<ext>)
├── banners/        # Bannière utilisateur et serveur
├── guild-icons/    # Icônes de serveur
├── emojis/         # Emojis personnalisés
├── stickers/       # Stickers
└── attachments/    # Pièces jointes des messages
    └── <channelId>/
        └── <messageId>/
```

### Traitement des images (sharp)

- Avatars : redimensionnés à 128×128 px, convertis en WebP
- Bannières utilisateur : redimensionnées à 600×240 px, WebP
- Icônes de serveur : 128×128 px, WebP
- Pièces jointes images : génération d'un thumbnail 256×256 max

### Accès aux fichiers

Les fichiers uploadés sont servis par Express via une route statique :
`GET /uploads/<type>/<filename>` → fichier local

---

## 10. Système d'Internationalisation (i18n)

- **Bibliothèque** : `i18next` + `react-i18next` côté client
- **Langues supportées** : `fr` (défaut) et `en`
- **Fichiers** : `packages/client/src/locales/fr.json` et `en.json`
- **Structure des clés** : namespaces par domaine fonctionnel

```json
{
  "auth": {
    "login": {
      "title": "Bon retour !",
      "email_placeholder": "Email",
      "submit": "Se connecter"
    }
  },
  "errors": {
    "UNAUTHORIZED": "Vous devez être connecté.",
    "RATE_LIMITED": "Trop de requêtes. Réessayez dans {{seconds}} secondes."
  }
}
```

- La locale de l'utilisateur est stockée en base (`users.locale`) et synchronisée au login
- Le sélecteur de langue est accessible dans les paramètres utilisateur (Apparence)
- Côté backend, les messages d'erreur retournés sont des **codes** (ex: `UNAUTHORIZED`), la traduction se fait côté client

---

## 11. Rate Limiting

Implémenté avec `express-rate-limit`. Comportement Discord-like : la réponse 429 inclut le header `Retry-After` (en secondes).

| Route | Limite | Fenêtre |
|---|---|---|
| `POST /api/auth/login` | 5 requêtes | 1 minute |
| `POST /api/auth/register` | 3 requêtes | 1 heure |
| `POST /api/channels/:id/messages` | 5 requêtes | 5 secondes |
| `POST /api/channels/:id/typing` | 1 requête | 3 secondes |
| Routes générales | 100 requêtes | 15 minutes |

Format de la réponse 429 :

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Trop de requêtes.",
    "retry_after": 42
  }
}
```

---

## 12. Panneau d'Administration

Accessible à `/admin` dans le frontend. Protégé par le niveau de compte `admin_level` (voir spec `02-users-profiles-badges.md`).

- `admin_level = 0` → utilisateur normal → 403 à `/admin`
- `admin_level = 1` → modérateur → accès limité
- `admin_level = 2` → administrateur → accès complet
- `admin_level = 3` → superadmin → accès complet + gestion des admins

Sections du panneau :
- Gestion des utilisateurs (recherche, bannissement global, modification `admin_level`)
- Gestion des badges (création, attribution, suppression)
- Gestion des plugins installés
- Statistiques globales (nb utilisateurs, serveurs, messages)
- Journaux d'audit globaux

---

## 13. Système de Plugins

Les plugins sont **officiels uniquement** (pas de plugins tiers non vérifiés). Ils sont distribués comme packages npm internes au monorepo ou chargés depuis un répertoire contrôlé.

### Plugin serveur

- Interface : `ServerPlugin { name, version, onLoad(app, prisma, io), onUnload() }`
- Peut enregistrer des routes Express supplémentaires, des listeners Socket.IO, des hooks sur les événements métier
- Chargé au démarrage du serveur depuis `packages/server/src/plugins/`

### Plugin client

- Interface : `ClientPlugin { name, version, onLoad(registry), onUnload() }`
- Peut enregistrer des composants React dans des slots prédéfinis (ex: `sidebar-bottom`, `message-context-menu`)
- Chargé dynamiquement via `packages/client/src/plugins/loader.ts`

### Sécurité

- Les plugins sont exécutés dans le même processus (pas de sandbox VM)
- La validation et la revue de code sont obligatoires avant toute inclusion officielle
- Un plugin peut être activé/désactivé sans redémarrage (via le panneau admin)

---

## 14. OpenCord+ (Abonnement Premium)

- **Prix** : 5€/mois
- **Paiement** : Stripe (Checkout Session + Webhooks)
- **Avantages** :
  - Upload de fichiers jusqu'à 25 MB (vs 8 MB)
  - Badge `OPENCORD_PLUS_SUBSCRIBER` automatique
  - Stickers personnalisés supplémentaires
  - Emojis animés dans tous les serveurs
  - Boost d'un serveur inclus par mois
- **Gestion** : page `/settings/premium` côté client, webhooks Stripe côté serveur
- **Modèle `subscriptions`** : lié à l'utilisateur et au `subscription_id` Stripe
- Voir `06-premium-plugins.md` pour les détails complets

---

## Références croisées

- `01-authentication.md` — Système d'authentification, JWT, 2FA
- `02-users-profiles-badges.md` — Profils, amis, badges
- `03-servers-channels.md` — Serveurs, canaux, rôles
- `04-messages.md` — Messages, réactions, recherche, threads
- `05-roles-permissions.md` — Système de permissions bitfield (à créer)
- `06-premium-plugins.md` — OpenCord+, plugins en détail (à créer)
