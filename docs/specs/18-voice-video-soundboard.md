# Spécification 18 — Voix, Vidéo & Soundboard

> **Note générale** : L'intégralité des fonctionnalités de ce document est DIFFÉRÉE. Elles sont décrites ici à des fins de planification et d'architecture future. Aucune implémentation ne doit être entreprise avant une demande explicite.

---

## 1. Canaux Vocaux

⚠️ **DIFFÉRÉ — Ne pas implémenter tant que ce n'est pas explicitement demandé**

### 1.1 Technologies

- **Protocole média** : WebRTC (peer-to-peer pour 2 participants, SFU pour les groupes)
- **SFU (Selective Forwarding Unit)** : [mediasoup](https://mediasoup.org/) — solution Node.js native, aucun service externe requis
  - mediasoup s'exécute en tant que worker dans le processus serveur ou dans un processus séparé
  - Architecture : un `Worker` mediasoup par CPU disponible, plusieurs `Router` par worker
- **Signalisation** : via Socket.IO (canal dédié aux événements vocaux, sur la même connexion que les autres événements temps réel)
- **Codec audio** : Opus (supporté nativement par WebRTC)

### 1.2 Modèle de données

#### Channel (type vocal)
Un canal vocal est un `Channel` standard avec `type = VOICE (2)`.

Champs supplémentaires sur le modèle `Channel` pour les canaux vocaux :

| Champ | Type | Description |
|---|---|---|
| `bitrate` | Int | Qualité audio en bps. Plage : 8000–96000 (standard), jusqu'à 384000 avec boost de serveur. Défaut : 64000 |
| `userLimit` | Int | Nombre max d'utilisateurs simultanés. 0 = illimité. Max : 99 |
| `rtcRegion` | String? | Région de serveur vocal (optionnel, pour usage futur) |

#### VoiceState

```
VoiceState {
  userId         : String  (FK → User)
  guildId        : String? (FK → Guild, null pour les DM vocaux)
  channelId      : String? (FK → Channel, null si déconnecté)
  sessionId      : String  (identifiant de session unique, généré à la connexion)
  deaf           : Boolean (sourd côté serveur — forcé par un modérateur)
  mute           : Boolean (muet côté serveur — forcé par un modérateur)
  selfDeaf       : Boolean (sourd de son propre chef)
  selfMute       : Boolean (muet de son propre chef)
  selfStream     : Boolean (est en train de partager son écran)
  selfVideo      : Boolean (caméra activée)
  suppress       : Boolean (mode audience en Stage channel)
  requestToSpeak : DateTime? (timestamp de la demande de parole en Stage)
  createdAt      : DateTime
  updatedAt      : DateTime
}
```

Clé primaire : `(userId, guildId)` — un utilisateur ne peut être que dans un seul canal vocal par serveur.

### 1.3 Flux de connexion

1. Le client émet `VOICE_STATE_UPDATE` sur la connexion Socket.IO avec `{ guildId, channelId, selfMute, selfDeaf }`
2. Le serveur vérifie :
   - L'utilisateur est bien membre du serveur
   - L'utilisateur possède la permission `CONNECT` sur le canal
   - Le canal n'a pas atteint sa `userLimit` (si > 0)
3. Le serveur met à jour le `VoiceState` en base et diffuse `VOICE_STATE_UPDATE` à tous les membres du serveur
4. Le serveur émet vers le client `VOICE_SERVER_UPDATE` contenant :
   ```json
   {
     "token": "<token_signé_court_durée>",
     "guildId": "...",
     "endpoint": "ws://localhost:3001/voice"
   }
   ```
5. Le client ouvre une connexion WebSocket vers l'endpoint vocal
6. Échange de capacités mediasoup (RTP capabilities)
7. Création des transports WebRTC côté serveur et côté client
8. Échange des paramètres de transport (DTLS, ICE)
9. Création des producers (micro/caméra) et des consumers (flux des autres participants)
10. Les médias circulent via mediasoup (SFU)

### 1.4 Fonctionnalités vocales

- **Rejoindre / Quitter** un canal vocal : via `VOICE_STATE_UPDATE`
- **Mute/Deafen serveur** : un modérateur peut forcer `mute: true` ou `deaf: true` sur un utilisateur
- **Mute/Deafen soi-même** : l'utilisateur contrôle `selfMute` et `selfDeaf` — ces états ne coupent pas le flux côté serveur mais signalent aux autres de ne pas afficher l'activité vocale
- **Déplacer un membre** : un modérateur avec `MOVE_MEMBERS` peut forcer un utilisateur dans un autre canal vocal
- **Indicateur d'activité vocale** : le serveur émet des événements `SPEAKING` quand l'analyse VAD (Voice Activity Detection) détecte que l'utilisateur parle — déclenche l'animation de l'avatar dans l'UI
- **Orateur prioritaire** (`PRIORITY_SPEAKER`) : quand actif, le volume des autres participants est automatiquement réduit

### 1.5 Permissions vocales

| Permission | Description |
|---|---|
| `CONNECT` | Peut rejoindre le canal vocal |
| `SPEAK` | Peut transmettre de l'audio |
| `MUTE_MEMBERS` | Peut muter les autres membres côté serveur |
| `DEAFEN_MEMBERS` | Peut rendre les autres membres sourds côté serveur |
| `MOVE_MEMBERS` | Peut déplacer les membres entre les canaux vocaux |
| `USE_VAD` | Peut utiliser la détection vocale automatique (sans push-to-talk) |
| `PRIORITY_SPEAKER` | Peut s'activer comme orateur prioritaire |

### 1.6 Traitement audio

- **Codec** : Opus, 48kHz, stéréo
- **Suppression du bruit** : RNNoise via WebAssembly (`rnnoise-wasm`), appliqué dans le navigateur avant l'envoi
- **Annulation d'écho** : native WebRTC (AEC — Acoustic Echo Cancellation)
- **Contrôle automatique du gain** : native WebRTC (AGC)
- **Push-to-talk** : géré côté client (coupure du micro sauf quand la touche configurée est maintenue) — le serveur ne connaît pas ce mode, il reçoit juste l'audio ou son absence

### 1.7 Événements Socket.IO — Canaux vocaux

| Événement | Direction | Payload | Description |
|---|---|---|---|
| `VOICE_STATE_UPDATE` | Client → Serveur | `{ channelId, selfMute, selfDeaf }` | Rejoindre/quitter/modifier l'état |
| `VOICE_STATE_UPDATE` | Serveur → Client | VoiceState complet | Diffusé à tous les membres du serveur |
| `VOICE_SERVER_UPDATE` | Serveur → Client | `{ token, guildId, endpoint }` | Infos de connexion au serveur vocal |
| `SPEAKING` | Serveur → Client | `{ userId, speaking: boolean, ssrc }` | Indicateur d'activité vocale |

### 1.8 API REST — Canaux vocaux

```
GET  /api/guilds/:guildId/voice-states        → liste tous les VoiceState du serveur
GET  /api/guilds/:guildId/voice-states/@me    → VoiceState de l'utilisateur courant
PATCH /api/guilds/:guildId/voice-states/@me   → modifier selfMute, selfDeaf, channelId
PATCH /api/guilds/:guildId/voice-states/:userId → modérateur : mute/deaf/move
```

---

## 2. Vidéo et Partage d'Écran

⚠️ **DIFFÉRÉ — Ne pas implémenter tant que ce n'est pas explicitement demandé**

### 2.1 Technologies

- Utilise la **même infrastructure SFU mediasoup** que la voix
- **Partage d'écran** : API navigateur `navigator.mediaDevices.getDisplayMedia()`
- **Caméra** : API navigateur `navigator.mediaDevices.getUserMedia({ video: true })`
- **Codecs vidéo supportés** : VP8, VP9, H.264 (selon les capacités du navigateur)

### 2.2 Qualité vidéo

| Mode | Résolution | FPS | Disponibilité |
|---|---|---|---|
| Caméra standard | 720p | 30 | Tous utilisateurs |
| Caméra HD | 1080p | 30 | OpenCord+ uniquement |
| Partage d'écran standard | 720p | 30 | Tous utilisateurs |
| Partage d'écran HD | 1080p | 60 | OpenCord+ uniquement |

### 2.3 Fonctionnalité "Go Live" (stream vers le canal)

- Un utilisateur connecté à un canal vocal peut activer le mode Go Live pour diffuser son écran à tous les membres présents dans ce canal
- L'état `selfStream: true` est reflété dans le `VoiceState`
- Les spectateurs voient le flux sans être actifs (ils n'ont pas besoin d'être dans le canal vocal eux-mêmes, mais l'accès au visionnage peut être restreint au canal)

### 2.4 Grille vidéo

- Jusqu'à **25 participants** affichables simultanément en grille
- Mise en page adaptative : 1 → 2×2 → 3×3 → 4×4 → 5×5 selon le nombre de participants actifs
- Focus mode : cliquer sur un participant l'agrandit en plein écran (vue épinglée)

### 2.5 Champs supplémentaires sur VoiceState

| Champ | Type | Description |
|---|---|---|
| `selfStream` | Boolean | L'utilisateur partage son écran via Go Live |
| `selfVideo` | Boolean | La caméra de l'utilisateur est activée |

---

## 3. Canaux Stage

⚠️ **DIFFÉRÉ — Ne pas implémenter tant que ce n'est pas explicitement demandé**

### 3.1 Concept

Un canal Stage est un canal vocal avec un modèle **orateur/audience** :
- **Orateurs** : transmettent leur audio, visibles par tous
- **Audience** : écoute uniquement, peut lever la main pour demander à parler
- Les modérateurs du Stage peuvent inviter des membres de l'audience à parler, les ramener dans l'audience, ou les muter

Le canal Stage est représenté par `type = STAGE (14)` dans le modèle `Channel`.

### 3.2 Modèle `StageInstance`

```
StageInstance {
  id            : String   (CUID)
  channelId     : String   (FK → Channel)
  guildId       : String   (FK → Guild)
  topic         : String   (sujet du Stage, max 120 caractères)
  privacyLevel  : Enum     (PUBLIC | GUILD_ONLY)
  discoverable  : Boolean  (visible dans la liste publique des Stages actifs)
  createdAt     : DateTime
  updatedAt     : DateTime
}
```

### 3.3 Gestion des rôles dans un Stage

- `suppress: true` dans `VoiceState` = l'utilisateur est en mode audience
- `suppress: false` = l'utilisateur est orateur
- `requestToSpeak` : timestamp quand un membre de l'audience lève la main

Les modérateurs du Stage sont les utilisateurs ayant la permission `MUTE_MEMBERS` ou `MOVE_MEMBERS`.

### 3.4 Événements Socket.IO — Stage

| Événement | Description |
|---|---|
| `STAGE_INSTANCE_CREATE` | Un Stage est démarré dans le serveur |
| `STAGE_INSTANCE_UPDATE` | Le sujet ou les paramètres du Stage changent |
| `STAGE_INSTANCE_DELETE` | Le Stage est terminé |

### 3.5 API REST — Stage

```
POST   /api/stage-instances              → démarrer un Stage (body: { channelId, topic, privacyLevel })
GET    /api/stage-instances/:channelId   → infos sur le Stage actif
PATCH  /api/stage-instances/:channelId   → modifier le topic ou la visibilité
DELETE /api/stage-instances/:channelId   → terminer le Stage
```

---

## 4. Soundboard

⚠️ **DIFFÉRÉ — Ne pas implémenter tant que ce n'est pas explicitement demandé**

### 4.1 Concept

Le Soundboard permet aux membres d'un serveur de jouer des sons courts dans un canal vocal pour que tous les participants l'entendent. Chaque serveur peut avoir sa propre collection de sons.

### 4.2 Modèle de données

```
SoundboardSound {
  id              : String   (CUID)
  guildId         : String?  (FK → Guild, null pour les sons globaux par défaut)
  name            : String   (max 32 caractères)
  emoji           : String?  (emoji unicode ou ID d'emoji custom associé)
  volume          : Float    (0.0 à 1.0, défaut : 1.0)
  available       : Boolean  (false si le boost tier baisse et dépasse la limite)
  creatorId       : String   (FK → User)
  storagePath     : String   (chemin relatif depuis uploads/)
  url             : String   (URL publique /files/...)
  mimeType        : String
  durationSeconds : Float    (durée en secondes, max 5.0)
  fileSizeBytes   : Int
  createdAt       : DateTime
  updatedAt       : DateTime
}
```

### 4.3 Limites par tier de boost

| Tier | Nombre de sons maximum |
|---|---|
| Tier 0 (non boosté) | 8 sons |
| Tier 1 (2 boosts) | 24 sons |
| Tier 2 (7 boosts) | 36 sons |
| Tier 3 (14 boosts) | 48 sons |

Si le tier du serveur baisse (suite à l'expiration de boosts), les sons excédentaires sont marqués `available: false` — ils restent en base mais ne peuvent plus être joués. Ils redeviennent disponibles si le tier remonte.

### 4.4 Spécifications des fichiers audio

| Propriété | Valeur |
|---|---|
| Durée maximale | 5 secondes |
| Taille maximale | 512 KB |
| Formats acceptés | MP3 (`audio/mpeg`), OGG (`audio/ogg`), WAV (`audio/wav`) |

Le fichier audio est stocké dans `uploads/soundboard/{guildId}/{soundId}.{ext}`.

### 4.5 Mécanisme de lecture

1. Un utilisateur connecté à un canal vocal clique sur un son dans le panneau Soundboard
2. Le client émet `SOUNDBOARD_SEND` : `{ soundId, channelId }`
3. Le serveur vérifie :
   - L'utilisateur est bien connecté au canal vocal `channelId`
   - L'utilisateur possède la permission `USE_SOUNDBOARD`
   - Le son n'est pas en cooldown pour cet utilisateur
4. Le serveur récupère le fichier audio et le joue comme un flux audio supplémentaire dans le canal via mediasoup
5. Tous les membres connectés au canal entendent le son
6. Le serveur enregistre le timestamp de lecture pour le cooldown

**Cooldown** : 5 secondes entre deux sons joués par le même utilisateur.

### 4.6 Permission

| Permission | Description |
|---|---|
| `USE_SOUNDBOARD` | Peut jouer des sons depuis le Soundboard |
| `MANAGE_GUILD_EXPRESSIONS` | Peut créer, modifier et supprimer des sons (même permission que pour les emojis) |

### 4.7 API REST — Soundboard

```
GET    /api/guilds/:guildId/soundboard-sounds
  → Retourne la liste de tous les sons du serveur
  Response: SoundboardSound[]

POST   /api/guilds/:guildId/soundboard-sounds
  → Créer un son (multipart/form-data)
  Body: { name: String, emoji?: String, volume?: Float, file: File }
  Response 201: SoundboardSound
  Permissions requises: MANAGE_GUILD_EXPRESSIONS

PATCH  /api/guilds/:guildId/soundboard-sounds/:soundId
  → Modifier nom, emoji ou volume d'un son
  Body: { name?: String, emoji?: String, volume?: Float }
  Response 200: SoundboardSound
  Permissions requises: MANAGE_GUILD_EXPRESSIONS

DELETE /api/guilds/:guildId/soundboard-sounds/:soundId
  → Supprimer un son et son fichier physique
  Response 204: (no content)
  Permissions requises: MANAGE_GUILD_EXPRESSIONS

POST   /api/guilds/:guildId/soundboard-sounds/:soundId/play
  → Jouer un son dans un canal vocal
  Body: { channelId: String }
  Response 200: { success: true }
  Permissions requises: USE_SOUNDBOARD + être connecté au canal
```

### 4.8 Interface de gestion (page Paramètres Serveur → Soundboard)

La page de paramètres du Soundboard, accessible via le panneau de paramètres du serveur, doit permettre :

- **Liste des sons** : affichage en grille ou en tableau avec emoji, nom, durée, volume, créateur, date d'ajout
- **Prévisualisation** : bouton de lecture pour chaque son (lecture dans le navigateur, sans passer par le canal vocal)
- **Ajout** : bouton "Ajouter un son" → formulaire avec upload du fichier audio, nom, emoji associé, volume
- **Modification** : clic sur un son → modification du nom, emoji, volume (slider 0–100%)
- **Suppression** : bouton supprimer avec confirmation, libère un slot
- **Indicateur de limite** : jauge affichant le nombre de slots utilisés / disponibles pour le tier actuel

### 4.9 Panneau Soundboard en canal vocal

Lorsqu'un utilisateur est connecté à un canal vocal, un bouton "Soundboard" apparaît dans la barre d'actions (barre du bas ou barre flottante du canal vocal). Son clic ouvre un panneau latéral ou flottant affichant :

- Les sons du serveur courant (filtrés par `available: true`)
- Les sons globaux par défaut (fournis avec OpenCord, quelques sons d'ambiance)
- Chaque son : bouton cliquable avec emoji + nom
- Indicateur de cooldown sur le bouton après lecture (5 secondes)

---

## 5. Dépendances npm requises (DIFFÉRÉES)

> Ces packages ne doivent être installés qu'au moment de l'implémentation effective de ces fonctionnalités.

| Package | Rôle |
|---|---|
| `mediasoup` | SFU WebRTC pour Node.js |
| `rnnoise-wasm` | Suppression du bruit côté client (WebAssembly) |
| `@types/mediasoup-client` | Types TypeScript pour mediasoup client |
| `mediasoup-client` | SDK client pour la connexion WebRTC via mediasoup |

---

## 6. Configuration `.env` liée à la voix/vidéo (DIFFÉRÉE)

```env
# Nombre de workers mediasoup (typiquement = nombre de CPU)
MEDIASOUP_NUM_WORKERS=2

# Plage de ports UDP pour les transports WebRTC
MEDIASOUP_RTC_MIN_PORT=10000
MEDIASOUP_RTC_MAX_PORT=10100

# IP annoncée aux clients (IP publique ou LAN en dev)
MEDIASOUP_ANNOUNCED_IP=127.0.0.1

# Bitrate maximum pour la voix (en bps)
VOICE_MAX_BITRATE=96000
VOICE_MAX_BITRATE_BOOSTED=384000
```
