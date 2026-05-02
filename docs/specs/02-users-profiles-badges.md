# 02 — Utilisateurs, Profils et Badges

> Spécification complète des profils utilisateurs, des paramètres, du système d'amis, de la présence et des badges.
>
> Dépendances : `00-architecture.md` (conventions), `01-authentication.md` (auth middleware).

---

## 1. Modèle Utilisateur Complet

### Table `users`

| Champ | Type Prisma | Description |
|---|---|---|
| `id` | `String` (snowflake) | Identifiant unique global |
| `email` | `String` UNIQUE | Adresse email |
| `username` | `String` | Nom d'utilisateur (2–32 caractères) |
| `discriminator` | `String(4)` | Code à 4 chiffres (`0001`–`9999`) |
| `password_hash` | `String` | Mot de passe haché (bcrypt) |
| `avatar` | `String?` | Chemin relatif du fichier avatar |
| `avatar_decoration` | `String?` | Décoration d'avatar (cadre) — pour usage futur |
| `banner` | `String?` | Chemin relatif du fichier bannière |
| `banner_color` | `String?` | Couleur de bannière hex (#FF5733) si pas de fichier |
| `bio` | `String?` | Biographie (max 190 caractères) |
| `status` | `Enum` | `online`, `idle`, `dnd`, `invisible`, `offline` |
| `custom_status_text` | `String?` | Texte du statut personnalisé (max 128 caractères) |
| `custom_status_emoji` | `String?` | Emoji du statut personnalisé (unicode ou `:nom:`) |
| `custom_status_expires_at` | `DateTime?` | Expiration automatique du statut personnalisé |
| `locale` | `String` | Code langue (`fr`, `en`) — défaut `fr` |
| `theme` | `Enum` | `dark` (seul disponible initialement) |
| `explicit_content_filter` | `Int` | `0`=désactivé, `1`=amis seulement, `2`=tous |
| `default_message_notifications` | `Int` | `0`=tous messages, `1`=mentions seulement |
| `allow_dms_from` | `Int` | `0`=personne, `1`=amis seulement, `2`=tout le monde |
| `admin_level` | `Int` | `0`=user, `1`=mod, `2`=admin, `3`=superadmin |
| `two_factor_enabled` | `Boolean` | 2FA TOTP activée |
| `two_factor_secret` | `String?` | Secret TOTP |
| `two_factor_backup_codes` | `String?` | JSON array de codes de secours hachés |
| `verified` | `Boolean` | Email vérifié |
| `email_verify_token` | `String?` | Token de vérification email |
| `password_reset_token` | `String?` | Token de reset mot de passe |
| `password_reset_expires` | `DateTime?` | Expiration du token de reset |
| `date_of_birth` | `DateTime` | Date de naissance |
| `flags` | `Int` | Bitfield de flags spéciaux (badges système via flags ou table dédiée) |
| `premium_type` | `Int` | `0`=aucun, `1`=OpenCord+ |
| `premium_since` | `DateTime?` | Date de début de l'abonnement premium |
| `premium_lost_at` | `DateTime?` | Date de dernière perte du premium (pour restauration GIF) |
| `avatar_animated` | `Boolean` @default(false) | `true` si une version GIF de l'avatar existe sur disque |
| `banner_animated` | `Boolean` @default(false) | `true` si une version GIF de la bannière existe sur disque |
| `avatar_updated_at` | `DateTime?` | Dernière modification de l'avatar |
| `banner_updated_at` | `DateTime?` | Dernière modification de la bannière |
| `created_at` | `DateTime` | Date de création du compte |
| `updated_at` | `DateTime` | Date de dernière modification |

---

## 2. Affichage du Profil Utilisateur

Le profil est un panneau latéral ou une modale affichée en cliquant sur un avatar.

### Composants du profil

```
┌─────────────────────────────────────┐
│  [Bannière — 600×240px ou couleur]  │
│                                     │
│  [Avatar 128px] Nom#0042            │
│  ● En ligne                         │
│                                     │
│  [Badge CEO] [Badge Staff] [Badge+] │
│                                     │
│  🎮 Joue à Minecraft                 │
│  (statut personnalisé)              │
│                                     │
│  À PROPOS DE MOI                    │
│  Biographie de l'utilisateur...     │
│                                     │
│  MEMBRE DEPUIS                      │
│  15 janv. 2024                      │
│                                     │
│  SERVEURS EN COMMUN (3)             │
│  [Icône] NomServeur1                │
│                                     │
│  AMIS EN COMMUN (2)                 │
│  [Avatar] Alice                     │
│                                     │
│  RÔLES SUR CE SERVEUR               │
│  [●] Modérateur  [●] Membre         │
└─────────────────────────────────────┘
```

### Règles d'affichage

- L'**avatar** est affiché en cercle (128px sur la fiche, 32px dans la liste des membres)
- Si pas d'avatar → générer un avatar par défaut basé sur le discriminant (couleur + initiale)
- La **bannière** est affichée uniquement si l'utilisateur a uploadé un fichier ou défini une couleur
- Les **badges** sont affichés en ligne horizontale, avec un tooltip au survol (nom + description)
- Le **statut personnalisé** est affiché sous le nom avec l'emoji associé
- **Serveurs en commun** et **amis en commun** ne sont affichés que si l'utilisateur est connecté et partage des espaces
- **Rôles** : affichés uniquement dans le contexte d'un serveur (pas dans les DM)

---

## 3. API Endpoints — Utilisateurs

### 3.1 Profil courant

**`GET /api/users/@me`**

Retourne le profil complet de l'utilisateur authentifié.

**Réponse 200 OK :**

```json
{
  "id": "812345678901234567",
  "username": "Alice",
  "discriminator": "0042",
  "email": "alice@example.com",
  "avatar": "/uploads/avatars/812345678901234567.webp",
  "banner": null,
  "banner_color": "#5865F2",
  "bio": "Développeuse passionnée.",
  "status": "online",
  "custom_status_text": "Café ☕",
  "custom_status_emoji": "☕",
  "locale": "fr",
  "theme": "dark",
  "admin_level": 0,
  "two_factor_enabled": true,
  "verified": true,
  "premium_type": 1,
  "premium_since": "2024-01-01T00:00:00.000Z",
  "flags": 0,
  "created_at": "2024-01-15T10:00:00.000Z"
}
```

---

**`PATCH /api/users/@me`**

Met à jour le profil de l'utilisateur courant.

**Corps de la requête (tous les champs sont optionnels) :**

```json
{
  "username": "AliceNew",
  "bio": "Nouvelle biographie.",
  "banner_color": "#FF5733",
  "locale": "en",
  "default_message_notifications": 1,
  "explicit_content_filter": 1,
  "allow_dms_from": 1
}
```

> Changer le `username` déclenche une nouvelle assignation de discriminant. Le mot de passe est requis pour changer l'email (endpoint séparé dans les paramètres de compte).

**Réponse 200 OK :** profil mis à jour (même format que `GET /api/users/@me`)

---

### 3.2 Profil d'un autre utilisateur

**`GET /api/users/:userId`**

Retourne le profil public d'un utilisateur.

**Réponse 200 OK :**

```json
{
  "id": "812345678901234568",
  "username": "Bob",
  "discriminator": "1337",
  "avatar": "/uploads/avatars/812345678901234568.webp",
  "banner": null,
  "banner_color": "#ED4245",
  "bio": "Gamer.",
  "status": "dnd",
  "custom_status_text": "Ne pas déranger",
  "custom_status_emoji": "🔴",
  "flags": 0,
  "premium_type": 0,
  "created_at": "2024-02-01T00:00:00.000Z",
  "mutual_guilds": [
    { "id": "900000000000000001", "name": "Mon Serveur", "icon": "..." }
  ],
  "mutual_friends": [
    { "id": "812345678901234567", "username": "Alice", "discriminator": "0042" }
  ]
}
```

> Les données sensibles (email, admin_level, etc.) ne sont jamais exposées dans ce endpoint.

---

### 3.3 Upload Avatar

**`PATCH /api/users/@me/avatar`**

**Content-Type :** `multipart/form-data`

**Champ :** `avatar` (fichier image — JPEG, PNG, GIF, WebP — max configurable via `PlatformSettings`)

**Logique :**
1. Valider le type MIME et la taille (limite lue depuis `PlatformSettings` : `upload.max_avatar_size` ou `upload.max_avatar_size_premium`)
2. Supprimer l'ancien avatar du disque (toutes variantes, y compris l'ancienne version animée)
3. Si le fichier est un **GIF** :
   a. Extraire la première frame et générer les variantes WebP statiques (128, 256, 512, 1024)
   b. Conserver le GIF original comme `{hash}_animated.gif`
   c. Mettre `avatar_animated = true`
4. Si le fichier est un **PNG/JPEG/WebP** :
   a. Générer les variantes WebP (128, 256, 512, 1024)
   b. Mettre `avatar_animated = false`
5. Mettre à jour `users.avatar`, `users.avatarHash`, `users.avatar_updated_at = now()`
6. L'URL retournée dépend du statut premium :
   - Si `user.premium = true` ET `avatar_animated = true` ET `PlatformSettings.premium.animated_avatar_enabled = true` → URL animée
   - Sinon → URL statique WebP
7. Émettre `USER_UPDATE` via Socket.IO

**Réponse 200 OK :**

```json
{
  "avatar": "/files/avatars/812345678901234567/{hash}_128.webp",
  "avatar_animated": true
}
```

**`DELETE /api/users/@me/avatar`** — Supprime l'avatar (toutes variantes, y compris animée). Retour à l'avatar par défaut. Met `avatar_animated = false`.

---

### 3.4 Upload Bannière

**`PATCH /api/users/@me/banner`**

**Content-Type :** `multipart/form-data`

**Champ :** `banner` (fichier image — JPEG, PNG, GIF, WebP)

**Logique identique à l'avatar** (voir 3.3), avec les différences :
- Redimensionné à 600×240 px (ratio 2.5:1)
- Stocké dans `uploads/banners/{userId}/`
- Champs associés : `banner_animated`, `banner_updated_at`
- Setting admin : `PlatformSettings.premium.animated_banner_enabled`

Si le fichier est un GIF :
- Version statique WebP générée (première frame, 600×240)
- Version animée conservée (`{hash}_animated.gif`)
- `banner_animated = true`
- URL servie = animée si premium, statique sinon

**`DELETE /api/users/@me/banner`** — Supprime la bannière (toutes variantes). Met `banner_animated = false`.

---

### 3.5 Suppression du compte

**`DELETE /api/users/@me`**

**Corps de la requête :**

```json
{
  "password": "MotDePass3!Secure"
}
```

**Logique :**
1. Vérifier le mot de passe
2. Vérifier que l'utilisateur n'est propriétaire d'aucun serveur (sinon exiger de transférer la propriété ou de supprimer les serveurs d'abord)
3. Anonymiser les données (pseudonymiser le compte plutôt que suppression physique pour préserver l'historique des messages)
4. Révoquer tous les refresh tokens

**Réponse 204 No Content**

---

## 4. Pages de Paramètres Utilisateur

La page des paramètres est accessible via `/settings` et suit la structure de Discord.

### 4.1 Mon compte (`/settings/account`)

- **Affichage :** aperçu du profil (avatar, nom#discrim, email masqué, téléphone masqué)
- **Actions disponibles :**
  - Modifier le nom d'utilisateur (nécessite le mot de passe)
  - Modifier l'email (nécessite le mot de passe + re-vérification)
  - Modifier le numéro de téléphone (optionnel, pour usage futur)
  - Changer le mot de passe
  - Activer/Désactiver la 2FA
  - Afficher le statut de vérification de l'email
- **Bouton "Supprimer mon compte"** : ouvre une modale de confirmation

---

### 4.2 Profil (`/settings/profile`)

- Modifier l'avatar (upload ou suppression)
- Modifier la bannière (upload, couleur ou suppression)
- Modifier la biographie (textarea, max configurable via `PlatformSettings` : `limits.max_bio_length` défaut 190, `limits.max_bio_length_premium` défaut 4000 si premium)
- Modifier le nom affiché (display name, distinct du username)
- Modifier le statut personnalisé (texte + emoji + durée)
- Aperçu du profil en temps réel

---

### 4.3 Contenu et Social (`/settings/privacy`)

- Filtre de contenu explicite : `off` / `amis seulement` / `tous`
- Permettre les DM de : `personne` / `amis seulement` / `tout le monde`
- Permettre les demandes d'amis de : `tout le monde` / `amis d'amis` / `serveurs en commun` / `personne`

---

### 4.4 Données et Confidentialité (`/settings/data`)

- **Demande de données :** génère un export JSON des données de l'utilisateur (non implémenté à MVP, bouton visible)
- **Suppression du compte :** identique à `DELETE /api/users/@me`

---

### 4.5 Appareils / Sessions (`/settings/sessions`)

- Liste des sessions actives : appareil (user-agent parsé), IP, date de création, date dernière utilisation
- Badge "Session actuelle" sur la session en cours
- Bouton "Déconnecter" par session (révoque le refresh token)
- Bouton "Déconnecter tous les autres appareils"

---

### 4.6 Connexions (`/settings/connections`)

Section réservée aux futurs providers OAuth (GitHub, Google, etc.). Afficher "Bientôt disponible" à ce stade.

---

### 4.7 Notifications (`/settings/notifications`)

- Activer/désactiver les notifications pour : messages, mentions, demandes d'amis, mises à jour système
- Toutes les notifications sont **in-app uniquement** (pas de push, pas d'email en dehors de la vérification)

---

### 4.8 Apparence (`/settings/appearance`)

- **Thème :** sélecteur (Dark uniquement pour l'instant, prévu : Light, AMOLED)
- **Langue :** sélecteur `fr` / `en` (appliqué immédiatement, persiste en base)
- **Taille de la police :** curseur 12–20px
- **Accessibilité :** réduire les animations (respecter `prefers-reduced-motion`)

---

### 4.9 Voix & Vidéo (`/settings/voice`)

⚠️ **DIFFÉRÉ — Ne pas implémenter tant que ce n'est pas explicitement demandé.**

La page existe dans la navigation mais affiche un message "Fonctionnalité à venir". Structure prévue :

- Sélection du périphérique d'entrée (microphone)
- Sélection du périphérique de sortie (casque)
- Test du microphone
- Suppression du bruit (toggle)
- Volume d'entrée/sortie
- Paramètres vidéo (caméra, qualité)

---

### 4.10 Raccourcis Clavier (`/settings/keybinds`)

Page statique affichant la liste des raccourcis disponibles. Traduits via i18n.

| Action | Raccourci |
|---|---|
| Naviguer entre les serveurs | `Ctrl + Alt + ↑/↓` |
| Naviguer entre les canaux | `Alt + ↑/↓` |
| Marquer comme lu | `Escape` |
| Recherche rapide | `Ctrl + K` |
| Mentionner un utilisateur | `@` dans le champ de message |
| Créer une nouvelle ligne | `Shift + Enter` |
| Envoyer un message | `Enter` |

---

## 5. Système d'Amis

### Modèle — Table `friends`

| Champ | Type | Description |
|---|---|---|
| `id` | `String` (snowflake) | Identifiant de la relation |
| `user_id` | `String` | L'utilisateur source |
| `target_id` | `String` | L'utilisateur cible |
| `type` | `Enum` | `friend`, `blocked`, `pending_incoming`, `pending_outgoing` |
| `created_at` | `DateTime` | Date de la relation |

> Les relations sont bidirectionnelles au niveau de la sémantique mais stockées comme une paire directionnelle. Lorsque Bob accepte la demande d'Alice, deux entrées existent : `(alice→bob, friend)` et `(bob→alice, friend)`.

### Types de relation

| Type | Description |
|---|---|
| `friend` | Amis confirmés |
| `blocked` | L'utilisateur source a bloqué la cible |
| `pending_incoming` | La cible a envoyé une demande à la source (vu par la source) |
| `pending_outgoing` | La source a envoyé une demande à la cible (vu par la source) |

---

### 5.1 Envoyer une demande d'ami

**`POST /api/users/@me/relationships`**

**Corps de la requête :**

```json
{
  "username": "Bob",
  "discriminator": "1337"
}
```

**Logique :**
1. Chercher l'utilisateur par `(username, discriminator)`
2. Vérifier que l'utilisateur cible n'a pas bloqué la source
3. Vérifier que la relation n'existe pas déjà
4. Créer `(source→target, pending_outgoing)` et `(target→source, pending_incoming)`
5. Émettre un événement Socket.IO `relationship:request` à la cible

**Réponse 201 Created :**

```json
{
  "id": "rel_id",
  "type": "pending_outgoing",
  "user": {
    "id": "...", "username": "Bob", "discriminator": "1337", "avatar": "..."
  }
}
```

---

### 5.2 Accepter une demande d'ami

**`PUT /api/users/@me/relationships/:userId`**

**Corps de la requête :**

```json
{
  "type": 1
}
```

> `type: 1` = accepter. Conventionné pour correspondre à une future API plus riche.

**Logique :** Mettre les deux entrées `pending_*` en `friend`. Émettre `relationship:accept` aux deux parties.

**Réponse 200 OK :** relation mise à jour

---

### 5.3 Refuser / Annuler / Supprimer

**`DELETE /api/users/@me/relationships/:userId`**

- Si la relation est `pending_incoming` → **refus** de la demande
- Si la relation est `pending_outgoing` → **annulation** de la demande
- Si la relation est `friend` → **suppression** de l'amitié
- Émet `relationship:remove` aux parties concernées

**Réponse 204 No Content**

---

### 5.4 Bloquer un utilisateur

**`POST /api/users/@me/relationships`** avec :

```json
{
  "user_id": "812345678901234568",
  "type": "block"
}
```

**Logique :**
- Supprimer toute relation existante (amitié ou demande en cours)
- Créer `(source→target, blocked)`
- L'utilisateur bloqué ne peut plus envoyer de DM ni de demande d'ami

---

### 5.5 Liste des relations

**`GET /api/users/@me/relationships`**

**Query params optionnels :**
- `?type=friend` — filtre par type

**Réponse 200 OK :**

```json
{
  "relationships": [
    {
      "id": "rel_id",
      "type": "friend",
      "user": {
        "id": "...",
        "username": "Bob",
        "discriminator": "1337",
        "avatar": "...",
        "status": "online",
        "custom_status_text": "GG",
        "custom_status_emoji": "🎮"
      },
      "created_at": "2024-01-20T12:00:00.000Z"
    }
  ]
}
```

---

## 6. Présence et Statut

### Types de statut

| Valeur | Couleur | Description |
|---|---|---|
| `online` | Vert `#23A55A` | Actif et connecté |
| `idle` | Jaune/Orange `#F0B132` | Inactif (AFK) |
| `dnd` | Rouge `#F23F43` | Ne pas déranger |
| `invisible` | Gris `#80848E` | Apparaît hors-ligne aux autres |
| `offline` | Gris `#80848E` | Déconnecté (automatique) |

> `invisible` et `offline` ont la même apparence visuelle pour les autres utilisateurs. Seul l'utilisateur sait qu'il est en `invisible`.

---

### 6.1 Modifier le statut

**`PATCH /api/users/@me/status`**

**Corps de la requête :**

```json
{
  "status": "dnd",
  "custom_status_text": "En train de coder",
  "custom_status_emoji": "💻",
  "custom_status_expires_at": "2024-01-15T18:00:00.000Z"
}
```

**Réponse 200 OK :** utilisateur mis à jour

**Logique :**
1. Mettre à jour en base
2. Émettre `presence:update` via Socket.IO à tous les serveurs communs et amis

---

### 6.2 Diffusion de présence (Socket.IO)

Lors de la connexion WebSocket d'un utilisateur :
1. Son statut est mis à `online` (sauf si `invisible`)
2. Un événement `presence:update` est émis à tous ses amis et membres de serveurs communs

Lors de la déconnexion :
1. Son statut est mis à `offline`
2. Un événement `presence:update` est émis

Mise à jour de présence en temps réel :
- Événement : `presence:update`
- Payload : `{ userId, status, custom_status_text, custom_status_emoji }`
- Envoyé dans les rooms `guild:<guildId>` de tous les serveurs de l'utilisateur

---

## 7. Système de Badges

### Modèle — Table `badges`

| Champ | Type | Description |
|---|---|---|
| `id` | `String` (snowflake) | Identifiant unique du badge |
| `name` | `String` UNIQUE | Nom technique du badge (ex: `OPENCORD_CEO`) |
| `label` | `String` | Nom affiché (traduit via i18n) |
| `description` | `String` | Description affichée dans le tooltip |
| `icon` | `String` | Chemin de l'icône ou emoji unicode |
| `type` | `Enum` | `system` (intégré), `admin` (assigné manuellement), `auto` (règle automatique) |
| `color` | `String?` | Couleur hex optionnelle pour l'affichage |
| `priority` | `Int` | Ordre d'affichage (plus petit = affiché en premier) |
| `created_at` | `DateTime` | Date de création |

### Modèle — Table `user_badges`

| Champ | Type | Description |
|---|---|---|
| `user_id` | `String` | FK → `users.id` |
| `badge_id` | `String` | FK → `badges.id` |
| `assigned_at` | `DateTime` | Date d'assignation |
| `assigned_by` | `String?` | FK → `users.id` (null si auto-assigné) |

### Badges prédéfinis (seed)

| `name` | `label` | `icon` | `priority` | `type` |
|---|---|---|---|---|
| `OPENCORD_CEO` | CEO d'OpenCord | `👑` | 1 | `system` |
| `OPENCORD_STAFF` | Staff OpenCord | `🛡️` | 2 | `system` |
| `OPENCORD_SECURITY` | Équipe Sécurité | `🔒` | 3 | `system` |
| `OPENCORD_PLUS_SUBSCRIBER` | Abonné OpenCord+ | `⭐` | 10 | `auto` |

Ces badges sont insérés par le script de seed (`npm run db:seed`).

---

### 7.1 Auto-assignation

Le **service de badges** (`packages/server/src/services/badge.service.ts`) expose des fonctions :

- `assignBadge(userId, badgeName, assignedBy?)` — assigne un badge à un utilisateur
- `revokeBadge(userId, badgeName)` — révoque un badge
- `getUserBadges(userId)` — retourne les badges d'un utilisateur

**Règles d'auto-assignation :**

| Badge | Déclencheur | Révocation |
|---|---|---|
| `OPENCORD_PLUS_SUBSCRIBER` | Webhook Stripe `invoice.paid` avec abonnement actif | Webhook Stripe `customer.subscription.deleted` ou `invoice.payment_failed` |

---

### 7.2 Assignation manuelle (Admin)

**`POST /api/admin/badges/:badgeId/assign/:userId`**

Nécessite `admin_level >= 2`.

**Réponse 201 Created :**

```json
{
  "user_id": "...",
  "badge_id": "...",
  "assigned_at": "2024-01-15T10:00:00.000Z",
  "assigned_by": "admin_user_id"
}
```

**`DELETE /api/admin/badges/:badgeId/revoke/:userId`**

Nécessite `admin_level >= 2`. Révoque un badge assigné manuellement.

---

### 7.3 CRUD Badges (Admin)

**`GET /api/badges`** — Liste tous les badges (public, pour l'affichage profil)

**Réponse 200 OK :**

```json
{
  "badges": [
    {
      "id": "...",
      "name": "OPENCORD_CEO",
      "label": "CEO d'OpenCord",
      "description": "Le fondateur d'OpenCord.",
      "icon": "👑",
      "color": "#FFD700",
      "priority": 1
    }
  ]
}
```

---

**`POST /api/admin/badges`** — Créer un nouveau badge

Nécessite `admin_level >= 2`.

**Corps de la requête :**

```json
{
  "name": "EARLY_ADOPTER",
  "label": "Adopteur précoce",
  "description": "A rejoint OpenCord dans ses premiers mois.",
  "icon": "🌱",
  "color": "#57F287",
  "priority": 20,
  "type": "admin"
}
```

**Réponse 201 Created :** badge créé

---

**`PATCH /api/admin/badges/:badgeId`** — Modifier un badge

Nécessite `admin_level >= 2`. Tous les champs optionnels.

**`DELETE /api/admin/badges/:badgeId`** — Supprimer un badge

Nécessite `admin_level >= 3` (superadmin). Révoque automatiquement le badge à tous les utilisateurs.

---

### 7.4 Affichage des badges

- Les badges sont affichés en **ligne horizontale** dans la fiche profil
- **Ordre** : trié par `priority` croissant (CEO en premier)
- **Tooltip** au survol : affiche `label` + `description` du badge
- **Taille** : 20px × 20px dans le profil, 16px × 16px dans les listes de membres
- L'icône peut être un emoji unicode ou un fichier image (chemin relatif dans `icon`)

---

## 8. Notifications In-App

### Modèle — Table `notifications`

| Champ | Type | Description |
|---|---|---|
| `id` | `String` (snowflake) | Identifiant |
| `user_id` | `String` | Destinataire |
| `type` | `Enum` | `friend_request`, `message_mention`, `guild_invite`, `system` |
| `title` | `String` | Titre (clé i18n) |
| `body` | `String?` | Corps de la notification |
| `data` | `String?` | JSON payload contextuel (ex: `{ guildId, channelId, messageId }`) |
| `read` | `Boolean` | Lu ou non |
| `created_at` | `DateTime` | Date |

### API Notifications

**`GET /api/users/@me/notifications`**

```json
{
  "notifications": [
    {
      "id": "...",
      "type": "friend_request",
      "title": "notifications.friend_request.title",
      "body": "Bob vous a envoyé une demande d'ami.",
      "data": { "userId": "..." },
      "read": false,
      "created_at": "2024-01-15T10:00:00.000Z"
    }
  ],
  "unread_count": 3
}
```

**`POST /api/users/@me/notifications/:id/read`** — Marquer comme lue

**`POST /api/users/@me/notifications/read-all`** — Tout marquer comme lu

**Diffusion temps réel :**

Lorsqu'une notification est créée, émettre `notification:new` dans la room `user:<userId>` du destinataire.

---

## 9. Notes Utilisateur

Les notes utilisateur permettent à chaque utilisateur d'écrire des notes privées sur d'autres utilisateurs. Ces notes sont visibles uniquement par leur auteur.

### Modèle — Table `user_notes`

| Champ | Type | Description |
|---|---|---|
| `user_id` | `String` | FK → `users.id` — auteur de la note |
| `target_id` | `String` | FK → `users.id` — utilisateur cible |
| `content` | `String` | Contenu de la note (max 256 caractères) |
| `updated_at` | `DateTime` | Date de dernière modification |

Contrainte : `@@id([user_id, target_id])` — une seule note par paire auteur/cible.

### API

**`PUT /api/users/@me/notes/:targetId`**

**Corps de la requête :**
```json
{
  "note": "Rencontré à la convention TypeScript 2024. Développeur backend."
}
```

**Réponse 200 OK :**
```json
{
  "target_id": "2222222222222222222",
  "note": "Rencontré à la convention TypeScript 2024. Développeur backend.",
  "updated_at": "2025-01-15T10:00:00.000Z"
}
```

Envoyer un `note` vide (`""`) supprime la note.

**`GET /api/users/@me/notes/:targetId`**

**Réponse 200 OK :** objet note (ou `{ "note": null }` si aucune note)

### Interface

- Champ "Note" visible dans le popout de profil et la page de profil, sous la section badges
- Textarea inline, placeholder "Cliquez pour ajouter une note"
- Sauvegarde automatique au blur (debounce 500ms)
- Compteur de caractères `0/256`

---

## 10. Activités et Statut de Jeu

### 10.1 Modèle de données

#### Table `user_activities`

| Champ | Type | Description |
|---|---|---|
| `id` | `String` (snowflake) | Identifiant |
| `user_id` | `String` | FK → `users.id` |
| `type` | `Int` | Type d'activité (voir tableau ci-dessous) |
| `name` | `String` | Nom de l'activité (ex: "Visual Studio Code", "Spotify") |
| `state` | `String?` | État secondaire (ex: "Éditant main.ts") |
| `details` | `String?` | Détails (ex: "Workspace: opencord") |
| `url` | `String?` | URL (pour le type Streaming) |
| `timestamps_start` | `DateTime?` | Début de l'activité |
| `timestamps_end` | `DateTime?` | Fin prévue |
| `assets_large_image` | `String?` | URL ou clé de la grande image |
| `assets_large_text` | `String?` | Tooltip de la grande image |
| `assets_small_image` | `String?` | URL ou clé de la petite image |
| `assets_small_text` | `String?` | Tooltip de la petite image |
| `created_at` | `DateTime` | Date de création |

Les activités sont stockées **en mémoire** (comme la présence) et non en base de données. La table ci-dessus sert de référence structurelle mais le stockage effectif est dans le `presenceStore` (Map en mémoire).

### Types d'activité

| Valeur | Constante | Affichage |
|---|---|---|
| `0` | `PLAYING` | "Joue à **{name}**" |
| `1` | `STREAMING` | "Diffuse en direct **{name}**" |
| `2` | `LISTENING` | "Écoute **{name}**" |
| `3` | `WATCHING` | "Regarde **{name}**" |
| `4` | `CUSTOM` | Affiche `state` avec emoji optionnel (identique au custom status) |
| `5` | `COMPETING` | "En compétition sur **{name}**" |

### 10.2 Activité personnalisée (Custom Activity)

L'activité de type `CUSTOM` (4) est le statut personnalisé déjà spécifié dans la section 6. Elle reste gérée par `PATCH /api/users/@me/status`.

### 10.3 Activités automatiques (détection de jeu)

OpenCord n'a pas d'accès aux processus système (application web). La détection de jeu est gérée par un **mécanisme déclaratif** :

**Approche :** L'utilisateur configure manuellement ses activités ou un bot/plugin les met à jour via l'API.

### 10.4 API — Mise à jour des activités

**Événement Socket.IO client → serveur : `ACTIVITY_UPDATE`**

```json
{
  "activities": [
    {
      "type": 0,
      "name": "Minecraft",
      "timestamps": { "start": 1705312800000 }
    }
  ]
}
```

L'utilisateur peut avoir **jusqu'à 3 activités simultanées** (ex: jouer + écouter de la musique).

**Logique serveur :**
1. Mettre à jour les activités dans le `presenceStore`
2. Diffuser `PRESENCE_UPDATE` aux amis et serveurs communs avec le champ `activities`

### 10.5 API — Jeux enregistrés (bibliothèque)

#### Table `user_game_library`

| Champ | Type | Description |
|---|---|---|
| `user_id` | `String` | FK → `users.id` |
| `name` | `String` | Nom du jeu/application |
| `icon_url` | `String?` | URL de l'icône |
| `last_played_at` | `DateTime?` | Dernière utilisation |
| `total_play_time_minutes` | `Int` | Temps de jeu total cumulé |
| `created_at` | `DateTime` | Date d'ajout |

**`GET /api/users/@me/games`** — Liste les jeux enregistrés

**`POST /api/users/@me/games`** — Ajouter un jeu manuellement

```json
{
  "name": "Minecraft",
  "icon_url": "https://example.com/minecraft.png"
}
```

**`DELETE /api/users/@me/games/:gameId`** — Retirer un jeu

### 10.6 Affichage des activités

**Dans la liste des membres (sidebar droite) :**
- Sous le nom d'utilisateur : texte de l'activité en `--text-muted`, tronqué à 1 ligne
- Ex: "Joue à Minecraft" en vert, "Écoute Spotify" en vert

**Dans le popout de profil :**
- Section "Activité" avec icône large (si définie), nom, détails, état
- Barre de progression si `timestamps.end` est défini (ex: musique)
- Durée écoulée si seulement `timestamps.start` est défini (ex: "depuis 2h 15min")

**Dans la liste d'amis :**
- Activité affichée sous le statut dans la carte d'ami

### 10.7 Événements Socket.IO

Le champ `activities` est inclus dans `PRESENCE_UPDATE` :

```json
{
  "user_id": "1111111111111111111",
  "status": "online",
  "custom_status": { "text": "...", "emoji": "..." },
  "activities": [
    {
      "type": 0,
      "name": "Minecraft",
      "state": "Survival Mode",
      "details": "Exploring caves",
      "timestamps": { "start": 1705312800000 },
      "assets": {
        "large_image": "https://...",
        "large_text": "Minecraft",
        "small_image": "https://...",
        "small_text": "Survival"
      }
    }
  ]
}
```

### 10.8 Paramètres utilisateur — Activité

Section dans **Paramètres → Activité** :

- Toggle "Afficher l'activité en cours comme message de statut"
- Liste des jeux enregistrés avec temps de jeu total
- Bouton "Ajouter un jeu" (nom + icône optionnelle)
- Pour chaque jeu : toggle "Afficher dans le statut quand actif" + bouton supprimer

---

## 11. Streamer Mode

Le mode Streamer masque les informations sensibles de l'interface pour les utilisateurs qui diffusent leur écran en live. Il peut être activé manuellement ou automatiquement.

### 11.1 Paramètres — Table `user_settings` (champs additionnels)

| Champ | Type | Défaut | Description |
|---|---|---|---|
| `streamer_mode_enabled` | `Boolean` | `false` | Mode streamer activé manuellement |
| `streamer_mode_auto_detect` | `Boolean` | `true` | Activer automatiquement quand une app de streaming est détectée (non applicable en web, prévu pour desktop) |
| `streamer_mode_hide_links` | `Boolean` | `true` | Masquer les liens d'invitation |
| `streamer_mode_hide_email` | `Boolean` | `true` | Masquer l'email dans les paramètres |
| `streamer_mode_hide_notes` | `Boolean` | `true` | Masquer les notes utilisateur |
| `streamer_mode_hide_notifications` | `Boolean` | `true` | Désactiver les notifications desktop |
| `streamer_mode_hide_personal_info` | `Boolean` | `true` | Masquer discriminator, ID utilisateur, informations de compte |
| `streamer_mode_disable_sounds` | `Boolean` | `false` | Couper les sons de notification |

### 11.2 API

**`PATCH /api/users/@me/settings`**

```json
{
  "streamer_mode_enabled": true,
  "streamer_mode_hide_links": true,
  "streamer_mode_hide_email": true
}
```

Le mode est stocké côté serveur pour la synchronisation multi-appareils. L'activation peut aussi être purement côté client (toggle rapide sans appel API) avec `localStorage` comme fallback.

### 11.3 Comportement quand le mode est actif

| Élément | Comportement normal | Comportement Streamer Mode |
|---|---|---|
| Liens d'invitation | `opencord.app/invite/aBcDeF` | `[lien d'invitation masqué]` (texte gris, non cliquable) |
| Email (paramètres) | `user@example.com` | `u***@e***.com` |
| Notes utilisateur | Texte visible | Champ masqué avec "[Mode Streamer actif]" |
| Notifications desktop | Popup avec contenu | Désactivées |
| Sons de notification | Joués | Muets (si configuré) |
| Nom du serveur dans la taskbar | "OpenCord - Mon Serveur" | "OpenCord" |
| Liens dans les messages | URL visible | Domaine affiché, chemin masqué : `example.com/***` |

### 11.4 Indicateur visuel

Quand le mode Streamer est actif :
- Bandeau violet en haut de l'application : "Mode Streamer activé — les informations sensibles sont masquées" avec bouton "Désactiver" à droite
- Hauteur : 32px, `background: #593695`, texte blanc, `font-size: 13px`
- Le bandeau pousse le contenu vers le bas (pas d'overlay)

### 11.5 Interface — Paramètres → Mode Streamer

- Toggle principal "Activer le Mode Streamer"
- Toggle "Détection automatique" (avec texte explicatif : "Active automatiquement le mode quand OBS, Streamlabs ou XSplit est détecté — fonctionnalité réservée à l'application desktop")
- Section "Éléments masqués" :
  - Toggle "Masquer les liens d'invitation"
  - Toggle "Masquer l'adresse email"
  - Toggle "Masquer les notes personnelles"
  - Toggle "Désactiver les notifications de bureau"
  - Toggle "Masquer les informations personnelles"
  - Toggle "Couper les sons de notification"
- Aperçu en temps réel : les toggles prennent effet immédiatement dans l'interface

---

## Références croisées

- `00-architecture.md` — Stack, conventions, stockage fichiers
- `01-authentication.md` — Auth middleware, sessions, 2FA
- `03-servers-channels.md` — Membres de serveur, contexte des rôles dans le profil
- `13-gateway-realtime.md` — PRESENCE_UPDATE, presenceStore
