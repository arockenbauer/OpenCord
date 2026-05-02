# Spécification 15 — Limitation de Débit & Sécurité

## Vue d'ensemble

Ce document décrit l'ensemble du système de limitation de débit (rate limiting) inspiré de Discord, ainsi que toutes les mesures de sécurité à mettre en place dans OpenCord. Ces mécanismes s'appliquent à l'API backend (Express/Node.js) et doivent être implémentés de façon cohérente sur chaque route.

---

## 1. Système de Limitation de Débit (Rate Limiting)

### 1.1 Bibliothèques et infrastructure

- **Bibliothèque principale** : `express-rate-limit` pour la gestion des fenêtres glissantes
- **Middleware personnalisé** : complète `express-rate-limit` pour gérer les buckets par utilisateur/IP, les en-têtes Discord-style et les buckets nommés
- **Stockage** : store en mémoire (`Map<string, { count: number, resetAt: number }>`), sans Redis ni base de données externe
  - La clé du store est une combinaison de `bucket_name:user_id` (authentifié) ou `bucket_name:ip` (non authentifié)
  - Nettoyage périodique des entrées expirées pour éviter les fuites mémoire (toutes les 5 minutes)

### 1.2 En-têtes de réponse

Chaque réponse API doit inclure les en-têtes suivants, quel que soit le statut HTTP retourné :

| En-tête | Description | Exemple |
|---|---|---|
| `X-RateLimit-Limit` | Nombre maximum de requêtes autorisées dans la fenêtre courante | `5` |
| `X-RateLimit-Remaining` | Nombre de requêtes restantes dans la fenêtre courante | `3` |
| `X-RateLimit-Reset` | Timestamp Unix (en secondes) de la réinitialisation du compteur | `1711929600` |
| `X-RateLimit-Reset-After` | Secondes restantes avant réinitialisation | `4.987` |
| `X-RateLimit-Bucket` | Identifiant du bucket de rate limit appliqué | `message_send` |

### 1.3 Réponse en cas de dépassement (HTTP 429)

Quand une limite est dépassée, le serveur répond avec le statut **429 Too Many Requests** et le corps JSON suivant :

```json
{
  "message": "You are being rate limited.",
  "retry_after": 5.0,
  "global": false
}
```

- `retry_after` : nombre de secondes flottant avant de pouvoir retenter la requête
- `global` : `true` si la limite globale est atteinte, `false` pour un bucket spécifique
- En-tête supplémentaire : `Retry-After: 5` (valeur entière arrondie vers le haut, en secondes)

### 1.4 Buckets de rate limiting

Chaque groupe de routes possède son propre bucket avec ses propres limites. Les buckets sont indépendants les uns des autres (dépasser un bucket n'affecte pas les autres).

#### Bucket : `global`
- **Limite** : 50 requêtes par seconde par utilisateur (authentifié) ou par IP (non authentifié)
- **Scope** : s'applique à toutes les routes confondues
- **Comportement** : si dépassé, TOUTES les routes retournent 429 avec `global: true`

#### Bucket : `auth`
- **Routes concernées** : `POST /api/auth/login`, `POST /api/auth/register`, `POST /api/auth/forgot-password`
- **Limite** : 5 requêtes par minute par IP
- **Raison** : protection contre le brute-force et l'enumération de comptes

#### Bucket : `message_send`
- **Routes concernées** : `POST /api/channels/:id/messages`
- **Limite** : 5 messages par 5 secondes par canal par utilisateur
- **Scope** : par paire (user_id, channel_id)

#### Bucket : `message_edit_delete`
- **Routes concernées** : `PATCH /api/channels/:id/messages/:msgId`, `DELETE /api/channels/:id/messages/:msgId`
- **Limite** : 10 requêtes par 10 secondes par utilisateur

#### Bucket : `channel_manage`
- **Routes concernées** : `POST /api/guilds/:id/channels`, `PATCH /api/channels/:id`, `DELETE /api/channels/:id`
- **Limite** : 5 requêtes par 30 secondes par utilisateur

#### Bucket : `guild_operations`
- **Routes concernées** : `POST /api/guilds`, `PATCH /api/guilds/:id`, `DELETE /api/guilds/:id`, `POST /api/guilds/:id/roles`, `PATCH /api/guilds/:id/roles/:roleId`
- **Limite** : 5 requêtes par 30 secondes par utilisateur

#### Bucket : `user_profile_update`
- **Routes concernées** : `PATCH /api/users/@me`, `PATCH /api/users/@me/avatar`, `PATCH /api/users/@me/banner`
- **Limite** : 2 requêtes par 10 secondes par utilisateur

#### Bucket : `reaction_add`
- **Routes concernées** : `PUT /api/channels/:id/messages/:msgId/reactions/:emoji/@me`, `DELETE /api/channels/:id/messages/:msgId/reactions/:emoji/@me`
- **Limite** : 10 requêtes par 10 secondes par utilisateur

#### Bucket : `bulk_delete`
- **Routes concernées** : `POST /api/channels/:id/messages/bulk-delete`
- **Limite** : 1 requête par 30 secondes par utilisateur

#### Bucket : `search`
- **Routes concernées** : `GET /api/guilds/:id/messages/search`, `GET /api/channels/:id/messages/search`
- **Limite** : 2 requêtes par 10 secondes par utilisateur

#### Bucket : `file_upload`
- **Routes concernées** : toute route avec upload multipart (avatar, banner, attachments, emojis, stickers)
- **Limite** : 5 requêtes par 60 secondes par utilisateur

#### Bucket : `typing`
- **Routes concernées** : `POST /api/channels/:id/typing`
- **Limite** : 5 requêtes par 5 secondes par utilisateur
- **Comportement spécial** : les requêtes excédentaires sont simplement **abandonnées** (droppées) sans erreur HTTP 429 — l'indicateur de saisie est simplement ignoré côté serveur

### 1.5 Identification du sujet de la limite

- **Utilisateur authentifié** : la clé est basée sur le `user_id` extrait du JWT
- **Requête non authentifiée** : la clé est basée sur l'adresse IP du client (en tenant compte du header `X-Forwarded-For` si le serveur est derrière un proxy, configurable via `TRUST_PROXY=true` dans `.env`)

### 1.6 Rate limits pour les bots

Les tokens de type bot bénéficient de limites plus généreuses. Un multiplicateur de **1.5×** est appliqué à tous les buckets listés ci-dessus. Le type de token (user/bot) est stocké dans le JWT (`type: "bot" | "user"`).

### 1.7 Implémentation du middleware

Le middleware de rate limiting est appliqué dans l'ordre suivant :

1. Middleware global (appliqué sur `app.use(...)` avant toutes les routes)
2. Middleware de bucket spécifique appliqué sur chaque groupe de routes

Chaque middleware :
- Lit l'identifiant (user_id ou IP)
- Lit l'entrée dans le store (`Map`)
- Si l'entrée n'existe pas ou est expirée : créer avec `count = 1, resetAt = now + windowMs`
- Si l'entrée existe et n'est pas expirée : incrémenter `count`
- Si `count > limit` : retourner 429
- Sinon : injecter les en-têtes et appeler `next()`

---

## 2. Sécurité

### 2.1 CORS (Cross-Origin Resource Sharing)

- Configurable via la variable d'environnement `CORS_ORIGIN` dans `.env` backend
  - Développement : `CORS_ORIGIN=http://localhost:5173`
  - Production : `CORS_ORIGIN=https://votredomaine.com`
- Seule l'origine du frontend est autorisée — pas de wildcard `*`
- `credentials: true` activé pour permettre l'envoi de cookies si besoin
- Méthodes autorisées : `GET, POST, PUT, PATCH, DELETE, OPTIONS`
- En-têtes autorisés : `Content-Type, Authorization, X-Requested-With`

### 2.2 Helmet.js

Helmet est appliqué globalement sur l'application Express avec la configuration suivante :

| En-tête | Valeur | Justification |
|---|---|---|
| `Content-Security-Policy` | `default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; script-src 'self'; style-src 'self' 'unsafe-inline'` | Empêche le chargement de ressources non autorisées |
| `X-Content-Type-Options` | `nosniff` | Empêche le MIME sniffing |
| `X-Frame-Options` | `DENY` | Empêche le clickjacking via iframes |
| `X-XSS-Protection` | `0` | Désactivé volontairement — les navigateurs modernes ne l'utilisent plus et il peut introduire des failles |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Activé uniquement en production (`NODE_ENV=production`) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limite la fuite de l'URL référente |

### 2.3 Validation des entrées

Toute donnée reçue dans le corps d'une requête, les query params ou les paramètres de route doit être validée avant traitement.

- **Bibliothèque** : Zod (schémas de validation TypeScript-first)
- **Emplacement des schémas** : `packages/shared/src/validators/` (partagés entre frontend et backend)
- **Structure des schémas** : un fichier par domaine fonctionnel (`auth.validators.ts`, `guild.validators.ts`, `message.validators.ts`, etc.)

#### Ce qui est validé

- Types de données (string, number, boolean, array, object)
- Longueurs minimales et maximales des chaînes
- Formats spéciaux : email (regex RFC 5321), URL (URL standard), couleur hexadécimale (`#[0-9A-Fa-f]{6}`)
- Champs requis vs optionnels
- Valeurs dans une liste autorisée (enum)
- Taille des tableaux
- Valeurs numériques dans une plage (min/max)

#### Suppression des champs inconnus

Les schémas Zod doivent utiliser `.strip()` (comportement par défaut) pour supprimer silencieusement les champs non attendus dans les objets entrants.

#### Réponse en cas d'erreur de validation

Statut HTTP **400 Bad Request** avec le corps :

```json
{
  "errors": [
    { "field": "email", "message": "Format d'email invalide" },
    { "field": "username", "message": "Le nom d'utilisateur doit contenir entre 2 et 32 caractères" }
  ]
}
```

### 2.4 Prévention des injections SQL

Prisma ORM utilise des requêtes paramétrées pour toutes les interactions avec la base de données. Aucune concaténation manuelle de chaînes SQL n'est tolérée. Le risque d'injection SQL est éliminé structurellement par l'utilisation de Prisma.

### 2.5 Prévention XSS (Cross-Site Scripting)

- **Côté client** : tout contenu utilisateur affiché (messages, noms, descriptions) est rendu via un moteur Markdown qui échappe le HTML brut. La bibliothèque `DOMPurify` est utilisée pour assainir le HTML avant insertion dans le DOM.
- **Côté serveur** : le contenu n'est pas assaini à l'écriture (il est stocké tel quel), mais est systématiquement échappé à l'affichage
- **Content-Security-Policy** : réduit la surface d'attaque XSS en interdisant les scripts inline non autorisés

### 2.6 CSRF (Cross-Site Request Forgery)

La protection CSRF n'est **pas nécessaire** dans OpenCord car :
- L'authentification repose sur des **tokens JWT** transmis dans l'en-tête `Authorization: Bearer <token>`
- Les cookies ne sont pas utilisés pour l'authentification
- Les requêtes cross-origin malveillantes ne peuvent pas inclure l'en-tête `Authorization` (bloqué par la politique SOP du navigateur)
- CORS est configuré pour n'accepter que l'origine du frontend

Cette décision est documentée ici à des fins de traçabilité.

### 2.7 Sécurité des mots de passe

- **Algorithme de hachage** : bcrypt avec un facteur de coût de **12 rounds**
- **Longueur minimale** : 8 caractères
- **Longueur maximale** : 128 caractères (pour éviter les attaques DoS via bcrypt sur très longs mots de passe)
- **Complexité minimale** (configurable via `.env`) : au moins 1 majuscule, 1 minuscule, 1 chiffre
- **Rate limiting sur le login** : bucket `auth` (5 tentatives/minute par IP)
- **Verrouillage de compte** : après 10 tentatives de connexion échouées consécutives, le compte est verrouillé pendant 30 minutes. Un champ `locked_until` est stocké en base de données.

### 2.8 Sécurité JWT

#### Access Token
- **Durée de vie** : 15 minutes
- **Algorithme** : HS256 (HMAC-SHA256)
- **Secret** : minimum 256 bits, stocké dans `JWT_ACCESS_SECRET` dans `.env`
- **Payload** : `{ sub: userId, type: "user"|"bot", iat, exp }`

#### Refresh Token
- **Durée de vie** : 30 jours
- **Stockage** : hash du refresh token stocké en base de données (`RefreshToken` model), avec `userId`, `expiresAt`, `revokedAt`
- **Secret** : stocké dans `JWT_REFRESH_SECRET` dans `.env`, distinct du secret d'access token
- **Révocation** : à la déconnexion, le refresh token est marqué `revokedAt = now` en base — il ne peut plus être utilisé
- **Rotation** : à chaque renouvellement d'access token, un nouveau refresh token est émis et l'ancien est révoqué

#### Blacklist des tokens
- Les access tokens révoqués (suite à un logout ou un changement de mot de passe) sont ajoutés à une blacklist en mémoire (`Set<string>` contenant le JTI — JWT ID) jusqu'à leur expiration naturelle.
- Nettoyage automatique des tokens expirés de la blacklist.

### 2.9 Sécurité des fichiers uploadés

- **Whitelist MIME** : seuls les types MIME autorisés sont acceptés (voir spécification 17)
- **Validation magic bytes** : le type réel du fichier est vérifié via ses octets d'en-tête (bibliothèque `file-type`), indépendamment de l'extension fournie par le client
- **Limite de taille** : imposée par multer (`limits.fileSize`) avant traitement
- **Sanitisation du nom de fichier** :
  - Suppression des séparateurs de chemin (`/`, `\`, `..`)
  - Suppression des caractères spéciaux dangereux
  - Limitation à 255 caractères
- **Nom de stockage** : le fichier est stocké avec un UUID v4 généré aléatoirement, jamais avec le nom original (le nom original est conservé en base de données pour l'affichage)
- **Content-Disposition** : les fichiers non-image sont servis avec `Content-Disposition: attachment; filename="nom_original.ext"` pour éviter l'exécution dans le navigateur

### 2.10 Système de permissions

Chaque endpoint API vérifie les permissions de l'utilisateur avant d'effectuer toute action. L'ordre de vérification est :

1. Authentification (JWT valide et non révoqué)
2. Existence des ressources référencées (guild, channel, message)
3. Appartenance de l'utilisateur à la guilde concernée
4. Permissions calculées (owner → toutes permissions, puis rôles → permission_overwrites de channel)
5. Exécution de l'action

Aucun raccourci ne doit être pris — chaque route doit effectuer ces vérifications dans l'ordre.

### 2.11 Gestion des erreurs

#### Classe `AppError`

```typescript
class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    public message: string,
    public details?: unknown
  ) {}
}
```

#### Codes d'erreur standardisés

| Code | Statut HTTP | Description |
|---|---|---|
| `USER_NOT_FOUND` | 404 | Utilisateur introuvable |
| `GUILD_NOT_FOUND` | 404 | Serveur introuvable |
| `CHANNEL_NOT_FOUND` | 404 | Canal introuvable |
| `MESSAGE_NOT_FOUND` | 404 | Message introuvable |
| `MISSING_PERMISSIONS` | 403 | Permissions insuffisantes |
| `MISSING_ACCESS` | 403 | Accès refusé (pas membre de la guilde) |
| `RATE_LIMITED` | 429 | Limite de débit dépassée |
| `INVALID_CREDENTIALS` | 401 | Identifiants invalides |
| `TOKEN_EXPIRED` | 401 | Token JWT expiré |
| `TOKEN_INVALID` | 401 | Token JWT invalide ou révoqué |
| `ACCOUNT_LOCKED` | 403 | Compte temporairement verrouillé |
| `VALIDATION_ERROR` | 400 | Erreur de validation des données |
| `DUPLICATE_ENTRY` | 409 | Ressource déjà existante (email, username) |
| `FILE_TOO_LARGE` | 413 | Fichier trop volumineux |
| `INVALID_FILE_TYPE` | 415 | Type de fichier non autorisé |
| `INTERNAL_ERROR` | 500 | Erreur interne du serveur |
| `NOT_IMPLEMENTED` | 501 | Fonctionnalité non implémentée |

#### Middleware global de gestion d'erreurs

- Intercepte toutes les erreurs non gérées dans les handlers Express
- En **développement** : inclut le stack trace dans la réponse pour faciliter le debug
- En **production** : n'expose jamais le stack trace ; log l'erreur côté serveur
- Logging :
  - Développement : `console.error`
  - Production : écriture dans un fichier de log (`logs/error.log`) avec rotation

### 2.12 Protection des données sensibles

- **Mots de passe** : jamais loggés, jamais retournés dans les réponses API
- **Tokens** : jamais loggés
- **Email dans les réponses API** :
  - Vers le propriétaire du compte (`/api/users/@me`) : email complet
  - Vers les autres utilisateurs : masqué (ex : `ax***@gmail.com` — 2 premiers caractères + `***` + domaine)
- **Numéro de téléphone** : masqué de la même façon dans les réponses vers les tiers
- **Champs supprimés des objets utilisateur** renvoyés à d'autres utilisateurs : `email`, `phone`, `mfaEnabled`, `locale`, `flags` internes, tout champ de sécurité

---

## 3. Configuration `.env` liée à la sécurité

```env
# JWT
JWT_ACCESS_SECRET=<minimum 32 caractères aléatoires>
JWT_REFRESH_SECRET=<minimum 32 caractères aléatoires, différent du précédent>
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=30d

# CORS
CORS_ORIGIN=http://localhost:5173

# Proxy
TRUST_PROXY=false

# Sécurité
BCRYPT_ROUNDS=12
ACCOUNT_LOCKOUT_ATTEMPTS=10
ACCOUNT_LOCKOUT_DURATION_MINUTES=30
PASSWORD_MIN_LENGTH=8
PASSWORD_MAX_LENGTH=128
PASSWORD_REQUIRE_UPPERCASE=true
PASSWORD_REQUIRE_LOWERCASE=true
PASSWORD_REQUIRE_NUMBER=true
```
