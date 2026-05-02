# Spécification 37 — Transfert de messages & Super Réactions

## 1. Modifications du modèle `Message`

```prisma
model Message {
  id                String   @id @default(cuid())
  channel_id        String   // FK Channel.id
  author_id         String   // FK User.id
  content           String?
  // ... autres champs existants
  message_snapshots Json?    // [{ "message": { "id": "...", "content": "...", "author": {"id": "..."}, "attachments": [], "embeds": [], "created_at": "..." } }]
  flags             Int      @default(0) // bits : 1<<13 = FORWARDED, 1<<14 = IS_VOICE_MESSAGE, etc.
}
```

- `FORWARDED` (`1 << 13`) indique qu’un message a été transféré.
- `message_snapshots` contient le(s) snapshot(s) du ou des messages originaux.

## 2. Endpoint de transfert

**POST** `/api/channels/:targetChannelId/messages`
```json
{
  "message_reference": {
    "message_id": "clxmsg123",
    "channel_id": "clxchanSrc",
    "guild_id": "clxguild001",
    "type": 1 // 0 = reply, 1 = forward
  }
}
```
- Validation : l’utilisateur doit avoir accès au message source (membre du canal source).
- Le serveur crée un nouveau message dans `targetChannelId` avec `flags` incluant `FORWARDED` et copie le snapshot du message original dans `message_snapshots`.
- Réponse `201 Created` :
```json
{ "id": "clxmsgFwd001", "channel_id": "clxchanDst", "author_id": "clxuserMe", "content": null, "message_snapshots": [{"message":{...}}], "flags": 8192 }
```

## 3. Affichage du message transféré (client)
- En‑tête : texte **« Message transféré »** avec icône de transfert.
- Le snapshot est rendu comme un embed léger : auteur original, contenu, aperçu des pièces jointes (lien vers l’original si accessible).
- Aucun fichier n’est réellement copié.

## 4. Super Réactions

### Modifications du modèle `MessageReaction`
```prisma
model MessageReaction {
  message_id   String
  channel_id   String
  emoji_id     String?
  emoji_name   String
  burst_colors Json?   // ["#FF0000","#00FF00"] – couleurs de l’animation
  burst_count  Int    @default(0)
  me_burst     Boolean @default(false)
  // ... autres champs existants
  @@id([message_id, channel_id, emoji_id, emoji_name])
}
```

### Table `MessageReactionUser`
```prisma
model MessageReactionUser {
  message_id String
  channel_id String
  emoji_id   String?
  emoji_name String
  user_id    String
  burst      Boolean @default(false)
  @@id([message_id, channel_id, emoji_id, emoji_name, user_id, burst])
}
```

### Endpoints réactions
| Méthode | Chemin | Query `type` | Description |
|--------|--------|--------------|-------------|
| **PUT** | `/api/channels/:channelId/messages/:messageId/reactions/:emoji/@me` | `0` = normale (défaut) <br> `1` = super réaction (requiert OpenCord+) | Ajouter une réaction
| **DELETE** | `/api/channels/:channelId/messages/:messageId/reactions/:emoji/@me?type=0` | Supprimer réaction normale |
| **DELETE** | `/api/channels/:channelId/messages/:messageId/reactions/:emoji/@me?type=1` | Supprimer super réaction |
| **GET** | `/api/channels/:channelId/messages/:messageId/reactions/:emoji` | `type=0` ou `1`, `after` (userId), `limit` (max 25) | Lister les utilisateurs ayant réagi |
| **DELETE** | `/api/channels/:channelId/messages/:messageId/reactions` | — | Supprimer toutes les réactions (requiert `MANAGE_MESSAGES`) |
| **DELETE** | `/api/channels/:channelId/messages/:messageId/reactions/:emoji` | — | Supprimer toutes les réactions d’un emoji (requiert `MANAGE_MESSAGES`) |

### Règles métier
- Super réaction (`type=1`) nécessite que l’utilisateur possède `premium_type >= 1` (OpenCord+).
- Limite : max 3 super réactions par message et par utilisateur.
- `burst_colors` par défaut : `["#7c3aed","#a855f7","#d946ef"]` (couleurs de la marque).

## 5. Animation côté client
- Lorsqu’une super réaction est ajoutée, jouer une animation CSS **burst** : particules colorées selon `burst_colors` qui éclatent autour de l’emoji.
- L’emoji affiche un petit compteur `burst_count`.
- Si `me_burst` est `true`, le client indique que l’utilisateur a déjà utilisé une super réaction sur cet emoji.

---
*Cette spécification complète les sections `04-messages.md` et `08-emojis-stickers.md` et n’ajoute aucun nouvel événement au fichier `13-gateway-realtime.md`.*