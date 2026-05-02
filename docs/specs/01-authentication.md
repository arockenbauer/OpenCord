# 01 — Authentification

> Spécification complète du système d'authentification d'OpenCord : inscription, connexion, JWT, 2FA TOTP, sessions, et sécurité.
>
> Dépendances : voir `00-architecture.md` pour la stack technique et les conventions.

---

## 1. Modèles de Données

### Table `users` (champs liés à l'auth)

| Champ | Type | Description |
|---|---|---|
| `id` | `String` (snowflake) | Identifiant unique |
| `email` | `String` UNIQUE | Adresse email |
| `username` | `String` | Nom d'utilisateur (sans discriminant) |
| `discriminator` | `String(4)` | Code à 4 chiffres (`0001`–`9999`) |
| `password_hash` | `String` | Mot de passe haché (bcrypt, rounds=12) |
| `two_factor_enabled` | `Boolean` | 2FA TOTP activée |
| `two_factor_secret` | `String?` | Secret TOTP chiffré |
| `two_factor_backup_codes` | `String?` | JSON array de codes de secours hachés |
| `verified` | `Boolean` | Email vérifié |
| `email_verify_token` | `String?` | Token de vérification email |
| `password_reset_token` | `String?` | Token de reset mot de passe |
| `password_reset_expires` | `DateTime?` | Expiration du token de reset |
| `date_of_birth` | `DateTime` | Date de naissance (vérification âge) |
| `created_at` | `DateTime` | Date de création |
| `updated_at` | `DateTime` | Date de mise à jour |

### Table `refresh_tokens`

| Champ | Type | Description |
|---|---|---|
| `id` | `String` (UUID) | Identifiant du token |
| `user_id` | `String` | FK → `users.id` |
| `token_hash` | `String` | Hash SHA-256 du refresh token |
| `device_info` | `String?` | User-Agent de l'appareil |
| `ip_address` | `String?` | IP de création |
| `last_used_at` | `DateTime` | Dernière utilisation |
| `expires_at` | `DateTime` | Expiration (7 jours) |
| `created_at` | `DateTime` | Date de création |
| `is_revoked` | `Boolean` | Token révoqué (logout) |

### Table `sessions` (alias de refresh_tokens pour affichage)

Les sessions actives correspondent aux `refresh_tokens` non révoqués et non expirés. La page "Appareils" dans les paramètres utilisateur liste ces entrées.

---

## 2. Système Username + Discriminant

À l'instar de l'ancien système Discord (avant la migration vers les usernames uniques), OpenCord utilise la combinaison `username#discriminator`.

### Règles

- `username` : 2–32 caractères, alphanumériques + underscores + points + tirets, pas d'espaces en début/fin
- `discriminator` : 4 chiffres, assigné aléatoirement à la création du compte parmi les disponibles pour ce username
- La paire `(username, discriminator)` est **unique en base**
- Si tous les discriminants (0001–9999) sont pris pour un username donné, l'inscription est refusée avec `USERNAME_TAKEN`
- Affichage : `NomUtilisateur#0042`

---

## 3. Structure JWT

### Access Token

```json
{
  "userId": "812345678901234567",
  "type": "access",
  "iat": 1700000000,
  "exp": 1700000900
}
```

- Durée de vie : **15 minutes**
- Signé avec `JWT_SECRET`
- Transmis dans le header : `Authorization: Bearer <token>`

### Refresh Token

```json
{
  "tokenId": "uuid-v4",
  "userId": "812345678901234567",
  "type": "refresh",
  "iat": 1700000000,
  "exp": 1700604800
}
```

- Durée de vie : **7 jours**
- Signé avec `JWT_REFRESH_SECRET`
- Seul le hash SHA-256 du token est stocké en base (table `refresh_tokens`)
- Envoyé en body JSON (pas en cookie httpOnly — architecture API first)

### Partial Token (2FA)

```json
{
  "userId": "812345678901234567",
  "type": "partial",
  "twoFactorRequired": true,
  "iat": 1700000000,
  "exp": 1700000300
}
```

- Durée de vie : **5 minutes**
- Utilisé uniquement quand la 2FA est activée, en remplacement temporaire de l'access token
- N'est pas stocké en base
- Ne donne accès à aucune ressource sauf `POST /api/auth/2fa/login`

---

## 4. Endpoints d'Authentification

### 4.1 Inscription

**`POST /api/auth/register`**

Crée un nouveau compte utilisateur.

**Corps de la requête :**

```json
{
  "email": "alice@example.com",
  "username": "Alice",
  "password": "MotDePass3!Secure",
  "date_of_birth": "1998-06-15"
}
```

**Validation (Zod) :**

- `email` : email valide, max 254 caractères
- `username` : 2–32 caractères, regex `/^[a-zA-Z0-9_.\\-]+$/`
- `password` : min 8 caractères, au moins 1 majuscule, 1 chiffre
- `date_of_birth` : date ISO valide, utilisateur doit avoir ≥ 13 ans

**Réponse 201 Created :**

```json
{
  "user": {
    "id": "812345678901234567",
    "username": "Alice",
    "discriminator": "0042",
    "email": "alice@example.com",
    "verified": false,
    "created_at": "2024-01-15T10:00:00.000Z"
  },
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Erreurs possibles :**

| Code | Status | Description |
|---|---|---|
| `EMAIL_TAKEN` | 409 | Email déjà utilisé |
| `USERNAME_TAKEN` | 409 | Tous les discriminants pris pour ce username |
| `VALIDATION_ERROR` | 422 | Données invalides |
| `UNDERAGE` | 400 | Utilisateur de moins de 13 ans |

**Logique interne :**

1. Valider les données avec Zod
2. Vérifier que l'email n'existe pas déjà
3. Générer un discriminant disponible pour le username
4. Hacher le mot de passe avec bcrypt (rounds=12)
5. Créer l'utilisateur en base avec `verified=false`
6. Générer un token de vérification email et l'enregistrer
7. Générer access_token + refresh_token
8. Stocker le hash du refresh_token en base (`refresh_tokens`)
9. Retourner les tokens + profil utilisateur minimal

---

### 4.2 Connexion

**`POST /api/auth/login`**

**Corps de la requête :**

```json
{
  "email": "alice@example.com",
  "password": "MotDePass3!Secure"
}
```

**Réponse 200 OK (sans 2FA) :**

```json
{
  "user": {
    "id": "812345678901234567",
    "username": "Alice",
    "discriminator": "0042",
    "avatar": null,
    "email": "alice@example.com"
  },
  "access_token": "eyJ...",
  "refresh_token": "eyJ..."
}
```

**Réponse 200 OK (avec 2FA activée) :**

```json
{
  "two_factor_required": true,
  "partial_token": "eyJ..."
}
```

Le client doit alors rediriger vers l'écran de saisie du code 2FA et appeler `POST /api/auth/2fa/login`.

**Erreurs possibles :**

| Code | Status | Description |
|---|---|---|
| `INVALID_CREDENTIALS` | 401 | Email ou mot de passe incorrect |
| `RATE_LIMITED` | 429 | Trop de tentatives |

**Logique interne :**

1. Chercher l'utilisateur par email
2. Comparer le mot de passe avec bcrypt
3. Si `two_factor_enabled = true` → générer un `partial_token` et retourner `two_factor_required: true`
4. Sinon → générer access_token + refresh_token, enregistrer le refresh en base avec device_info et IP

---

### 4.3 Rafraîchissement du Token

**`POST /api/auth/refresh`**

**Corps de la requête :**

```json
{
  "refresh_token": "eyJ..."
}
```

**Réponse 200 OK :**

```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ..."
}
```

**Logique interne :**

1. Vérifier la signature JWT avec `JWT_REFRESH_SECRET`
2. Extraire le `tokenId` du payload
3. Chercher en base par `tokenId`, vérifier `is_revoked=false` et `expires_at > now`
4. Invalider l'ancien refresh token (mettre `is_revoked=true`)
5. Générer une nouvelle paire access + refresh
6. Stocker le nouveau refresh en base
7. Mettre à jour `last_used_at` sur l'ancienne entrée avant révocation

**Erreurs possibles :**

| Code | Status | Description |
|---|---|---|
| `INVALID_TOKEN` | 401 | Token invalide ou expiré |
| `TOKEN_REVOKED` | 401 | Token déjà révoqué |

---

### 4.4 Déconnexion

**`POST /api/auth/logout`**

Nécessite un access token valide.

**Corps de la requête :**

```json
{
  "refresh_token": "eyJ..."
}
```

**Réponse 204 No Content**

**Logique interne :**

1. Extraire le `tokenId` du refresh token
2. Mettre `is_revoked=true` en base pour cette entrée
3. L'access token expire naturellement (15 min) — pas de blacklist côté serveur pour les access tokens

---

### 4.5 Déconnexion de tous les appareils

**`POST /api/auth/logout/all`**

Révoque tous les refresh tokens de l'utilisateur courant.

**Réponse 204 No Content**

---

## 5. Authentification à Deux Facteurs (2FA TOTP)

Implémentée avec `otplib` (compatible Google Authenticator, Authy, etc.).

### 5.1 Activation de la 2FA

**`POST /api/auth/2fa/enable`**

Nécessite un access token valide et le mot de passe confirmé.

**Corps de la requête :**

```json
{
  "password": "MotDePass3!Secure"
}
```

**Réponse 200 OK :**

```json
{
  "secret": "JBSWY3DPEHPK3PXP",
  "otpauth_uri": "otpauth://totp/OpenCord:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=OpenCord",
  "qr_code": "data:image/png;base64,iVBORw...",
  "backup_codes": [
    "a3f9-12bc",
    "9d2e-45fa",
    "...8 autres codes..."
  ]
}
```

> La 2FA n'est **pas encore activée** à ce stade. Elle le devient seulement après vérification via `POST /api/auth/2fa/verify`.

**Logique interne :**

1. Vérifier le mot de passe
2. Générer un secret TOTP aléatoire avec `otplib`
3. Construire l'URI `otpauth://`
4. Générer le QR code en base64 avec la bibliothèque `qrcode`
5. Générer 10 codes de secours aléatoires (format `xxxx-xxxx`)
6. Hacher chaque code de secours avec bcrypt
7. Stocker le secret et les codes hachés en base (champ temporaire jusqu'à confirmation)
8. Retourner secret, URI, QR code, et codes en clair (une seule fois)

---

### 5.2 Confirmation de l'activation

**`POST /api/auth/2fa/verify`**

L'utilisateur saisit le code de son application pour confirmer l'activation.

**Corps de la requête :**

```json
{
  "code": "123456"
}
```

**Réponse 200 OK :**

```json
{
  "two_factor_enabled": true,
  "message": "two_factor_activated"
}
```

**Logique interne :**

1. Récupérer le secret temporaire en base
2. Vérifier le code TOTP avec `otplib.authenticator.verify`
3. Si valide → définir `two_factor_enabled=true`, persister le secret et les backup codes
4. Invalider tous les refresh tokens existants (forcer re-login)

---

### 5.3 Connexion avec 2FA

**`POST /api/auth/2fa/login`**

**Corps de la requête :**

```json
{
  "partial_token": "eyJ...",
  "code": "123456"
}
```

Le champ `code` peut contenir soit un code TOTP (6 chiffres), soit un code de secours (`xxxx-xxxx`).

**Réponse 200 OK :**

```json
{
  "user": { "..." },
  "access_token": "eyJ...",
  "refresh_token": "eyJ..."
}
```

**Logique interne :**

1. Vérifier et décoder le `partial_token`
2. Récupérer l'utilisateur et son secret TOTP
3. Si le code ressemble à un TOTP (6 chiffres) → vérifier avec otplib
4. Si le code ressemble à un code de secours → comparer avec les hashes en base, marquer le code comme utilisé
5. Si valide → générer access_token + refresh_token complets

---

### 5.4 Désactivation de la 2FA

**`POST /api/auth/2fa/disable`**

**Corps de la requête :**

```json
{
  "password": "MotDePass3!Secure",
  "code": "123456"
}
```

**Réponse 200 OK :**

```json
{
  "two_factor_enabled": false
}
```

**Logique interne :**

1. Vérifier le mot de passe
2. Vérifier le code TOTP ou code de secours
3. Mettre `two_factor_enabled=false`, effacer `two_factor_secret` et `two_factor_backup_codes`

---

### 5.5 Régénération des codes de secours

**`POST /api/auth/2fa/backup-codes`**

**Corps de la requête :**

```json
{
  "password": "MotDePass3!Secure",
  "code": "123456"
}
```

**Réponse 200 OK :**

```json
{
  "backup_codes": [
    "x7k2-9mne",
    "...9 autres codes..."
  ]
}
```

Invalide les anciens codes et génère 10 nouveaux.

---

## 6. Gestion du Mot de Passe

### 6.1 Changement de mot de passe (authentifié)

**`POST /api/auth/password/change`**

**Corps de la requête :**

```json
{
  "old_password": "AncienMotDePasse",
  "new_password": "NouveauMotDePasse1!"
}
```

**Réponse 200 OK :**

```json
{
  "message": "password_changed"
}
```

**Logique :** Vérifier l'ancien mot de passe → hacher le nouveau → révoquer tous les refresh tokens sauf le courant.

---

### 6.2 Réinitialisation du mot de passe (non authentifié)

**Étape 1 — Demande de reset :**

**`POST /api/auth/password/reset-request`**

**Corps de la requête :**

```json
{
  "email": "alice@example.com"
}
```

**Réponse 200 OK (toujours, même si l'email n'existe pas — sécurité) :**

```json
{
  "message": "reset_email_sent"
}
```

**Logique :** Générer un token UUID v4, le stocker haché en base avec une expiration de 1 heure, simuler l'envoi email (dans un contexte sans SMTP, loguer le lien en console en développement, ou implémenter un système de notification in-app si l'utilisateur est connecté).

---

**Étape 2 — Réinitialisation :**

**`POST /api/auth/password/reset`**

**Corps de la requête :**

```json
{
  "token": "abc123uuid",
  "new_password": "NouveauMotDePasse1!"
}
```

**Réponse 200 OK :**

```json
{
  "message": "password_reset_success"
}
```

**Erreurs :**

| Code | Status | Description |
|---|---|---|
| `INVALID_TOKEN` | 400 | Token invalide ou expiré |

---

## 7. Vérification d'Email

**`POST /api/auth/verify-email`**

**Corps de la requête :**

```json
{
  "token": "abc123uuid"
}
```

**Réponse 200 OK :**

```json
{
  "message": "email_verified"
}
```

**Logique :** Chercher l'utilisateur avec le token correspondant → `verified=true` → effacer le token.

> Sans serveur SMTP, le token de vérification peut être affiché en console en dev. En production, il convient d'intégrer une solution d'envoi d'email ou de considérer la vérification comme optionnelle (l'admin peut forcer `verified=true` depuis le panneau admin).

---

## 8. Middleware d'Authentification

Fichier : `packages/server/src/middleware/auth.middleware.ts`

### `requireAuth`

Middleware Express qui :

1. Extrait le header `Authorization: Bearer <token>`
2. Vérifie la signature JWT avec `JWT_SECRET`
3. Vérifie que `type === 'access'`
4. Attache l'objet `{ userId, ... }` à `req.user`
5. En cas d'échec → `AppError(401, 'UNAUTHORIZED', '...')`

### `requireAdminLevel(level: number)`

Middleware factory qui vérifie que `req.user.admin_level >= level`. Retourne 403 si insuffisant.

### `optionalAuth`

Identique à `requireAuth` mais ne bloque pas si pas de token (utile pour les routes publiques avec comportement différent si connecté).

---

## 9. Suivi des Sessions

La page "Appareils" dans les paramètres utilisateur (`/settings/sessions`) liste toutes les sessions actives.

**`GET /api/users/@me/sessions`**

**Réponse 200 OK :**

```json
{
  "sessions": [
    {
      "id": "uuid",
      "device_info": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)...",
      "ip_address": "192.168.1.42",
      "last_used_at": "2024-01-15T14:32:00.000Z",
      "created_at": "2024-01-10T09:00:00.000Z",
      "is_current": true
    }
  ]
}
```

**`DELETE /api/users/@me/sessions/:sessionId`**

Révoque un refresh token spécifique (déconnecte cet appareil).

**Réponse 204 No Content**

---

## 10. Sécurité

### Hachage des mots de passe

- Algorithme : **bcrypt**, coût `12`
- Jamais de mot de passe en clair en base ou dans les logs

### Rate Limiting sur les routes auth

| Route | Limite | Fenêtre | Action sur dépassement |
|---|---|---|---|
| `POST /api/auth/login` | 5 requêtes | 1 minute | 429 + `Retry-After` |
| `POST /api/auth/register` | 3 requêtes | 1 heure | 429 + `Retry-After` |
| `POST /api/auth/2fa/login` | 5 requêtes | 5 minutes | 429 + `Retry-After` |
| `POST /api/auth/password/reset-request` | 3 requêtes | 1 heure | 429 + `Retry-After` |

### Protection contre les attaques courantes

- **Timing attacks** : utiliser `bcrypt.compare` (comparaison à temps constant) même si l'utilisateur n'existe pas (comparer avec un hash factice)
- **Enumération d'emails** : les routes de reset et de vérification retournent toujours 200, qu'un compte existe ou non
- **Token rotation** : à chaque refresh, l'ancien token est révoqué et un nouveau est émis
- **Logs** : ne jamais logger de tokens, mots de passe ou secrets

### Headers de sécurité (Helmet)

Appliqués globalement sur l'application Express :
- `Content-Security-Policy`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Strict-Transport-Security` (en production)

---

## Références croisées

- `00-architecture.md` — Stack, AppError, rate limiting global
- `02-users-profiles-badges.md` — Modèle complet User, sessions dans les paramètres
