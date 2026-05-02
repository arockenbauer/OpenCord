# Spécification 13 — Gateway Temps Réel (Socket.IO)

## 1. Configuration du serveur Socket.IO

```typescript
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL,
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  pingInterval: 25000,
  pingTimeout: 20000,
});
```

- **Namespace** : `/` (namespace par défaut)
- **Transports** : WebSocket en priorité, polling HTTP comme fallback
- **Ping/Pong intégré** : Socket.IO gère nativement le heartbeat — interval de 25 secondes, timeout de 20 secondes

### Authentification à la connexion

Le client envoie le token JWT lors de l'initialisation de la connexion :

```typescript
const socket = io(SERVER_URL, {
  auth: { token: localStorage.getItem('access_token') },
});
```

Côté serveur, le middleware de connexion :

```typescript
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('UNAUTHORIZED'));

  const user = await verifyJWT(token);
  if (!user) return next(new Error('INVALID_TOKEN'));

  socket.data.user = user;
  next();
});
```

En cas d'erreur d'authentification, la connexion est rejetée avec un code d'erreur.

---

## 2. Stratégie de rooms (salles)

Socket.IO utilise des rooms pour cibler les événements. Chaque entité a sa propre room.

| Room                   | Format                   | Membres                                         |
|------------------------|--------------------------|-------------------------------------------------|
| Room personnelle       | `user:<userId>`          | Socket unique de l'utilisateur                  |
| Room de guilde         | `guild:<guildId>`        | Tous les membres connectés de la guilde         |
| Room de canal          | `channel:<channelId>`    | Tous les membres avec accès au canal            |

### Rejoindre les rooms à la connexion

À chaque connexion réussie, le serveur effectue automatiquement :

```typescript
socket.on('connect', async () => {
  const user = socket.data.user;

  // Room personnelle
  socket.join(`user:${user.id}`);

  // Rooms de toutes les guildes dont l'utilisateur est membre
  const guilds = await getGuildsForUser(user.id);
  for (const guild of guilds) {
    socket.join(`guild:${guild.id}`);

    // Rooms de tous les canaux visibles dans chaque guilde
    const channels = await getAccessibleChannels(user.id, guild.id);
    for (const channel of channels) {
      socket.join(`channel:${channel.id}`);
    }
  }

  // Rooms des canaux DM ouverts
  const dmChannels = await getDMChannelsForUser(user.id);
  for (const dm of dmChannels) {
    socket.join(`channel:${dm.id}`);
  }

  // Envoyer l'événement READY
  socket.emit('READY', await buildReadyPayload(user.id));
});
```

### Rejoindre/Quitter dynamiquement

- Quand un utilisateur **rejoint un serveur** : `socket.join('guild:<id>')` + join des rooms de canaux
- Quand un utilisateur **quitte un serveur** : `socket.leave('guild:<id>')` + leave des rooms de canaux
- Quand un canal est **créé** : les membres éligibles rejoignent `channel:<id>`
- Quand les permissions changent : recalculer et rejoindre/quitter les rooms de canaux

---

## 3. Événement READY

Envoyé au client immédiatement après la connexion réussie. Sert de point de synchronisation initial et de resynchronisation après reconnexion.

```typescript
interface ReadyPayload {
  user: CurrentUser;
  guilds: GuildWithChannels[];
  dm_channels: DMChannel[];
  presences: PresenceUpdate[];
  read_states: ReadState[];
  relationships: Relationship[];
  notifications_unread_count: number;
}
```

Exemple :
```json
{
  "user": {
    "id": "clxuser123",
    "username": "axel",
    "discriminator": "0001",
    "email": "axel@example.com",
    "avatar": null,
    "admin_level": 3,
    "locale": "fr",
    "mfa_enabled": false
  },
  "guilds": [
    {
      "id": "clxguild1",
      "name": "Mon Serveur",
      "icon": null,
      "channels": [...],
      "roles": [...],
      "members": [...]
    }
  ],
  "dm_channels": [...],
  "presences": [
    { "user_id": "clxfriend1", "status": "online", "custom_status": "En train de coder" }
  ],
  "read_states": [
    { "channel_id": "clxchannel1", "last_read_message_id": "clxmsg456" }
  ],
  "relationships": [...],
  "notifications_unread_count": 3
}
```

---

## 4. Événements serveur → client

### Messages

#### `MESSAGE_CREATE`
Déclenché à l'envoi d'un nouveau message dans un canal.

Diffusé sur la room `channel:<channelId>`.

> ⚠️ L'événement est uniquement envoyé aux membres ayant la permission `VIEW_CHANNEL` sur le canal. Le serveur vérifie les permissions avant la diffusion.

```json
{
  "message": {
    "id": "clxmsg789",
    "channel_id": "clxchannel1",
    "guild_id": "clxguild1",
    "author": {
      "id": "clxuser123",
      "username": "axel",
      "avatar": null,
      "bot": false
    },
    "content": "Bonjour tout le monde !",
    "attachments": [],
    "embeds": [],
    "reactions": [],
    "mentions": [],
    "pinned": false,
    "edited_at": null,
    "created_at": "2025-06-15T14:00:00.000Z"
  }
}
```

#### `MESSAGE_UPDATE`
Déclenché lors de la modification d'un message.

Diffusé sur `channel:<channelId>`.

```json
{
  "message": {
    "id": "clxmsg789",
    "channel_id": "clxchannel1",
    "guild_id": "clxguild1",
    "content": "Bonjour tout le monde ! (modifié)",
    "edited_at": "2025-06-15T14:05:00.000Z"
  }
}
```

#### `MESSAGE_DELETE`
Déclenché lors de la suppression d'un message.

Diffusé sur `channel:<channelId>`.

```json
{
  "id": "clxmsg789",
  "channel_id": "clxchannel1",
  "guild_id": "clxguild1"
}
```

#### `MESSAGE_REACTION_ADD`
Déclenché lors de l'ajout d'une réaction.

```json
{
  "user_id": "clxuser123",
  "channel_id": "clxchannel1",
  "message_id": "clxmsg789",
  "emoji": { "name": "👍", "id": null }
}
```

#### `MESSAGE_REACTION_REMOVE`
Déclenché lors du retrait d'une réaction. Même structure que `MESSAGE_REACTION_ADD`.

---

### Canaux

#### `CHANNEL_CREATE`
Diffusé sur `guild:<guildId>`. Les membres éligibles rejoignent automatiquement la room du nouveau canal.

```json
{
  "channel": {
    "id": "clxchannel99",
    "guild_id": "clxguild1",
    "name": "nouveau-canal",
    "type": 0,
    "position": 5,
    "parent_id": "clxcategory1"
  }
}
```

#### `CHANNEL_UPDATE`
Diffusé sur `guild:<guildId>`.

```json
{
  "channel": {
    "id": "clxchannel99",
    "name": "canal-renommé",
    "topic": "Nouveau sujet du canal"
  }
}
```

#### `CHANNEL_DELETE`
Diffusé sur `guild:<guildId>`.

```json
{
  "id": "clxchannel99",
  "guild_id": "clxguild1"
}
```

---

### Guildes

#### `GUILD_CREATE`
Envoyé **uniquement** à l'utilisateur concerné (via `user:<userId>`) quand il rejoint un nouveau serveur.

```json
{
  "guild": { /* objet guilde complet avec channels, roles, members */ }
}
```

#### `GUILD_UPDATE`
Diffusé sur `guild:<guildId>`.

```json
{
  "guild": {
    "id": "clxguild1",
    "name": "Nouveau nom du serveur",
    "icon": "newhash"
  }
}
```

#### `GUILD_DELETE`
Envoyé à l'utilisateur (via `user:<userId>`) quand il est expulsé, banni, ou quand le serveur est supprimé.

```json
{
  "id": "clxguild1"
}
```

---

### Membres

#### `GUILD_MEMBER_ADD`
Diffusé sur `guild:<guildId>` quand un nouveau membre rejoint.

```json
{
  "guild_id": "clxguild1",
  "member": {
    "user": { "id": "clxuser999", "username": "nouveau" },
    "roles": [],
    "joined_at": "2025-06-15T16:00:00.000Z",
    "nickname": null
  }
}
```

#### `GUILD_MEMBER_REMOVE`
Diffusé sur `guild:<guildId>` quand un membre quitte ou est expulsé.

```json
{
  "guild_id": "clxguild1",
  "user_id": "clxuser999"
}
```

#### `GUILD_MEMBER_UPDATE`
Diffusé sur `guild:<guildId>` lors d'un changement de rôles ou de surnom.

```json
{
  "guild_id": "clxguild1",
  "member": {
    "user": { "id": "clxuser123" },
    "roles": ["clxrole1", "clxrole2"],
    "nickname": "Mon Surnom"
  }
}
```

---

### Rôles

#### `GUILD_ROLE_CREATE`
```json
{
  "guild_id": "clxguild1",
  "role": { "id": "clxrole99", "name": "Nouveau Rôle", "color": 16711680, "permissions": "0" }
}
```

#### `GUILD_ROLE_UPDATE`
```json
{
  "guild_id": "clxguild1",
  "role": { "id": "clxrole99", "name": "Rôle Renommé", "color": 255 }
}
```

#### `GUILD_ROLE_DELETE`
```json
{
  "guild_id": "clxguild1",
  "role_id": "clxrole99"
}
```

---

### Bans

#### `GUILD_BAN_ADD`
Diffusé sur `guild:<guildId>`.

```json
{
  "guild_id": "clxguild1",
  "user": { "id": "clxuser999", "username": "troll" }
}
```

#### `GUILD_BAN_REMOVE`
```json
{
  "guild_id": "clxguild1",
  "user": { "id": "clxuser999" }
}
```

---

### Emojis & Stickers

#### `GUILD_EMOJIS_UPDATE`
```json
{
  "guild_id": "clxguild1",
  "emojis": [ /* liste complète des emojis de la guilde */ ]
}
```

#### `GUILD_STICKERS_UPDATE`
```json
{
  "guild_id": "clxguild1",
  "stickers": [ /* liste complète des stickers */ ]
}
```

---

### Présence & Indicateur de frappe

#### `TYPING_START`
Diffusé sur `channel:<channelId>` quand un utilisateur commence à taper.

```json
{
  "channel_id": "clxchannel1",
  "user_id": "clxuser456",
  "timestamp": 1718460000000
}
```

L'indicateur de frappe disparaît automatiquement après **10 secondes** sans nouvel événement.

#### `PRESENCE_UPDATE`
Diffusé aux membres des guildes communes et aux amis.

```json
{
  "user_id": "clxuser456",
  "status": "idle",
  "custom_status": {
    "text": "En train de jouer",
    "emoji": "🎮"
  }
}
```

---

### Utilisateur courant

#### `USER_UPDATE`
Envoyé uniquement à l'utilisateur lui-même (via `user:<userId>`) quand ses propres données changent (avatar, username, email, etc.).

```json
{
  "user": {
    "id": "clxuser123",
    "username": "axel_new",
    "avatar": "newhash"
  }
}
```

---

### Relations (amis)

#### `RELATIONSHIP_ADD`
Envoyé à l'utilisateur concerné quand une relation est créée ou mise à jour.

```json
{
  "relationship": {
    "id": "clxrel1",
    "type": 1,
    "user": { "id": "clxuser456", "username": "ami" }
  }
}
```

#### `RELATIONSHIP_REMOVE`
```json
{
  "id": "clxrel1"
}
```

---

### Notifications

#### `NOTIFICATION_CREATE`
Envoyé à l'utilisateur via `user:<userId>`.

```json
{
  "notification": {
    "id": "clxnotif1",
    "type": "MENTION",
    "data": {
      "message_id": "clxmsg789",
      "channel_id": "clxchannel1",
      "guild_id": "clxguild1",
      "sender_id": "clxuser456"
    },
    "read": false,
    "created_at": "2025-06-15T14:00:00.000Z"
  }
}
```

---

### Threads

#### `THREAD_CREATE`
```json
{
  "thread": {
    "id": "clxthread1",
    "parent_id": "clxchannel1",
    "guild_id": "clxguild1",
    "name": "Discussion sur le sujet X",
    "owner_id": "clxuser123"
  }
}
```

#### `THREAD_UPDATE`
```json
{
  "thread": {
    "id": "clxthread1",
    "name": "Nouveau titre du thread",
    "archived": false
  }
}
```

#### `THREAD_DELETE`
```json
{
  "id": "clxthread1",
  "guild_id": "clxguild1",
  "parent_id": "clxchannel1"
}
```

---

### Voix

#### `VOICE_STATE_UPDATE`

> ⚠️ **DIFFÉRÉ** — La fonctionnalité voix n'est pas dans le périmètre initial. L'événement est réservé pour une implémentation future.

---

## 5. Événements client → serveur

### `TYPING_START`
Envoyé par le client quand l'utilisateur commence à taper dans un canal.

```json
{ "channel_id": "clxchannel1" }
```

Le serveur diffuse `TYPING_START` à tous les membres du canal (sauf l'émetteur).

### `PRESENCE_UPDATE`
Envoyé par le client pour mettre à jour son statut de présence.

```json
{
  "status": "dnd",
  "custom_status": {
    "text": "Ne pas déranger",
    "emoji": "⛔"
  }
}
```

### `REQUEST_GUILD_MEMBERS`
Envoyé par le client pour charger la liste des membres d'un serveur (chargement paresseux).

```json
{
  "guild_id": "clxguild1",
  "query": "",
  "limit": 100
}
```

Le serveur répond avec `GUILD_MEMBER_ADD` pour chaque membre chargé.

### `VOICE_STATE_UPDATE`

> ⚠️ **DIFFÉRÉ**

---

## 6. Système de présence

### Statuts disponibles

| Statut      | Valeur       | Comportement                                                       |
|-------------|--------------|--------------------------------------------------------------------|
| En ligne    | `online`     | Visible comme en ligne pour tous                                   |
| Inactif     | `idle`       | Visible comme inactif (lune jaune)                                 |
| Ne pas déranger | `dnd`    | Visible mais notifications silencieuses                            |
| Invisible   | `invisible`  | Apparaît comme **hors ligne** pour les autres, accès normal        |
| Hors ligne  | `offline`    | État automatique après déconnexion (non sélectionnable manuellement)|

### Stockage en mémoire

La présence est stockée **en mémoire** (Map JavaScript dans le processus Node.js) et non en base de données, pour des raisons de performance :

```typescript
const presenceStore = new Map<string, PresenceState>();
// Key: userId, Value: { status, custom_status, last_seen, socket_ids: Set<string> }
```

### Comportement à la connexion

1. Le statut est restauré depuis le `presenceStore` (ou `online` par défaut si première connexion)
2. Si l'utilisateur avait choisi `invisible`, il est restauré en `invisible`
3. Le statut est diffusé aux guildes communes et aux amis

### Comportement à la déconnexion

1. Le socket est retiré du `Set<socket_ids>` dans le `presenceStore`
2. Si `socket_ids` est encore non vide (sessions multiples) : rien ne change
3. Si `socket_ids` est vide : un timer de **30 secondes** est lancé
4. Après 30 secondes sans reconnexion : le statut passe à `offline` et les amis/guildes sont notifiés
5. Si l'utilisateur se reconnecte avant 30 secondes : le timer est annulé, pas de notification `offline`

### Détection d'inactivité

Le client est responsable de détecter l'inactivité locale :
- Après **5 minutes** sans interaction (clic, frappe, défilement) : le client envoie `PRESENCE_UPDATE` avec `status: "idle"`
- À la reprise d'activité : le client envoie `PRESENCE_UPDATE` avec `status: "online"`

### Diffusion des changements de présence

Les mises à jour de présence sont envoyées :
- Aux membres de **toutes les guildes communes**
- Aux **amis** (relation de type `FRIEND`)

Pour optimiser la performance, les mises à jour de présence sont **regroupées par lot** (batch toutes les 5 secondes) avant diffusion.

---

## 7. Reconnexion et résilience

### Reconnexion automatique (Socket.IO)

Socket.IO gère nativement la reconnexion avec **backoff exponentiel** :
- Tentative 1 : 1 seconde
- Tentative 2 : 2 secondes
- Tentative 3 : 4 secondes
- …jusqu'à un maximum configurable (ex: 30 secondes)

### Comportement côté client à la reconnexion

1. Le client se reconnecte avec le dernier token valide
2. Le serveur ré-authentifie et ré-envoie l'événement `READY`
3. Le client remplace son état local avec les données fraîches du `READY`
4. Les événements manqués pendant la déconnexion sont considérés comme perdus (le `READY` fait office de resynchronisation complète)

### File d'attente d'événements hors ligne

Le client maintient une file d'attente locale pour les actions effectuées hors ligne :
- Les messages tapés mais non envoyés sont préservés dans l'input
- Les actions critiques (envoi de message) sont retentées à la reconnexion

---

## 8. Considérations de performance

### Ciblage précis des événements

Les événements sont toujours diffusés à la room la plus précise possible — jamais en broadcast global.

| Événement              | Room cible                  |
|------------------------|-----------------------------|
| Nouveau message        | `channel:<channelId>`       |
| Mise à jour de guilde  | `guild:<guildId>`           |
| Notification           | `user:<userId>`             |
| Présence               | Rooms `guild:*` communes + amis |

### Filtrage par permissions

Avant toute diffusion d'événement `MESSAGE_CREATE` :
- Le serveur vérifie la liste des membres du canal ayant `VIEW_CHANNEL`
- L'événement n'est envoyé qu'aux sockets correspondants

### Chargement paresseux des membres

La liste complète des membres d'une guilde n'est **pas** incluse dans le payload `READY` pour les grandes guildes (> 100 membres). Seuls les membres en ligne sont inclus. Le client demande les membres hors ligne via `REQUEST_GUILD_MEMBERS`.

### Batch des présences

Les mises à jour de présence individuelles ne sont pas envoyées immédiatement. Elles sont accumulées pendant 5 secondes puis diffusées en lot pour réduire le nombre d'événements Socket.IO.
