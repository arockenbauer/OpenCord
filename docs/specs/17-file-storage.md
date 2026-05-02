# Spécification 17 — Stockage de Fichiers Local

## Vue d'ensemble

OpenCord utilise un système de stockage de fichiers **entièrement local**, sans service externe (pas de S3, pas de Cloudinary, pas de CDN tiers). Tous les fichiers uploadés sont stockés sur le système de fichiers du serveur et servis directement via Express.

---

## 1. Configuration

### 1.1 Variable d'environnement

```env
UPLOAD_DIR=./uploads
MAX_FILE_SIZE_AVATAR=8388608         # 8 MB
MAX_FILE_SIZE_AVATAR_PREMIUM=10485760 # 10 MB (OpenCord+)
MAX_FILE_SIZE_ATTACHMENT=8388608      # 8 MB
MAX_FILE_SIZE_ATTACHMENT_PREMIUM=26214400 # 25 MB (OpenCord+)
MAX_FILE_SIZE_EMOJI=262144            # 256 KB
MAX_FILE_SIZE_STICKER=524288          # 512 KB
MAX_FILE_SIZE_GUILD_ICON=8388608      # 8 MB
MAX_FILE_SIZE_GUILD_BANNER=8388608    # 8 MB
STORAGE_LIMIT_PER_GUILD=5368709120   # 5 GB
STORAGE_ALERT_THRESHOLD=0.9          # Alerte à 90% de la limite
```

Le chemin `UPLOAD_DIR` est résolu relativement à la racine de `packages/server/`.

---

## 2. Structure des Répertoires

```
packages/server/uploads/
├── avatars/
│   └── {userId}/
│       ├── {hash}_128.webp
│       ├── {hash}_256.webp
│       ├── {hash}_512.webp
│       └── {hash}_1024.webp
├── banners/
│   └── {userId}/
│       └── {hash}.webp
├── guild-icons/
│   └── {guildId}/
│       ├── {hash}_128.webp
│       └── {hash}_256.webp
├── guild-banners/
│   └── {guildId}/
│       └── {hash}.webp
├── guild-splashes/
│   └── {guildId}/
│       └── {hash}.webp
├── attachments/
│   └── {channelId}/
│       └── {messageId}/
│           ├── {uuid}_{sanitizedOriginalName}
│           └── {uuid}_{sanitizedOriginalName}_thumb.webp  ← pour les images
├── emojis/
│   └── {guildId}/
│       └── {emojiId}.{ext}
├── stickers/
│   └── {guildId}/
│       └── {stickerId}.{ext}
├── badges/
│   └── {badgeId}.{ext}
└── plugins/
    └── {pluginSlug}.{ext}
```

### 2.1 Convention de nommage

- **Hash** : MD5 ou SHA1 du contenu du fichier (hex, 16 caractères), utilisé pour éviter les doublons et comme identifiant unique de version
- **UUID** : UUID v4 généré aléatoirement pour les pièces jointes (le nom original est conservé en base de données, pas dans le nom de fichier stocké)
- **Taille suffix** : `_128`, `_256`, `_512`, `_1024` pour les variantes redimensionnées
- **Nom original sanitisé** : seuls les caractères alphanumériques, tirets, underscores et points sont conservés ; longueur max 64 caractères

---

## 3. Service de Fichiers (Express Static)

### 3.1 Route de service

```
GET /files/*  →  packages/server/uploads/*
```

Express sert le dossier `uploads/` sous le préfixe `/files/`. Les URLs retournées dans l'API ont la forme :

```
/files/avatars/{userId}/{hash}_128.webp
/files/guild-icons/{guildId}/{hash}_128.webp
/files/attachments/{channelId}/{messageId}/{uuid}_{name}.pdf
```

### 3.2 En-têtes HTTP pour les fichiers servis

- **Fichiers avec hash dans le nom** (avatars, icônes) : `Cache-Control: public, max-age=31536000, immutable`
  - Le hash change à chaque mise à jour → l'URL change → pas de problème de cache
- **Pièces jointes** :
  - Images : `Cache-Control: public, max-age=3600`
  - Fichiers non-image : `Cache-Control: private, no-cache` + `Content-Disposition: attachment; filename="nom_original.ext"`
- **Emojis / stickers** : `Cache-Control: public, max-age=86400`

### 3.3 Sécurité des fichiers servis

- Le chemin est normalisé avant de servir pour prévenir les traversées de répertoires (`path.resolve` + vérification que le chemin résolu commence bien par le dossier `uploads/`)
- Les fichiers sont servis avec `X-Content-Type-Options: nosniff`
- Les fichiers non-image sont servis avec `Content-Disposition: attachment` pour éviter l'exécution dans le navigateur

---

## 4. Gestion des Uploads (Middleware Multer)

### 4.1 Configuration multer

- **Moteur de stockage** : `diskStorage` (stockage direct sur disque, pas en mémoire)
- **Destination** : déterminée dynamiquement selon le type d'upload (route courante)
- **Nom de fichier** : généré par l'application (UUID ou hash), pas par multer directement
- **Encoding** : `multipart/form-data`

### 4.2 Tailles maximales par type de fichier

| Type | Limite standard | Limite OpenCord+ |
|---|---|---|
| Avatar utilisateur | 8 MB | 10 MB |
| Bannière utilisateur | 8 MB | 10 MB |
| Pièce jointe (message) | 8 MB | 25 MB |
| Emoji personnalisé | 256 KB | 256 KB |
| Autocollant | 512 KB | 512 KB |
| Icône de serveur | 8 MB | 8 MB |
| Bannière de serveur | 8 MB | 8 MB |
| Son de soundboard | 512 KB | 512 KB |

La limite effective est choisie dynamiquement dans le middleware selon le statut premium de l'utilisateur.

### 4.3 Types MIME autorisés

#### Images (avatars, bannières, icônes, emojis)
- `image/png`
- `image/jpeg`
- `image/gif`
- `image/webp`

#### Autocollants (stickers)
- Tous les types image ci-dessus
- `image/apng` (PNG animé)
- `application/json` (format Lottie pour animations vectorielles)

#### Pièces jointes (attachments)
Whitelist extensible :
- Toutes les images (PNG, JPEG, GIF, WebP)
- `video/mp4`
- `video/webm`
- `audio/mpeg` (MP3)
- `audio/ogg`
- `audio/wav`
- `application/pdf`
- `text/plain`
- `application/zip`
- `application/x-zip-compressed`

#### Sons de soundboard
- `audio/mpeg` (MP3)
- `audio/ogg`
- `audio/wav`

### 4.4 Processus de validation d'un upload

1. **Vérification de la taille** : multer reject si dépassement avant traitement
2. **Vérification du type MIME déclaré** : le `Content-Type` doit être dans la whitelist
3. **Vérification des magic bytes** : lecture des premiers octets du fichier via la bibliothèque `file-type` pour confirmer le type réel, indépendamment de ce que le client déclare
4. **Sanitisation du nom original** : suppression des caractères dangereux, troncation à 255 caractères — le nom sanitisé est conservé en base de données
5. **Génération du nom de stockage** : UUID v4 pour les pièces jointes, hash du contenu pour les assets redimensionnés
6. **Création du répertoire de destination** si inexistant (`fs.mkdirSync(..., { recursive: true })`)
7. **Traitement par sharp** si applicable (voir section 5)
8. **Écriture du fichier** sur disque
9. **Insertion en base de données** du record associé

En cas d'échec à n'importe quelle étape : retour 400/413/415 selon l'erreur, suppression du fichier temporaire si déjà écrit.

---

## 5. Traitement des Images (sharp)

La bibliothèque **sharp** est utilisée pour le redimensionnement et la conversion de format. sharp est installé en dépendance du package `server`.

### 5.1 Avatars utilisateur

- Génération de **4 variantes statiques** : 128×128, 256×256, 512×512, 1024×1024 px en WebP (qualité 85)
- Redimensionnement avec `cover` (recadrage centré) pour maintenir le ratio carré
- **Pour les GIF animés** (tous les utilisateurs peuvent uploader des GIF) :
  - Extraction de la première frame → génération des 4 variantes WebP statiques
  - Conservation du GIF original comme `{hash}_animated.gif` (non redimensionné, ou redimensionné à 256×256 max si trop grand)
  - Le flag `user.avatar_animated = true` est enregistré en base
  - La version servie dépend du statut premium : animée si `user.premium = true` ET `PlatformSettings.premium.animated_avatar_enabled = true`, statique sinon
- **Restauration automatique** : quand un utilisateur perd puis retrouve le premium, la version animée est restaurée automatiquement (si l'avatar n'a pas changé entre-temps, comparaison via `avatar_updated_at` vs `premium_lost_at`)
- Toutes les variantes sont stockées dans `uploads/avatars/{userId}/`

### 5.2 Bannières utilisateur

- Redimensionnement à max **600×240** px (ratio 2.5:1), conversion WebP qualité 85
- `fit: 'inside'` (pas de recadrage, pas d'agrandissement)
- Version statique : `{hash}.webp`
- **Pour les GIF animés** : même logique que les avatars (voir 5.1) :
  - Première frame → WebP statique 600×240
  - GIF original conservé comme `{hash}_animated.gif`
  - `user.banner_animated = true`
  - Version servie selon statut premium et `PlatformSettings.premium.animated_banner_enabled`

### 5.3 Icônes de serveur

- Variantes : 128×128 et 256×256 px
- Conversion WebP qualité 85, cover centré
- Stockées dans `uploads/guild-icons/{guildId}/`

### 5.4 Bannières de serveur

- Redimensionnement à max **960×540** px (ratio 16:9), conversion WebP qualité 85
- `fit: 'inside'`

### 5.5 Splashs d'invitation de serveur

- Redimensionnement à max **960×540** px, conversion WebP qualité 85

### 5.6 Emojis personnalisés

- Si les dimensions sont supérieures à 128×128 : redimensionnement à 128×128 (cover)
- Conservation du format original (PNG, GIF, WebP)
- Validation que les dimensions d'origine sont au minimum 16×16 px

### 5.7 Autocollants (stickers)

- Redimensionnement à max **320×320** px, `fit: 'inside'`
- Format Lottie (JSON) : pas de traitement par sharp, simple validation de la structure JSON

### 5.8 Miniatures (thumbnails) des pièces jointes image

- Pour chaque pièce jointe image, génération d'une miniature de **400px de large** (hauteur proportionnelle)
- Conversion WebP qualité 70
- Nommée `{uuid}_{sanitizedName}_thumb.webp`, stockée dans le même répertoire que la pièce jointe
- L'URL de la miniature est incluse dans la réponse API avec la pièce jointe

### 5.9 Métadonnées extraites lors du traitement

Pour les images, sharp extrait et stocke en base de données :
- `width` et `height` (dimensions originales)
- `size` (taille en octets)
- `mimeType` (type MIME vérifié)

---

## 6. Modèles de Données Associés

### 6.1 Attachment (pièce jointe de message)

```
Attachment {
  id         : String  (CUID)
  messageId  : String
  filename   : String  (nom original sanitisé, affiché à l'utilisateur)
  storagePath: String  (chemin relatif depuis uploads/, interne)
  url        : String  (URL publique ex: /files/attachments/...)
  mimeType   : String
  size       : Int     (en octets)
  width      : Int?    (si image)
  height     : Int?    (si image)
  thumbnailUrl: String? (si image)
  createdAt  : DateTime
  deletedAt  : DateTime? (soft delete)
}
```

### 6.2 UserAvatar (enregistrement d'avatar)

L'URL courante de l'avatar est stockée directement sur le modèle `User`. La version servie (statique ou animée) est résolue dynamiquement :

```
User {
  ...
  avatarUrl          : String?  (/files/avatars/{userId}/{hash}_128.webp — URL statique de base)
  avatarHash         : String?  (pour invalider les caches)
  avatar_animated    : Boolean  (true si un {hash}_animated.gif existe)
  avatar_updated_at  : DateTime (pour la logique de restauration premium)
  bannerUrl          : String?
  bannerHash         : String?
  banner_animated    : Boolean  (true si un {hash}_animated.gif existe)
  banner_updated_at  : DateTime
  premium_lost_at    : DateTime? (date de dernière perte du premium)
}
```

**Résolution d'URL dynamique :** Le backend ne stocke pas l'URL finale en base — il la calcule lors de la sérialisation du User :
- Si `avatar_animated = true` ET `user.premium = true` ET `PlatformSettings.premium.animated_avatar_enabled` → `/files/avatars/{userId}/{hash}_animated.gif`
- Sinon → `/files/avatars/{userId}/{hash}_128.webp`

L'avatar précédent (y compris sa version animée) est supprimé lors du changement (voir section 7).

### 6.3 Guild (icône et bannière)

```
Guild {
  ...
  iconUrl    : String?
  iconHash   : String?
  bannerUrl  : String?
  bannerHash : String?
  splashUrl  : String?
}
```

---

## 7. Nettoyage des Fichiers

### 7.1 Changement d'avatar / bannière / icône

Lors du remplacement d'un avatar (ou bannière ou icône de serveur) :
1. Nouveau fichier traité et écrit sur disque (versions statique + animée si GIF)
2. Base de données mise à jour avec le nouveau hash/URL, `avatar_animated` / `banner_animated`, et `avatar_updated_at` / `banner_updated_at`
3. Ancien fichier **supprimé immédiatement** (toutes les variantes de taille, **y compris l'ancienne version `_animated.gif`**)

### 7.2 Suppression de message avec pièces jointes

Les pièces jointes d'un message supprimé ne sont **pas supprimées immédiatement** pour éviter les surcharges et permettre un éventuel audit.
- Le champ `deletedAt` est renseigné (soft delete)
- Un **job de nettoyage périodique** (toutes les 24 heures) supprime les fichiers physiques dont `deletedAt` date de plus de 48 heures

### 7.3 Suppression d'emoji / autocollant

Les fichiers d'emoji et d'autocollant sont **supprimés immédiatement** lors de la suppression de la ressource en base.

### 7.4 Script de nettoyage des orphelins

Un script utilitaire `packages/server/scripts/cleanup-orphans.ts` peut être lancé manuellement par l'administrateur. Il :
1. Liste tous les fichiers présents dans `uploads/`
2. Compare avec les enregistrements en base de données
3. Identifie les fichiers non référencés (orphelins)
4. Propose un rapport avec taille totale récupérable
5. Supprime les orphelins si confirmé (`--dry-run` par défaut, `--confirm` pour exécuter)

---

## 8. Endpoints API d'Upload

### 8.1 Avatar utilisateur

```
PATCH /api/users/@me/avatar
Content-Type: multipart/form-data
Body: { avatar: File }
Response 200: { avatarUrl: "/files/avatars/{userId}/{hash}_128.webp" }
```

### 8.2 Bannière utilisateur

```
PATCH /api/users/@me/banner
Content-Type: multipart/form-data
Body: { banner: File }
Response 200: { bannerUrl: "/files/banners/{userId}/{hash}.webp" }
```

### 8.3 Pièce jointe (message)

Intégrée dans la création de message :

```
POST /api/channels/:channelId/messages
Content-Type: multipart/form-data
Body: {
  content: String (optionnel si fichier présent),
  files[]: File[] (max 10 fichiers)
}
Response 200: Message object avec attachments[]
```

### 8.4 Emoji personnalisé

```
POST /api/guilds/:guildId/emojis
Content-Type: multipart/form-data
Body: { name: String, image: File }
Response 201: Emoji object
```

### 8.5 Autocollant (sticker)

```
POST /api/guilds/:guildId/stickers
Content-Type: multipart/form-data
Body: { name: String, description: String, tags: String, file: File }
Response 201: Sticker object
```

### 8.6 Icône de serveur

Intégrée dans la modification du serveur :

```
PATCH /api/guilds/:guildId
Content-Type: multipart/form-data
Body: { name?: String, icon?: File, banner?: File, splash?: File, ... }
Response 200: Guild object mis à jour
```

---

## 9. Limites de Stockage

### 9.1 Par serveur (guild)

- Limite totale : **5 GB** de pièces jointes par serveur (configurable via `STORAGE_LIMIT_PER_GUILD` dans `.env`)
- La limite est calculée comme la somme des `size` de tous les `Attachment` dont `deletedAt IS NULL` liés aux canaux du serveur
- Avant tout upload de pièce jointe, vérifier que `taille_actuelle + taille_fichier <= limite`
- Si dépassement : erreur 507 Insufficient Storage avec message explicite

### 9.2 Avatars utilisateur

- Seule la version courante est conservée (l'ancienne est supprimée au changement)
- Pas de limite de stockage individuelle pour les avatars

### 9.3 Monitoring du stockage (panel admin)

Un endpoint réservé aux administrateurs retourne les statistiques de stockage :

```
GET /api/admin/storage/stats
Response: {
  totalUsedBytes: number,
  breakdown: {
    attachments: number,
    avatars: number,
    guildsMedia: number,
    emojis: number,
    stickers: number
  },
  topGuildsByStorage: Array<{ guildId, guildName, usedBytes }>,
  limitBytes: number,
  usagePercent: number
}
```

Une alerte est loggée côté serveur (et optionnellement notifiée aux admins via un webhook configurable) lorsque `usagePercent >= STORAGE_ALERT_THRESHOLD`.

---

## 10. Configuration `.env` complète liée au stockage

> **Note :** Ces valeurs `.env` servent de **fallback initial**. Une fois qu'un paramètre est défini dans `PlatformSettings` (via le panneau admin), la valeur en base a priorité. Voir spec `09-premium-boosts.md` section 1.2 PlatformSettings.

```env
# Répertoire de stockage (relatif à packages/server/)
UPLOAD_DIR=./uploads

# Limites de taille (en octets)
MAX_FILE_SIZE_AVATAR=8388608
MAX_FILE_SIZE_AVATAR_PREMIUM=10485760
MAX_FILE_SIZE_ATTACHMENT=8388608
MAX_FILE_SIZE_ATTACHMENT_PREMIUM=26214400
MAX_FILE_SIZE_EMOJI=262144
MAX_FILE_SIZE_STICKER=524288
MAX_FILE_SIZE_GUILD_ICON=8388608
MAX_FILE_SIZE_GUILD_BANNER=8388608

# Limite de stockage total par serveur
STORAGE_LIMIT_PER_GUILD=5368709120

# Seuil d'alerte (0.0 à 1.0)
STORAGE_ALERT_THRESHOLD=0.9

# Nombre maximum de fichiers par message
MAX_ATTACHMENTS_PER_MESSAGE=10

# Durée avant suppression physique des pièces jointes supprimées (en heures)
ATTACHMENT_CLEANUP_DELAY_HOURS=48
```

---

## 11. Dépendances npm requises

| Package | Version | Rôle |
|---|---|---|
| `multer` | latest stable | Parsing multipart/form-data, gestion des uploads |
| `sharp` | latest stable | Redimensionnement et conversion d'images |
| `file-type` | latest stable (ESM) | Détection du type MIME via magic bytes |
| `uuid` | latest stable | Génération d'UUID v4 pour les noms de fichiers |
| `crypto` | natif Node.js | Génération des hashes MD5/SHA1 des fichiers |
| `fs/promises` | natif Node.js | Opérations fichiers asynchrones |
| `path` | natif Node.js | Manipulation sécurisée des chemins |
