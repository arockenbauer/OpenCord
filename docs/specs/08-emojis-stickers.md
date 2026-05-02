# Spécification 08 — Emojis, Autocollants & Réactions

## Vue d'ensemble

OpenCord supporte les emojis personnalisés par serveur, les autocollants (stickers) personnalisés, et les réactions sur les messages. Les utilisateurs OpenCord+ peuvent utiliser les emojis et stickers de n'importe quel serveur dont ils sont membres.

---

## 1. Emojis personnalisés

### 1.1 Modèle de données

```
Emoji {
  id              String    @id (snowflake)
  guild_id        String    (référence vers Guild)
  name            String    (alphanumériques et underscores uniquement, ex: "mon_emoji")
  creator_id      String?   (référence vers User — peut être null si créateur a quitté)
  animated        Boolean   @default(false)  (true si GIF animé)
  available       Boolean   @default(true)   (false si désactivé suite à downgrade boost)
  require_colons  Boolean   @default(true)   (toujours true en v1)
  managed         Boolean   @default(false)  (géré par une intégration)
  created_at      DateTime  @default(now())
}
```

**Contraintes :**
- `name` : 2 à 32 caractères, uniquement `[a-zA-Z0-9_]`, unique par guild.
- Taille maximale du fichier : **256 KB**.
- Dimensions maximales : **128 × 128 pixels** (redimensionnement côté serveur si dépassé).
- Formats acceptés : **PNG** (statique), **GIF** (animé).
- Les emojis GIF sont `animated = true` et comptent dans le quota des emojis animés.

---

### 1.2 Limites par tier de boost

| Tier | Emojis statiques | Emojis animés |
|------|-----------------|----------------|
| 0    | 50              | 50             |
| 1    | 100             | 100            |
| 2    | 150             | 150            |
| 3    | 250             | 250            |

Quand un serveur descend de tier (boosts retirés), les emojis en surnombre passent à `available = false`. Ils ne peuvent plus être utilisés dans de nouveaux messages mais restent visible dans les anciens messages.

---

### 1.3 Endpoints

#### `POST /api/guilds/:guildId/emojis` — Créer un emoji

**Requiert :** `MANAGE_EMOJIS_AND_STICKERS`

**Corps de la requête (multipart/form-data) :**
```
name      : "mon_emoji"
image     : <fichier PNG ou GIF, max 256KB, max 128x128>
roles[]   : (optionnel) IDs de rôles pouvant utiliser cet emoji
```

**Corps en JSON (alternative, image en base64) :**
```json
{
  "name": "mon_emoji",
  "image": "data:image/png;base64,iVBORw0KGgo...",
  "roles": []
}
```

**Réponse 201 :**
```json
{
  "id": "1234567890123456789",
  "name": "mon_emoji",
  "animated": false,
  "available": true,
  "require_colons": true,
  "managed": false,
  "creator": {
    "id": "1111111111111111111",
    "username": "alice",
    "avatar": "abc123"
  },
  "roles": [],
  "created_at": "2025-01-01T00:00:00.000Z"
}
```

**Erreurs :**
- `403` si `MANAGE_EMOJIS_AND_STICKERS` manquant.
- `400` si le nom est invalide (caractères non autorisés, trop court/long).
- `400` si le fichier dépasse 256KB ou le format est invalide.
- `400` si le quota d'emojis du tier est atteint.
- `409` si un emoji avec ce nom existe déjà dans la guild.

---

#### `GET /api/guilds/:guildId/emojis` — Lister les emojis d'un serveur

**Authentification requise** (être membre de la guild)

**Réponse 200 :**
```json
[
  {
    "id": "1234567890123456789",
    "name": "mon_emoji",
    "animated": false,
    "available": true,
    "require_colons": true,
    "managed": false,
    "creator": {
      "id": "1111111111111111111",
      "username": "alice",
      "avatar": "abc123"
    },
    "roles": [],
    "created_at": "2025-01-01T00:00:00.000Z"
  }
]
```

---

#### `GET /api/guilds/:guildId/emojis/:emojiId` — Obtenir un emoji spécifique

**Réponse 200 :** objet Emoji (même format)

---

#### `PATCH /api/guilds/:guildId/emojis/:emojiId` — Renommer un emoji

**Requiert :** `MANAGE_EMOJIS_AND_STICKERS`

**Corps de la requête :**
```json
{
  "name": "nouveau_nom",
  "roles": ["222333444555666777"]
}
```

**Réponse 200 :** objet Emoji mis à jour

**Note :** L'image elle-même ne peut pas être modifiée. Supprimer et recréer l'emoji si nécessaire.

---

#### `DELETE /api/guilds/:guildId/emojis/:emojiId` — Supprimer un emoji

**Requiert :** `MANAGE_EMOJIS_AND_STICKERS`

**Réponse 204** (pas de corps)

**Comportement :**
- L'emoji est supprimé de la base.
- Les messages contenant cet emoji afficheront `:nom_emoji:` en texte brut.
- Entrée `EMOJI_DELETE` créée dans l'audit log.

---

### 1.4 Utilisation des emojis dans les messages

**Syntaxe dans le contenu d'un message :**
- Emoji statique : `<:nom_emoji:1234567890123456789>`
- Emoji animé : `<a:nom_emoji:1234567890123456789>`
- Emoji unicode standard : directement dans le texte (ex: `😀`)

**Saisie par l'utilisateur :**
- `:nom_emoji:` → autocomplétion côté client → converti en `<:nom_emoji:id>` à l'envoi.
- Seuls les emojis `available = true` apparaissent dans l'autocomplétion.

**Règles d'utilisation cross-serveur :**
- Par défaut : un emoji ne peut être utilisé que dans le serveur où il a été créé.
- **OpenCord+** : peut utiliser les emojis de n'importe quel serveur dont il est membre, dans n'importe quel salon (guild ou DM).
- Vérification backend : si l'emoji appartient à une autre guild que celle du salon, vérifier que l'auteur a `user.premium = true` ET est membre de la guild propriétaire de l'emoji.

---

### 1.5 Sélecteur d'emojis (Emoji Picker — côté client)

Interface accessible via le bouton 😊 dans la zone de saisie.

**Structure du sélecteur :**
- Barre de recherche en haut (recherche par nom).
- **Section "Récemment utilisés"** : les 24 derniers emojis utilisés, stockés en `localStorage`.
- **Section "Emojis du serveur"** (si dans un salon de guild) :
  - Un onglet par serveur dont l'utilisateur est membre (icône du serveur en miniature).
  - Si OpenCord+ : afficher les emojis de **tous** les serveurs.
  - Sinon : afficher uniquement les emojis de la guild courante.
  - Chaque emoji affiché en grille 36×36px avec tooltip du nom au survol.
- **Section "Emojis Unicode"** par catégories standard :
  - Smileys & Émotions, Personnes & Corps, Animaux & Nature, Nourriture & Boissons, Voyages & Lieux, Activités, Objets, Symboles, Drapeaux.

---

## 2. Autocollants (Stickers)

### 2.1 Modèle de données

```
Sticker {
  id            String    @id (snowflake)
  guild_id      String?   (null pour stickers système OpenCord)
  name          String    (2 à 30 caractères)
  description   String?   (max 100 caractères)
  tags          String    (mots-clés séparés par virgule, max 200 chars total)
  format_type   Int       (voir enum)
  asset         String    (chemin du fichier stocké, ex: "/uploads/stickers/id.png")
  available     Boolean   @default(true)
  sort_value    Int       @default(0)
  creator_id    String?   (référence vers User)
  created_at    DateTime  @default(now())
}
```

**Enum `format_type` :**
| Valeur | Nom     | Extension |
|--------|---------|-----------|
| `1`    | `PNG`   | `.png`    |
| `2`    | `APNG`  | `.png` (animé) |
| `3`    | `LOTTIE`| `.json` (animation vectorielle) |
| `4`    | `GIF`   | `.gif`    |

**En v1 :** seuls `PNG` et `GIF` sont supportés. `APNG` et `LOTTIE` sont réservés pour v2.

**Contraintes :**
- Taille maximale : **512 KB**.
- Dimensions recommandées : **320 × 320 pixels**.
- Le champ `tags` est utilisé pour la recherche dans le sélecteur (ex: `"content,happy,smile"`).

---

### 2.2 Limites par tier de boost

| Tier | Nombre de stickers |
|------|--------------------|
| 0    | 5                  |
| 1    | 15                 |
| 2    | 30                 |
| 3    | 60                 |

---

### 2.3 Endpoints

#### `POST /api/guilds/:guildId/stickers` — Créer un autocollant

**Requiert :** `MANAGE_EMOJIS_AND_STICKERS`

**Corps de la requête (multipart/form-data) :**
```
name        : "mon_sticker"
description : "Un sticker rigolo"
tags        : "drôle,content,sourire"
file        : <fichier PNG ou GIF, max 512KB>
```

**Réponse 201 :**
```json
{
  "id": "9876543210987654321",
  "guild_id": "5555555555555555555",
  "name": "mon_sticker",
  "description": "Un sticker rigolo",
  "tags": "drôle,content,sourire",
  "format_type": 1,
  "asset": "/uploads/stickers/9876543210987654321.png",
  "available": true,
  "sort_value": 0,
  "creator": {
    "id": "1111111111111111111",
    "username": "alice",
    "avatar": "abc123"
  },
  "created_at": "2025-01-01T00:00:00.000Z"
}
```

**Erreurs :**
- `403` si `MANAGE_EMOJIS_AND_STICKERS` manquant.
- `400` si le fichier dépasse 512KB.
- `400` si le nom est trop court/long.
- `400` si le quota du tier est atteint.

---

#### `GET /api/guilds/:guildId/stickers` — Lister les stickers d'un serveur

**Réponse 200 :**
```json
[
  {
    "id": "9876543210987654321",
    "name": "mon_sticker",
    "description": "Un sticker rigolo",
    "tags": "drôle,content,sourire",
    "format_type": 1,
    "asset": "/uploads/stickers/9876543210987654321.png",
    "available": true,
    "sort_value": 0
  }
]
```

---

#### `GET /api/guilds/:guildId/stickers/:stickerId` — Obtenir un sticker spécifique

**Réponse 200 :** objet Sticker complet

---

#### `PATCH /api/guilds/:guildId/stickers/:stickerId` — Modifier un sticker

**Requiert :** `MANAGE_EMOJIS_AND_STICKERS`

**Corps de la requête (champs optionnels) :**
```json
{
  "name": "nouveau_nom",
  "description": "Nouvelle description",
  "tags": "nouveau,tags,ici"
}
```

**Réponse 200 :** objet Sticker mis à jour

**Note :** le fichier asset ne peut pas être modifié. Supprimer et recréer si nécessaire.

---

#### `DELETE /api/guilds/:guildId/stickers/:stickerId` — Supprimer un sticker

**Requiert :** `MANAGE_EMOJIS_AND_STICKERS`

**Réponse 204** (pas de corps)

**Comportement :**
- Le fichier physique est supprimé du stockage.
- Les messages contenant ce sticker affichent un placeholder "Sticker indisponible".
- Entrée `STICKER_DELETE` dans l'audit log.

---

### 2.4 Envoi d'un sticker dans un message

**Corps de la requête `POST /api/channels/:channelId/messages` :**
```json
{
  "content": "",
  "sticker_ids": ["9876543210987654321"]
}
```

**Règles :**
- Maximum **1 sticker** par message (limitation v1 — Discord autorise 3).
- Un message avec sticker peut aussi avoir du contenu textuel.
- Un message avec sticker peut aussi avoir des pièces jointes.
- Vérification cross-serveur identique aux emojis (OpenCord+ requis pour utiliser hors guild propriétaire).
- Le sticker doit avoir `available = true`.

**Représentation du sticker dans l'objet message :**
```json
{
  "id": "...",
  "content": "",
  "sticker_items": [
    {
      "id": "9876543210987654321",
      "name": "mon_sticker",
      "format_type": 1
    }
  ],
  "stickers": [
    {
      "id": "9876543210987654321",
      "name": "mon_sticker",
      "format_type": 1,
      "asset": "/uploads/stickers/9876543210987654321.png",
      "description": "Un sticker rigolo"
    }
  ]
}
```

---

### 2.5 Sélecteur de stickers (côté client)

Accessible via le bouton autocollant 🏷️ dans la zone de saisie.

**Structure :**
- Barre de recherche (par nom ou tag).
- **Onglet par serveur** dont l'utilisateur est membre (si des stickers existent).
  - Si OpenCord+ : tous les serveurs.
  - Sinon : uniquement le serveur courant.
- Chaque sticker affiché en grille avec preview et tooltip du nom.

---

## 3. Réactions

### 3.1 Modèle de données

```
Reaction {
  message_id   String    (référence vers Message)
  emoji_id     String?   (null pour emoji unicode)
  emoji_name   String    (nom de l'emoji ou caractère unicode)
  animated     Boolean   @default(false)
  count        Int       @default(1)
  @@unique([message_id, emoji_id, emoji_name])
}

ReactionUser {
  message_id   String
  emoji_id     String?
  emoji_name   String
  user_id      String
  created_at   DateTime @default(now())
  @@id([message_id, emoji_id, emoji_name, user_id])
}
```

**Note architecturale :** Le champ `count` dans `Reaction` est dénormalisé pour la performance. Il est incrémenté/décrémenté à chaque ajout/retrait de réaction. En cas de désynchronisation, recalculer depuis `ReactionUser`.

---

### 3.2 Endpoints

#### `PUT /api/channels/:channelId/messages/:messageId/reactions/:emoji/@me` — Ajouter une réaction

**Format de `:emoji` :**
- Emoji unicode : encodé en URL (ex: `%F0%9F%91%8D` pour 👍).
- Emoji personnalisé : `nom_emoji:id` (ex: `mon_emoji:1234567890123456789`).

**Requiert :** `ADD_REACTIONS` + `READ_MESSAGE_HISTORY`

**Réponse 204** (pas de corps)

**Erreurs :**
- `403` si `ADD_REACTIONS` manquant.
- `400` si l'emoji n'existe pas ou n'est pas disponible.
- `400` si l'utilisateur a déjà réagi avec cet emoji.
- `400` avec `MAX_REACTIONS_REACHED` si le message a déjà 20 emojis distincts.

---

#### `DELETE /api/channels/:channelId/messages/:messageId/reactions/:emoji/@me` — Retirer sa réaction

**Réponse 204** (pas de corps)

---

#### `DELETE /api/channels/:channelId/messages/:messageId/reactions/:emoji/:userId` — Retirer la réaction d'un autre utilisateur

**Requiert :** `MANAGE_MESSAGES`

**Réponse 204** (pas de corps)

---

#### `DELETE /api/channels/:channelId/messages/:messageId/reactions/:emoji` — Supprimer toutes les réactions d'un emoji

**Requiert :** `MANAGE_MESSAGES`

**Réponse 204** (pas de corps)

---

#### `DELETE /api/channels/:channelId/messages/:messageId/reactions` — Supprimer toutes les réactions

**Requiert :** `MANAGE_MESSAGES`

**Réponse 204** (pas de corps)

---

#### `GET /api/channels/:channelId/messages/:messageId/reactions/:emoji` — Lister les utilisateurs d'une réaction

**Paramètres de requête :**
```
?limit=25     (défaut: 25, max: 100)
?after=userId (pagination)
?type=0       (0 = réaction normale, 1 = super réaction — v2)
```

**Réponse 200 :**
```json
[
  {
    "id": "1111111111111111111",
    "username": "alice",
    "avatar": "abc123",
    "global_name": "Alice"
  },
  {
    "id": "2222222222222222222",
    "username": "bob",
    "avatar": "def456",
    "global_name": "Bob"
  }
]
```

---

### 3.3 Représentation des réactions dans un message

Les réactions sont incluses dans l'objet message :

```json
{
  "id": "...",
  "content": "Hello !",
  "reactions": [
    {
      "emoji": { "id": null, "name": "👍" },
      "count": 5,
      "me": true,
      "me_burst": false,
      "count_details": { "normal": 5, "burst": 0 }
    },
    {
      "emoji": {
        "id": "1234567890123456789",
        "name": "mon_emoji",
        "animated": false
      },
      "count": 2,
      "me": false,
      "me_burst": false,
      "count_details": { "normal": 2, "burst": 0 }
    }
  ]
}
```

---

### 3.4 Interface d'affichage des réactions

**Rendu sous un message :**
- Chaque réaction affichée comme une "pilule" : image de l'emoji + nombre.
- Pilule mise en évidence (fond coloré) si `me = true` (l'utilisateur connecté a réagi).
- Clic sur une pilule existante : toggle (ajouter/retirer sa réaction).
- Clic sur le bouton ➕ : ouvre l'emoji picker filtré pour les réactions.

**Tooltip au survol d'une réaction :**
- Affiche les noms des 3 premiers utilisateurs ayant réagi.
- Si plus de 3 : "Alice, Bob, Charlie et X autres ont réagi avec [emoji]".
- Si `me = true` : "Toi, Alice et X autres" ou "Toi et X autres".

---

### 3.5 Super Réactions (OpenCord+ — v2, non implémenté en v1)

Les super réactions sont une version améliorée des réactions, réservée aux abonnés OpenCord+.

**Description pour v2 :**
- Animation spéciale (explosion de particules) lors de l'envoi.
- Indépendantes des réactions normales (compteur séparé).
- L'expéditeur reçoit une notification spéciale.
- Coût : 2 "burst crédits" par super réaction (rechargement quotidien).
- Déclenchement : maintenir le bouton de réaction appuyé → sélecteur de super réaction.
- Représentation dans le message : pilule avec contour doré.

---

## 4. Événements Socket.IO liés aux emojis, stickers et réactions

| Événement                    | Déclencheur | Destinataires | Payload |
|------------------------------|-------------|---------------|---------|
| `GUILD_EMOJIS_UPDATE`        | Emoji créé, renommé, supprimé | Membres de la guild | `{ guild_id, emojis: [...] }` |
| `GUILD_STICKERS_UPDATE`      | Sticker créé, modifié, supprimé | Membres de la guild | `{ guild_id, stickers: [...] }` |
| `MESSAGE_REACTION_ADD`       | Réaction ajoutée | Membres ayant accès au salon | `{ user_id, channel_id, message_id, guild_id?, emoji }` |
| `MESSAGE_REACTION_REMOVE`    | Réaction retirée | Membres ayant accès au salon | `{ user_id, channel_id, message_id, guild_id?, emoji }` |
| `MESSAGE_REACTION_REMOVE_ALL`| Toutes les réactions supprimées | Membres ayant accès au salon | `{ channel_id, message_id, guild_id? }` |
| `MESSAGE_REACTION_REMOVE_EMOJI` | Toutes les réactions d'un emoji supprimées | Membres ayant accès au salon | `{ channel_id, message_id, guild_id?, emoji }` |

---

## 5. Interface (Paramètres du serveur)

### 5.1 Page "Emoji"

Accessible via Paramètres du serveur → Emoji.

**Contenu :**
- Compteurs en haut : "X / Y emojis statiques utilisés" + "X / Y emojis animés utilisés" (avec barre de progression).
- Bouton "Importer un emoji" en haut à droite.
- **Tableau des emojis :**
  - Colonne Aperçu (image 32×32).
  - Colonne Nom (modifiable en cliquant).
  - Colonne Ajouté par (avatar + nom du créateur).
  - Colonne Date d'ajout.
  - Colonne Actions : bouton crayon (renommer) + bouton corbeille (supprimer).
- Barre de recherche par nom.
- Filtre : Tous / Statiques / Animés.

**Modale "Importer un emoji" :**
- Zone de drop de fichier ou bouton "Parcourir".
- Champ de saisie du nom (pré-rempli avec le nom du fichier sans extension).
- Aperçu de l'emoji.
- Bouton "Enregistrer".

---

### 5.2 Page "Autocollants"

Accessible via Paramètres du serveur → Autocollants.

**Contenu :**
- Compteur : "X / Y autocollants utilisés".
- Bouton "Importer un autocollant" en haut à droite.
- **Grille d'autocollants :**
  - Aperçu carré 80×80px.
  - Nom sous l'aperçu.
  - Description au survol.
  - Bouton de suppression en superposition au survol.
- Clic sur un autocollant → modale d'édition (nom, description, tags).

**Modale "Importer un autocollant" :**
- Zone de drop de fichier (PNG ou GIF).
- Champ "Nom" (obligatoire).
- Champ "Description" (optionnel).
- Champ "Tags" (mots-clés séparés par virgule, pour la recherche).
- Aperçu du sticker.
- Bouton "Enregistrer".

---

## 6. Stockage des fichiers

**Emojis :**
- Chemin : `/uploads/emojis/{guild_id}/{emoji_id}.{ext}`
- Servis par le backend via route statique.
- L'URL publique retournée dans les APIs est relative (ex: `/uploads/emojis/guild123/emoji456.png`).

**Stickers :**
- Chemin : `/uploads/stickers/{guild_id}/{sticker_id}.{ext}`
- Même logique de service statique.

**Validation :**
- Vérification du magic bytes du fichier (pas seulement l'extension).
- Redimensionnement automatique si dimensions > 128×128 (emojis) ou > 320×320 (stickers).
- Compression PNG sans perte si possible.

---

## 7. Cas limites et règles métier

- Un emoji ou sticker `available = false` (suite au downgrade de boost) n'est plus proposé dans les sélecteurs mais reste visible dans l'historique des messages.
- La suppression d'un emoji n'est pas réversible. Les références dans les anciens messages s'affichent en texte brut (`:nom_emoji:`).
- Si un utilisateur OpenCord+ perd son abonnement, ses messages contenant des emojis cross-serveur restent affichés mais il ne peut plus en envoyer de nouveaux.
- Les emojis `managed = true` (créés par des intégrations) ne peuvent pas être supprimés manuellement.
- Maximum 20 emojis distincts par message (réactions).
- Maximum 1 sticker par message en v1.
- La recherche dans le sélecteur d'emojis fonctionne sur le nom de l'emoji. La recherche dans le sélecteur de stickers fonctionne sur le nom ET les tags.
