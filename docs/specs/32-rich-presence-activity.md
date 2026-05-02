# Spécification 32 — Présence riche & activités

## 1. Modèle `UserActivity`

```prisma
model UserActivity {
  user_id        String   @id // FK User.id
  name           String   // nom du jeu / application
  type           Int      // 0=PLAYING,1=STREAMING,2=LISTENING,3=WATCHING,5=COMPETING,4=CUSTOM (déjà géré ailleurs)
  url            String?  // URL du stream pour type=STREAMING
  details        String?  // ligne 1 sous le nom
  state          String?  // ligne 2 sous le nom
  timestamps     Json?    // { "start": 1620000000, "end": 1620003600 }
  assets         Json?    // { "large_image": "hash", "large_text": "text", "small_image": "hash", "small_text": "text" }
  party          Json?    // { "id": "party1", "size": [current, max] }
  application_id String?  // FK Application.id si liée à une application bot
  created_at     Int      // timestamp Unix (ms) de création
}
```

> ⚠️ DIFFÉRÉ – persistance en base de données n’est pas prévue, les activités sont stockées en mémoire côté serveur.

## 2. Mise à jour via Gateway

- Le client envoie l’événement **`PRESENCE_UPDATE`** sur la connexion Socket.IO avec le payload :
```json
{
  "status": "online",
  "activities": [/* tableau d'objets UserActivity (sans `created_at`) */],
  "client_status": { "desktop": "online", "mobile": "idle", "web": "online" }
}
```
- Aucun endpoint REST ; le serveur met à jour une `Map<string, UserActivity[]>` en mémoire et diffuse l’événement aux membres concernés.

## 3. Événement Gateway `PRESENCE_UPDATE`

| Champ | Type | Description |
|------|------|-------------|
| `user.id` | String | Snowflake de l'utilisateur |
| `guild_id` | String? | Guild concernée (si présence dans une guild) |
| `status` | String (`online`,`idle`,`dnd`,`offline`) |
| `activities` | Array of UserActivity objects |
| `client_status` | Object `{ desktop?, mobile?, web? }` |

## 4. Affichage côté client
- Sous le nom d’utilisateur dans la liste des membres et sur le profil, on affiche l’icône et le texte de l’activité.
- Tooltip : montre les assets, `details`, `state` et la durée calculée depuis `timestamps.start`.
- Barre de progression pour les activités musicales (`type=LISTENING`) : largeur proportionnelle à `now - start` / (`end - start`).
- Badge **LIVE** lorsqu’une activité `STREAMING` possède une URL.

## 5. Intégration Spotify (plugin officiel)
- Plugin `spotify-rpc` côté client utilise l’API Web Playback SDK ou les API publiques de Spotify.
- Lorsqu’un utilisateur écoute sur Spotify, le client crée automatiquement une activité :
```json
{
  "name": "Spotify",
  "type": 2,
  "details": "Titre de la piste",
  "state": "Artiste",
  "timestamps": { "start": 1620000000 },
  "assets": { "large_image": "spotify:album:hash", "large_text": "Album" }
}
```
- Le token OAuth Spotify **n’est jamais** envoyé au serveur OpenCord ; il reste côté client.

---
*Cette spécification s’appuie sur les modèles de `02-users-profiles-badges.md` pour le statut personnalisé et ajoute l’événement `PRESENCE_UPDATE` au fichier `13-gateway-realtime.md`.*