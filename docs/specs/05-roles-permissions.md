# Spécification 05 — Rôles & Permissions

## Vue d'ensemble

Le système de rôles d'OpenCord est un clone fidèle du système Discord. Chaque serveur (guild) possède un ensemble de rôles permettant d'organiser les membres et de contrôler leurs droits. Les permissions sont encodées sous forme de bitfield (`bigint`) pour permettre une vérification rapide et extensible.

---

## 1. Modèle de données

### 1.1 Role

```
Role {
  id              String    @id (snowflake)
  guild_id        String    (référence vers Guild)
  name            String    (ex: "Modérateur", "@everyone")
  color           String?   (code hexadécimal CSS, ex: "#FF0000", null = pas de couleur)
  hoist           Boolean   @default(false)   (afficher séparément dans la liste des membres)
  position        Int       (entier positif, plus grand = plus de pouvoir ; @everyone = 0)
  permissions     BigInt    (bitfield des permissions accordées par ce rôle)
  mentionable     Boolean   @default(false)   (n'importe qui peut mentionner ce rôle)
  icon            String?   (hash de l'icône uploadée, ex: "abcdef1234")
  unicode_emoji   String?   (emoji unicode alternatif à l'icône, ex: "🔥")
  managed         Boolean   @default(false)   (géré par une intégration, non modifiable manuellement)
  created_at      DateTime  @default(now())
}
```

**Contraintes :**
- `position` est unique par guild (hors égalités gérées en transaction).
- Un seul rôle par guild peut avoir `name = "@everyone"` et `position = 0`.
- `color` et `unicode_emoji` sont mutuellement exclusifs pour l'affichage de l'icône de rôle.
- `icon` nécessite le niveau de boost Tier 2 minimum.

---

### 1.2 PermissionOverwrite (remplacements de permissions par salon)

```
PermissionOverwrite {
  id           String    @id (snowflake)
  channel_id   String    (référence vers Channel)
  target_id    String    (référence vers Role.id ou GuildMember.user_id selon target_type)
  target_type  String    (enum: "role" | "member")
  allow        BigInt    @default(0)   (bits de permissions explicitement accordées)
  deny         BigInt    @default(0)   (bits de permissions explicitement refusées)
}
```

**Contraintes :**
- Combinaison `(channel_id, target_id, target_type)` unique.
- `allow` et `deny` ne peuvent pas avoir des bits en commun (mutuellement exclusifs bit à bit).

---

### 1.3 GuildMemberRole (table de jonction membre ↔ rôle)

```
GuildMemberRole {
  guild_id   String
  user_id    String
  role_id    String
  assigned_at DateTime @default(now())
  assigned_by String?   (user_id de celui qui a assigné)
  @@id([guild_id, user_id, role_id])
}
```

---

## 2. Bitfield des permissions

Chaque permission est représentée par un bit dans un entier de 64 bits (`bigint`). Plusieurs permissions peuvent être combinées avec l'opérateur `OR`.

| Nom de la permission            | Valeur hexadécimale  | Description |
|---------------------------------|----------------------|-------------|
| `CREATE_INSTANT_INVITE`         | `0x1`                | Créer des liens d'invitation |
| `KICK_MEMBERS`                  | `0x2`                | Expulser des membres |
| `BAN_MEMBERS`                   | `0x4`                | Bannir des membres |
| `ADMINISTRATOR`                 | `0x8`                | Contourne toutes les permissions et restrictions de salon |
| `MANAGE_CHANNELS`               | `0x10`               | Créer, modifier, supprimer des salons |
| `MANAGE_GUILD`                  | `0x20`               | Modifier les paramètres du serveur |
| `ADD_REACTIONS`                 | `0x40`               | Ajouter des réactions aux messages |
| `VIEW_AUDIT_LOG`                | `0x80`               | Voir le journal des audits |
| `VIEW_CHANNEL`                  | `0x400`              | Voir un salon textuel ou vocal |
| `SEND_MESSAGES`                 | `0x800`              | Envoyer des messages dans un salon textuel |
| `SEND_TTS_MESSAGES`             | `0x1000`             | Envoyer des messages en synthèse vocale |
| `MANAGE_MESSAGES`               | `0x2000`             | Supprimer des messages ou épingler des messages |
| `EMBED_LINKS`                   | `0x4000`             | Intégrer des liens (aperçus automatiques) |
| `ATTACH_FILES`                  | `0x8000`             | Joindre des fichiers aux messages |
| `READ_MESSAGE_HISTORY`          | `0x10000`            | Lire l'historique des messages d'un salon |
| `MENTION_EVERYONE`              | `0x20000`            | Mentionner @everyone, @here et tous les rôles |
| `USE_EXTERNAL_EMOJIS`           | `0x40000`            | Utiliser des emojis provenant d'autres serveurs |
| `CONNECT`                       | `0x100000`           | *(DIFFÉRÉ — vocal)* Rejoindre un salon vocal |
| `SPEAK`                         | `0x200000`           | *(DIFFÉRÉ — vocal)* Parler dans un salon vocal |
| `MUTE_MEMBERS`                  | `0x400000`           | *(DIFFÉRÉ — vocal)* Couper le micro d'un membre |
| `DEAFEN_MEMBERS`                | `0x800000`           | *(DIFFÉRÉ — vocal)* Couper le son pour un membre |
| `MOVE_MEMBERS`                  | `0x1000000`          | *(DIFFÉRÉ — vocal)* Déplacer un membre vers un autre salon |
| `CHANGE_NICKNAME`               | `0x4000000`          | Changer son propre surnom |
| `MANAGE_NICKNAMES`              | `0x8000000`          | Modifier les surnoms des autres membres |
| `MANAGE_ROLES`                  | `0x10000000`         | Créer, modifier, supprimer des rôles (sous sa propre position) |
| `MANAGE_WEBHOOKS`               | `0x20000000`         | Créer et gérer des webhooks |
| `MANAGE_EMOJIS_AND_STICKERS`    | `0x40000000`         | Ajouter, modifier ou supprimer emojis et autocollants |
| `USE_APPLICATION_COMMANDS`      | `0x80000000`         | Utiliser les commandes d'application (slash commands) |
| `MANAGE_THREADS`                | `0x400000000`        | Gérer les fils de discussion |
| `CREATE_PUBLIC_THREADS`         | `0x800000000`        | Créer des fils publics |
| `CREATE_PRIVATE_THREADS`        | `0x1000000000`       | Créer des fils privés |
| `USE_EXTERNAL_STICKERS`         | `0x2000000000`       | Utiliser des autocollants d'autres serveurs |
| `SEND_MESSAGES_IN_THREADS`      | `0x4000000000`       | Envoyer des messages dans les fils de discussion |
| `MANAGE_EVENTS`                 | `0x8000000000`       | Créer et gérer des événements du serveur |
| `MODERATE_MEMBERS`              | `0x10000000000`      | Mettre en sourdine temporaire des membres |

**Permissions par défaut du rôle `@everyone` à la création d'un serveur :**
```
VIEW_CHANNEL | SEND_MESSAGES | ADD_REACTIONS | READ_MESSAGE_HISTORY |
ATTACH_FILES | EMBED_LINKS | USE_APPLICATION_COMMANDS | CREATE_INSTANT_INVITE |
CHANGE_NICKNAME
```
Valeur décimale correspondante stockée en `BigInt`.

**La permission `ADMINISTRATOR` (0x8) :**
- Contourne **toutes** les vérifications de permission, y compris les overwrites de salon.
- Permet d'effectuer toutes les actions sur le serveur.
- Seul le propriétaire du serveur et les rôles au-dessus du rôle cible peuvent retirer cette permission.

---

## 3. Rôle @everyone

- Créé automatiquement lors de la création du serveur.
- `name = "@everyone"`, `position = 0`, `managed = false`.
- Ne peut pas être supprimé, renommé, ni déplacé.
- Ses permissions constituent la base de tous les membres du serveur.
- Modifiable via `PATCH /api/guilds/:id/roles/:roleId` (seuls `permissions`, `mentionable` sont modifiables).

---

## 4. Algorithme de calcul des permissions

Le calcul se fait en plusieurs étapes, dans cet ordre strict :

### Étape 1 — Permissions de base (niveau serveur)
1. Partir des permissions du rôle `@everyone` de la guild.
2. Pour chaque rôle assigné au membre (trié par position croissante), effectuer un `OR` binaire avec les permissions du rôle.
3. Résultat : permissions cumulées au niveau serveur.

### Étape 2 — Vérification ADMINISTRATOR
- Si le bit `ADMINISTRATOR (0x8)` est présent dans les permissions cumulées, **accorder toutes les permissions** sans vérifier les overwrites.
- Le propriétaire du serveur (`guild.owner_id == user.id`) bénéficie implicitement de `ADMINISTRATOR`.

### Étape 3 — Application des overwrites de salon (channel overwrites)
Si on calcule les permissions pour un salon spécifique, appliquer les overwrites dans cet ordre :

**3a. Overwrite du rôle @everyone sur ce salon**
```
permissions = (permissions & ~deny_everyone) | allow_everyone
```

**3b. Overwrites des rôles du membre (du plus bas au plus haut en position)**
- Accumuler séparément les bits `allow` et `deny` de tous les rôles du membre :
```
role_allow = OR de tous les allow des rôles du membre
role_deny  = OR de tous les deny des rôles du membre
permissions = (permissions & ~role_deny) | role_allow
```

**3c. Overwrite spécifique au membre (user overwrite)**
```
permissions = (permissions & ~deny_user) | allow_user
```

### Étape 4 — Résultat final
- Le résultat est un `bigint` représentant les permissions effectives du membre dans ce salon.
- Pour vérifier une permission : `(effectivePermissions & PERMISSION_BIT) !== 0n`

### Pseudo-code TypeScript illustratif

```typescript
function computePermissions(
  member: GuildMember,
  guild: Guild,
  channel?: Channel
): bigint {
  if (guild.owner_id === member.user_id) return ALL_PERMISSIONS;

  const everyoneRole = guild.roles.find(r => r.name === "@everyone")!;
  let perms = everyoneRole.permissions;

  for (const role of member.roles) {
    perms |= role.permissions;
  }

  if ((perms & ADMINISTRATOR) !== 0n) return ALL_PERMISSIONS;

  if (!channel) return perms;

  // Overwrite @everyone sur le salon
  const everyoneOw = channel.overwrites.find(
    o => o.target_id === everyoneRole.id && o.target_type === "role"
  );
  if (everyoneOw) {
    perms = (perms & ~everyoneOw.deny) | everyoneOw.allow;
  }

  // Overwrites des rôles du membre
  let roleAllow = 0n, roleDeny = 0n;
  for (const role of member.roles) {
    const ow = channel.overwrites.find(
      o => o.target_id === role.id && o.target_type === "role"
    );
    if (ow) { roleAllow |= ow.allow; roleDeny |= ow.deny; }
  }
  perms = (perms & ~roleDeny) | roleAllow;

  // Overwrite spécifique au membre
  const memberOw = channel.overwrites.find(
    o => o.target_id === member.user_id && o.target_type === "member"
  );
  if (memberOw) {
    perms = (perms & ~memberOw.deny) | memberOw.allow;
  }

  return perms;
}
```

---

## 5. Hiérarchie des rôles

- Un membre ne peut gérer (créer, modifier, supprimer, assigner) que des rôles dont la **position est strictement inférieure** à la position de son rôle le plus haut.
- Le propriétaire du serveur est exempt de cette restriction.
- Un modérateur (`MANAGE_ROLES`) avec le rôle de position 5 ne peut pas toucher aux rôles de position 5 ou supérieure.
- Cette vérification s'effectue côté **backend** pour chaque opération sur les rôles.

**Couleur d'affichage du membre :**
- La couleur affichée est celle du rôle avec la **position la plus élevée** parmi les rôles assignés au membre qui ont une couleur non-nulle (`color !== null`).
- Si aucun rôle n'a de couleur, la couleur est la valeur par défaut (blanc/gris selon le thème).

---

## 6. Routes API

### 6.1 Gestion des rôles

#### `POST /api/guilds/:id/roles` — Créer un rôle

Requiert : `MANAGE_ROLES`

**Corps de la requête :**
```json
{
  "name": "Modérateur",
  "color": "#FF5733",
  "hoist": true,
  "mentionable": false,
  "permissions": "8"
}
```

**Réponse 201 :**
```json
{
  "id": "1234567890123456789",
  "guild_id": "9876543210987654321",
  "name": "Modérateur",
  "color": "#FF5733",
  "hoist": true,
  "position": 3,
  "permissions": "8",
  "mentionable": false,
  "icon": null,
  "unicode_emoji": null,
  "managed": false,
  "created_at": "2025-01-01T00:00:00.000Z"
}
```

**Erreurs :**
- `403` si l'utilisateur n'a pas `MANAGE_ROLES`
- `403` si la permission demandée dépasse les permissions de l'utilisateur
- `400` si le nom dépasse 100 caractères

---

#### `GET /api/guilds/:id/roles` — Lister les rôles d'un serveur

**Réponse 200 :**
```json
[
  {
    "id": "111",
    "name": "@everyone",
    "color": null,
    "position": 0,
    "permissions": "104324673",
    "hoist": false,
    "mentionable": false,
    "icon": null,
    "unicode_emoji": null
  },
  {
    "id": "222",
    "name": "Modérateur",
    "color": "#FF5733",
    "position": 2,
    "permissions": "8",
    "hoist": true,
    "mentionable": true,
    "icon": null,
    "unicode_emoji": "🛡️"
  }
]
```

---

#### `PATCH /api/guilds/:id/roles/:roleId` — Modifier un rôle

Requiert : `MANAGE_ROLES` + hiérarchie supérieure au rôle cible

**Corps de la requête (tous les champs sont optionnels) :**
```json
{
  "name": "Super Modérateur",
  "color": "#0099FF",
  "hoist": false,
  "mentionable": true,
  "permissions": "1071698660417",
  "icon": null,
  "unicode_emoji": "⭐"
}
```

**Réponse 200 :** objet `Role` mis à jour (même format que POST)

**Erreurs :**
- `403` si hiérarchie insuffisante
- `404` si le rôle n'existe pas dans cette guild

---

#### `DELETE /api/guilds/:id/roles/:roleId` — Supprimer un rôle

Requiert : `MANAGE_ROLES` + hiérarchie supérieure au rôle cible

**Réponse 204** (pas de corps)

**Comportement :**
- Retire le rôle de tous les membres qui le possèdent.
- Supprime tous les `PermissionOverwrite` associés à ce rôle.
- Entrée créée dans l'audit log (`ROLE_DELETE`).
- Ne peut pas supprimer le rôle `@everyone`.

---

#### `PATCH /api/guilds/:id/roles` — Mettre à jour les positions de plusieurs rôles

Requiert : `MANAGE_ROLES`

**Corps de la requête :**
```json
[
  { "id": "111", "position": 1 },
  { "id": "222", "position": 3 },
  { "id": "333", "position": 2 }
]
```

**Réponse 200 :** tableau de tous les rôles de la guild avec leurs nouvelles positions

**Comportement :**
- Réorganisation atomique (transaction).
- Le rôle `@everyone` reste toujours en position 0.
- Un membre ne peut déplacer un rôle qu'en dessous de son propre rôle le plus haut.

---

### 6.2 Gestion des rôles des membres

#### `PUT /api/guilds/:id/members/:userId/roles/:roleId` — Assigner un rôle à un membre

Requiert : `MANAGE_ROLES` + position du rôle inférieure à la position de l'utilisateur appelant

**Réponse 204** (pas de corps)

**Événement Socket.IO émis :** `GUILD_MEMBER_UPDATE` avec le membre et ses nouveaux rôles

---

#### `DELETE /api/guilds/:id/members/:userId/roles/:roleId` — Retirer un rôle d'un membre

Requiert : `MANAGE_ROLES` + position du rôle inférieure à la position de l'utilisateur appelant

**Réponse 204** (pas de corps)

**Événement Socket.IO émis :** `GUILD_MEMBER_UPDATE`

---

### 6.3 Gestion des overwrites de salon

#### `PUT /api/channels/:channelId/permissions/:targetId` — Créer ou mettre à jour un overwrite

Requiert : `MANAGE_ROLES` (ou `MANAGE_CHANNELS` pour les overwrites de membres)

**Corps de la requête :**
```json
{
  "allow": "3072",
  "deny": "1024",
  "type": "role"
}
```
*(type: `"role"` ou `"member"`)*

**Réponse 204** (pas de corps)

---

#### `DELETE /api/channels/:channelId/permissions/:targetId` — Supprimer un overwrite

Requiert : `MANAGE_ROLES`

**Réponse 204** (pas de corps)

---

## 7. Événements Socket.IO liés aux rôles

| Événement              | Déclencheur                          | Payload |
|------------------------|--------------------------------------|---------|
| `GUILD_ROLE_CREATE`    | Nouveau rôle créé                    | `{ guild_id, role }` |
| `GUILD_ROLE_UPDATE`    | Rôle modifié ou repositionné         | `{ guild_id, role }` |
| `GUILD_ROLE_DELETE`    | Rôle supprimé                        | `{ guild_id, role_id }` |
| `GUILD_MEMBER_UPDATE`  | Rôle assigné ou retiré à un membre   | `{ guild_id, member }` |
| `CHANNEL_UPDATE`       | Overwrite de salon créé/modifié/supprimé | `{ channel }` |

---

## 8. Cas limites et règles métier

- **Limite de rôles par serveur :** 250 rôles maximum (hors `@everyone`).
- **Permissions accordées > permissions possédées :** Un membre ne peut pas accorder à un rôle des permissions qu'il ne possède pas lui-même (sauf ADMINISTRATOR).
- **Rôles managed :** Les rôles `managed = true` (ex: bot) ne peuvent pas être assignés manuellement. Ils sont gérés par l'intégration qui les a créés.
- **Hoist et affichage :** Les rôles avec `hoist = true` sont affichés dans des catégories séparées dans la liste des membres en ligne, classés par position décroissante.
- **Mentionable :** Si `mentionable = false`, seuls les membres avec `MENTION_EVERYONE` peuvent mentionner ce rôle.

---

## 9. Interface utilisateur (Paramètres du serveur → Rôles)

### Page liste des rôles
- Liste de tous les rôles, triée par position décroissante (rôles les plus puissants en haut).
- Chaque entrée : couleur, nom, nombre de membres portant ce rôle, icône d'édition.
- Bouton **"Créer un rôle"** en haut à droite.
- Drag & drop pour réordonner (envoie `PATCH /api/guilds/:id/roles` en batch).

### Page d'édition d'un rôle
Onglets :
1. **Affichage** : nom, couleur (color picker hex), afficher séparément (hoist), autoriser la mention.
2. **Permissions** : liste des permissions avec toggles ON/OFF groupés par catégorie (Général, Membres, Salons, etc.).
3. **Membres** : liste des membres ayant ce rôle avec recherche, bouton pour retirer.

### Fenêtre d'édition des permissions d'un salon (overwrite)

Accessible via **Paramètres du salon → Permissions**.

#### Layout global

La page est divisée en deux colonnes :

- **Colonne gauche (250px)** : liste des rôles et membres qui ont des overwrites sur ce canal
  - Section "Rôles" : affiche les rôles ayant au moins un overwrite, avec leur couleur
  - Section "Membres" : affiche les membres ayant au moins un overwrite individuel, avec avatar
  - Bouton "Ajouter un rôle ou un membre" (ouvre un `<Combobox>` de recherche)
  - Élément sélectionné surligné avec `--bg-modifier-selected`
  - Bouton "×" pour supprimer tous les overwrites d'un rôle/membre (confirmation modale)

- **Colonne droite** : liste des permissions avec leur état pour le rôle/membre sélectionné

#### Système de toggle tristate

Chaque permission affiche un toggle à 3 états :

| État | Visuel | Valeur |
|---|---|---|
| **Autoriser** | Cercle vert rempli (✓) | `allow` bit activé |
| **Neutre** | Cercle gris vide (/) | Ni `allow` ni `deny` (hérite du rôle) |
| **Refuser** | Cercle rouge rempli (✕) | `deny` bit activé |

Clic cyclique : Neutre → Autoriser → Refuser → Neutre.

#### Groupement des permissions

Les permissions sont regroupées par catégorie avec un header de section :

| Catégorie | Permissions incluses |
|---|---|
| **Permissions générales** | `VIEW_CHANNEL`, `MANAGE_CHANNELS`, `MANAGE_ROLES` |
| **Permissions de membres** | `CREATE_INSTANT_INVITE`, `CHANGE_NICKNAME`, `MANAGE_NICKNAMES`, `KICK_MEMBERS`, `BAN_MEMBERS`, `MODERATE_MEMBERS` |
| **Permissions de texte** | `SEND_MESSAGES`, `SEND_MESSAGES_IN_THREADS`, `CREATE_PUBLIC_THREADS`, `CREATE_PRIVATE_THREADS`, `EMBED_LINKS`, `ATTACH_FILES`, `ADD_REACTIONS`, `USE_EXTERNAL_EMOJIS`, `USE_EXTERNAL_STICKERS`, `MENTION_EVERYONE`, `MANAGE_MESSAGES`, `MANAGE_THREADS`, `READ_MESSAGE_HISTORY`, `SEND_TTS_MESSAGES`, `USE_APPLICATION_COMMANDS` |
| **Permissions vocales** | `CONNECT`, `SPEAK`, `VIDEO`, `USE_VOICE_ACTIVITY`, `PRIORITY_SPEAKER`, `MUTE_MEMBERS`, `DEAFEN_MEMBERS`, `MOVE_MEMBERS` |

Seules les catégories pertinentes au type de canal sont affichées (ex: pas de permissions vocales pour un canal texte).

#### Indicateurs visuels

- Si un overwrite **Refuser** bloque une permission qu'un rôle accorde normalement, afficher une icône d'avertissement `⚠️` avec tooltip "Ce refus annule la permission accordée par le rôle {nom}"
- Si `@everyone` est sélectionné, afficher un bandeau info : "Les modifications sur @everyone affectent tous les membres sans rôle spécifique"
- Permissions grisées et non cliquables si l'utilisateur n'a pas lui-même la permission `MANAGE_ROLES` ou si la permission dépasse la hiérarchie de ses rôles

#### Barre d'actions (sticky bottom)

- Apparaît dès qu'un changement est effectué (transition slide-up)
- Texte : "Attention — vous avez des modifications non enregistrées !"
- Bouton "Réinitialiser" (outline) : annule les changements locaux
- Bouton "Enregistrer les modifications" (primary vert) : envoie `PUT /api/channels/:id/permissions/:overwriteId`
- Disparaît après sauvegarde réussie (toast de confirmation)

#### Modale de confirmation — Suppression d'overwrite

- Titre : "Supprimer les overwrites"
- Texte : "Êtes-vous sûr de vouloir supprimer toutes les permissions personnalisées pour **{nom}** dans ce canal ? Il héritera uniquement des permissions de ses rôles."
- Boutons : "Annuler" / "Supprimer" (rouge)
