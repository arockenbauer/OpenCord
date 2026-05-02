# Spécification 10 — API Bots, Webhooks & Embeds

## 1. Modèle de données

### Application

Représente une application développeur (similaire aux applications Discord).

| Champ        | Type      | Description                              |
|--------------|-----------|------------------------------------------|
| `id`         | `String`  | Identifiant unique (CUID)                |
| `name`       | `String`  | Nom de l'application                     |
| `description`| `String?` | Description publique de l'application    |
| `icon`       | `String?` | Hash de l'icône                          |
| `owner_id`   | `String`  | Référence vers `User.id`                 |
| `bot_id`     | `String?` | Référence vers `User.id` du bot associé  |
| `created_at` | `DateTime`| Date de création                         |

### Bot (extension de User)

Un bot est un `User` standard avec les champs supplémentaires suivants :

| Champ            | Type      | Description                                       |
|------------------|-----------|---------------------------------------------------|
| `bot`            | `Boolean` | Toujours `true` pour un compte bot                |
| `bot_token`      | `String`  | Token d'authentification haché (bcrypt)           |
| `owner_id`       | `String`  | Référence vers `User.id` du propriétaire          |
| `application_id` | `String`  | Référence vers `Application.id`                   |

### Webhook

| Champ              | Type      | Description                                                  |
|--------------------|-----------|--------------------------------------------------------------|
| `id`               | `String`  | Identifiant unique (CUID)                                    |
| `guild_id`         | `String`  | Référence vers `Guild.id`                                    |
| `channel_id`       | `String`  | Référence vers `Channel.id`                                  |
| `name`             | `String`  | Nom d'affichage du webhook                                   |
| `avatar`           | `String?` | Hash de l'avatar                                             |
| `token`            | `String`  | Token unique d'exécution (non haché, stocké en clair côté serveur) |
| `type`             | `Int`     | `1` = INCOMING, `2` = CHANNEL_FOLLOWER                       |
| `source_guild_id`  | `String?` | Guilde source (type CHANNEL_FOLLOWER uniquement)             |
| `source_channel_id`| `String?` | Canal source (type CHANNEL_FOLLOWER uniquement)              |
| `creator_id`       | `String`  | Référence vers `User.id` du créateur                         |
| `created_at`       | `DateTime`| Date de création                                             |

---

## 2. Format du token bot

Le token bot est généré selon le format suivant (inspiré de Discord) :

```
base64(bot_id) . timestamp_base64 . hmac_sha256(bot_id + timestamp, SECRET_KEY)
```

- **Partie 1** : `base64url(bot_id)` — identifiant du bot encodé en base64
- **Partie 2** : `base64url(timestamp)` — timestamp Unix de génération
- **Partie 3** : `HMAC-SHA256(partie1 + "." + partie2, SECRET_KEY)` — signature de sécurité

La valeur brute (avant hachage) est retournée **une seule fois** lors de la création ou du reset. En base de données, seul le hash bcrypt est stocké.

---

## 3. Authentification bot

Les bots s'authentifient via l'en-tête HTTP :

```
Authorization: Bot <TOKEN>
```

Le middleware `authenticateBot` :
1. Extrait le token de l'en-tête
2. Décode la partie 1 pour obtenir le `bot_id`
3. Charge le bot depuis la base de données
4. Compare le token avec le hash stocké via bcrypt
5. Attache l'utilisateur bot à `req.user`

---

## 4. Création d'un bot

### Étape 1 — Créer une application

**`POST /api/applications`**

Corps de la requête :
```json
{
  "name": "Mon Bot de Modération",
  "description": "Un bot pour modérer mon serveur"
}
```

Réponse `201 Created` :
```json
{
  "id": "clx1234567890",
  "name": "Mon Bot de Modération",
  "description": "Un bot pour modérer mon serveur",
  "icon": null,
  "owner_id": "clxuser123",
  "bot_id": null,
  "created_at": "2025-01-01T00:00:00.000Z"
}
```

### Étape 2 — Créer le bot associé

**`POST /api/applications/:id/bot`**

Aucun corps requis. Le serveur génère automatiquement :
- Un compte `User` avec `bot = true`
- Un username basé sur le nom de l'application
- Un token d'authentification unique

Réponse `201 Created` :
```json
{
  "id": "clxbot123",
  "username": "Mon Bot de Modération",
  "discriminator": "0000",
  "bot": true,
  "application_id": "clx1234567890",
  "token": "bW9uYm90MTIz.1735689600.abcdef1234567890abcdef1234567890"
}
```

> ⚠️ Le `token` est retourné **une seule fois**. Il ne peut pas être récupéré ultérieurement, seulement régénéré.

---

## 5. Gestion des applications

### Lister ses applications

**`GET /api/applications/@me`**

Réponse `200 OK` :
```json
[
  {
    "id": "clx1234567890",
    "name": "Mon Bot de Modération",
    "description": "Un bot pour modérer mon serveur",
    "icon": null,
    "owner_id": "clxuser123",
    "bot_id": "clxbot123",
    "created_at": "2025-01-01T00:00:00.000Z"
  }
]
```

### Lister toutes les applications (admin uniquement)

**`GET /api/applications`**

Requiert `admin_level >= 2`. Retourne toutes les applications du système.

Paramètres de requête : `page`, `limit`, `search`

### Modifier une application

**`PATCH /api/applications/:id`**

Corps de la requête (tous les champs sont optionnels) :
```json
{
  "name": "Nouveau nom",
  "description": "Nouvelle description",
  "icon": "data:image/png;base64,..."
}
```

Réponse `200 OK` : l'application mise à jour.

### Supprimer une application

**`DELETE /api/applications/:id`**

Supprime l'application **et** le compte bot associé. Retire le bot de tous les serveurs.

Réponse `204 No Content`.

### Régénérer le token du bot

**`POST /api/applications/:id/bot/reset-token`**

Génère un nouveau token et invalide l'ancien immédiatement.

Réponse `200 OK` :
```json
{
  "token": "bW9uYm90MTIz.1735776000.newhmac1234567890abcdef"
}
```

---

## 6. API disponible pour les bots

Les bots utilisent le même préfixe `/api` que les utilisateurs humains. L'authentification se fait via `Authorization: Bot TOKEN` au lieu de `Authorization: Bearer JWT`.

### Endpoints accessibles aux bots

#### Messages
- `GET /api/channels/:id/messages` — lire les messages d'un canal
- `POST /api/channels/:id/messages` — envoyer un message
- `PATCH /api/channels/:id/messages/:messageId` — modifier un message envoyé par le bot
- `DELETE /api/channels/:id/messages/:messageId` — supprimer un message (avec permission)
- `POST /api/channels/:id/messages/:messageId/reactions/:emoji` — ajouter une réaction
- `DELETE /api/channels/:id/messages/:messageId/reactions/:emoji/@me` — retirer sa réaction

#### Canaux
- `GET /api/guilds/:id/channels` — lister les canaux d'un serveur
- `GET /api/channels/:id` — obtenir les détails d'un canal
- `POST /api/guilds/:id/channels` — créer un canal (requiert `MANAGE_CHANNELS`)
- `PATCH /api/channels/:id` — modifier un canal (requiert `MANAGE_CHANNELS`)
- `DELETE /api/channels/:id` — supprimer un canal (requiert `MANAGE_CHANNELS`)

#### Serveurs
- `GET /api/guilds/:id` — obtenir les informations d'un serveur
- `GET /api/guilds/:id/members` — lister les membres
- `GET /api/guilds/:id/members/:userId` — obtenir un membre
- `PATCH /api/guilds/:id/members/:userId` — modifier un membre (rôles, surnom)
- `DELETE /api/guilds/:id/members/:userId` — expulser un membre (requiert `KICK_MEMBERS`)
- `GET /api/guilds/:id/bans` — lister les bans (requiert `BAN_MEMBERS`)
- `PUT /api/guilds/:id/bans/:userId` — bannir un membre
- `DELETE /api/guilds/:id/bans/:userId` — débannir
- `GET /api/guilds/:id/roles` — lister les rôles
- `POST /api/guilds/:id/roles` — créer un rôle (requiert `MANAGE_ROLES`)
- `PATCH /api/guilds/:id/roles/:roleId` — modifier un rôle

### Rate limits pour les bots

Les bots bénéficient de limites plus généreuses que les utilisateurs humains :

| Ressource                    | Utilisateur | Bot      |
|------------------------------|-------------|----------|
| Messages par canal (10s)     | 5           | 30       |
| Requêtes globales (1s)       | 10          | 50       |
| Réactions par message (10s)  | 5           | 20       |

Les headers de rate limit retournés :
```
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 28
X-RateLimit-Reset: 1735689610
X-RateLimit-Bucket: channel_messages_clxchannel123
```

---

## 7. Invitation d'un bot sur un serveur

### Générer un lien d'invitation

Le lien d'invitation est généré côté client par le développeur, selon le format :

```
/oauth2/authorize?client_id=APP_ID&permissions=BITFIELD&scope=bot
```

Paramètres :
- `client_id` : l'ID de l'application
- `permissions` : bitfield des permissions demandées (entier)
- `scope` : toujours `bot` pour l'instant

### Traitement de l'invitation

**`GET /api/oauth2/authorize`**

Paramètres de requête :
- `client_id` : ID de l'application
- `permissions` : bitfield des permissions
- `scope` : `bot`

L'utilisateur doit être authentifié (JWT). Retourne les informations de l'application et du bot pour afficher la page de confirmation.

Réponse `200 OK` :
```json
{
  "application": {
    "id": "clx1234567890",
    "name": "Mon Bot de Modération",
    "icon": null
  },
  "bot": {
    "id": "clxbot123",
    "username": "Mon Bot de Modération",
    "avatar": null
  },
  "permissions": 268435456,
  "guilds": [
    {
      "id": "clxguild123",
      "name": "Mon Serveur",
      "icon": null,
      "is_owner": true
    }
  ]
}
```

**`POST /api/oauth2/authorize`**

Le propriétaire ou un administrateur du serveur approuve l'invitation.

Corps de la requête :
```json
{
  "client_id": "clx1234567890",
  "guild_id": "clxguild123",
  "permissions": 268435456
}
```

Réponse `200 OK` :
```json
{
  "guild_id": "clxguild123",
  "bot_id": "clxbot123",
  "permissions": 268435456
}
```

### Comportement après invitation

1. Le bot rejoint le serveur en tant que membre
2. Un rôle géré est automatiquement créé pour le bot :
   - Nom : nom du bot
   - `managed = true` (ne peut pas être assigné manuellement)
   - Position : juste au-dessus du rôle `@everyone`
   - Permissions : les permissions accordées lors de l'invitation
3. Le bot reçoit l'événement `GUILD_CREATE` via Socket.IO
4. L'entrée apparaît dans la page "Intégrations" du serveur

---

## 8. Embeds

### Structure complète d'un embed

```typescript
interface Embed {
  title?: string;         // Titre (max 256 chars)
  description?: string;   // Description (max 4096 chars)
  url?: string;           // URL du titre (rend le titre cliquable)
  color?: number;         // Couleur de la bordure gauche (entier RGB, ex: 0xFF5733)
  timestamp?: string;     // Date ISO 8601 affichée en bas de l'embed
  footer?: {
    text: string;         // Texte du pied de page (max 2048 chars)
    icon_url?: string;    // URL de l'icône du pied de page
  };
  image?: {
    url: string;          // URL de l'image principale
    width?: number;       // Largeur (renseigné par le serveur après résolution)
    height?: number;      // Hauteur
  };
  thumbnail?: {
    url: string;          // URL de la miniature (affichée en haut à droite)
    width?: number;
    height?: number;
  };
  author?: {
    name: string;         // Nom de l'auteur (max 256 chars)
    url?: string;         // URL de l'auteur (rend le nom cliquable)
    icon_url?: string;    // URL de l'icône de l'auteur
  };
  fields?: Array<{
    name: string;         // Nom du champ (max 256 chars)
    value: string;        // Valeur du champ (max 1024 chars)
    inline?: boolean;     // Si true, le champ peut s'afficher côte à côte
  }>;
}
```

### Limites

| Élément                         | Limite      |
|---------------------------------|-------------|
| Embeds par message              | 10          |
| Total caractères (tous embeds)  | 6 000       |
| Champs par embed                | 25          |
| Titre                           | 256 chars   |
| Description                     | 4 096 chars |
| Nom de champ                    | 256 chars   |
| Valeur de champ                 | 1 024 chars |
| Nom d'auteur                    | 256 chars   |
| Texte de pied de page           | 2 048 chars |

### Envoi d'un message avec embeds

**`POST /api/channels/:id/messages`**

Corps de la requête :
```json
{
  "content": "Voici le résultat de la recherche :",
  "embeds": [
    {
      "title": "Résultat trouvé",
      "description": "Voici ce que j'ai trouvé pour votre requête.",
      "color": 5763719,
      "fields": [
        { "name": "Catégorie", "value": "Général", "inline": true },
        { "name": "Score", "value": "42/100", "inline": true }
      ],
      "footer": { "text": "Bot de Recherche v1.0" },
      "timestamp": "2025-01-01T12:00:00.000Z"
    }
  ]
}
```

### Rendu des embeds

L'embed est affiché dans le chat avec :
- Une **bordure colorée verticale** à gauche (couleur définie par `color`)
- Le bloc **auteur** en haut (icône + nom cliquable)
- Le **titre** en gras et cliquable (si `url` défini)
- La **description** en texte normal
- Les **champs** en grille (inline = plusieurs par ligne, non-inline = une ligne chacun)
- L'**image** principale centrée en bas du contenu
- La **miniature** alignée à droite
- Le **pied de page** (icône + texte + timestamp séparé par un point)

---

## 9. Webhooks

### Créer un webhook

**`POST /api/channels/:id/webhooks`**

Requiert la permission `MANAGE_WEBHOOKS` sur le canal.

Corps de la requête :
```json
{
  "name": "Webhook de déploiement",
  "avatar": "data:image/png;base64,..."
}
```

Réponse `201 Created` :
```json
{
  "id": "clxwh123",
  "guild_id": "clxguild123",
  "channel_id": "clxchannel123",
  "name": "Webhook de déploiement",
  "avatar": null,
  "token": "AbCdEfGhIjKlMnOpQrStUvWxYz1234567890",
  "type": 1,
  "creator_id": "clxuser123",
  "created_at": "2025-01-01T00:00:00.000Z"
}
```

> ⚠️ Le `token` est retourné **uniquement** à la création. Conserver cette valeur, elle est nécessaire pour exécuter le webhook.

### Lister les webhooks d'un canal

**`GET /api/channels/:id/webhooks`**

Requiert `MANAGE_WEBHOOKS`. Retourne la liste sans le `token`.

Réponse `200 OK` :
```json
[
  {
    "id": "clxwh123",
    "name": "Webhook de déploiement",
    "avatar": null,
    "channel_id": "clxchannel123",
    "creator": {
      "id": "clxuser123",
      "username": "axel"
    },
    "created_at": "2025-01-01T00:00:00.000Z"
  }
]
```

### Lister les webhooks d'un serveur

**`GET /api/guilds/:id/webhooks`**

Requiert `MANAGE_WEBHOOKS`. Retourne tous les webhooks du serveur.

### Obtenir un webhook

**`GET /api/webhooks/:id`**

Requiert `MANAGE_WEBHOOKS` sur le canal du webhook.

### Modifier un webhook

**`PATCH /api/webhooks/:id`**

Corps de la requête (tous optionnels) :
```json
{
  "name": "Nouveau nom",
  "avatar": "data:image/png;base64,...",
  "channel_id": "clxchannel456"
}
```

### Supprimer un webhook

**`DELETE /api/webhooks/:id`**

Requiert `MANAGE_WEBHOOKS`. Réponse `204 No Content`.

### Exécuter un webhook

**`POST /api/webhooks/:id/:token`**

Cette route **ne nécessite pas d'authentification**. Le token dans l'URL fait office d'authentification.

Corps de la requête :
```json
{
  "content": "🚀 Déploiement réussi en production !",
  "username": "CI/CD Pipeline",
  "avatar_url": "https://example.com/ci-icon.png",
  "embeds": [
    {
      "title": "Build #42 — Succès",
      "color": 5763719,
      "fields": [
        { "name": "Branche", "value": "main", "inline": true },
        { "name": "Durée", "value": "2m 34s", "inline": true }
      ]
    }
  ],
  "tts": false
}
```

Réponse `204 No Content` (ou `200 OK` avec le message si `wait=true` est en paramètre de requête).

Le message apparaît dans le canal avec :
- L'avatar et le nom du webhook (ou `username` / `avatar_url` si fournis)
- Un badge **WEBHOOK** à côté du nom
- Aucune possibilité de répondre directement

---

## 10. Page Intégrations (Interface utilisateur)

Accessible via **Paramètres du serveur → Intégrations**.

### Section Webhooks

- **Tableau** listant tous les webhooks du serveur :
  - Icône/avatar du webhook
  - Nom du webhook
  - Canal cible (avec icône #)
  - Créé par (avatar + nom d'utilisateur)
  - Date de création
  - Boutons : **Modifier**, **Supprimer**

- Bouton **"Créer un webhook"** en haut à droite
- Modal de création : champ nom, sélecteur de canal, upload d'avatar optionnel
- Modal de modification : mêmes champs + affichage et copie du token (avec avertissement de sécurité)

### Section Bots

- **Liste** des bots membres du serveur :
  - Avatar + nom du bot + badge BOT
  - Permissions accordées (liste lisible)
  - Lien vers la page de l'application
  - Bouton **Retirer le bot** (expulse le bot du serveur)

- Bouton **"Ajouter un bot"** qui redirige vers `/oauth2/authorize`
