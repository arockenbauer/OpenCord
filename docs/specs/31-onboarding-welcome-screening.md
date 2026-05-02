# Spécification 31 — Onboarding, Welcome Screen & Membership Screening

## 1. Welcome Screen

```prisma
model GuildWelcomeScreen {
  guild_id        String   @id @unique // FK Guild.id
  enabled         Boolean  @default(false)
  description     String?  @db.VarChar(140)
  welcome_channels Json    // [{ channel_id, description, emoji_id?, emoji_name? }], max 5
}
```

### Endpoints
| Méthode | Chemin | Description |
|--------|--------|-------------|
| **GET** | `/api/guilds/:guildId/welcome-screen` | Public – accessible aux utilisateurs ayant reçu une invitation |
| **PATCH** | `/api/guilds/:guildId/welcome-screen` | Requiert `MANAGE_GUILD` |

#### Exemple de réponse (`GET`)
```json
{
  "enabled": true,
  "description": "Bienvenue sur le serveur !",
  "welcome_channels": [
    { "channel_id": "clxchan001", "description": "#règles", "emoji_id": null, "emoji_name": "📜" },
    { "channel_id": "clxchan002", "description": "#annonces", "emoji_id": null, "emoji_name": "📢" }
  ]
}
```

## 2. Membership Screening (Member Verification Gate)

```prisma
model GuildMemberVerification {
  guild_id    String   @id @unique // FK Guild.id
  enabled     Boolean  @default(false)
  description String?  @db.VarChar(300)
  form_fields Json     // [{ field_type: "TERMS", label, values: [], required: true }]
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt
}
```

### Endpoints
| Méthode | Chemin | Description |
|--------|--------|-------------|
| **GET** | `/api/guilds/:guildId/member-verification` | Public si `enabled` ; retourne le formulaire |
| **PUT** | `/api/guilds/:guildId/member-verification` | Crée ou remplace le formulaire – requiert `MANAGE_GUILD` |
| **PATCH** | `/api/guilds/:guildId/member-verification` | Modifie partiellement le formulaire – requiert `MANAGE_GUILD` |
| **POST** | `/api/guilds/:guildId/member-verification/complete` | Soumission de l’acceptation – utilisateur authentifié, membre de la guilde |

### Comportement
- Lorsqu’activé, les nouveaux membres obtiennent `pending = true` dans la table `guild_members`.
- Tant que `pending` : visibilité limitée aux canaux `@everyone`, aucune permission d’écriture ni de DM.
- Après soumission réussie (`POST …/complete`) → `pending = false` et le membre devient pleinement actif.

#### Modification de `guild_members`
```prisma
model GuildMember {
  user_id   String
  guild_id  String
  pending   Boolean @default(false)
  // ... autres champs
  @@id([user_id, guild_id])
}
```

## 3. Server Onboarding

```prisma
model GuildOnboarding {
  guild_id            String   @id @unique // FK Guild.id
  enabled             Boolean  @default(false)
  mode                Int      @default(0) // 0=DEFAULT, 1=ADVANCED
  prompts             Json     // tableau d'objets prompt (voir ci‑dessous)
  default_channel_ids Json?    // canaux rejoignables automatiquement
  created_at          DateTime @default(now())
  updated_at          DateTime @updatedAt
}
```

### Structure d’un prompt
```json
{
  "id": "clxprompt001",
  "type": 0,
  "title": "Quel est ton niveau ?",
  "options": [
    {
      "id": "opt001",
      "title": "Débutant",
      "description": "Je débute",
      "emoji": { "name": "🌱" },
      "role_ids": ["clxrole001"],
      "channel_ids": ["clxchan001"]
    }
  ],
  "single_select": true,
  "required": true,
  "in_onboarding": true
}
```

### Endpoints
| Méthode | Chemin | Description |
|--------|--------|-------------|
| **GET** | `/api/guilds/:guildId/onboarding` | Récupérer la configuration d’onboarding |
| **PUT** | `/api/guilds/:guildId/onboarding` | Crée/replace – requiert `MANAGE_GUILD` + `MANAGE_ROLES` |

### Comportement UI
- Après le Welcome Screen, le client affiche le formulaire d’onboarding.
- Les réponses attribuent les rôles et rejoignent les canaux définis dans chaque option.
- En mode `ADVANCED`, les prompts peuvent également définir quels canaux sont visibles pour le membre.

---
*Cette spécification complète `03-servers-channels.md` et ajoute les nouveaux événements au fichier `13-gateway-realtime.md`.*