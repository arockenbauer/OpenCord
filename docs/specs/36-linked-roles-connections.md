# Spécification 36 — Rôles liés & connexions tierces

## 1. Connexions utilisateur (Connections)

```prisma
model UserConnection {
  id               String   @id @default(cuid())
  user_id          String   // FK User.id
  type             String   // github, twitter, twitch, youtube, spotify, steam, reddit, linkedin, xbox, playstation, battlenet, epicgames, leagueoflegends
  name             String   // pseudo sur la plateforme
  friend_sync      Boolean  @default(false)
  show_activity    Boolean  @default(false)
  visibility       Int      @default(0) // 0=none, 1=everyone
  access_token     String?  // chiffré AES‑256
  refresh_token    String?  // chiffré AES‑256
  token_expires_at DateTime?
  verified         Boolean  @default(false)
  created_at       DateTime @default(now())
}
```

### Affichage profil
- Section **CONNEXIONS** visible uniquement si `visibility = 1`.
- Icône de la plateforme + `name`.

### Endpoints
| Méthode | Chemin | Description |
|--------|--------|-------------|
| **GET** | `/api/users/@me/connections` | Liste les connexions de l’utilisateur |
| **POST** | `/api/users/@me/connections/:type/callback` | Callback OAuth de la plateforme tierce (reçoit `code`, échange contre token, crée la connexion) |
| **PATCH** | `/api/users/@me/connections/:connectionId` | Modifier `visibility`, `friend_sync`, `show_activity` |
| **DELETE** | `/api/users/@me/connections/:connectionId` | Supprimer la connexion |

> ⚠️ DIFFÉRÉ – les variables d’environnement pour chaque provider (`GITHUB_CLIENT_ID`, etc.) seront documentées séparément.

## 2. Linked Roles (Rôles liés)

### Modèle `ApplicationRoleConnectionMetadata`
```prisma
model ApplicationRoleConnectionMetadata {
  application_id String
  key           String   // max 50 chars, unique per app
  name          String   // max 100 chars
  name_localizations Json?
  description   String   // max 200 chars
  description_localizations Json?
  type          Int      // 1=INTEGER_LESS_THAN_OR_EQUAL, 2=INTEGER_GREATER_THAN_OR_EQUAL, 3=INTEGER_EQUAL, 4=INTEGER_NOT_EQUAL, 5=DATETIME_LESS_THAN_OR_EQUAL, 6=DATETIME_GREATER_THAN_OR_EQUAL, 7=BOOLEAN_EQUAL, 8=BOOLEAN_NOT_EQUAL
  @@id([application_id, key])
}
```

### Modèle `GuildRoleConnectionRequirement`
```prisma
model GuildRoleConnectionRequirement {
  guild_id       String
  role_id        String   // FK Role.id
  application_id String
  metadata_key   String   // FK ApplicationRoleConnectionMetadata.key
  metadata_value String   // valeur attendue
  @@id([guild_id, role_id, application_id, metadata_key])
}
```

### Modèle `UserApplicationRoleConnection`
```prisma
model UserApplicationRoleConnection {
  user_id        String
  application_id String
  platform_name  String?   // affichage optionnel
  platform_username String?
  metadata       Json      // { key: value, ... }
  @@id([user_id, application_id])
}
```

## 3. Endpoints (bot token)
| Méthode | Chemin | Description |
|--------|--------|-------------|
| **GET** | `/api/applications/:appId/role-connections/metadata` | Récupérer les métadonnées définies pour l’application |
| **PUT** | `/api/applications/:appId/role-connections/metadata` | Définir ou remplacer les métadonnées (max 5) |

## 4. Endpoints (OAuth2 scope `role_connections.write`)
| Méthode | Chemin | Scopes | Description |
|--------|--------|--------|-------------|
| **GET** | `/api/users/@me/applications/:appId/role-connection` | `applications.role_connections.read` | Récupérer les valeurs actuelles de l’utilisateur |
| **PUT** | `/api/users/@me/applications/:appId/role-connection` | `applications.role_connections.write` | Mettre à jour les valeurs de métadonnées |

## 5. Vérification d’éligibilité
- **Cron** : toutes les 5 minutes ou déclenché à chaque mise à jour de `UserApplicationRoleConnection`.
- Pour chaque `GuildRoleConnectionRequirement` :
  1. Récupérer la valeur fournie par l’utilisateur (`metadata[key]`).
  2. Comparer selon le `type` (ex. `INTEGER_GREATER_THAN_OR_EQUAL`).
  3. Si toutes les exigences sont satisfaites, attribuer le rôle (`guild_members_roles`); sinon, le retirer.

## 6. Événement Gateway

| Événement | Payload | Description |
|-----------|---------|-------------|
| `ROLE_CONNECTION_UPDATE` | `{ user_id, application_id, metadata }` | Diffusé dans la room `guild:<guildId>` lorsqu’un utilisateur met à jour ses métadonnées de connexion de rôle |

---
*Cette spécification s’appuie sur `10-bots-api.md` pour le modèle `Application` et ajoute l’événement `ROLE_CONNECTION_UPDATE` au fichier `13-gateway-realtime.md`.*