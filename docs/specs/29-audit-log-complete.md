# Spécification 29 — Journal d'audit complet

## 1. Modèle `AuditLogEntry`

```prisma
model AuditLogEntry {
  id          String   @id @default(cuid())
  guild_id    String
  target_id   String
  target_type String   // enum (USER, ROLE, CHANNEL, MESSAGE, ...)
  user_id     String   // acteur
  action_type Int
  changes     Json     // [{"key":"name","old_value":"Ancien","new_value":"Nouveau"}]
  options     Json?
  reason      String?  @db.VarChar(512)
  created_at  DateTime @default(now())
}
```

## 2. Structure `changes`
```json
[
  { "key": "name", "old_value": "Ancien nom", "new_value": "Nouveau nom" },
  { "key": "permissions", "old_value": "1024", "new_value": "2048" }
]
```

## 3. Structure `options`
Varie selon `action_type`. Exemples :
- `count` : nombre d’éléments (bulk delete)
- `channel_id`, `message_id`, `role_name`, `type` (overwrite)

## 4. Table exhaustive des `action_type`
*(Valeurs compatibles Discord)*

| Catégorie | Valeur | Action |
|-----------|--------|--------|
| Guild | 1 | GUILD_UPDATE |
| Channel | 10 | CHANNEL_CREATE |
|  | 11 | CHANNEL_UPDATE |
|  | 12 | CHANNEL_DELETE |
| Channel Overwrite | 13 | CHANNEL_OVERWRITE_CREATE |
|  | 14 | CHANNEL_OVERWRITE_UPDATE |
|  | 15 | CHANNEL_OVERWRITE_DELETE |
| Member | 20 | MEMBER_KICK |
|  | 21 | MEMBER_PRUNE |
|  | 22 | MEMBER_BAN_ADD |
|  | 23 | MEMBER_BAN_REMOVE |
|  | 24 | MEMBER_UPDATE |
|  | 25 | MEMBER_ROLE_UPDATE |
|  | 26 | MEMBER_MOVE |
|  | 27 | MEMBER_DISCONNECT |
|  | 28 | BOT_ADD |
| Role | 30 | ROLE_CREATE |
|  | 31 | ROLE_UPDATE |
|  | 32 | ROLE_DELETE |
| Invite | 40 | INVITE_CREATE |
|  | 41 | INVITE_UPDATE |
|  | 42 | INVITE_DELETE |
| Webhook | 50 | WEBHOOK_CREATE |
|  | 51 | WEBHOOK_UPDATE |
|  | 52 | WEBHOOK_DELETE |
| Emoji | 60 | EMOJI_CREATE |
|  | 61 | EMOJI_UPDATE |
|  | 62 | EMOJI_DELETE |
| Message | 72 | MESSAGE_DELETE |
|  | 73 | MESSAGE_BULK_DELETE |
|  | 74 | MESSAGE_PIN |
|  | 75 | MESSAGE_UNPIN |
| Integration | 80 | INTEGRATION_CREATE |
|  | 81 | INTEGRATION_UPDATE |
|  | 82 | INTEGRATION_DELETE |
| Stage Instance | 83 | STAGE_INSTANCE_CREATE |
|  | 84 | STAGE_INSTANCE_UPDATE |
|  | 85 | STAGE_INSTANCE_DELETE |
| Sticker | 90 | STICKER_CREATE |
|  | 91 | STICKER_UPDATE |
|  | 92 | STICKER_DELETE |
| Scheduled Event | 100 | GUILD_SCHEDULED_EVENT_CREATE |
|  | 101 | GUILD_SCHEDULED_EVENT_UPDATE |
|  | 102 | GUILD_SCHEDULED_EVENT_DELETE |
| Thread | 110 | THREAD_CREATE |
|  | 111 | THREAD_UPDATE |
|  | 112 | THREAD_DELETE |
| Application Command Permission | 121 | APPLICATION_COMMAND_PERMISSION_UPDATE |
| AutoMod | 140 | AUTO_MODERATION_RULE_CREATE |
|  | 141 | AUTO_MODERATION_RULE_UPDATE |
|  | 142 | AUTO_MODERATION_RULE_DELETE |
| AutoMod Action | 143 | AUTO_MODERATION_BLOCK_MESSAGE |
```

## 5. Endpoint REST

| Méthode | Chemin | Description |
|--------|--------|-------------|
| **GET** | `/api/guilds/:guildId/audit-logs` | Lister les entrées d’audit |

### Paramètres de requête
- `user_id` : filtrer par acteur
- `action_type` : filtrer par type d’action
- `before` / `after` : curseur de pagination (snowflake)
- `limit` : 1‑100 (défaut 50)

### Réponse
```json
{
  "audit_log_entries": [/* AuditLogEntry */],
  "users": [],
  "webhooks": [],
  "application_commands": []
}
```

**Permission requise** : `VIEW_AUDIT_LOG`.

## 6. Création automatique d’entrées
```ts
interface CreateAuditLogParams {
  guildId: string;
  userId: string;
  targetId: string;
  targetType: string;
  actionType: number;
  changes: Array<{key:string; old_value:any; new_value:any}>;
  options?: any;
  reason?: string;
}

await AuditLogService.create(params);
```
Le header `X-Audit-Log-Reason` (URL‑encoded, max 512 car) peut être fourni par le bot.

## 7. Événement Gateway

| Événement | Payload | Description |
|-----------|---------|-------------|
| `GUILD_AUDIT_LOG_ENTRY_CREATE` | `{ entry }` | Diffusé dans la room `guild:<guildId>` aux membres possédant `VIEW_AUDIT_LOG` |

---
*Cette spécification complète `06-moderation-automod.md` et ajoute l’événement au fichier `13-gateway-realtime.md`.*