# Spécification 30 — Templates de serveur

## 1. Modèle `GuildTemplate`

```prisma
model GuildTemplate {
  code                     String   @id @default(random(8)) // 8 caractères alphanumériques
  name                     String   @db.VarChar(100)
  description              String?  @db.VarChar(120)
  creator_id               String   // FK User.id
  guild_id                 String   // FK Guild.id
  usage_count              Int      @default(0)
  is_dirty                 Boolean  @default(false)
  serialized_source_guild  Json     // snapshot complet du serveur
  created_at               DateTime @default(now())
  updated_at               DateTime @updatedAt
}
```

### Structure `serialized_source_guild`
```json
{
  "name": "My Server",
  "description": "Description du serveur",
  "icon": "hash",
  "verification_level": 2,
  "default_message_notifications": 1,
  "explicit_content_filter": 0,
  "preferred_locale": "fr",
  "system_channel_flags": 0,
  "roles": [
    { "name": "@everyone", "permissions": 104324673, "color": 0, "hoist": false, "mentionable": false, "position": 0 }
    // les autres rôles, IDs remplacés par des placeholders "role_X"
  ],
  "channels": [
    { "name": "général", "type": 0, "position": 0, "topic": null, "nsfw": false, "rate_limit_per_user": 0, "permission_overwrites": [], "parent_id": null }
    // autres canaux, IDs remplacés par des placeholders
  ]
}
```

## 2. Endpoints REST (Authorization: Bot <token> ou JWT selon contexte)

| Méthode | Chemin | Description |
|--------|--------|-------------|
| **POST** | `/api/guilds/:guildId/templates` | Créer un template (requiert `MANAGE_GUILD`, max 1 template par serveur) |
| **GET** | `/api/guilds/:guildId/templates` | Lister les templates du serveur |
| **PUT** | `/api/guilds/:guildId/templates/:code` | Synchroniser le template : mettre à jour le snapshot depuis la guild courante, `is_dirty = false` (requiert `MANAGE_GUILD`) |
| **PATCH** | `/api/guilds/:guildId/templates/:code` | Modifier le nom ou la description |
| **DELETE** | `/api/guilds/:guildId/templates/:code` | Supprimer un template |
| **GET** | `/api/guilds/templates/:code` | Obtenir un template public (pas d’auth) – utilisé pour la preview |
| **POST** | `/api/guilds/templates/:code` | Créer un serveur depuis un template |

### Corps de création (`POST /api/guilds/:guildId/templates`)
```json
{ "name": "Mon Template", "description": "Template de base" }
```

### Réponse (`201 Created`)
```json
{ "code": "a1b2c3d4", "name": "Mon Template", "description": "Template de base", "creator_id": "clxuser123", "guild_id": "clxguild456", "is_dirty": false, "created_at": "2025-01-01T00:00:00.000Z" }
```

### Création d’un serveur depuis un template (`POST /api/guilds/templates/:code`)
```json
{ "name": "Nouveau serveur", "icon": "data:image/png;base64,..." }
```
Le serveur crée les rôles et canaux à partir du snapshot : chaque placeholder ID devient un nouveau snowflake. Le créateur devient propriétaire.

## 3. Comportement `is_dirty`
- Passé à `true` dès qu’une modification de structure affecte la guild source : création/suppression de canal, création/suppression/modification de rôle, mise à jour du serveur (`GUILD_UPDATE`).
- UI : affichage « Template désynchronisé — Synchroniser ? ».
- Triggers : `CHANNEL_CREATE`, `CHANNEL_DELETE`, `CHANNEL_UPDATE`, `ROLE_CREATE`, `ROLE_DELETE`, `ROLE_UPDATE`, `GUILD_UPDATE` → mettre à jour le champ `is_dirty` du template associé.

## 4. Événement Gateway

| Événement | Payload | Description |
|-----------|---------|-------------|
| `GUILD_TEMPLATE_CREATE` | `{ template }` | Un nouveau template a été créé |
| `GUILD_TEMPLATE_UPDATE` | `{ template }` | Un template a été modifié |
| `GUILD_TEMPLATE_DELETE` | `{ code }` | Un template a été supprimé |

---
*Cette spécification s’appuie sur `10-bots-api.md` pour l’authentification et ajoute les événements au fichier `13-gateway-realtime.md`.*