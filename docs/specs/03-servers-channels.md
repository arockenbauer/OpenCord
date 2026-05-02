# 03 — Serveurs et Canaux

> Spécification complète des serveurs (guilds), de leurs paramètres, des canaux, des fils de discussion et des forums.
>
> Dépendances : `00-architecture.md` (conventions), `01-authentication.md` (auth), `05-roles-permissions.md` (système de permissions).

---

## 1. Modèle Guild (Serveur)

### Table `guilds`

| Champ | Type Prisma | Description |
|---|---|---|
| `id` | `String` (snowflake) | Identifiant unique du serveur |
| `name` | `String` | Nom du serveur (2–100 caractères) |
| `icon` | `String?` | Chemin de l'icône (128×128 WebP) |
| `banner` | `String?` | Chemin de la bannière de serveur |
| `splash` | `String?` | Image de fond de l'écran d'invitation |
| `description` | `String?` | Description du serveur (max 120 caractères) |
| `owner_id` | `String` | FK → `users.id` — propriétaire |
| `verification_level` | `Int` | `0`=none, `1`=low, `2`=medium, `3`=high, `4`=very_high |
| `default_message_notifications` | `Int` | `0`=tous, `1`=mentions seulement |
| `explicit_content_filter` | `Int` | `0`=off, `1`=members without roles, `2`=all members |
| `system_channel_id` | `String?` | FK → `channels.id` — canal des messages système |
| `system_channel_flags` | `Int` | Bitfield : quels messages système afficher |
| `afk_channel_id` | `String?` | FK → `channels.id` — canal AFK vocal |
| `afk_timeout` | `Int` | Délai AFK en secondes (60, 300, 900, 1800, 3600) |
| `preferred_locale` | `String` | Langue préférée du serveur (`fr`, `en`) |
| `features` | `String` | JSON array des fonctionnalités activées |
| `vanity_url_code` | `String?` UNIQUE | Code d'URL personnalisée (ex: `discord`) |
| `premium_tier` | `Int` | `0`–`3` — niveau de boost du serveur |
| `premium_subscription_count` | `Int` | Nombre de boosts actifs |
| `max_members` | `Int` | Limite de membres (défaut: 500000) |
| `created_at` | `DateTime` | Date de création |
| `updated_at` | `DateTime` | Date de mise à jour |

### Flags `system_channel_flags` (bitfield)

| Valeur | Bit | Description |
|---|---|---|
| `SUPPRESS_JOIN_NOTIFICATIONS` | `1 << 0` | Ne pas afficher les messages d'accueil |
| `SUPPRESS_PREMIUM_SUBSCRIPTIONS` | `1 << 1` | Ne pas afficher les messages de boost |
| `SUPPRESS_GUILD_REMINDER_NOTIFICATIONS` | `1 << 2` | Ne pas afficher les conseils de configuration |
| `SUPPRESS_JOIN_NOTIFICATION_REPLIES` | `1 << 3` | Ne pas afficher le bouton "Répondre avec un sticker" |

### Niveaux de boost (`premium_tier`)

| Tier | Boosts requis | Avantages |
|---|---|---|
| `0` | 0 | Aucun avantage |
| `1` | 2 | Émojis animés, qualité audio améliorée |
| `2` | 7 | Bannière de serveur, icône de serveur animée |
| `3` | 14 | URL vanité, qualité maximale |

---

## 2. API — Serveurs

### 2.1 Créer un serveur

**`POST /api/guilds`**

**Corps de la requête :**

```json
{
  "name": "Mon Super Serveur",
  "icon": null
}
```

> L'icône peut être uploadée séparément via `PATCH /api/guilds/:id/icon`.

**Logique :**
1. Créer le serveur avec `owner_id = req.user.userId`
2. Créer automatiquement :
   - Une catégorie "TEXTE" et un canal `#général` de type TEXT
   - Une catégorie "VOCAL" et un canal `Général` de type VOICE
   - Le rôle `@everyone` avec les permissions de base
3. Ajouter le créateur comme membre avec le rôle `@everyone`
4. Mettre à jour `system_channel_id` vers `#général`

**Réponse 201 Created :**

```json
{
  "id": "900000000000000001",
  "name": "Mon Super Serveur",
  "icon": null,
  "owner_id": "812345678901234567",
  "verification_level": 0,
  "default_message_notifications": 0,
  "system_channel_id": "channel_id_general",
  "premium_tier": 0,
  "premium_subscription_count": 0,
  "created_at": "2024-01-15T10:00:00.000Z"
}
```

---

### 2.2 Obtenir un serveur

**`GET /api/guilds/:guildId`**

L'utilisateur doit être membre du serveur.

**Réponse 200 OK :**

```json
{
  "id": "900000000000000001",
  "name": "Mon Super Serveur",
  "icon": "/uploads/guild-icons/900000000000000001.webp",
  "banner": null,
  "description": "Un serveur communautaire sympa.",
  "owner_id": "812345678901234567",
  "verification_level": 1,
  "system_channel_id": "channel_id",
  "premium_tier": 1,
  "premium_subscription_count": 3,
  "vanity_url_code": null,
  "channels": [ "..." ],
  "roles": [ "..." ],
  "emojis": [ "..." ],
  "member_count": 42,
  "features": []
}
```

---

### 2.3 Modifier un serveur

**`PATCH /api/guilds/:guildId`**

Nécessite la permission `MANAGE_GUILD`.

**Corps de la requête (tous optionnels) :**

```json
{
  "name": "Nouveau Nom",
  "description": "Nouvelle description.",
  "verification_level": 2,
  "default_message_notifications": 1,
  "explicit_content_filter": 1,
  "system_channel_id": "channel_id",
  "system_channel_flags": 3,
  "afk_channel_id": "voice_channel_id",
  "afk_timeout": 300,
  "preferred_locale": "fr",
  "vanity_url_code": "monserveur"
}
```

**Réponse 200 OK :** serveur mis à jour

---

### 2.4 Upload icône / bannière

**`PATCH /api/guilds/:guildId/icon`**

`multipart/form-data`, champ `icon`. Redimensionné à 128×128 WebP.

**`PATCH /api/guilds/:guildId/banner`**

`multipart/form-data`, champ `banner`. Redimensionné à 960×540 WebP. Disponible seulement à partir du tier 2.

**`PATCH /api/guilds/:guildId/splash`**

`multipart/form-data`, champ `splash`. Redimensionné à 960×540 WebP.

---

### 2.5 Supprimer un serveur

**`DELETE /api/guilds/:guildId`**

Uniquement le propriétaire (`owner_id`). Demande une confirmation avec le nom du serveur.

**Corps de la requête :**

```json
{
  "confirmation": "Mon Super Serveur"
}
```

**Logique :** Suppression en cascade de tous les canaux, messages, rôles, membres, emojis, webhooks.

**Réponse 204 No Content**

---

### 2.6 Serveurs de l'utilisateur

**`GET /api/users/@me/guilds`**

**Réponse 200 OK :**

```json
{
  "guilds": [
    {
      "id": "900000000000000001",
      "name": "Mon Super Serveur",
      "icon": "...",
      "owner": true,
      "permissions": "2147483647",
      "premium_tier": 1
    }
  ]
}
```

---

## 3. Pages de Paramètres du Serveur

Accessibles via l'icône ⚙️ dans la sidebar du serveur. Nécessite `MANAGE_GUILD` ou admin du serveur.

### 3.1 Profil du serveur

- **Nom** du serveur (input, 2–100 caractères)
- **Icône** : upload, suppression, ou sélection parmi des avatars par défaut
- **Bannière** : upload, sélection de couleur parmi des options prédéfinies (nécessite tier 2)
- **Description** : textarea (max 120 caractères)
- **Tags / Particularités** : sélection de tags décrivant le serveur (Jeux, Musique, Éducation…) — max 5 tags

### 3.2 Tag du serveur

Sélecteur de tags thématiques parmi une liste prédéfinie. Les tags aident à catégoriser le serveur dans une future fonctionnalité de découverte.

### 3.3 Participation

- **Messages système :**
  - Toggle : "Envoyer un message quand quelqu'un rejoint"
  - Toggle : "Proposer un sticker de réponse lors des messages de bienvenue"
  - Toggle : "Envoyer un message quand quelqu'un booste"
  - Toggle : "Afficher les conseils de configuration"
  - Sélecteur : canal des messages système
- **Notifications par défaut :** Tous les messages / Mentions seulement
- **Canal inactif :** sélecteur de canal vocal + délai AFK (60s, 5min, 15min, 30min, 1h)
- **Widget serveur :** toggle + sélecteur de canal d'invitation par défaut

### 3.4 Avantages de boost

Affichage de l'état actuel du boost du serveur :
- Nombre de boosts actifs / requis pour le prochain tier
- Liste des avantages débloqués par tier
- Liste des membres ayant booosté (avec leur avatar et durée)

---

## 4. Membres du Serveur

### Modèle — Table `guild_members`

| Champ | Type | Description |
|---|---|---|
| `guild_id` | `String` | FK → `guilds.id` |
| `user_id` | `String` | FK → `users.id` |
| `nickname` | `String?` | Pseudo sur ce serveur (max 32 caractères) |
| `joined_at` | `DateTime` | Date d'adhésion |
| `premium_since` | `DateTime?` | Date depuis laquelle il booste |
| `deaf` | `Boolean` | Sourd (vocal) — DIFFÉRÉ |
| `mute` | `Boolean` | Muet (vocal) — DIFFÉRÉ |
| `pending` | `Boolean` | En attente de vérification (membership screening) |
| `communication_disabled_until` | `DateTime?` | Timeout jusqu'à cette date |

> La relation N-N entre membres et rôles est gérée par la table `role_members`.

---

### 4.1 Liste des membres

**`GET /api/guilds/:guildId/members`**

**Query params :**
- `?limit=100` (max 1000)
- `?after=userId` (pagination curseur)
- `?query=alice` (recherche par username/nickname)

**Réponse 200 OK :**

```json
{
  "members": [
    {
      "user": {
        "id": "...", "username": "Alice", "discriminator": "0042",
        "avatar": "...", "status": "online"
      },
      "nickname": "Ali",
      "roles": ["role_id_1", "role_id_2"],
      "joined_at": "2024-01-15T10:00:00.000Z",
      "premium_since": null
    }
  ]
}
```

---

### 4.2 Obtenir un membre

**`GET /api/guilds/:guildId/members/:userId`**

**Réponse 200 OK :** objet membre (format identique à la liste)

---

### 4.3 Modifier un membre

**`PATCH /api/guilds/:guildId/members/:userId`**

Nécessite `MANAGE_NICKNAMES` pour modifier le pseudo, `MANAGE_ROLES` pour modifier les rôles, `MODERATE_MEMBERS` pour le timeout.

**Corps de la requête :**

```json
{
  "nickname": "NouveauPseudo",
  "roles": ["role_id_1"],
  "communication_disabled_until": "2024-01-15T12:00:00.000Z"
}
```

**Réponse 200 OK :** membre mis à jour

---

### 4.4 Expulser un membre (Kick)

**`DELETE /api/guilds/:guildId/members/:userId`**

Nécessite la permission `KICK_MEMBERS`. Ne peut pas expulser quelqu'un avec un rôle de niveau supérieur.

**Réponse 204 No Content**

---

### 4.5 Rejoindre / Quitter un serveur

**`PUT /api/guilds/:guildId/members/@me`**

Rejoindre via une invitation (le code d'invitation est validé avant). Voir le système d'invitations.

**`DELETE /api/guilds/:guildId/members/@me`**

Quitter le serveur. Le propriétaire ne peut pas quitter (doit transférer d'abord).

**Réponse 204 No Content**

---

## 5. Bans

### Modèle — Table `bans`

| Champ | Type | Description |
|---|---|---|
| `guild_id` | `String` | FK → `guilds.id` |
| `user_id` | `String` | FK → `users.id` |
| `reason` | `String?` | Raison du bannissement |
| `banned_by` | `String` | FK → `users.id` — modérateur |
| `created_at` | `DateTime` | Date du bannissement |

**`GET /api/guilds/:guildId/bans`** — Liste des bannis (nécessite `BAN_MEMBERS`)

**`GET /api/guilds/:guildId/bans/:userId`** — Détail d'un ban

**`PUT /api/guilds/:guildId/bans/:userId`** — Bannir un utilisateur (nécessite `BAN_MEMBERS`)

```json
{
  "reason": "Spam",
  "delete_message_days": 7
}
```

**`DELETE /api/guilds/:guildId/bans/:userId`** — Débannir (nécessite `BAN_MEMBERS`)

---

## 6. Invitations

### Modèle — Table `invites`

| Champ | Type | Description |
|---|---|---|
| `code` | `String` UNIQUE | Code d'invitation (7 caractères alphanumériques) |
| `guild_id` | `String` | FK → `guilds.id` |
| `channel_id` | `String` | FK → `channels.id` — canal de destination |
| `inviter_id` | `String` | FK → `users.id` |
| `max_uses` | `Int?` | Utilisations max (null = illimitées) |
| `uses` | `Int` | Nombre d'utilisations actuelles |
| `max_age` | `Int?` | Durée de vie en secondes (null = permanente) |
| `temporary` | `Boolean` | Membre temporaire (expulsé si aucun rôle assigné) |
| `created_at` | `DateTime` | Date de création |
| `expires_at` | `DateTime?` | Date d'expiration calculée |

**`POST /api/guilds/:guildId/channels/:channelId/invites`** — Créer une invitation

```json
{
  "max_age": 86400,
  "max_uses": 10,
  "temporary": false
}
```

**Réponse 201 Created :**

```json
{
  "code": "aBcDe12",
  "guild": { "id": "...", "name": "...", "icon": "..." },
  "channel": { "id": "...", "name": "..." },
  "inviter": { "id": "...", "username": "...", "discriminator": "..." },
  "uses": 0,
  "max_uses": 10,
  "expires_at": "2024-01-16T10:00:00.000Z"
}
```

**`GET /api/invites/:code`** — Résoudre une invitation (preview avant de rejoindre)

**`POST /api/invites/:code`** — Utiliser une invitation (rejoindre le serveur)

**`GET /api/guilds/:guildId/invites`** — Lister les invitations (nécessite `MANAGE_GUILD`)

**`DELETE /api/invites/:code`** — Supprimer une invitation

---

## 7. Modèle Canal

### Table `channels`

| Champ | Type | Description |
|---|---|---|
| `id` | `String` (snowflake) | Identifiant unique |
| `guild_id` | `String?` | FK → `guilds.id` (null pour DM) |
| `name` | `String` | Nom du canal (1–100 caractères, kebab-case pour texte) |
| `type` | `Int` | Type de canal (voir tableau ci-dessous) |
| `position` | `Int` | Position dans la liste (triée par `position` croissant) |
| `parent_id` | `String?` | FK → `channels.id` — catégorie parente |
| `topic` | `String?` | Sujet du canal (max 1024 caractères) |
| `nsfw` | `Boolean` | Canal sensible (accès restreint) |
| `slowmode_delay` | `Int` | Délai de slowmode en secondes (0 = désactivé, max 21600) |
| `last_message_id` | `String?` | FK → `messages.id` — dernier message |
| `permission_overwrites` | `String` | JSON array des overrides de permissions |
| `bitrate` | `Int?` | Qualité audio vocal en bps (8000–384000) |
| `user_limit` | `Int?` | Limite utilisateurs vocal (0 = illimité) |
| `rate_limit_per_user` | `Int` | Alias de `slowmode_delay` |
| `default_auto_archive_duration` | `Int?` | Durée d'auto-archivage des fils (60, 1440, 4320, 10080) |
| `default_thread_slowmode` | `Int?` | Slowmode par défaut pour les nouveaux fils |
| `default_sort_order` | `Int?` | Tri des posts forum (`0`=latest_activity, `1`=creation_date) |
| `default_forum_layout` | `Int?` | Affichage forum (`0`=not_set, `1`=list, `2`=gallery) |
| `available_tags` | `String?` | JSON array des tags disponibles pour ce canal forum |
| `created_at` | `DateTime` | Date de création |

### Types de canaux

| Valeur | Constante | Description |
|---|---|---|
| `0` | `TEXT` | Canal texte standard |
| `1` | `DM` | Message direct (privé) |
| `2` | `VOICE` | Canal vocal ⚠️ DIFFÉRÉ |
| `3` | `GROUP_DM` | Groupe DM |
| `4` | `CATEGORY` | Catégorie (groupe de canaux) |
| `5` | `ANNOUNCEMENT` | Canal d'annonces (crosspostable) |
| `10` | `ANNOUNCEMENT_THREAD` | Fil dans un canal d'annonces |
| `11` | `PUBLIC_THREAD` | Fil public dans un canal texte |
| `12` | `PRIVATE_THREAD` | Fil privé dans un canal texte |
| `13` | `FORUM` | Canal forum (posts avec titre) |
| `14` | `STAGE` | Canal de scène ⚠️ DIFFÉRÉ |

### Permission Overwrites (structure JSON)

Chaque overwrite est un objet dans le tableau :

```json
[
  {
    "id": "role_id_or_user_id",
    "type": 0,
    "allow": "1024",
    "deny": "2048"
  }
]
```

`type: 0` = rôle, `type: 1` = membre. `allow` et `deny` sont des chaînes représentant des bitfields de permissions (voir `05-roles-permissions.md`).

---

## 8. Types de Canaux en Détail

### 8.1 Canal Texte (type=0)

Canal de messagerie standard. Supporte :
- Messages, réactions, épingles
- Slowmode
- NSFW toggle
- Sujet du canal affiché en haut
- Fils de discussion enfants

---

### 8.2 Canal Vocal (type=2)

⚠️ **DIFFÉRÉ — Ne pas implémenter tant que ce n'est pas explicitement demandé.**

Structure prévue :
- Bitrate configurable (8–384 kbps selon le tier du serveur)
- Limite d'utilisateurs (0–99, 0 = illimitée)
- Les membres connectés sont visibles dans la liste des membres
- Partage d'écran et vidéo (DIFFÉRÉ)
- Connexion via WebRTC (DIFFÉRÉ)
- Le canal vocal peut avoir un chat texte associé

---

### 8.3 Canal d'Annonces (type=5)

Identique au canal texte avec une fonctionnalité supplémentaire : **crossposter** un message vers des serveurs qui ont suivi ce canal.

- `POST /api/channels/:id/messages/:msgId/crosspost` — Publie un message dans les canaux abonnés
- La liste des serveurs suiveurs est gérée par la relation `channel_followers`
- Un serveur peut suivre un canal d'annonces : `PUT /api/channels/:id/followers` avec `{ webhook_channel_id }`

---

### 8.4 Canal Forum (type=13)

Un canal forum contient des **posts** (qui sont des fils de discussion enrichis). Chaque post a un titre, des tags, et un contenu initial.

**Caractéristiques :**
- **Tags** : liste de tags configurée par les admins du serveur, assignables aux posts
- **Tri** : par activité récente ou par date de création
- **Affichage** : liste ou grille (gallery)
- **Post épinglé** : les modérateurs peuvent épingler un post en haut du forum
- Chaque post est techniquement un fil de discussion (type `FORUM_THREAD`)

**Créer un post forum :**

`POST /api/channels/:forumChannelId/threads`

```json
{
  "name": "Titre du post",
  "message": {
    "content": "Contenu initial du post."
  },
  "applied_tags": ["tag_id_1"],
  "auto_archive_duration": 10080
}
```

---

### 8.5 Canal Scène (type=14)

⚠️ **DIFFÉRÉ — Ne pas implémenter tant que ce n'est pas explicitement demandé.**

Structure prévue :
- Un "speaker" diffuse sa voix à tous les participants (auditeurs)
- Les auditeurs peuvent lever la main pour parler
- Sujet de la scène (topic)
- Modération des speakers

---

### 8.6 Catégorie (type=4)

Conteneur logique pour regrouper des canaux. N'est pas un canal au sens strict (pas de messages).

- `position` global dans la liste des canaux
- Les canaux enfants ont `parent_id = category.id`
- Les overrides de permissions sur une catégorie sont hérités par les enfants (sync)

---

## 9. API — Canaux

### 9.1 Créer un canal

**`POST /api/guilds/:guildId/channels`**

Nécessite `MANAGE_CHANNELS`.

**Corps de la requête :**

```json
{
  "name": "général",
  "type": 0,
  "parent_id": "category_id",
  "topic": "Canal de discussion générale",
  "nsfw": false,
  "slowmode_delay": 0,
  "position": 0,
  "permission_overwrites": []
}
```

**Réponse 201 Created :** objet canal complet

**Événement Socket.IO émis :** `channel:create` → room `guild:<guildId>`

---

### 9.2 Liste des canaux d'un serveur

**`GET /api/guilds/:guildId/channels`**

**Réponse 200 OK :**

```json
{
  "channels": [
    {
      "id": "cat_id",
      "type": 4,
      "name": "TEXTE",
      "position": 0,
      "parent_id": null,
      "permission_overwrites": []
    },
    {
      "id": "channel_id",
      "type": 0,
      "name": "général",
      "position": 0,
      "parent_id": "cat_id",
      "topic": "Canal de discussion générale",
      "nsfw": false,
      "slowmode_delay": 0,
      "last_message_id": "msg_id"
    }
  ]
}
```

---

### 9.3 Obtenir un canal

**`GET /api/channels/:channelId`**

L'utilisateur doit avoir accès au canal (membre du serveur + permissions de lecture).

**Réponse 200 OK :** objet canal complet

---

### 9.4 Modifier un canal

**`PATCH /api/channels/:channelId`**

Nécessite `MANAGE_CHANNELS`.

**Corps de la requête (tous optionnels) :**

```json
{
  "name": "nouveau-nom",
  "topic": "Nouveau sujet",
  "nsfw": true,
  "slowmode_delay": 5,
  "parent_id": "new_category_id",
  "permission_overwrites": [
    { "id": "role_id", "type": 0, "allow": "1024", "deny": "0" }
  ],
  "default_auto_archive_duration": 1440
}
```

**Réponse 200 OK :** canal mis à jour

**Événement Socket.IO émis :** `channel:update` → room `guild:<guildId>`

---

### 9.5 Supprimer un canal

**`DELETE /api/channels/:channelId`**

Nécessite `MANAGE_CHANNELS`. Suppression en cascade des messages, fils, épingles.

**Réponse 204 No Content**

**Événement Socket.IO émis :** `channel:delete` → room `guild:<guildId>`

---

### 9.6 Réordonner les canaux

**`PATCH /api/guilds/:guildId/channels`** (bulk update positions)

**Corps de la requête :**

```json
[
  { "id": "channel_id_1", "position": 0, "parent_id": "cat_id" },
  { "id": "channel_id_2", "position": 1, "parent_id": "cat_id" }
]
```

**Réponse 204 No Content**

---

## 10. Threads (Fils de Discussion)

### Modèle — Table `threads`

| Champ | Type | Description |
|---|---|---|
| `id` | `String` (snowflake) | = l'ID du canal thread créé |
| `guild_id` | `String` | FK → `guilds.id` |
| `parent_id` | `String` | FK → `channels.id` — canal parent (texte ou forum) |
| `owner_id` | `String` | FK → `users.id` — créateur |
| `name` | `String` | Titre du fil (1–100 caractères) |
| `type` | `Int` | `10`=annonce, `11`=public, `12`=privé |
| `archived` | `Boolean` | Fil archivé (lecture seule) |
| `auto_archive_duration` | `Int` | Durée avant archivage auto (60, 1440, 4320, 10080 minutes) |
| `archive_timestamp` | `DateTime?` | Date d'archivage |
| `locked` | `Boolean` | Fil verrouillé (seul un mod peut écrire) |
| `invitable` | `Boolean` | (Fils privés) d'autres peuvent inviter des membres |
| `message_count` | `Int` | Nombre de messages (approximatif > 50) |
| `member_count` | `Int` | Nombre de membres suivant le fil |
| `total_message_sent` | `Int` | Nombre total de messages envoyés (ne diminue pas) |
| `created_at` | `DateTime` | Date de création |

### Modèle — Table `thread_members`

| Champ | Type | Description |
|---|---|---|
| `thread_id` | `String` | FK → `threads.id` |
| `user_id` | `String` | FK → `users.id` |
| `join_timestamp` | `DateTime` | Date d'adhésion au fil |
| `flags` | `Int` | Préférences de notification pour ce fil |

---

### 10.1 Créer un fil depuis un message

**`POST /api/channels/:channelId/messages/:messageId/threads`**

Nécessite `CREATE_PUBLIC_THREADS`.

**Corps de la requête :**

```json
{
  "name": "Discussion sur ce sujet",
  "auto_archive_duration": 1440
}
```

**Réponse 201 Created :** objet thread (= objet canal de type 11)

---

### 10.2 Créer un fil autonome

**`POST /api/channels/:channelId/threads`**

Pour créer un fil sans message de départ (ou un post forum).

**Corps de la requête :**

```json
{
  "name": "Nouveau fil",
  "type": 11,
  "auto_archive_duration": 10080,
  "message": {
    "content": "Message initial du fil."
  }
}
```

**Réponse 201 Created :** objet thread

---

### 10.3 Modifier un fil

**`PATCH /api/channels/:threadId`**

Mêmes règles que `PATCH /api/channels/:channelId` mais avec des champs spécifiques aux threads :

```json
{
  "name": "Nouveau titre",
  "archived": false,
  "locked": true,
  "auto_archive_duration": 4320,
  "applied_tags": ["tag_id_1"]
}
```

---

### 10.4 Liste des fils d'un canal

**`GET /api/channels/:channelId/threads/active`** — Fils actifs (non archivés)

**`GET /api/channels/:channelId/threads/archived/public`** — Fils archivés publics

**`GET /api/channels/:channelId/threads/archived/private`** — Fils archivés privés (MANAGE_THREADS)

**Réponse 200 OK :**

```json
{
  "threads": [ "...objets thread..." ],
  "members": [ "...objets thread_member pour l'utilisateur courant..." ],
  "has_more": false
}
```

---

### 10.5 Rejoindre / Quitter un fil

**`PUT /api/channels/:threadId/thread-members/@me`** — Rejoindre le fil

**`DELETE /api/channels/:threadId/thread-members/@me`** — Quitter le fil

**`PUT /api/channels/:threadId/thread-members/:userId`** — Ajouter un membre (créateur ou MANAGE_THREADS)

**`DELETE /api/channels/:threadId/thread-members/:userId`** — Retirer un membre

**`GET /api/channels/:threadId/thread-members`** — Lister les membres

---

### 10.6 Auto-archivage

Un job de fond (lancé toutes les 5 minutes) vérifie les fils dont le dernier message est plus ancien que `auto_archive_duration`. Si c'est le cas, le fil passe à `archived=true`. Le fil reste lisible mais ne peut plus recevoir de messages.

Un fil archivé peut être désarchivé manuellement (nécessite `MANAGE_THREADS` ou être le créateur).

---

## 11. Forum Posts

Les posts de forum sont des threads créés dans un canal de type `FORUM` (type=13). En plus des champs de thread, ils ont :

### Modèle — Table `forum_tags`

| Champ | Type | Description |
|---|---|---|
| `id` | `String` (snowflake) | Identifiant du tag |
| `channel_id` | `String` | FK → `channels.id` (canal forum) |
| `name` | `String` | Nom du tag (max 20 caractères) |
| `emoji` | `String?` | Emoji unicode ou `:nom:` |
| `moderated` | `Boolean` | Si `true`, seuls les mods peuvent l'appliquer |
| `created_at` | `DateTime` | Date de création |

### Modèle — Table `forum_post_tags`

| Champ | Type | Description |
|---|---|---|
| `thread_id` | `String` | FK → `threads.id` |
| `tag_id` | `String` | FK → `forum_tags.id` |

---

**Créer un tag de forum :**

**`POST /api/channels/:forumChannelId/tags`**

Nécessite `MANAGE_CHANNELS`.

```json
{
  "name": "Question",
  "emoji": "❓",
  "moderated": false
}
```

**Réponse 201 Created :** objet tag

**`PATCH /api/channels/:forumChannelId/tags/:tagId`** — Modifier

**`DELETE /api/channels/:forumChannelId/tags/:tagId`** — Supprimer

### 11.2 Champs additionnels du canal forum

Champs supplémentaires sur le modèle `channels` pour les canaux de type `FORUM` (13) :

| Champ | Type | Description |
|---|---|---|
| `require_tag` | `Boolean` | Si `true`, chaque post doit avoir au moins un tag |
| `default_reaction_emoji` | `String?` | Emoji par défaut pour la réaction automatique sur les posts (unicode ou `<:nom:id>`) |
| `post_guidelines` | `String?` | Message affiché dans le placeholder du formulaire de création de post (max 500 caractères, Markdown) |

### 11.3 Système de résolution (Solved/Unsolved)

Champ ajouté à la table `threads` pour les forum threads :

| Champ | Type | Description |
|---|---|---|
| `solved` | `Boolean` | Post marqué comme résolu |
| `solved_by` | `String?` | FK → `users.id` — utilisateur ayant marqué comme résolu |
| `solved_at` | `DateTime?` | Date de résolution |

**`PATCH /api/channels/:threadId`** (champs additionnels pour les forum threads) :

```json
{
  "solved": true
}
```

**Permissions requises :** le créateur du post peut marquer son propre post comme résolu. Les utilisateurs avec `MANAGE_THREADS` peuvent marquer n'importe quel post.

Un post résolu affiche un badge vert "✓ Résolu" à côté du titre dans la liste du forum.

### 11.4 Interface — Vue Forum

#### Layout du canal forum

La vue d'un canal forum ne ressemble pas à un canal texte classique. Elle affiche une **grille ou liste de posts** :

**Barre d'outils (haut) :**
- Nom du canal + description (topic)
- Bouton "Nouveau Post" (primaire)
- Dropdown tri : "Activité récente" (`latest_activity`) / "Date de création" (`creation_date`)
- Dropdown filtre par tag (multi-select, affiche les tags définis pour ce canal)
- Toggle vue : icône liste / icône grille (gallery)

**Vue liste (`default_forum_layout = 1`) :**
- Chaque post est une carte horizontale :
  - Avatar du créateur + username
  - Titre du post (bold, lien cliquable)
  - Extrait du premier message (2 lignes max, `--text-muted`)
  - Tags appliqués (badges colorés)
  - Badge "✓ Résolu" si applicable (vert)
  - Métadonnées à droite : nombre de réponses (icône bulle), dernier message "il y a 2h"
  - Séparateur `--border-subtle`

**Vue grille/gallery (`default_forum_layout = 2`) :**
- Cartes dans un CSS Grid (min 250px par colonne, `gap: 16px`)
- Chaque carte :
  - Image d'aperçu si le premier message contient une image (ratio 16:9, `object-fit: cover`)
  - Titre (bold, 2 lignes max ellipsis)
  - Avatar + username du créateur
  - Tags (max 3 visibles, +N si plus)
  - Badge "✓ Résolu" si applicable
  - Nombre de réponses + date du dernier message

**Modale de création de post :**
1. Titre (input, obligatoire, max 100 caractères)
2. Message du post (textarea riche, même éditeur que le chat, obligatoire)
3. Tags (multi-select dropdown, obligatoire si `require_tag = true`)
4. Si `post_guidelines` est défini : affiché comme placeholder ou bandeau info au-dessus de l'éditeur
5. Bouton "Publier" (disabled tant que les champs obligatoires ne sont pas remplis)

**Vue d'un post ouvert :**
- Header : titre du post, tags, badge résolu, créateur, date
- Message initial affiché comme premier message du thread
- Réponses en dessous (identique à un thread classique)
- Bouton "Marquer comme résolu" dans le header (pour le créateur ou les mods)
- Bouton retour "← {nom du forum}" pour revenir à la vue liste/grille

---

## 12. Canaux DM et Groupe DM

### Modèle — Table `dm_channels`

| Champ | Type | Description |
|---|---|---|
| `id` | `String` (snowflake) | Identifiant |
| `type` | `Int` | `1`=DM, `3`=GROUP_DM |
| `name` | `String?` | Nom du groupe DM |
| `icon` | `String?` | Icône du groupe DM |
| `owner_id` | `String?` | Créateur du groupe DM |
| `last_message_id` | `String?` | Dernier message |
| `created_at` | `DateTime` | Date de création |

### Modèle — Table `dm_members`

| Champ | Type | Description |
|---|---|---|
| `channel_id` | `String` | FK → `dm_channels.id` |
| `user_id` | `String` | FK → `users.id` |

**`GET /api/users/@me/channels`** — Liste les DM de l'utilisateur

**`POST /api/users/@me/channels`** — Ouvrir un DM

```json
{
  "recipient_id": "812345678901234568"
}
```

**Réponse 200 OK :** canal DM (existant ou créé)

---

## 13. Server Onboarding

Le système d'onboarding permet aux propriétaires de serveur de configurer un flux d'accueil pour les nouveaux membres : acceptation de règles, choix de rôles, et recommandation de canaux.

### 13.1 Modèle de données

#### Table `guild_onboarding`

| Champ | Type | Description |
|---|---|---|
| `guild_id` | `String` @id | FK → `guilds.id` |
| `enabled` | `Boolean` | Onboarding activé |
| `mode` | `Int` | `0`=ONBOARDING_DEFAULT (affiché aux nouveaux), `1`=ONBOARDING_ADVANCED (personnalisation complète) |
| `default_channel_ids` | `String` | JSON array des IDs de canaux visibles par défaut |
| `updated_at` | `DateTime` | Date de modification |

#### Table `guild_onboarding_prompts`

| Champ | Type | Description |
|---|---|---|
| `id` | `String` (snowflake) | Identifiant |
| `guild_id` | `String` | FK → `guilds.id` |
| `type` | `Int` | `0`=MULTIPLE_CHOICE, `1`=DROPDOWN |
| `title` | `String` | Question (ex: "Quels sont vos centres d'intérêt ?") |
| `single_select` | `Boolean` | Sélection unique ou multiple |
| `required` | `Boolean` | Réponse obligatoire |
| `in_onboarding` | `Boolean` | Affiché pendant l'onboarding (vs paramètres serveur) |
| `position` | `Int` | Ordre d'affichage |

#### Table `guild_onboarding_prompt_options`

| Champ | Type | Description |
|---|---|---|
| `id` | `String` (snowflake) | Identifiant |
| `prompt_id` | `String` | FK → `guild_onboarding_prompts.id` |
| `title` | `String` | Label de l'option (ex: "Gaming") |
| `description` | `String?` | Description optionnelle |
| `emoji` | `String?` | Emoji associé |
| `role_ids` | `String` | JSON array de rôles à assigner si choisi |
| `channel_ids` | `String` | JSON array de canaux à rendre visibles si choisi |
| `position` | `Int` | Ordre d'affichage |

### 13.2 Flux d'onboarding

1. Le nouveau membre rejoint le serveur
2. Si `guild_onboarding.enabled = true`, le frontend affiche la modale d'onboarding au lieu du canal par défaut
3. Écran 1 : **Règles du serveur** (si un canal de règles est configuré via `rules_channel_id`)
   - Affichage des règles
   - Bouton "J'accepte les règles" (obligatoire)
4. Écrans 2+ : **Prompts de personnalisation** (un écran par prompt `in_onboarding = true`)
   - L'utilisateur choisit ses options
   - Les rôles correspondants sont assignés automatiquement
   - Les canaux correspondants deviennent visibles
5. Écran final : **Bienvenue !** avec résumé des choix et bouton "Commencer"

### 13.3 API

**`GET /api/guilds/:guildId/onboarding`**

Retourne la configuration d'onboarding complète (prompts + options).

**`PUT /api/guilds/:guildId/onboarding`**

Requiert : `MANAGE_GUILD`

```json
{
  "enabled": true,
  "mode": 0,
  "default_channel_ids": ["channel_1", "channel_2"],
  "prompts": [
    {
      "id": "prompt_1",
      "type": 0,
      "title": "Quels sujets vous intéressent ?",
      "single_select": false,
      "required": true,
      "in_onboarding": true,
      "options": [
        {
          "id": "opt_1",
          "title": "Gaming",
          "emoji": "🎮",
          "role_ids": ["role_gaming"],
          "channel_ids": ["channel_gaming"]
        },
        {
          "id": "opt_2",
          "title": "Musique",
          "emoji": "🎵",
          "role_ids": ["role_music"],
          "channel_ids": ["channel_music"]
        }
      ]
    }
  ]
}
```

**`POST /api/guilds/:guildId/onboarding/complete`**

Appelé par le client quand le nouveau membre termine l'onboarding.

```json
{
  "selected_options": ["opt_1", "opt_3"]
}
```

**Logique :** assigner les rôles correspondants aux options sélectionnées via `GuildMemberRole`.

### 13.4 Interface — Configuration (Paramètres serveur → Onboarding)

- Toggle "Activer l'onboarding"
- Sélecteur de canaux par défaut (multi-select)
- Liste des prompts (drag & drop pour réordonner)
- Bouton "Ajouter une question"
- Pour chaque prompt : titre, type (choix multiples / dropdown), options avec rôles et canaux associés
- Bouton "Aperçu" pour tester le flux en tant que nouveau membre

---

## 14. Templates de Serveur

Les templates permettent de sauvegarder la structure d'un serveur (canaux, rôles, permissions, onboarding) et de la réutiliser pour créer de nouveaux serveurs.

### 14.1 Modèle de données

#### Table `guild_templates`

| Champ | Type | Description |
|---|---|---|
| `id` | `String` (snowflake) | Identifiant |
| `code` | `String` UNIQUE | Code court du template (8 caractères alphanumériques) |
| `guild_id` | `String` | FK → `guilds.id` — serveur source |
| `name` | `String` | Nom du template (1–100 caractères) |
| `description` | `String?` | Description (max 120 caractères) |
| `creator_id` | `String` | FK → `users.id` |
| `usage_count` | `Int` | Nombre de fois que le template a été utilisé |
| `serialized_guild` | `Json` | Snapshot de la structure du serveur (voir ci-dessous) |
| `created_at` | `DateTime` | Date de création |
| `updated_at` | `DateTime` | Date de dernière synchronisation |

### 14.2 Structure `serialized_guild`

```json
{
  "name": "Mon Serveur",
  "description": "Template de serveur gaming",
  "icon_hash": null,
  "verification_level": 1,
  "default_message_notifications": 1,
  "system_channel_flags": 0,
  "roles": [
    {
      "id": 0,
      "name": "@everyone",
      "color": null,
      "hoist": false,
      "permissions": "104324673",
      "mentionable": false,
      "position": 0
    },
    {
      "id": 1,
      "name": "Modérateur",
      "color": "#FF5733",
      "hoist": true,
      "permissions": "8",
      "mentionable": false,
      "position": 2
    }
  ],
  "channels": [
    {
      "id": 0,
      "type": 4,
      "name": "TEXTE",
      "position": 0,
      "parent_id": null,
      "permission_overwrites": []
    },
    {
      "id": 1,
      "type": 0,
      "name": "général",
      "position": 0,
      "parent_id": 0,
      "topic": "Canal de discussion générale"
    }
  ]
}
```

Les IDs dans `serialized_guild` sont des entiers relatifs (0, 1, 2…) pour les références croisées internes. Lors de la création depuis un template, de vrais snowflakes sont générés et les références sont remappées.

### 14.3 API

**`POST /api/guilds/:guildId/templates`** — Créer un template depuis le serveur

Requiert : `MANAGE_GUILD`. Maximum **1 template** par serveur.

```json
{
  "name": "Template Gaming",
  "description": "Structure de serveur optimisée pour les communautés gaming"
}
```

**Réponse 201 Created :**
```json
{
  "code": "aBcDeFgH",
  "name": "Template Gaming",
  "description": "...",
  "usage_count": 0,
  "creator": { "id": "...", "username": "axel" },
  "serialized_guild": { "..." },
  "created_at": "2025-01-15T10:00:00.000Z"
}
```

**`GET /api/guilds/:guildId/templates`** — Lister les templates du serveur

**`PUT /api/guilds/:guildId/templates/:code/sync`** — Resynchroniser le template avec l'état actuel du serveur

Requiert : `MANAGE_GUILD`. Met à jour `serialized_guild` avec la structure actuelle.

**`PATCH /api/guilds/:guildId/templates/:code`** — Modifier nom/description

**`DELETE /api/guilds/:guildId/templates/:code`** — Supprimer le template

**`GET /api/guilds/templates/:code`** — Obtenir un template par code (route publique)

**`POST /api/guilds/templates/:code`** — Créer un serveur depuis un template

Requiert : authentification.

```json
{
  "name": "Mon Nouveau Serveur",
  "icon": null
}
```

**Logique :** créer le serveur avec les canaux, rôles et permissions définis dans `serialized_guild`, en générant de nouveaux snowflakes et en remappant les références internes.

### 14.4 Interface

- **Paramètres du serveur → Template** : bouton "Générer un template", nom, description, code partageable, bouton "Synchroniser", bouton "Supprimer"
- **Création de serveur** : option "Créer depuis un template" dans la modale de création. Champ pour coller un code de template + aperçu de la structure (canaux et rôles)

---

## 15. Canaux d'Annonces — Followers & Crosspost (détail)

### 15.1 Modèle de données

#### Table `channel_followers`

| Champ | Type | Description |
|---|---|---|
| `id` | `String` (snowflake) | Identifiant |
| `channel_id` | `String` | FK → `channels.id` — canal d'annonces source (type 5) |
| `guild_id` | `String` | FK → `guilds.id` — serveur source |
| `webhook_channel_id` | `String` | FK → `channels.id` — canal de destination dans le serveur suiveur |
| `webhook_id` | `String` | FK → `webhooks.id` — webhook créé automatiquement pour le crosspost |
| `created_at` | `DateTime` | Date d'abonnement |

### 15.2 Suivre un canal d'annonces

**`PUT /api/channels/:channelId/followers`**

Requiert : `MANAGE_WEBHOOKS` dans le serveur suiveur.

```json
{
  "webhook_channel_id": "channel_destination_id"
}
```

**Logique :**
1. Vérifier que `channelId` est un canal de type `ANNOUNCEMENT` (5)
2. Vérifier que l'utilisateur a `MANAGE_WEBHOOKS` dans le serveur de destination
3. Créer un webhook de type `CHANNEL_FOLLOWER` (type 2) dans le canal de destination
4. Créer l'entrée dans `channel_followers`

**Réponse 200 OK :**
```json
{
  "channel_id": "source_channel_id",
  "webhook_id": "webhook_auto_created_id"
}
```

### 15.3 Ne plus suivre

**`DELETE /api/channels/:channelId/followers/:followerId`**

Supprime l'entrée `channel_followers` et le webhook associé.

### 15.4 Lister les serveurs suiveurs

**`GET /api/channels/:channelId/followers`**

Requiert : `MANAGE_CHANNELS` dans le serveur source.

```json
{
  "followers": [
    {
      "id": "follower_1",
      "guild": { "id": "...", "name": "Serveur B", "icon": "..." },
      "channel": { "id": "...", "name": "annonces" },
      "created_at": "2025-01-10T12:00:00.000Z"
    }
  ]
}
```

### 15.5 Crosspost d'un message

**`POST /api/channels/:channelId/messages/:messageId/crosspost`**

Requiert : `SEND_MESSAGES` dans le canal d'annonces (auteur du message) ou `MANAGE_MESSAGES`.

**Logique :**
1. Vérifier que le canal est de type `ANNOUNCEMENT`
2. Marquer le message avec le flag `CROSSPOSTED` (bit `1 << 0`)
3. Pour chaque entrée dans `channel_followers` du canal :
   a. Envoyer le message via le webhook associé au canal de destination
   b. Le message reçu est marqué avec le flag `IS_CROSSPOST` (bit `1 << 1`)
   c. Le message contient une `message_reference` pointant vers le message original
4. Émettre `MESSAGE_UPDATE` sur le canal source (flag mis à jour)

**Réponse 200 OK :** message avec le flag `CROSSPOSTED` mis à jour

**Erreurs :**
- `403` si le canal n'est pas de type annonces
- `400` si le message est déjà crossposté

### 15.6 Auto-crosspost

Option configurable par canal : `auto_crosspost = true` sur un canal d'annonces. Si activé, chaque nouveau message dans le canal est automatiquement crossposté sans action manuelle.

### 15.7 Interface

**Dans le canal d'annonces :**
- Bouton "Publier" sur chaque message (icône mégaphone) pour crosspost manuel
- Badge "Publié ✓" sur les messages déjà crosspostés
- Toggle "Auto-publier" dans les paramètres du canal

**Paramètres du canal d'annonces → Suiveurs :**
- Liste des serveurs qui suivent ce canal
- Bouton "Retirer" pour arrêter un suivi

**Dans le serveur suiveur :**
- Option "Suivre un canal d'annonces" dans le menu d'un canal texte
- Modale : recherche du serveur source, sélection du canal d'annonces, confirmation

### 15.8 Événements Socket.IO

| Événement | Déclencheur | Payload |
|---|---|---|
| `CHANNEL_FOLLOWERS_UPDATE` | Nouveau follower / retrait | `{ channel_id, guild_id }` |
| `MESSAGE_UPDATE` | Message crossposté (flag mis à jour) | `{ message }` |

---

## Références croisées

- `00-architecture.md` — Conventions, stockage fichiers, Socket.IO rooms
- `01-authentication.md` — Auth middleware
- `02-users-profiles-badges.md` — Profil utilisateur, statut de présence
- `04-messages.md` — Messages dans les canaux et threads
- `05-roles-permissions.md` — Système de permissions bitfield, overwrites
- `10-bots-api.md` — Webhooks (type CHANNEL_FOLLOWER)
- `19-server-discovery.md` — Découvrabilité des serveurs
- `20-scheduled-events.md` — Événements serveur
