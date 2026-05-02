# 04 — Messages

> Spécification complète du système de messagerie : envoi, édition, suppression, markdown, pièces jointes, embeds, épingles, réactions, recherche FTS5, états de lecture et indicateur de frappe.
>
> Dépendances : `00-architecture.md`, `03-servers-channels.md` (canaux), `05-roles-permissions.md` (permissions).

---

## 1. Modèle Message

### Table `messages`

| Champ | Type Prisma | Description |
|---|---|---|
| `id` | `String` (snowflake) | Identifiant unique (snowflake = horodaté) |
| `channel_id` | `String` | FK → `channels.id` |
| `author_id` | `String` | FK → `users.id` |
| `content` | `String?` | Contenu textuel (max 2000 caractères) |
| `type` | `Int` | Type de message (voir tableau ci-dessous) |
| `flags` | `Int` | Bitfield de flags (CROSSPOSTED, IS_CROSSPOST, SUPPRESS_EMBEDS, EPHEMERAL…) |
| `edited_at` | `DateTime?` | Date de dernière édition |
| `tts` | `Boolean` | Message TTS (Text-to-Speech) |
| `mention_everyone` | `Boolean` | Mentionne @everyone ou @here |
| `pinned` | `Boolean` | Message épinglé dans le canal |
| `reference_id` | `String?` | FK → `messages.id` — message cité (réponse) |
| `thread_id` | `String?` | FK → `channels.id` — fil créé depuis ce message |
| `webhook_id` | `String?` | FK → `webhooks.id` — si envoyé par webhook |
| `application_id` | `String?` | FK → plugins/bots futurs |
| `created_at` | `DateTime` | Date d'envoi |

### Types de messages

| Valeur | Constante | Description |
|---|---|---|
| `0` | `DEFAULT` | Message standard |
| `1` | `RECIPIENT_ADD` | Ajout d'un membre à un groupe DM |
| `2` | `RECIPIENT_REMOVE` | Retrait d'un membre d'un groupe DM |
| `3` | `CALL` | Appel vocal — ⚠️ DIFFÉRÉ |
| `4` | `CHANNEL_NAME_CHANGE` | Renommage du canal |
| `5` | `CHANNEL_ICON_CHANGE` | Changement d'icône (groupe DM) |
| `6` | `CHANNEL_PINNED_MESSAGE` | Message épinglé dans le canal |
| `7` | `GUILD_MEMBER_JOIN` | Arrivée d'un nouveau membre |
| `8` | `USER_PREMIUM_GUILD_SUBSCRIPTION` | Boost du serveur |
| `9` | `USER_PREMIUM_GUILD_SUBSCRIPTION_TIER_1` | Boost → niveau 1 |
| `10` | `USER_PREMIUM_GUILD_SUBSCRIPTION_TIER_2` | Boost → niveau 2 |
| `11` | `USER_PREMIUM_GUILD_SUBSCRIPTION_TIER_3` | Boost → niveau 3 |
| `19` | `REPLY` | Réponse à un message |
| `21` | `THREAD_CREATED` | Fil créé depuis ce message |
| `24` | `AUTO_MODERATION_ACTION` | Action d'automod |

### Flags de message (bitfield)

| Bit | Constante | Description |
|---|---|---|
| `1 << 0` | `CROSSPOSTED` | Message crossposté depuis un canal d'annonces |
| `1 << 1` | `IS_CROSSPOST` | Ce message est un crosspost |
| `1 << 2` | `SUPPRESS_EMBEDS` | Les embeds sont masqués |
| `1 << 3` | `SOURCE_MESSAGE_DELETED` | Le message original de la réponse a été supprimé |
| `1 << 6` | `EPHEMERAL` | Message éphémère (visible seulement par le destinataire) |
| `1 << 7` | `LOADING` | Message de chargement (thinking…) |

---

## 2. API — Messages

### 2.1 Envoyer un message

**`POST /api/channels/:channelId/messages`**

Nécessite la permission `SEND_MESSAGES` dans le canal.

**Content-Type :** `application/json` ou `multipart/form-data` (si pièces jointes)

**Corps de la requête (JSON) :**

```json
{
  "content": "Bonjour tout le monde ! 👋",
  "tts": false,
  "message_reference": {
    "message_id": "msg_id_replied_to",
    "channel_id": "channel_id",
    "guild_id": "guild_id"
  },
  "sticker_ids": ["sticker_id"],
  "flags": 0
}
```

**Corps de la requête (multipart/form-data) :**

- Champ `payload_json` : JSON stringifié (même structure qu'au-dessus)
- Champs `files[0]`, `files[1]`… : fichiers à joindre

**Validation :**
- `content` : max 2000 caractères (si fourni)
- Au moins `content`, `sticker_ids` ou `files` doit être présent
- Max 10 pièces jointes par message
- Si le canal a un slowmode, vérifier que l'utilisateur peut envoyer (sauf si `MANAGE_MESSAGES`)

**Réponse 201 Created :**

```json
{
  "id": "message_snowflake_id",
  "channel_id": "channel_id",
  "author": {
    "id": "user_id",
    "username": "Alice",
    "discriminator": "0042",
    "avatar": "..."
  },
  "content": "Bonjour tout le monde ! 👋",
  "type": 0,
  "flags": 0,
  "tts": false,
  "mention_everyone": false,
  "mentions": [],
  "mention_roles": [],
  "attachments": [],
  "embeds": [],
  "reactions": [],
  "pinned": false,
  "edited_at": null,
  "referenced_message": null,
  "created_at": "2024-01-15T10:00:00.000Z"
}
```

**Logique interne :**

1. Vérifier les permissions (`SEND_MESSAGES`, `SEND_TTS_MESSAGES` si tts, `ATTACH_FILES` si pièces jointes)
2. Vérifier le slowmode (si `slowmode_delay > 0`)
3. Parser les mentions (`<@userId>`, `<@&roleId>`, `<#channelId>`, `@everyone`, `@here`)
4. Valider et stocker les pièces jointes (upload via multer → sharp pour les images)
5. Créer le message en base
6. Si URL détectée dans le contenu → générer un embed automatique (via parse des meta OpenGraph)
7. Mettre à jour `channels.last_message_id`
8. Émettre `message:create` via Socket.IO → room `channel:<channelId>`
9. Créer des notifications pour les utilisateurs mentionnés

---

### 2.2 Lister les messages

**`GET /api/channels/:channelId/messages`**

Nécessite `VIEW_CHANNEL` + `READ_MESSAGE_HISTORY`.

**Query params :**

| Param | Type | Description |
|---|---|---|
| `limit` | `Int` | Nombre de messages (1–100, défaut 50) |
| `before` | `String` | Récupérer les messages avant cet ID (snowflake) |
| `after` | `String` | Récupérer les messages après cet ID (snowflake) |
| `around` | `String` | Récupérer les messages autour de cet ID |

> `before`, `after` et `around` sont mutuellement exclusifs. Si `around` est utilisé, retourne `limit/2` messages de chaque côté.

**Réponse 200 OK :**

```json
{
  "messages": [
    {
      "id": "...",
      "content": "Message 1",
      "author": { "..." },
      "attachments": [],
      "embeds": [],
      "reactions": [
        { "emoji": { "name": "👍" }, "count": 3, "me": true }
      ],
      "created_at": "..."
    }
  ]
}
```

> Les messages sont retournés dans l'ordre chronologique décroissant pour `before`, croissant pour `after`.

---

### 2.3 Obtenir un message

**`GET /api/channels/:channelId/messages/:messageId`**

**Réponse 200 OK :** objet message complet

---

### 2.4 Éditer un message

**`PATCH /api/channels/:channelId/messages/:messageId`**

Seul l'auteur peut éditer son message.

**Corps de la requête :**

```json
{
  "content": "Contenu modifié",
  "flags": 4
}
```

> `flags: 4` = `SUPPRESS_EMBEDS` — permet de masquer les embeds générés automatiquement.

**Réponse 200 OK :** message mis à jour avec `edited_at` renseigné

**Logique :**
1. Vérifier que `author_id = req.user.userId`
2. Mettre à jour `content` et `edited_at = now()`
3. Émettre `message:update` → room `channel:<channelId>`

---

### 2.5 Supprimer un message

**`DELETE /api/channels/:channelId/messages/:messageId`**

- Auteur peut supprimer son propre message
- Permission `MANAGE_MESSAGES` permet de supprimer les messages des autres

**Réponse 204 No Content**

**Logique :**
1. Vérifier les droits
2. Supprimer le message et ses pièces jointes (fichiers physiques)
3. Supprimer les réactions associées
4. Émettre `message:delete` → room `channel:<channelId>`

---

### 2.6 Suppression en masse (Bulk Delete)

**`POST /api/channels/:channelId/messages/bulk-delete`**

Nécessite `MANAGE_MESSAGES`.

**Corps de la requête :**

```json
{
  "ids": ["msg_id_1", "msg_id_2", "msg_id_3"]
}
```

**Règles :**
- Max 100 messages par appel
- Les messages doivent dater de moins de 14 jours (sinon erreur `MESSAGE_TOO_OLD`)
- Les messages déjà supprimés sont ignorés silencieusement

**Réponse 204 No Content**

**Événement Socket.IO émis :** `message:bulk_delete` → `{ channel_id, ids: [...] }`

---

## 3. Rendu Markdown (Discord-Flavored)

Le rendu Markdown est effectué côté client avec `markdown-it` (plus plugin personnalisés). Le contenu brut est stocké en base, jamais le HTML.

### 3.1 Syntaxes supportées

#### Formatage de texte

| Syntaxe | Rendu | Notes |
|---|---|---|
| `**texte**` | **texte** (gras) | |
| `*texte*` ou `_texte_` | *texte* (italique) | |
| `***texte***` | ***texte*** (gras italique) | |
| `__texte__` | <u>texte</u> (souligné) | |
| `~~texte~~` | ~~texte~~ (barré) | |
| `\|\|texte\|\|` | texte spoiler (masqué, révélé au clic) | |
| `` `code` `` | `code inline` | |
| ` ```lang\ncode\n``` ` | Bloc de code avec coloration syntaxique | `lang` est optionnel |
| `> texte` | Citation (blockquote) | |
| `>>> texte` | Citation multi-ligne | Tout ce qui suit est cité |
| `# Titre` | Titre H1 | |
| `## Titre` | Titre H2 | |
| `### Titre` | Titre H3 | |
| `- item` ou `* item` | Liste à puces | |
| `1. item` | Liste numérotée | |
| `[texte](url)` | Lien cliquable | |

---

#### Mentions

| Syntaxe | Rendu | Notes |
|---|---|---|
| `<@userId>` | `@Alice` (lien vers profil) | Mentionne un utilisateur |
| `<@!userId>` | `@Alice` (avec nickname) | Variante de mention utilisateur |
| `<@&roleId>` | `@Modérateur` (couleur du rôle) | Mentionne un rôle |
| `<#channelId>` | `#général` (lien vers canal) | Lien vers un canal |
| `@everyone` | `@everyone` (alerte rouge) | Nécessite permission `MENTION_EVERYONE` |
| `@here` | `@here` (alerte orange) | Mentionne les membres en ligne |

---

#### Timestamps

Format : `<t:UNIX_TIMESTAMP:FORMAT>`

| Code Format | Exemple | Description |
|---|---|---|
| `t` | 15:30 | Heure courte |
| `T` | 15:30:00 | Heure longue |
| `d` | 15/01/2024 | Date courte |
| `D` | 15 janvier 2024 | Date longue |
| `f` | 15 janvier 2024 15:30 | Date et heure |
| `F` | lundi 15 janvier 2024 15:30 | Date et heure complète |
| `R` | il y a 3 heures | Temps relatif (mis à jour en temps réel) |

Exemple : `<t:1705318200:R>` → "il y a 3 heures" (mis à jour toutes les secondes côté client)

---

#### Emojis

| Syntaxe | Description |
|---|---|
| `:smile:` | Emoji standard par shortcode |
| `<:nom:id>` | Emoji personnalisé statique |
| `<a:nom:id>` | Emoji personnalisé animé (GIF) — OpenCord+ pour envoyer hors serveur d'origine |

---

### 3.2 Sécurité du rendu

- Le HTML n'est **jamais** stocké en base
- Le contenu brut est rendu côté client
- Les URLs dans les liens sont validées (pas de `javascript:`, `data:`, etc.)
- La sanitisation est effectuée après le rendu Markdown (DOMPurify côté client)

---

## 4. Pièces Jointes

### Modèle — Table `attachments`

| Champ | Type | Description |
|---|---|---|
| `id` | `String` (snowflake) | Identifiant |
| `message_id` | `String` | FK → `messages.id` |
| `filename` | `String` | Nom original du fichier |
| `size` | `Int` | Taille en octets |
| `content_type` | `String` | MIME type |
| `url` | `String` | URL de téléchargement |
| `proxy_url` | `String?` | URL du thumbnail (images) |
| `width` | `Int?` | Largeur en pixels (images/vidéos) |
| `height` | `Int?` | Hauteur en pixels (images/vidéos) |
| `spoiler` | `Boolean` | Si le nom commence par `SPOILER_`, l'image est masquée |
| `description` | `String?` | Texte alternatif (accessibilité) |
| `ephemeral` | `Boolean` | Si l'attachement est éphémère |
| `created_at` | `DateTime` | Date d'upload |

### Limites de taille

| Utilisateur | Limite par fichier |
|---|---|
| Utilisateur standard | 8 MB |
| Abonné OpenCord+ | 25 MB |

La limite est vérifiée côté serveur (middleware multer configuré dynamiquement).

### Traitement des images

1. Upload via `multer` → stockage temporaire
2. `sharp` vérifie le type réel (pas seulement l'extension)
3. Génération d'un thumbnail `256×256 max` (format WebP) pour la prévisualisation
4. Fichier original conservé tel quel (pas de redimensionnement automatique)
5. Stockage dans `uploads/attachments/<channelId>/<messageId>/<filename>`

### Types de fichiers autorisés

- **Images :** JPEG, PNG, GIF, WebP, AVIF
- **Vidéos :** MP4, WebM, MOV (pas de transcodage)
- **Audio :** MP3, OGG, WAV, FLAC (lecteur intégré)
- **Documents :** PDF, TXT, ZIP, RAR, 7Z, CSV, JSON, XML
- **Code :** tout fichier texte

Types **interdits** : `.exe`, `.bat`, `.sh`, `.ps1`, `.cmd`, `.scr`, `.vbs`, `.msi`, `.dmg`, `.app`

### Fichiers spoiler

Si le nom du fichier commence par `SPOILER_` (ex: `SPOILER_screenshot.png`), le fichier est affiché masqué dans le chat. L'utilisateur doit cliquer pour révéler. La propriété `spoiler` est mise à `true` automatiquement.

---

## 5. Embeds

Les embeds sont des blocs enrichis affichés sous les messages. Ils peuvent être auto-générés (prévisualisation de lien) ou envoyés par des bots/webhooks.

### Modèle — Table `embeds`

| Champ | Type | Description |
|---|---|---|
| `id` | `String` | Identifiant |
| `message_id` | `String` | FK → `messages.id` |
| `type` | `String` | `rich`, `image`, `video`, `gifv`, `article`, `link` |
| `title` | `String?` | Titre de l'embed (max 256 caractères) |
| `description` | `String?` | Description (max 4096 caractères, supporte le Markdown) |
| `url` | `String?` | URL associée au titre |
| `color` | `Int?` | Couleur de la bordure gauche (entier RGB) |
| `timestamp` | `DateTime?` | Timestamp affiché dans le footer |
| `footer_text` | `String?` | Texte du footer (max 2048 caractères) |
| `footer_icon_url` | `String?` | URL de l'icône du footer |
| `image_url` | `String?` | URL de l'image principale |
| `image_width` | `Int?` | Largeur de l'image |
| `image_height` | `Int?` | Hauteur de l'image |
| `thumbnail_url` | `String?` | URL du thumbnail (coin supérieur droit) |
| `author_name` | `String?` | Nom de l'auteur (max 256 caractères) |
| `author_url` | `String?` | URL de l'auteur |
| `author_icon_url` | `String?` | URL de l'icône de l'auteur |
| `fields` | `String?` | JSON array : `[{ name, value, inline }]` |
| `created_at` | `DateTime` | Date de création |

### Limites

- Max **10 embeds** par message
- Max **25 champs** (`fields`) par embed
- Longueur totale de l'embed (toutes chaînes combinées) ≤ 6000 caractères

### Auto-génération depuis URL

Lorsqu'un message contient une URL, le serveur tente de générer un embed automatiquement :

1. Récupérer le HTML de la page (timeout 3 secondes)
2. Parser les balises `<meta>` OpenGraph (`og:title`, `og:description`, `og:image`, `og:url`) et Twitter Card
3. Créer un embed de type `link` ou `article`
4. Mettre à jour le message avec l'embed

> En cas d'échec (timeout, page inaccessible, pas de métadonnées), aucun embed n'est généré. Pas d'erreur visible pour l'utilisateur.

### Cache des embeds auto-générés

#### Table `embed_cache`

| Champ | Type | Description |
|---|---|---|
| `url_hash` | `String` @id | SHA-256 de l'URL normalisée |
| `url` | `String` | URL originale |
| `embed_data` | `Json?` | Données de l'embed (null si aucun embed trouvé) |
| `status` | `Int` | `0`=pending, `1`=success, `2`=failed |
| `expires_at` | `DateTime` | Date d'expiration du cache |
| `created_at` | `DateTime` | Date de création |

**Logique de cache :**
1. Avant de fetch une URL, vérifier si un cache valide existe (`url_hash` + `expires_at > now`)
2. Si cache hit : utiliser les données en cache, pas de requête HTTP
3. Si cache miss : fetch, stocker le résultat, TTL = **1 heure** pour les succès, **5 minutes** pour les échecs
4. Maximum **50 fetches/minute** côté serveur (rate limit global sur l'unfurling)
5. Nettoyage cron : supprimer les entrées expirées toutes les heures

### Proxy d'images

Pour protéger la vie privée des utilisateurs (ne pas exposer leur IP aux serveurs tiers), les images des embeds sont proxifiées :

- Endpoint : `GET /api/proxy/image?url=<encoded_url>`
- Le serveur OpenCord fetch l'image et la relaie au client
- Taille max : 8 MB
- Formats acceptés : `image/png`, `image/jpeg`, `image/gif`, `image/webp`
- Cache côté serveur : fichier temporaire dans `uploads/proxy_cache/`, TTL 24h, nettoyage cron
- Le client remplace toutes les URLs d'images dans les embeds par l'URL du proxy

### Support oEmbed

En plus d'OpenGraph, le serveur supporte le protocole **oEmbed** :

1. Vérifier si l'URL correspond à un provider oEmbed connu (liste interne)
2. Appeler le endpoint oEmbed du provider : `GET {oembed_url}?url={url}&format=json`
3. Mapper la réponse oEmbed vers le modèle d'embed interne

#### Providers oEmbed intégrés

| Provider | Domaines | Type d'embed |
|---|---|---|
| YouTube | `youtube.com`, `youtu.be` | `video` — player iframe, thumbnail, titre, chaîne |
| Twitter/X | `twitter.com`, `x.com` | `rich` — contenu du tweet, avatar, métriques |
| Spotify | `open.spotify.com` | `rich` — artwork, titre, artiste, player compact |
| GitHub | `github.com` | `rich` — repo (stars, description), issue/PR (état, titre), gist |
| Twitch | `twitch.tv` | `video` — stream en direct ou clip, thumbnail, streamer |
| Imgur | `imgur.com` | `image` / `gifv` — image directe ou GIF |
| SoundCloud | `soundcloud.com` | `rich` — waveform, titre, artiste |

Pour les providers non oEmbed, le fallback reste l'extraction OpenGraph/Twitter Card.

#### Rendu des embeds vidéo

Les embeds de type `video` (YouTube, Twitch) affichent :
- Thumbnail avec bouton play (triangle blanc sur overlay semi-transparent)
- Clic sur le thumbnail → remplace par un `<iframe>` (lazy-load, pas d'autoplay)
- Iframe sandboxé : `sandbox="allow-scripts allow-same-origin allow-popups"`
- Taille : largeur max 400px, ratio 16:9

### Structure d'un embed (représentation JSON pour API webhook/bot)

```json
{
  "title": "Titre de l'article",
  "description": "Résumé de l'article avec **markdown** supporté.",
  "url": "https://example.com/article",
  "color": 5793266,
  "timestamp": "2024-01-15T10:00:00.000Z",
  "footer": {
    "text": "Source: Example.com",
    "icon_url": "https://example.com/favicon.ico"
  },
  "image": {
    "url": "https://example.com/image.jpg"
  },
  "thumbnail": {
    "url": "https://example.com/thumb.jpg"
  },
  "author": {
    "name": "Auteur de l'article",
    "url": "https://example.com/auteur",
    "icon_url": "https://example.com/avatar.jpg"
  },
  "fields": [
    { "name": "Champ 1", "value": "Valeur 1", "inline": true },
    { "name": "Champ 2", "value": "Valeur 2", "inline": true }
  ]
}
```

---

## 6. Épingles (Pins)

### Modèle — Table `pins`

| Champ | Type | Description |
|---|---|---|
| `channel_id` | `String` | FK → `channels.id` |
| `message_id` | `String` | FK → `messages.id` |
| `pinned_by` | `String` | FK → `users.id` |
| `created_at` | `DateTime` | Date d'épinglage |

**Limite :** 50 messages épinglés par canal.

---

### 6.1 Épingler un message

**`PUT /api/channels/:channelId/pins/:messageId`**

Nécessite `MANAGE_MESSAGES`.

**Logique :**
1. Vérifier la limite de 50 pins
2. Créer l'entrée dans `pins`
3. Mettre `messages.pinned = true`
4. Créer un message système de type `CHANNEL_PINNED_MESSAGE` dans le canal
5. Émettre `channel:pins_update` → room `channel:<channelId>`

**Réponse 204 No Content**

---

### 6.2 Désépingler un message

**`DELETE /api/channels/:channelId/pins/:messageId`**

Nécessite `MANAGE_MESSAGES`.

**Réponse 204 No Content**

---

### 6.3 Liste des messages épinglés

**`GET /api/channels/:channelId/pins`**

**Réponse 200 OK :**

```json
{
  "pins": [
    {
      "message": {
        "id": "...",
        "content": "Message important à retenir.",
        "author": { "..." },
        "created_at": "..."
      },
      "pinned_by": { "id": "...", "username": "Alice", "discriminator": "0042" },
      "created_at": "..."
    }
  ]
}
```

---

## 7. Réactions

### Modèle — Table `reactions`

| Champ | Type | Description |
|---|---|---|
| `id` | `String` | Identifiant |
| `message_id` | `String` | FK → `messages.id` |
| `channel_id` | `String` | FK → `channels.id` (dénormalisé pour performance) |
| `user_id` | `String` | FK → `users.id` |
| `emoji_name` | `String` | Unicode emoji (ex: `👍`) ou nom emoji custom |
| `emoji_id` | `String?` | ID de l'emoji custom (si custom) |
| `emoji_animated` | `Boolean` | Emoji animé |
| `created_at` | `DateTime` | Date d'ajout |

**Contrainte :** `UNIQUE(message_id, user_id, emoji_name, emoji_id)` — un utilisateur ne peut réagir qu'une fois avec le même emoji.

---

### 7.1 Ajouter une réaction

**`PUT /api/channels/:channelId/messages/:messageId/reactions/:emoji/@me`**

`:emoji` peut être :
- Un emoji unicode (URL-encodé) : `👍` → `%F0%9F%91%8D`
- Un emoji custom : `nom:id` → `smile:123456789`

Nécessite `ADD_REACTIONS`.

**Réponse 204 No Content**

**Événement Socket.IO :** `message:reaction_add` → `{ message_id, user_id, emoji }`

---

### 7.2 Supprimer sa réaction

**`DELETE /api/channels/:channelId/messages/:messageId/reactions/:emoji/@me`**

**Réponse 204 No Content**

**Événement Socket.IO :** `message:reaction_remove` → `{ message_id, user_id, emoji }`

---

### 7.3 Supprimer la réaction d'un autre utilisateur

**`DELETE /api/channels/:channelId/messages/:messageId/reactions/:emoji/:userId`**

Nécessite `MANAGE_MESSAGES`.

**Réponse 204 No Content**

---

### 7.4 Supprimer toutes les réactions

**`DELETE /api/channels/:channelId/messages/:messageId/reactions`**

Supprime toutes les réactions de tous les emojis.

Nécessite `MANAGE_MESSAGES`.

**Réponse 204 No Content**

**Événement Socket.IO :** `message:reaction_remove_all` → `{ message_id, channel_id }`

---

### 7.5 Supprimer toutes les réactions d'un emoji

**`DELETE /api/channels/:channelId/messages/:messageId/reactions/:emoji`**

Nécessite `MANAGE_MESSAGES`.

**Réponse 204 No Content**

---

### 7.6 Liste des utilisateurs ayant réagi

**`GET /api/channels/:channelId/messages/:messageId/reactions/:emoji`**

**Query params :** `?limit=25&after=userId`

**Réponse 200 OK :**

```json
{
  "users": [
    { "id": "...", "username": "Alice", "discriminator": "0042", "avatar": "..." }
  ]
}
```

---

## 8. Recherche de Messages (FTS5)

La recherche utilise la fonctionnalité **FTS5** (Full-Text Search 5) de SQLite.

### Structure FTS

Une table virtuelle FTS5 est maintenue en synchronisation avec la table `messages` :

```sql
CREATE VIRTUAL TABLE messages_fts USING fts5(
  content,
  content='messages',
  content_rowid='rowid',
  tokenize='unicode61'
);
```

Des triggers SQLite maintiennent la table FTS à jour (INSERT, UPDATE, DELETE sur `messages`).

---

### 8.1 Recherche dans un serveur

**`GET /api/guilds/:guildId/messages/search`**

**Query params :**

| Param | Type | Description |
|---|---|---|
| `content` | `String` | Termes de recherche (FTS5) |
| `author_id` | `String` | Filtrer par auteur |
| `channel_id` | `String` | Filtrer par canal spécifique |
| `has` | `String` | Filtrer par contenu : `link`, `image`, `file`, `embed`, `video`, `audio`, `sticker` |
| `before` | `String` | Messages avant cet ID snowflake |
| `after` | `String` | Messages après cet ID snowflake |
| `limit` | `Int` | Résultats (max 25, défaut 25) |
| `offset` | `Int` | Pagination offset |

**Réponse 200 OK :**

```json
{
  "total_results": 42,
  "messages": [
    [
      {
        "id": "...",
        "content": "Voici un **message important** avec une mention <@userId>.",
        "author": { "..." },
        "channel_id": "...",
        "created_at": "...",
        "hit_type": "content"
      }
    ]
  ],
  "analytics_id": "search_session_id"
}
```

> La réponse est un tableau de tableaux : chaque sous-tableau contient le message correspondant + optionnellement les messages contextuels adjacents (avant/après).

---

### 8.2 Recherche dans un canal

**`GET /api/channels/:channelId/messages/search`**

Mêmes paramètres que ci-dessus sans `channel_id`.

---

### 8.3 Highlighting

Les termes correspondants sont enveloppés dans des balises côté client (ex: `<mark>terme</mark>`) après réception des résultats. La mise en évidence est purement cosmétique et se fait sur le contenu retourné.

---

## 9. États de Lecture (Read States)

### Modèle — Table `read_states`

| Champ | Type | Description |
|---|---|---|
| `user_id` | `String` | FK → `users.id` |
| `channel_id` | `String` | FK → `channels.id` |
| `last_message_id` | `String?` | Dernier message lu (snowflake) |
| `last_pin_timestamp` | `DateTime?` | Dernière épingle vue |
| `mention_count` | `Int` | Nombre de mentions non lues |
| `updated_at` | `DateTime` | Date de mise à jour |

**Contrainte :** `UNIQUE(user_id, channel_id)`

---

### 9.1 Marquer comme lu

**`POST /api/channels/:channelId/messages/:messageId/ack`**

Marque tous les messages jusqu'à et incluant `messageId` comme lus.

**Corps de la requête :**

```json
{
  "manual": true,
  "mention_count": 0
}
```

**Logique :**
1. Upsert dans `read_states` : `last_message_id = messageId`
2. Remettre `mention_count` à 0 si précisé
3. Émettre `read_state:update` → room `user:<userId>` (pour synchroniser d'autres onglets/appareils)

**Réponse 204 No Content**

---

### 9.2 Calcul des non-lus

Les messages non lus d'un canal pour un utilisateur sont :

```
SELECT COUNT(*) FROM messages
WHERE channel_id = :channelId
AND id > :lastMessageId
AND author_id != :userId
```

Ce calcul est effectué **à la demande** (lors du chargement de l'interface) et non en temps réel.

Le `mention_count` est incrémenté côté serveur lors de la création d'un message qui mentionne l'utilisateur.

---

### 9.3 Récupération des états de lecture

Les `read_states` sont retournés dans le payload initial de connexion (événement Socket.IO `ready`) pour tous les canaux que l'utilisateur peut voir.

---

## 10. Indicateur de Frappe (Typing Indicator)

### 10.1 Signaler la frappe

**`POST /api/channels/:channelId/typing`**

Aucun corps de requête nécessaire.

Rate limit : 1 requête toutes les 3 secondes par utilisateur et par canal.

**Réponse 204 No Content**

**Logique serveur :**
1. Émettre `typing:start` → room `channel:<channelId>` avec `{ user_id, timestamp }`
2. Planifier un timeout : après 10 secondes sans nouvel appel, émettre `typing:stop`

---

### 10.2 Événements Socket.IO liés

**`typing:start`**

```json
{
  "channel_id": "...",
  "user_id": "...",
  "member": {
    "user": { "id": "...", "username": "...", "avatar": "..." },
    "nickname": "Pseudo",
    "roles": []
  },
  "timestamp": 1705318200000
}
```

**`typing:stop`**

```json
{
  "channel_id": "...",
  "user_id": "..."
}
```

---

### 10.3 Affichage côté client

Le client affiche un indicateur en bas du chat du type :

- "**Alice** est en train d'écrire…"
- "**Alice** et **Bob** sont en train d'écrire…"
- "**Alice**, **Bob** et 2 autres sont en train d'écrire…"

L'indicateur disparaît après 10 secondes sans événement `typing:start` ou à la réception d'un message de cet utilisateur.

---

## 11. Emojis et Stickers

### Modèle — Table `emojis`

| Champ | Type | Description |
|---|---|---|
| `id` | `String` (snowflake) | Identifiant |
| `guild_id` | `String` | FK → `guilds.id` |
| `name` | `String` | Nom de l'emoji (alphanumériques + underscore) |
| `animated` | `Boolean` | Emoji GIF animé |
| `url` | `String` | Chemin du fichier |
| `created_by` | `String` | FK → `users.id` |
| `created_at` | `DateTime` | Date d'upload |

**Limites :**
- Emoji statique : max 50 par serveur (tier 0), +50 par tier
- Emoji animé : même limite, compteur séparé
- Taille max : 256 KB, format PNG ou GIF

**`GET /api/guilds/:guildId/emojis`** — Lister les emojis du serveur

**`POST /api/guilds/:guildId/emojis`** — Créer un emoji (nécessite `MANAGE_EMOJIS_AND_STICKERS`)

```json
{
  "name": "pepe_happy",
  "image": "data:image/png;base64,..."
}
```

**`PATCH /api/guilds/:guildId/emojis/:emojiId`** — Renommer

**`DELETE /api/guilds/:guildId/emojis/:emojiId`** — Supprimer

---

### Modèle — Table `stickers`

| Champ | Type | Description |
|---|---|---|
| `id` | `String` (snowflake) | Identifiant |
| `guild_id` | `String?` | FK → `guilds.id` (null si sticker système) |
| `name` | `String` | Nom du sticker |
| `description` | `String?` | Description |
| `tags` | `String` | Tags séparés par virgule (pour autocompletion) |
| `format_type` | `Int` | `1`=PNG, `2`=APNG, `3`=Lottie |
| `url` | `String` | Chemin du fichier |
| `sort_value` | `Int?` | Ordre dans le pack |
| `created_at` | `DateTime` | Date de création |

**`GET /api/guilds/:guildId/stickers`** — Lister les stickers

**`POST /api/guilds/:guildId/stickers`** — Créer (nécessite `MANAGE_EMOJIS_AND_STICKERS`, OpenCord+ pour les serveurs) — `multipart/form-data`

**`PATCH /api/guilds/:guildId/stickers/:stickerId`** — Modifier

**`DELETE /api/guilds/:guildId/stickers/:stickerId`** — Supprimer

---

## 12. Webhooks

### Modèle — Table `webhooks`

| Champ | Type | Description |
|---|---|---|
| `id` | `String` (snowflake) | Identifiant |
| `type` | `Int` | `1`=incoming, `2`=channel_follower |
| `guild_id` | `String` | FK → `guilds.id` |
| `channel_id` | `String` | FK → `channels.id` |
| `user_id` | `String?` | FK → `users.id` (créateur) |
| `name` | `String?` | Nom du webhook (affiché comme auteur) |
| `avatar` | `String?` | Avatar du webhook |
| `token` | `String` | Token secret (UUID v4) |
| `created_at` | `DateTime` | Date de création |

**`GET /api/channels/:channelId/webhooks`** — Lister les webhooks (nécessite `MANAGE_WEBHOOKS`)

**`POST /api/channels/:channelId/webhooks`** — Créer un webhook

**`GET /api/webhooks/:webhookId/:webhookToken`** — Résoudre un webhook (sans auth)

**`POST /api/webhooks/:webhookId/:webhookToken`** — Envoyer un message via webhook

```json
{
  "content": "Message envoyé par le webhook.",
  "username": "MonBot",
  "avatar_url": "https://example.com/avatar.png",
  "embeds": [ "..." ]
}
```

**`PATCH /api/webhooks/:webhookId`** — Modifier (nécessite `MANAGE_WEBHOOKS`)

**`DELETE /api/webhooks/:webhookId`** — Supprimer (nécessite `MANAGE_WEBHOOKS`)

---

## 13. AutoMod (Modération Automatique)

### Modèle — Table `automod_rules`

| Champ | Type | Description |
|---|---|---|
| `id` | `String` (snowflake) | Identifiant de la règle |
| `guild_id` | `String` | FK → `guilds.id` |
| `name` | `String` | Nom de la règle |
| `creator_id` | `String` | FK → `users.id` |
| `enabled` | `Boolean` | Règle active |
| `event_type` | `Int` | `1`=message_send |
| `trigger_type` | `Int` | `1`=keyword, `3`=spam, `4`=keyword_preset, `5`=mention_spam |
| `trigger_metadata` | `String` | JSON : `{ keyword_filter, regex_patterns, presets, mention_total_limit }` |
| `actions` | `String` | JSON array : `[{ type, metadata }]` |
| `exempt_roles` | `String` | JSON array d'IDs de rôles exemptés |
| `exempt_channels` | `String` | JSON array d'IDs de canaux exemptés |
| `created_at` | `DateTime` | Date de création |

### Types de triggers

| Valeur | Description |
|---|---|
| `1` (keyword) | Correspondance de mots-clés (liste + regex) |
| `3` (spam) | Détection de spam (messages répétitifs) |
| `4` (keyword_preset) | Listes prédéfinies (grossièretés, insultes, etc.) |
| `5` (mention_spam) | Trop de mentions dans un même message |

### Types d'actions

| Valeur | Description |
|---|---|
| `1` | Bloquer le message |
| `2` | Envoyer une alerte dans un canal de modération |
| `3` | Timeout de l'utilisateur |

**`GET /api/guilds/:guildId/auto-moderation/rules`** — Lister les règles (nécessite `MANAGE_GUILD`)

**`POST /api/guilds/:guildId/auto-moderation/rules`** — Créer une règle

**`PATCH /api/guilds/:guildId/auto-moderation/rules/:ruleId`** — Modifier

**`DELETE /api/guilds/:guildId/auto-moderation/rules/:ruleId`** — Supprimer

---

## 14. Journal d'Audit

### Modèle — Table `audit_logs`

| Champ | Type | Description |
|---|---|---|
| `id` | `String` (snowflake) | Identifiant |
| `guild_id` | `String` | FK → `guilds.id` |
| `user_id` | `String` | FK → `users.id` — responsable de l'action |
| `action_type` | `Int` | Code de l'action (voir tableau ci-dessous) |
| `target_id` | `String?` | ID de la cible (message, canal, utilisateur…) |
| `reason` | `String?` | Raison fournie par le modérateur |
| `changes` | `String?` | JSON array des champs modifiés : `[{ key, old_value, new_value }]` |
| `options` | `String?` | JSON options supplémentaires selon l'action |
| `created_at` | `DateTime` | Date de l'action |

### Types d'actions (sélection)

| Code | Action |
|---|---|
| `1` | Guild Update |
| `10` | Channel Create |
| `11` | Channel Update |
| `12` | Channel Delete |
| `13` | Channel Overwrite Create |
| `20` | Member Kick |
| `21` | Member Prune |
| `22` | Member Ban Add |
| `23` | Member Ban Remove |
| `24` | Member Update |
| `25` | Member Role Update |
| `30` | Role Create |
| `31` | Role Update |
| `32` | Role Delete |
| `40` | Invite Create |
| `42` | Invite Delete |
| `50` | Webhook Create |
| `51` | Webhook Update |
| `52` | Webhook Delete |
| `60` | Emoji Create |
| `62` | Emoji Delete |
| `72` | Message Delete |
| `73` | Message Bulk Delete |
| `74` | Message Pin |
| `75` | Message Unpin |
| `80` | Integration Create |
| `90` | Automod Rule Create |
| `91` | Automod Rule Update |
| `92` | Automod Rule Delete |
| `100` | Thread Create |
| `101` | Thread Update |
| `102` | Thread Delete |

**`GET /api/guilds/:guildId/audit-logs`**

Nécessite `VIEW_AUDIT_LOG`.

**Query params :** `?user_id=&action_type=&before=&limit=50`

**Réponse 200 OK :**

```json
{
  "audit_log_entries": [
    {
      "id": "...",
      "action_type": 20,
      "user_id": "mod_user_id",
      "target_id": "kicked_user_id",
      "reason": "Spam répété",
      "changes": [],
      "options": null,
      "created_at": "..."
    }
  ],
  "users": [ "...objets user des responsables et cibles..." ]
}
```

---

## 15. Sondages (Polls)

Les sondages sont un type de message spécial permettant aux utilisateurs de poser une question avec des options de vote. Les données sont **persistées en base** et survivent aux redémarrages.

### 15.1 Modèle de données

#### Table `polls`

| Champ | Type | Description |
|---|---|---|
| `id` | `String` (snowflake) | Identifiant |
| `message_id` | `String` UNIQUE | FK → `messages.id` |
| `question` | `String` | Texte de la question (max 300 caractères) |
| `allow_multiselect` | `Boolean` | Autoriser le vote sur plusieurs réponses |
| `expires_at` | `DateTime?` | Date d'expiration (null = pas d'expiration) |
| `finalized` | `Boolean` | Sondage terminé (résultats figés) |
| `layout_type` | `Int` | `1`=DEFAULT (seul type en v1) |
| `created_at` | `DateTime` | Date de création |

#### Table `poll_answers`

| Champ | Type | Description |
|---|---|---|
| `id` | `Int` | Identifiant relatif au sondage (1, 2, 3…) |
| `poll_id` | `String` | FK → `polls.id` |
| `text` | `String` | Texte de la réponse (max 55 caractères) |
| `emoji` | `String?` | Emoji optionnel (unicode ou `<:nom:id>`) |

Contrainte : `@@id([poll_id, id])`. Max **10 réponses** par sondage.

#### Table `poll_votes`

| Champ | Type | Description |
|---|---|---|
| `poll_id` | `String` | FK → `polls.id` |
| `answer_id` | `Int` | FK → `poll_answers.id` |
| `user_id` | `String` | FK → `users.id` |
| `created_at` | `DateTime` | Date du vote |

Contrainte : `@@id([poll_id, answer_id, user_id])`.

Si `allow_multiselect = false`, contrainte applicative : un seul vote par `(poll_id, user_id)`.

### 15.2 API

**Créer un message avec sondage : `POST /api/channels/:channelId/messages`**

```json
{
  "poll": {
    "question": {
      "text": "Quel framework préférez-vous ?"
    },
    "answers": [
      { "text": "React", "emoji": "⚛️" },
      { "text": "Vue", "emoji": "💚" },
      { "text": "Svelte", "emoji": "🔥" },
      { "text": "Angular", "emoji": "🅰️" }
    ],
    "allow_multiselect": false,
    "duration": 24,
    "layout_type": 1
  }
}
```

Le champ `duration` est en **heures** (1–168, soit max 7 jours). Si omis, le sondage n'expire pas.

Le message créé a `type = 22` (`POLL`).

**Réponse :** message standard avec un champ `poll` supplémentaire contenant la question, les réponses et les résultats.

**Voter : `PUT /api/channels/:channelId/polls/:messageId/answers/:answerId`**

Ajoute le vote de l'utilisateur. Si `allow_multiselect = false` et que l'utilisateur a déjà voté pour une autre réponse, l'ancien vote est remplacé.

**Réponse 204 No Content**

**Retirer un vote : `DELETE /api/channels/:channelId/polls/:messageId/answers/:answerId`**

**Réponse 204 No Content**

**Clôturer un sondage : `POST /api/channels/:channelId/polls/:messageId/expire`**

Requiert : être le créateur du sondage ou avoir `MANAGE_MESSAGES`.

Met `finalized = true`. Plus aucun vote n'est accepté.

**Obtenir les votants d'une réponse : `GET /api/channels/:channelId/polls/:messageId/answers/:answerId`**

```json
{
  "users": [
    { "id": "...", "username": "alice", "avatar": "..." },
    { "id": "...", "username": "bob", "avatar": "..." }
  ]
}
```

Paginé avec `?after=userId&limit=100`.

### 15.3 Expiration automatique

Un cron job tourne toutes les **30 secondes** et finalise les sondages dont `expires_at <= now AND finalized = false` :

1. `UPDATE polls SET finalized = true WHERE expires_at <= NOW() AND finalized = false`
2. Pour chaque sondage finalisé : émettre `MESSAGE_UPDATE` avec les résultats finaux

### 15.4 Événements Socket.IO

| Événement | Déclencheur | Payload |
|---|---|---|
| `MESSAGE_CREATE` | Nouveau sondage | Message complet avec champ `poll` |
| `MESSAGE_POLL_VOTE_ADD` | Vote ajouté | `{ poll_id, answer_id, user_id, message_id, channel_id, guild_id }` |
| `MESSAGE_POLL_VOTE_REMOVE` | Vote retiré | `{ poll_id, answer_id, user_id, message_id, channel_id, guild_id }` |
| `MESSAGE_UPDATE` | Sondage clôturé | Message avec `poll.finalized = true` et résultats complets |

### 15.5 Représentation d'un sondage dans le payload message

```json
{
  "id": "msg_id",
  "type": 22,
  "content": "",
  "poll": {
    "question": { "text": "Quel framework préférez-vous ?" },
    "answers": [
      { "answer_id": 1, "poll_media": { "text": "React", "emoji": { "name": "⚛️" } } },
      { "answer_id": 2, "poll_media": { "text": "Vue", "emoji": { "name": "💚" } } },
      { "answer_id": 3, "poll_media": { "text": "Svelte", "emoji": { "name": "🔥" } } },
      { "answer_id": 4, "poll_media": { "text": "Angular", "emoji": { "name": "🅰️" } } }
    ],
    "expiry": "2025-01-16T10:00:00.000Z",
    "allow_multiselect": false,
    "results": {
      "is_finalized": false,
      "answer_counts": [
        { "id": 1, "count": 15, "me_voted": true },
        { "id": 2, "count": 8, "me_voted": false },
        { "id": 3, "count": 12, "me_voted": false },
        { "id": 4, "count": 3, "me_voted": false }
      ]
    },
    "layout_type": 1
  }
}
```

### 15.6 Interface

**Création de sondage :**
- Bouton "Sondage" dans la barre d'outils du champ de message (icône barres horizontales)
- Formulaire inline dans le chat :
  - Champ question
  - Liste d'options (min 2, max 10) avec bouton "Ajouter une option"
  - Chaque option : champ texte + sélecteur emoji optionnel + bouton "×" pour supprimer
  - Toggle "Autoriser les votes multiples"
  - Dropdown durée : 1h, 4h, 8h, 24h, 3 jours, 7 jours, Pas d'expiration
  - Bouton "Publier le sondage"

**Affichage du sondage dans le chat :**
- Question affichée en `--header-primary`, bold, taille 16px
- Chaque option est un bouton cliquable (toute la largeur) :
  - Texte + emoji à gauche
  - Barre de progression en fond (couleur `--bg-accent` pour le leader, `--bg-modifier-active` pour les autres)
  - Pourcentage + nombre de votes à droite
  - Option votée par l'utilisateur : bordure `--bg-accent`, coche ✓
- Si `allow_multiselect` : boutons checkbox, sinon radio
- Barre de progression remplie proportionnellement (le max = 100%)
- Footer : "X votes au total" + temps restant ("Expire dans 23h") ou "Sondage terminé"
- Si non finalisé et que l'utilisateur n'a pas voté : les barres ne sont pas visibles, seulement les textes des options (éviter le biais)
- Après avoir voté ou si finalisé : affichage complet des résultats avec barres

**Interactions :**
- Clic sur une option → vote (ou retire le vote si déjà voté)
- Menu "⋯" du message → "Clôturer le sondage" (créateur/mods uniquement)
- Clic sur le nombre de votes d'une option → modale listant les votants

---

## Références croisées

- `00-architecture.md` — Conventions, Socket.IO rooms, stockage fichiers
- `03-servers-channels.md` — Canaux, threads, forums
- `05-roles-permissions.md` — Permissions (`SEND_MESSAGES`, `MANAGE_MESSAGES`, etc.)
- `26-server-insights.md` — Statistiques serveur (messages/jour)
