# Spécification 28 — Threads & Forums détaillé

## 1. Types de canaux thread

| Type | Valeur | Description |
|------|--------|-------------|
| `PUBLIC_THREAD` | 11 | Fil public créé depuis un message ou depuis un canal forum |
| `PRIVATE_THREAD` | 12 | Fil privé, visible uniquement par les membres invités et les modérateurs |
| `ANNOUNCEMENT_THREAD` | 10 | Fil créé depuis un canal d'annonces |

## 2. Modèle Thread (extension de Channel)

```prisma
model Thread {
  id                     String   @id @default(cuid())
  channel_id             String   @unique // référence au Channel.id de type thread
  owner_id               String   // créateur du thread
  message_count          Int      @default(0)
  member_count           Int      @default(0)
  total_message_sent    Int      @default(0)
  thread_metadata       Json     // { archived: Boolean, auto_archive_duration: Int, archive_timestamp: DateTime?, locked: Boolean, invitable: Boolean, create_timestamp: DateTime }
}
```

## 3. Tables associées

```prisma
model ThreadMember {
  id            String   @id @default(cuid())
  thread_id     String
  user_id       String
  join_timestamp DateTime @default(now())
  flags         Int      @default(0) // bitfield, ex: NOTIFICATIONS = 1<<0
  @@unique([thread_id, user_id])
}

model ForumTag {
  id          String   @id @default(cuid())
  channel_id  String   // le forum parent
  name        String   @db.VarChar(20)
  emoji_id    String?
  emoji_name  String?
  moderated   Boolean  @default(false)
}

model AppliedTag {
  thread_id String
  tag_id    String
  @@id([thread_id, tag_id])
}
```

## 4. Endpoints threads

| Méthode | Chemin | Description |
|--------|--------|-------------|
| **POST** | `/api/channels/:channelId/threads` | Créer un fil depuis un canal (sans message initial) |
| **POST** | `/api/channels/:channelId/messages/:messageId/threads` | Créer un fil depuis un message |
| **GET** | `/api/channels/:channelId/threads/active` | Lister les fils actifs du canal |
| **GET** | `/api/channels/:channelId/threads/archived/public` | Fils publics archivés (pagination cursor) |
| **GET** | `/api/channels/:channelId/threads/archived/private` | Fils privés archivés (requiert `MANAGE_THREADS`) |
| **GET** | `/api/channels/:channelId/users/@me/threads/archived/private` | Mes fils privés archivés |
| **PUT** | `/api/channels/:threadId/thread-members/@me` | Rejoindre un fil |
| **DELETE** | `/api/channels/:threadId/thread-members/@me` | Quitter un fil |
| **PUT** | `/api/channels/:threadId/thread-members/:userId` | Ajouter un membre à un fil privé (créateur ou `MANAGE_THREADS`) |
| **DELETE** | `/api/channels/:threadId/thread-members/:userId` | Retirer un membre |
| **GET** | `/api/channels/:threadId/thread-members` | Lister les membres (`with_member=true` inclut GuildMember) |
| **PATCH** | `/api/channels/:threadId` | Archiver/désarchiver, modifier `auto_archive_duration`, `locked`, `invitable`, `name`, `applied_tags`, `rate_limit_per_user` |

## 5. Canal Forum (type = 15) et Média (type = 16)

```prisma
model ForumChannel {
  id                         String   @id @default(cuid())
  type                       Int      @default(15) // 15 = FORUM, 16 = MEDIA
  default_auto_archive_duration Int   @default(60) // minutes
  available_tags             Json     // [{id, name, emoji_id?, emoji_name?, moderated}]
  default_reaction_emoji     Json?
  default_thread_rate_limit_per_user Int @default(0)
  default_sort_order         Int      @default(0) // 0=LATEST_ACTIVITY, 1=CREATION_DATE
  default_forum_layout       Int      @default(0) // 0=NOT_SET,1=LIST_VIEW,2=GALLERY_VIEW
}
```

**Règle** : tout message doit être envoyé dans un thread. Aucun message direct n’est autorisé dans le canal forum.

### Endpoint création thread depuis forum
**POST** `/api/channels/:forumChannelId/threads`
```json
{
  "name": "Discussion",
  "auto_archive_duration": 1440,
  "message": { "content": "Premier message du fil" },
  "applied_tags": ["tagId1","tagId2"]
}
```

## 6. Auto‑archivage

Durées disponibles : 60 min, 24 h, 3 j, 7 j. Les durées 3 j et 7 j nécessitent respectivement les niveaux de boost 1 et 2.

Cron **hourly** : parcourir les threads actifs, si `last_message_timestamp` + `auto_archive_duration` dépassé → `archived = true`, `archive_timestamp = now()`.

Un fil archivé devient lecture‑seule. Il peut être désarchivé par son créateur ou un modérateur (`MANAGE_THREADS`).

`locked = true` : seuls les modérateurs peuvent écrire ou désarchiver.

## 7. Notifications de threads

- **Socket.IO event** `JOIN_THREAD` envoyé dans la room `user:<userId>` lorsqu’un utilisateur rejoint un thread.
- **CREATE_MESSAGE** dans un thread → notifier les membres du thread selon leurs préférences (`thread_mentions`, `all_mentions`).

## 8. Événements Gateway

| Événement | Payload | Description |
|-----------|---------|-------------|
| `THREAD_CREATE` | `{ thread }` | Un nouveau thread a été créé |
| `THREAD_UPDATE` | `{ thread }` | Un thread a été modifié (archivé, verrouillé, etc.) |
| `THREAD_DELETE` | `{ thread_id }` | Un thread a été supprimé |
| `THREAD_LIST_SYNC` | `{ threads: [] }` | Synchronisation des threads actifs lors de la connexion |
| `THREAD_MEMBER_UPDATE` | `{ thread_id, member }` | Un membre a rejoint ou quitté |
| `THREAD_MEMBERS_UPDATE` | `{ thread_id, members: [] }` | Mise à jour massive des membres |

---
*Cette spécification complète les sections `03-servers-channels.md` et `04-messages.md` et ajoute les nouveaux événements au fichier `13-gateway-realtime.md`.*