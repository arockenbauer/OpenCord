# Spécification 07 — Invitations, Amis & Messages Privés

## Vue d'ensemble

Cette spécification couvre trois systèmes interconnectés : le système d'invitations pour rejoindre des serveurs, le système de messages privés (DM et groupes), et le système d'amis (complément à la spécification 02). Ces trois systèmes sont au cœur de la communication dans OpenCord.

---

## 1. Système d'invitations

### 1.1 Modèle de données

```
Invite {
  code        String    @id (6 à 10 caractères alphanumériques, ex: "aBcD3F")
  guild_id    String    (référence vers Guild)
  channel_id  String    (référence vers Channel — salon d'arrivée par défaut)
  inviter_id  String    (référence vers User — créateur du lien)
  uses        Int       @default(0)  (nombre d'utilisations)
  max_uses    Int       @default(0)  (0 = illimité)
  max_age     Int       @default(86400) (durée en secondes, 0 = permanent)
  temporary   Boolean   @default(false) (voir règle ci-dessous)
  created_at  DateTime  @default(now())
  expires_at  DateTime? (null si permanent, calculé = created_at + max_age)
  guild_scheduled_event_id String? (événement associé, v2)
}
```

**Règle `temporary` :**
- Si `true`, les membres qui rejoignent via ce lien sont **expulsés** automatiquement s'ils quittent tous les salons vocaux **et** qu'ils n'ont reçu aucun rôle (autre que `@everyone`).
- En pratique : utilisé pour des événements temporaires ou auditions.

**Génération du `code` :**
- Généré côté serveur : chaîne aléatoire alphanumériques sécurisée (`crypto.randomBytes`).
- Longueur par défaut : 8 caractères.
- Unicité vérifiée en base (réessai si collision).

---

### 1.2 Endpoints d'invitations

#### `POST /api/channels/:channelId/invites` — Créer un lien d'invitation

**Requiert :** `CREATE_INSTANT_INVITE` dans le salon

**Corps de la requête :**
```json
{
  "max_age": 86400,
  "max_uses": 50,
  "temporary": false,
  "unique": true
}
```
- `max_age` : 0 (permanent), 1800 (30min), 3600 (1h), 21600 (6h), 43200 (12h), 86400 (1 jour), 604800 (7 jours) en secondes.
- `max_uses` : 0 (illimité), 1, 5, 10, 25, 50, 100.
- `unique` : si `false`, retourner un lien existant compatible si disponible. Si `true`, forcer la création d'un nouveau code.

**Réponse 200 :**
```json
{
  "code": "aBcD3F8g",
  "guild": {
    "id": "9876543210987654321",
    "name": "Mon Serveur",
    "icon": "abc123hash",
    "splash": null,
    "banner": null,
    "features": [],
    "verification_level": 1,
    "vanity_url_code": null,
    "approximate_member_count": 42,
    "approximate_presence_count": 12
  },
  "channel": {
    "id": "1234567890123456789",
    "name": "général",
    "type": 0
  },
  "inviter": {
    "id": "1111111111111111111",
    "username": "alice",
    "avatar": "def456hash",
    "global_name": "Alice"
  },
  "uses": 0,
  "max_uses": 50,
  "max_age": 86400,
  "temporary": false,
  "created_at": "2025-01-01T00:00:00.000Z",
  "expires_at": "2025-01-02T00:00:00.000Z"
}
```

---

#### `GET /api/guilds/:guildId/invites` — Lister toutes les invitations d'un serveur

**Requiert :** `MANAGE_GUILD`

**Réponse 200 :**
```json
[
  {
    "code": "aBcD3F8g",
    "guild": { ... },
    "channel": { "id": "...", "name": "général", "type": 0 },
    "inviter": { "id": "...", "username": "alice", "avatar": "..." },
    "uses": 12,
    "max_uses": 50,
    "max_age": 86400,
    "temporary": false,
    "created_at": "2025-01-01T00:00:00.000Z",
    "expires_at": "2025-01-02T00:00:00.000Z"
  }
]
```

---

#### `GET /api/channels/:channelId/invites` — Lister les invitations d'un salon

**Requiert :** `MANAGE_CHANNELS`

**Réponse 200 :** même format que ci-dessus, filtré pour ce salon.

---

#### `GET /api/invites/:code` — Obtenir les informations d'une invitation

**Authentification :** non requise (route publique)

**Paramètres de requête optionnels :**
```
?with_counts=true    (inclure approximate_member_count et approximate_presence_count)
?with_expiration=true
```

**Réponse 200 :**
```json
{
  "code": "aBcD3F8g",
  "type": 0,
  "guild": {
    "id": "...",
    "name": "Mon Serveur",
    "icon": "...",
    "splash": null,
    "banner": null,
    "description": "Description du serveur",
    "features": [],
    "verification_level": 1,
    "nsfw_level": 0,
    "approximate_member_count": 42,
    "approximate_presence_count": 12
  },
  "channel": { "id": "...", "name": "général", "type": 0 },
  "inviter": { "id": "...", "username": "alice" },
  "uses": 12,
  "max_uses": 50,
  "expires_at": "2025-01-02T00:00:00.000Z"
}
```

**Réponse 404** si le code n'existe pas ou a expiré.

---

#### `DELETE /api/invites/:code` — Révoquer une invitation

**Requiert :** Être le créateur de l'invitation OU avoir `MANAGE_GUILD`

**Réponse 200 :** objet de l'invitation révoquée

---

#### `POST /api/invites/:code` — Utiliser une invitation (rejoindre un serveur)

**Requiert :** Authentification

**Corps de la requête :** vide `{}`

**Réponse 200 :**
```json
{
  "type": 0,
  "guild": { ... },
  "channel": { ... },
  "new_member": false
}
```
- `new_member: true` si l'utilisateur rejoint pour la première fois.
- `new_member: false` si l'utilisateur est déjà membre (pas d'erreur, retour silencieux).

**Erreurs :**
- `404` si le code n'existe pas ou a expiré.
- `403` avec `INVITE_MAX_USES_REACHED` si les utilisations sont épuisées.
- `403` avec `BANNED_FROM_GUILD` si l'utilisateur est banni du serveur.
- `403` avec `VERIFICATION_LEVEL_TOO_LOW` si le niveau de vérification n'est pas atteint.
- `403` avec `INVITES_DISABLED` si les invitations sont suspendues.

**Comportement :**
- Incrémente `uses` de l'invitation.
- Vérifie si `uses >= max_uses` (quand `max_uses > 0`) → marquer comme expirée ou supprimer.
- Crée l'entrée `GuildMember` avec les rôles par défaut (`@everyone`).
- Émet `GUILD_MEMBER_ADD` via Socket.IO.

---

### 1.3 URL personnalisée (Vanity URL)

- Disponible uniquement pour les serveurs **Tier 3** (14 boosts minimum).
- Le code vanity est une chaîne personnalisée (ex: "mon-serveur", 3-32 caractères alphanumériques et tirets).

#### `GET /api/guilds/:guildId/vanity-url`

**Requiert :** `MANAGE_GUILD`

**Réponse 200 :**
```json
{
  "code": "mon-serveur",
  "uses": 1337
}
```

#### `PATCH /api/guilds/:guildId/vanity-url`

**Requiert :** `MANAGE_GUILD` + Tier 3

**Corps de la requête :**
```json
{
  "code": "nouveau-code"
}
```

**Réponse 200 :** `{ "code": "nouveau-code" }`

**Erreurs :**
- `403` si le serveur n'est pas Tier 3.
- `409` si le code est déjà utilisé par un autre serveur.
- `400` si le code contient des caractères invalides.

---

### 1.4 Suspension des invitations

- **Champ `Guild.invites_disabled`** : booléen, `false` par défaut.
- Quand `true`, toute tentative d'utiliser une invitation retourne `403 INVITES_DISABLED`.
- Les nouvelles invitations ne peuvent pas être créées.

#### `PATCH /api/guilds/:guildId`

```json
{
  "invites_disabled": true
}
```

**Requiert :** `MANAGE_GUILD`

---

### 1.5 Interface (Paramètres du serveur → Invitations)

- **Tableau avec colonnes :**
  - Hôte (avatar + nom du créateur)
  - Code d'invitation (cliquable → copier)
  - Utilisations (ex: "12 / 50" ou "12 / ∞")
  - Expiration (relative, ex: "Dans 2 heures" ou "Permanent")
  - Actions (bouton de révocation)
- **Bouton "Suspendre les invitations"** en haut : toggle global, affiche un badge rouge "Invitations suspendues" quand actif.
- **Bouton "Créer un lien d'invitation"** : ouvre une modale avec les options (durée, utilisations max, temporaire).
- Recherche dans la liste par code ou nom de créateur.

---

## 2. Messages privés (DM)

### 2.1 Modèles de données

#### DMChannel (salon de conversation privée)

```
DMChannel {
  id               String    @id (snowflake)
  type             Int       (1 = DM individuel, 3 = Groupe DM)
  name             String?   (null pour DM 1:1, défini par le créateur pour groupes)
  icon             String?   (null pour DM 1:1, hash pour groupes)
  owner_id         String?   (créateur du groupe, null pour DM 1:1)
  last_message_id  String?   (référence vers le dernier message)
  created_at       DateTime  @default(now())
}
```

#### DMChannelMember

```
DMChannelMember {
  channel_id   String    (référence vers DMChannel)
  user_id      String    (référence vers User)
  joined_at    DateTime  @default(now())
  last_read_message_id String? (pour les indicateurs de messages non lus)
  @@id([channel_id, user_id])
}
```

---

### 2.2 DM individuel (type 1)

- Exactement **2 membres** en permanence.
- Créé automatiquement lors du premier message ou de la première demande d'ouverture.
- Un DM existant entre deux utilisateurs est **réutilisé** (unicité sur la paire d'utilisateurs).
- Pas de nom ni d'icône (dérivés du profil de l'interlocuteur).
- Un utilisateur peut "fermer" un DM côté client (masquer de sa liste) sans supprimer la conversation.

#### Création / récupération d'un DM

```
POST /api/users/@me/channels
```

**Corps de la requête :**
```json
{
  "recipient_id": "2222222222222222222"
}
```

**Réponse 200 (DM existant) ou 201 (nouveau DM) :**
```json
{
  "id": "5555555555555555555",
  "type": 1,
  "recipients": [
    {
      "id": "1111111111111111111",
      "username": "alice",
      "avatar": "abc123",
      "global_name": "Alice"
    },
    {
      "id": "2222222222222222222",
      "username": "bob",
      "avatar": "def456",
      "global_name": "Bob"
    }
  ],
  "last_message_id": null,
  "created_at": "2025-01-01T00:00:00.000Z"
}
```

**Erreurs :**
- `403` si l'utilisateur cible a bloqué l'appelant.
- `403` si l'utilisateur cible n'accepte pas les DM (paramètre de confidentialité).
- `400` si `recipient_id` est l'ID de l'utilisateur lui-même.

---

#### Envoi de messages dans un DM

- Même endpoint que pour les salons de guild : `POST /api/channels/:channelId/messages`
- Même format de message.
- Vérifications supplémentaires : bloquer si l'un des deux utilisateurs a bloqué l'autre.

---

### 2.3 Liste des DMs ouverts

```
GET /api/users/@me/channels
```

**Réponse 200 :**
```json
[
  {
    "id": "5555555555555555555",
    "type": 1,
    "recipients": [ { ... } ],
    "last_message_id": "8888888888888888888",
    "created_at": "2025-01-01T00:00:00.000Z"
  },
  {
    "id": "6666666666666666666",
    "type": 3,
    "name": "Groupe des amis",
    "icon": "groupicon123",
    "owner_id": "1111111111111111111",
    "recipients": [ { ... }, { ... }, { ... } ],
    "last_message_id": "9999999999999999999",
    "created_at": "2025-01-01T00:00:00.000Z"
  }
]
```

- Triés par `last_message_id` décroissant (conversations les plus récentes en premier).
- Incluent les DM "fermés" qui ont des messages non lus.

---

### 2.4 Fermer/masquer un DM

```
DELETE /api/channels/:channelId
```

*(uniquement pour les DM de type 1 ou groupes dont on n'est pas owner)*

**Réponse 200 :** objet du DMChannel

**Comportement :**
- Pour un DM type 1 : masque le salon de la liste de l'appelant. L'historique est conservé. Réapparaît si un nouveau message est reçu.
- Pour un groupe DM : l'utilisateur quitte le groupe (voir ci-dessous).

---

## 3. Groupes DM (type 3)

### 3.1 Règles métier

- Maximum **10 membres** par groupe.
- L'owner (créateur) est le seul à pouvoir ajouter des membres initialement.
- N'importe quel membre peut quitter un groupe.
- Si l'owner quitte, la propriété est transférée aléatoirement à un autre membre.
- Si le dernier membre quitte, le groupe est supprimé et son historique effacé.

### 3.2 Création d'un groupe DM

```
POST /api/users/@me/channels
```

**Corps de la requête :**
```json
{
  "recipients": [
    "2222222222222222222",
    "3333333333333333333"
  ]
}
```

*(minimum 2 destinataires, maximum 9 — l'appelant est ajouté automatiquement)*

**Réponse 201 :**
```json
{
  "id": "7777777777777777777",
  "type": 3,
  "name": null,
  "icon": null,
  "owner_id": "1111111111111111111",
  "recipients": [ ... ],
  "last_message_id": null,
  "created_at": "2025-01-01T00:00:00.000Z"
}
```

---

### 3.3 Gestion des membres du groupe

#### `PUT /api/channels/:channelId/recipients/:userId` — Ajouter un membre

**Requiert :** être l'owner du groupe

**Réponse 204** (pas de corps)

**Erreurs :**
- `403` si l'appelant n'est pas l'owner.
- `400` si le groupe est déjà à 10 membres.
- `400` si l'utilisateur est déjà membre.

---

#### `DELETE /api/channels/:channelId/recipients/:userId` — Retirer un membre

**Requiert :** être l'owner du groupe OU être l'utilisateur lui-même (`@me`)

**Réponse 204** (pas de corps)

**Pour se retirer soi-même :**
```
DELETE /api/channels/:channelId/recipients/@me
```

**Comportement :**
- Si c'est l'owner qui se retire : transfert de propriété au membre suivant (le plus ancien).
- Émet `CHANNEL_RECIPIENT_REMOVE` via Socket.IO.

---

#### `PATCH /api/channels/:channelId` — Modifier le nom/icône du groupe

**Requiert :** être l'owner du groupe

**Corps de la requête :**
```json
{
  "name": "Groupe des amis",
  "icon": "data:image/png;base64,..."
}
```
*(L'icône est envoyée en base64 data URL, stockée côté serveur)*

**Réponse 200 :** objet DMChannel mis à jour

---

### 3.4 Événements Socket.IO pour les groupes

| Événement                  | Déclencheur                      | Payload |
|----------------------------|----------------------------------|---------|
| `CHANNEL_CREATE`           | Nouveau groupe DM créé           | `{ channel }` (envoyé à chaque membre) |
| `CHANNEL_UPDATE`           | Nom/icône modifiés               | `{ channel }` |
| `CHANNEL_RECIPIENT_ADD`    | Membre ajouté                    | `{ channel_id, user }` |
| `CHANNEL_RECIPIENT_REMOVE` | Membre retiré ou parti           | `{ channel_id, user }` |
| `CHANNEL_DELETE`           | Groupe supprimé (dernier membre) | `{ channel_id }` |

---

## 4. Système d'amis (complément à la spec 02)

### 4.1 Rappel du modèle

*(Défini dans la spec 02, rappelé ici pour contexte)*

```
Friendship {
  id          String    @id (snowflake)
  user_id     String    (qui a envoyé/initié)
  friend_id   String    (destinataire)
  status      String    (pending_outgoing | pending_incoming | accepted | blocked)
  created_at  DateTime
  updated_at  DateTime
}
```

---

### 4.2 Notifications en temps réel (Socket.IO)

Toutes les actions liées aux amis déclenchent des événements Socket.IO envoyés uniquement aux utilisateurs concernés (pas de broadcast serveur).

| Événement                    | Déclencheur | Destinataire | Payload |
|------------------------------|-------------|--------------|---------|
| `RELATIONSHIP_ADD`           | Demande envoyée | Destinataire | `{ relationship: { user, type: 3 } }` (type 3 = en attente) |
| `RELATIONSHIP_ADD`           | Demande acceptée | Les deux | `{ relationship: { user, type: 1 } }` (type 1 = ami) |
| `RELATIONSHIP_REMOVE`        | Ami retiré / demande refusée / déblocage | Les deux | `{ relationship_id: userId }` |
| `RELATIONSHIP_ADD`           | Blocage | L'initiateur | `{ relationship: { user, type: 2 } }` (type 2 = bloqué) |
| `PRESENCE_UPDATE`            | Changement de statut d'un ami | Tous ses amis | `{ user_id, status, activities }` |

---

### 4.3 Interface — Liste des amis

Page accessible via l'icône principale (hors serveur), onglet "Amis".

**Onglets :**

| Onglet       | Contenu |
|--------------|---------|
| **Tous**     | Tous les amis acceptés, triés alphabétiquement |
| **En ligne** | Amis avec statut `online`, `idle`, `dnd` |
| **En attente** | Demandes reçues (sous-section "Reçues") + envoyées (sous-section "Envoyées") |
| **Bloqués**  | Utilisateurs bloqués avec bouton "Débloquer" |

**Carte d'un ami (onglet Tous / En ligne) :**
- Avatar avec indicateur de statut (couleur).
- Nom d'utilisateur + tag.
- Activité actuelle si applicable (ex: "Joue à Minecraft").
- Boutons : **Envoyer un message** (ouvre le DM), **Plus** (menu contextuel).

**Menu contextuel sur un ami :**
- Voir le profil
- Envoyer un message
- Appel vidéo *(DIFFÉRÉ)*
- Supprimer l'ami
- Bloquer

**Section "En attente" — demande reçue :**
- Avatar + nom de l'expéditeur.
- Bouton ✓ (Accepter) + bouton ✗ (Refuser).
- Tooltip "Demande d'ami de X".

**Bouton "Ajouter un ami" (en haut à droite) :**
- Champ de saisie : `Nom d'utilisateur#Tag` ou `nom d'utilisateur` (si nouveau format sans discriminant).
- Bouton "Envoyer une demande d'ami".
- Feedback : succès ("Demande envoyée !") ou erreur ("Utilisateur introuvable", "Déjà ami", "Vous avez bloqué cet utilisateur").

---

### 4.4 Amis mutuels sur un profil

Lorsqu'un utilisateur consulte le profil d'un autre utilisateur (popup ou page de profil), une section **"Amis en commun"** est affichée si des amis mutuels existent.

**Calcul :** intersection entre les amis de l'utilisateur connecté et les amis de la cible (uniquement les relations `accepted` des deux côtés).

**Endpoint :**
```
GET /api/users/:userId/relationships
```

**Réponse 200 :**
```json
{
  "mutual_friends": [
    {
      "id": "3333333333333333333",
      "username": "charlie",
      "avatar": "ghi789",
      "global_name": "Charlie",
      "status": "online"
    }
  ],
  "mutual_guilds": [
    {
      "id": "9876543210987654321",
      "name": "Mon Serveur",
      "icon": "abc123"
    }
  ]
}
```

**Règle de confidentialité :** ne retourne des amis mutuels que si les paramètres de confidentialité des deux utilisateurs l'autorisent. Si un utilisateur a désactivé "Afficher les serveurs en commun", la liste `mutual_guilds` est vide.

---

### 4.5 Menu contextuel sur un utilisateur

Accessible via clic droit sur un avatar (dans un salon, dans la liste des membres, dans les DM).

**Options disponibles (varient selon la relation) :**

| Condition | Options affichées |
|-----------|-------------------|
| Aucune relation | "Ajouter comme ami", "Envoyer un message", "Bloquer" |
| Demande envoyée | "Annuler la demande d'ami", "Envoyer un message", "Bloquer" |
| Ami | "Envoyer un message", "Supprimer l'ami", "Bloquer" |
| Bloqué | "Débloquer" |
| Soi-même | "Modifier le profil", "Copier l'ID utilisateur" |

---

### 4.6 Paramètres de confidentialité DM

Dans les paramètres utilisateur → Confidentialité & Sécurité :

```
UserPrivacySettings {
  user_id                      String  @id
  allow_dms_from               String  @default("friends")
    -- "everyone" | "friends" | "none"
  allow_friend_requests_from   String  @default("everyone")
    -- "everyone" | "friends_of_friends" | "none"
  show_mutual_guilds           Boolean @default(true)
  show_mutual_friends          Boolean @default(true)
}
```

**Comportement :**
- `allow_dms_from = "none"` : `POST /api/users/@me/channels` avec cet utilisateur comme cible retourne `403 CANNOT_SEND_MESSAGES`.
- `allow_friend_requests_from = "none"` : les demandes d'ami sont automatiquement refusées.
- Ces paramètres sont vérifiés côté backend sur chaque action concernée.

---

## 5. Événements Socket.IO globaux (DM & Invitations)

| Événement         | Déclencheur | Destinataires | Payload |
|-------------------|-------------|---------------|---------|
| `CHANNEL_CREATE`  | DM ouvert / groupe créé | Membres du DM/groupe | `{ channel }` |
| `CHANNEL_UPDATE`  | Groupe DM modifié | Membres du groupe | `{ channel }` |
| `CHANNEL_DELETE`  | Groupe supprimé | Membres du groupe | `{ id }` |
| `MESSAGE_CREATE`  | Nouveau message DM | Membres du DM/groupe | `{ message }` |
| `GUILD_MEMBER_ADD`| Membre rejoint via invitation | Tous les membres de la guild | `{ guild_id, member }` |

---

## 6. Cas limites et règles métier

- Un utilisateur ne peut pas s'envoyer un DM à lui-même.
- Si les deux utilisateurs d'un DM 1:1 ont "fermé" le canal côté client, le canal persiste en base mais n'apparaît dans aucune liste.
- Les messages dans les DM ne sont pas soumis aux règles AutoMod des serveurs.
- Un utilisateur banni d'un serveur peut toujours avoir un DM avec un membre de ce serveur (sauf si bloqué directement).
- La suppression d'un lien d'invitation (expiré ou max_uses atteint) peut être faite automatiquement par un job de nettoyage périodique (cron toutes les heures).
- Les invitations vers un salon de forum ou thread ne sont pas supportées en v1 (uniquement salons textuels et vocaux).
- Le code vanity remplace le code aléatoire : `opencord.app/invite/mon-serveur` fonctionne de la même manière.
