# Spécification 34 — Canaux d'annonces & cross‑post

## 1. Modèle `ChannelFollower`

```prisma
model ChannelFollower {
  source_channel_id String // FK Channel.id, type = NEWS
  target_channel_id String // FK Channel.id où les messages seront repostés
  created_by_id    String // FK User.id qui a créé le suivi
  created_at       DateTime @default(now())
  @@unique([source_channel_id, target_channel_id])
}
```

## 2. Cross‑post d’un message

**POST** `/api/channels/:channelId/messages/:messageId/crosspost`
- **Autorisation** : `SEND_MESSAGES` dans le canal NEWS ou `MANAGE_MESSAGES`.
- **Comportement** :
  1. Le message source reçoit le flag `CROSSPOSTED` (`1 << 0`).
  2. Pour chaque `ChannelFollower` du canal source :
     - Si aucun webhook de type `CHANNEL_FOLLOWER` n’existe, le serveur en crée un (`type = 2`).
     - Un nouveau message est créé dans le canal cible avec le flag `IS_CROSSPOST` (`1 << 1`), `reference_id` pointant vers le message original et `webhook_id` du webhook créé.
  3. Limites : max 10 cross‑posts par message, max 30 cross‑posts par canal source par heure.
- **Réponse** `200 OK` :
```json
{ "crossposted": true, "targets": ["clxchanTgt001","clxchanTgt002"] }
```

## 3. Suivi d’un canal d’annonces

**POST** `/api/channels/:channelId/followers`
- **Autorisation** : `MANAGE_WEBHOOKS` dans le canal cible.
- **Corps** :
```json
{ "webhook_channel_id": "clxchanTarget" }
```
- **Réponse** `201 Created` :
```json
{ "source_channel_id": "clxchanNews", "target_channel_id": "clxchanTarget", "webhook_id": "clxwebhook123" }
```
- Limite : max 10 suivis par canal cible.

## 4. Affichage d’un message cross‑posté
- Badge : « PUBLIÉ DEPUIS **[Nom du serveur]** #**[nom‑canal]** » affiché au‑dessus du message.
- Clic sur le badge → si l’utilisateur est membre du serveur source, navigation vers le message original (`/channels/:guildId/:channelId/:messageId`).

## 5. Événement Gateway

| Événement | Payload | Description |
|-----------|---------|-------------|
| `WEBHOOKS_UPDATE` | `{ channel_id, webhook_id }` | Émis dans la guild cible lorsqu’un nouveau suivi est créé. |

---
*Cette spécification complète `03-servers-channels.md` et ajoute l’événement `WEBHOOKS_UPDATE` déjà présent dans `13-gateway-realtime.md`.*