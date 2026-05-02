# Spécification 06 — Modération & AutoMod

## Vue d'ensemble

OpenCord implémente un système complet de modération manuelle (expulsion, bannissement, mise en sourdine temporaire) ainsi qu'un système de modération automatique (AutoMod) permettant de filtrer les messages en temps réel. Toutes les actions de modération sont tracées dans un journal d'audit.

---

## 1. Expulsion (Kick)

### Description
Retirer un membre du serveur sans bannissement. Le membre peut être réinvité et rejoindre librement.

### Endpoint

```
DELETE /api/guilds/:guildId/members/:userId
```

**Requiert :** permission `KICK_MEMBERS` + hiérarchie supérieure à la cible

**Headers :** `Authorization: Bearer <token>`

**Corps de la requête (optionnel) :**
```json
{
  "reason": "Comportement inapproprié répété"
}
```

**Réponse 204** (pas de corps)

**Comportement :**
- Supprime l'entrée `GuildMember` de la base de données.
- Supprime tous les rôles du membre dans la guild.
- Émet l'événement Socket.IO `GUILD_MEMBER_REMOVE` à tous les membres connectés.
- Enregistre une entrée dans le journal d'audit (`MEMBER_KICK`).
- Ne peut pas expulser un membre dont le rôle le plus haut est supérieur ou égal au sien.
- Ne peut pas s'expulser soi-même.
- Ne peut pas expulser le propriétaire du serveur.

**Erreurs :**
- `403` si `KICK_MEMBERS` manquant ou hiérarchie insuffisante
- `404` si le membre n'est pas dans le serveur
- `400` si l'utilisateur cible est le propriétaire

---

## 2. Bannissement (Ban)

### Modèle de données

```
Ban {
  id              String    @id (snowflake)
  guild_id        String    (référence vers Guild)
  user_id         String    (référence vers User — banni même s'il n'est plus membre)
  reason          String?   (raison du bannissement, max 512 chars)
  banned_by       String    (user_id du modérateur)
  delete_messages_seconds Int @default(0)  (0 à 604800 = 7 jours)
  created_at      DateTime  @default(now())
  @@unique([guild_id, user_id])
}
```

### Endpoints

#### `PUT /api/guilds/:guildId/bans/:userId` — Bannir un utilisateur

**Requiert :** `BAN_MEMBERS`

**Corps de la requête :**
```json
{
  "reason": "Spam et harcèlement",
  "delete_message_seconds": 86400
}
```
- `delete_message_seconds` : durée en secondes des messages à supprimer (0 = aucun, max 604800 = 7 jours).

**Réponse 204** (pas de corps)

**Comportement :**
- Expulse le membre s'il est encore dans le serveur.
- Supprime ses messages des X dernières secondes dans tous les salons visibles.
- Ajoute son `user_id` à la liste des bannissements.
- L'utilisateur banni ne peut plus rejoindre via invitation.
- Enregistre `MEMBER_BAN_ADD` dans l'audit log.
- Émet `GUILD_BAN_ADD` via Socket.IO.

---

#### `DELETE /api/guilds/:guildId/bans/:userId` — Lever un bannissement

**Requiert :** `BAN_MEMBERS`

**Corps de la requête (optionnel) :**
```json
{
  "reason": "Appel accepté"
}
```

**Réponse 204** (pas de corps)

**Comportement :**
- Supprime l'entrée `Ban`.
- L'utilisateur peut désormais rejoindre via invitation.
- Enregistre `MEMBER_BAN_REMOVE` dans l'audit log.
- Émet `GUILD_BAN_REMOVE` via Socket.IO.

---

#### `GET /api/guilds/:guildId/bans` — Lister les bannissements

**Requiert :** `BAN_MEMBERS`

**Paramètres de requête :**
```
?limit=1000     (défaut: 1000, max: 1000)
?before=userId  (pagination — avant cet userId)
?after=userId   (pagination — après cet userId)
?query=text     (recherche par nom d'utilisateur ou ID)
```

**Réponse 200 :**
```json
[
  {
    "reason": "Spam et harcèlement",
    "user": {
      "id": "1234567890",
      "username": "spammer123",
      "discriminator": "0001",
      "avatar": null,
      "global_name": "Spammer"
    }
  },
  {
    "reason": null,
    "user": {
      "id": "9876543210",
      "username": "troll",
      "discriminator": "0042",
      "avatar": "abcdef",
      "global_name": "Troll"
    }
  }
]
```

**Interface (Logs du serveur → Bannissements) :**
- Tableau avec colonnes : Avatar, Nom d'utilisateur, Raison, Date, Actions.
- Barre de recherche par nom ou ID.
- Bouton "Lever le bannissement" par entrée.
- Bouton "Bannir un utilisateur" en haut à droite.

---

#### `GET /api/guilds/:guildId/bans/:userId` — Obtenir un bannissement spécifique

**Requiert :** `BAN_MEMBERS`

**Réponse 200 :**
```json
{
  "reason": "Spam",
  "user": {
    "id": "1234567890",
    "username": "spammer123",
    "discriminator": "0001",
    "avatar": null
  }
}
```
**Réponse 404** si l'utilisateur n'est pas banni.

---

## 3. Mise en sourdine temporaire (Timeout)

### Description
Empêche temporairement un membre de participer au serveur sans le bannir ni l'expulser. Différent du mute vocal (DIFFÉRÉ).

### Endpoint

```
PATCH /api/guilds/:guildId/members/:userId
```

**Corps de la requête (pour appliquer le timeout) :**
```json
{
  "communication_disabled_until": "2025-01-15T12:00:00.000Z",
  "reason": "Comportement toxique"
}
```

**Corps de la requête (pour lever le timeout) :**
```json
{
  "communication_disabled_until": null
}
```

**Requiert :** `MODERATE_MEMBERS` + hiérarchie supérieure à la cible

**Réponse 200 :** objet `GuildMember` mis à jour avec `communication_disabled_until`

### Durées prédéfinies suggérées dans l'UI
| Libellé         | Durée            |
|-----------------|------------------|
| 60 secondes     | 60s              |
| 5 minutes       | 300s             |
| 10 minutes      | 600s             |
| 1 heure         | 3 600s           |
| 1 jour          | 86 400s          |
| 1 semaine       | 604 800s         |
| Personnalisé    | saisie libre     |

**Durée maximale autorisée :** 28 jours (2 419 200 secondes).

### Restrictions pour un membre en timeout
Un membre avec `communication_disabled_until` dans le futur **ne peut pas** :
- Envoyer des messages dans les salons textuels.
- Envoyer des messages dans les fils de discussion.
- Ajouter des réactions aux messages.
- Rejoindre des salons vocaux *(DIFFÉRÉ)*.
- Modifier son surnom.

Un membre en timeout **peut** :
- Voir les salons et leurs historiques (selon ses permissions normales).
- Voir les membres du serveur.

**Comportement backend :**
- Vérifier `communication_disabled_until` à chaque action sensible.
- Renvoyer `403` avec le code `MEMBER_COMMUNICATION_DISABLED` si le timeout est actif.
- Enregistre `MEMBER_UPDATE` dans l'audit log avec la clé `communication_disabled_until`.

---

## 4. Système AutoMod

### Vue d'ensemble
Le système AutoMod analyse les messages en temps réel avant leur persistance et peut bloquer, alerter ou pénaliser automatiquement.

### Modèle de données

```
AutoModRule {
  id                String    @id (snowflake)
  guild_id          String    (référence vers Guild)
  name              String    (nom de la règle, ex: "Filtre insultes")
  creator_id        String    (user_id du créateur)
  event_type        Int       (1 = MESSAGE_SEND — seule valeur en v1)
  trigger_type      Int       (voir enum ci-dessous)
  trigger_metadata  Json      (voir structure par trigger_type)
  actions           Json      (tableau d'actions, voir structure)
  enabled           Boolean   @default(true)
  exempt_roles      String[]  (IDs de rôles exemptés)
  exempt_channels   String[]  (IDs de salons exemptés)
  created_at        DateTime  @default(now())
  updated_at        DateTime  @updatedAt
}
```

### Enum TriggerType

| Valeur | Nom              | Description |
|--------|------------------|-------------|
| `1`    | `KEYWORD`        | Mots/phrases personnalisés avec support des wildcards |
| `3`    | `SPAM`           | Détection de spam (répétition, flood) |
| `4`    | `KEYWORD_PRESET` | Filtres prédéfinis par catégorie |
| `5`    | `MENTION_SPAM`   | Trop de mentions dans un seul message |

### Structure de `trigger_metadata` par type

**KEYWORD (`trigger_type = 1`) :**
```json
{
  "keyword_filter": ["*badword*", "mot interdit", "autre*"],
  "regex_patterns": ["\\b(spam|pub)\\b"],
  "allow_list": ["badwords_allowed", "contexte autorisé"]
}
```
- `keyword_filter` : liste de mots avec support des wildcards `*` (ex: `"*spam*"` matche "antispam", "spammer").
- `regex_patterns` : expressions régulières (max 10, max 75 chars chacune).
- `allow_list` : mots exacts qui contournent le filtre même s'ils contiennent un mot interdit.

**KEYWORD_PRESET (`trigger_type = 4`) :**
```json
{
  "presets": [1, 2],
  "allow_list": ["mot_autorisé"]
}
```
- `presets` : tableau d'entiers correspondant aux catégories prédéfinies :
  - `1` = Profanité
  - `2` = Contenu sexuel
  - `3` = Insultes / Discriminations

**MENTION_SPAM (`trigger_type = 5`) :**
```json
{
  "mention_total_limit": 5,
  "mention_raid_protection_enabled": true
}
```
- `mention_total_limit` : nombre max de mentions uniques dans un message (max 50).

**SPAM (`trigger_type = 3`) :**
```json
{}
```
- Pas de métadonnées configurables. Détecte automatiquement : flood (même message répété), envoi massif en rafale, spam de liens.

### Structure des `actions`

```json
[
  {
    "type": 1,
    "metadata": {
      "custom_message": "Ce message a été bloqué par AutoMod."
    }
  },
  {
    "type": 2,
    "metadata": {
      "channel_id": "1234567890123456789"
    }
  },
  {
    "type": 3,
    "metadata": {
      "duration_seconds": 60
    }
  }
]
```

| `type` | Nom                    | Métadonnées requises |
|--------|------------------------|----------------------|
| `1`    | `BLOCK_MESSAGE`        | `custom_message?` (texte affiché à l'auteur, max 150 chars) |
| `2`    | `SEND_ALERT_MESSAGE`   | `channel_id` (salon où envoyer l'alerte) |
| `3`    | `TIMEOUT`              | `duration_seconds` (1 à 2 419 200) |

### Règles métier AutoMod
- Maximum 6 règles par guild (limites configurables en constante backend).
- Les rôles dans `exempt_roles` sont complètement ignorés par cette règle.
- Les salons dans `exempt_channels` sont ignorés.
- `ADMINISTRATOR` contourne toutes les règles AutoMod.
- Les règles désactivées (`enabled = false`) ne sont pas évaluées.
- L'exécution AutoMod a lieu **avant** la persistance du message en base.

### Logique d'exécution (côté backend, dans le handler de `POST /api/channels/:id/messages`)

```
1. Récupérer toutes les règles AutoMod activées de la guild
2. Pour chaque règle (event_type = MESSAGE_SEND) :
   a. Vérifier si l'auteur a un rôle exempté → skip
   b. Vérifier si le salon est exempté → skip
   c. Évaluer le trigger selon son type contre le contenu du message
   d. Si trigger déclenché :
      - Exécuter chaque action dans l'ordre
      - Si BLOCK_MESSAGE : interrompre l'envoi, retourner 200 avec message fictif ou 400
      - Si SEND_ALERT_MESSAGE : créer un message système dans le salon d'alerte
      - Si TIMEOUT : appliquer communication_disabled_until
      - Enregistrer AUTO_MODERATION_BLOCK_MESSAGE dans l'audit log
3. Si aucun trigger → continuer l'envoi normal
```

---

## 5. Endpoints AutoMod

#### `POST /api/guilds/:guildId/auto-moderation/rules` — Créer une règle

**Requiert :** `MANAGE_GUILD`

**Corps de la requête :**
```json
{
  "name": "Filtre insultes",
  "event_type": 1,
  "trigger_type": 1,
  "trigger_metadata": {
    "keyword_filter": ["*insulte*", "grossièreté"],
    "regex_patterns": [],
    "allow_list": []
  },
  "actions": [
    { "type": 1, "metadata": { "custom_message": "Message bloqué." } },
    { "type": 2, "metadata": { "channel_id": "111222333444555666" } }
  ],
  "enabled": true,
  "exempt_roles": ["777888999000111222"],
  "exempt_channels": []
}
```

**Réponse 201 :** objet `AutoModRule` complet

---

#### `GET /api/guilds/:guildId/auto-moderation/rules` — Lister les règles

**Requiert :** `MANAGE_GUILD`

**Réponse 200 :** tableau d'objets `AutoModRule`

---

#### `GET /api/guilds/:guildId/auto-moderation/rules/:ruleId` — Obtenir une règle

**Requiert :** `MANAGE_GUILD`

**Réponse 200 :** objet `AutoModRule`

---

#### `PATCH /api/guilds/:guildId/auto-moderation/rules/:ruleId` — Modifier une règle

**Requiert :** `MANAGE_GUILD`

**Corps de la requête (champs optionnels) :**
```json
{
  "name": "Filtre insultes v2",
  "enabled": false,
  "trigger_metadata": {
    "keyword_filter": ["*insulte*", "grossièreté", "nouveauMot"]
  },
  "actions": [
    { "type": 1, "metadata": {} }
  ]
}
```

**Réponse 200 :** objet `AutoModRule` mis à jour

---

#### `DELETE /api/guilds/:guildId/auto-moderation/rules/:ruleId` — Supprimer une règle

**Requiert :** `MANAGE_GUILD`

**Réponse 204** (pas de corps)

---

## 6. Journal d'audit (Audit Log)

### Modèle de données

```
AuditLogEntry {
  id           String    @id (snowflake)
  guild_id     String    (référence vers Guild)
  user_id      String?   (qui a effectué l'action — null pour actions système)
  target_id    String?   (ID de l'entité affectée)
  target_type  String?   (type de la cible: "user", "channel", "role", etc.)
  action_type  Int       (voir enum ci-dessous)
  changes      Json?     (tableau de { key, old_value, new_value })
  reason       String?   (raison fournie par le modérateur, max 512 chars)
  options      Json?     (métadonnées supplémentaires selon l'action)
  created_at   DateTime  @default(now())
}
```

### Enum ActionType

| Valeur | Nom                                  | Description |
|--------|--------------------------------------|-------------|
| `1`    | `GUILD_UPDATE`                       | Serveur modifié |
| `10`   | `CHANNEL_CREATE`                     | Salon créé |
| `11`   | `CHANNEL_UPDATE`                     | Salon modifié |
| `12`   | `CHANNEL_DELETE`                     | Salon supprimé |
| `13`   | `CHANNEL_OVERWRITE_CREATE`           | Permission de salon créée |
| `14`   | `CHANNEL_OVERWRITE_UPDATE`           | Permission de salon modifiée |
| `15`   | `CHANNEL_OVERWRITE_DELETE`           | Permission de salon supprimée |
| `20`   | `MEMBER_KICK`                        | Membre expulsé |
| `22`   | `MEMBER_BAN_ADD`                     | Membre banni |
| `23`   | `MEMBER_BAN_REMOVE`                  | Bannissement levé |
| `24`   | `MEMBER_UPDATE`                      | Membre modifié (surnom, timeout...) |
| `25`   | `MEMBER_ROLE_UPDATE`                 | Rôles d'un membre modifiés |
| `30`   | `ROLE_CREATE`                        | Rôle créé |
| `31`   | `ROLE_UPDATE`                        | Rôle modifié |
| `32`   | `ROLE_DELETE`                        | Rôle supprimé |
| `40`   | `INVITE_CREATE`                      | Invitation créée |
| `41`   | `INVITE_UPDATE`                      | Invitation modifiée |
| `42`   | `INVITE_DELETE`                      | Invitation supprimée/révoquée |
| `50`   | `WEBHOOK_CREATE`                     | Webhook créé |
| `51`   | `WEBHOOK_UPDATE`                     | Webhook modifié |
| `52`   | `WEBHOOK_DELETE`                     | Webhook supprimé |
| `60`   | `EMOJI_CREATE`                       | Emoji personnalisé créé |
| `61`   | `EMOJI_UPDATE`                       | Emoji renommé |
| `62`   | `EMOJI_DELETE`                       | Emoji supprimé |
| `72`   | `MESSAGE_DELETE`                     | Message supprimé par modérateur |
| `73`   | `MESSAGE_BULK_DELETE`                | Suppression en masse de messages |
| `74`   | `MESSAGE_PIN`                        | Message épinglé |
| `75`   | `MESSAGE_UNPIN`                      | Message désépinglé |
| `90`   | `STICKER_CREATE`                     | Autocollant créé |
| `91`   | `STICKER_UPDATE`                     | Autocollant modifié |
| `92`   | `STICKER_DELETE`                     | Autocollant supprimé |
| `110`  | `THREAD_CREATE`                      | Fil de discussion créé |
| `111`  | `THREAD_UPDATE`                      | Fil de discussion modifié |
| `112`  | `THREAD_DELETE`                      | Fil de discussion supprimé |
| `140`  | `AUTO_MODERATION_RULE_CREATE`        | Règle AutoMod créée |
| `141`  | `AUTO_MODERATION_RULE_UPDATE`        | Règle AutoMod modifiée |
| `142`  | `AUTO_MODERATION_RULE_DELETE`        | Règle AutoMod supprimée |
| `143`  | `AUTO_MODERATION_BLOCK_MESSAGE`      | Message bloqué par AutoMod |

### Structure de `changes`

```json
[
  { "key": "name", "old_value": "Ancien nom", "new_value": "Nouveau nom" },
  { "key": "permissions", "old_value": "1071698657", "new_value": "1071698660417" },
  { "key": "$add", "new_value": [{ "id": "111", "name": "Admin" }] },
  { "key": "$remove", "new_value": [{ "id": "222", "name": "Mod" }] }
]
```

### Structure de `options` (selon l'action)

Pour `MEMBER_KICK` / `MEMBER_BAN_ADD` :
```json
{}
```

Pour `MESSAGE_DELETE` :
```json
{ "channel_id": "...", "message_id": "..." }
```

Pour `MESSAGE_BULK_DELETE` :
```json
{ "channel_id": "...", "count": "25" }
```

Pour `CHANNEL_OVERWRITE_*` :
```json
{ "id": "roleId", "role_name": "Modérateur", "type": "0" }
```
*(type 0 = rôle, type 1 = membre)*

Pour `AUTO_MODERATION_BLOCK_MESSAGE` :
```json
{
  "auto_moderation_rule_id": "...",
  "auto_moderation_rule_name": "Filtre insultes",
  "channel_id": "...",
  "message_id": "..."
}
```

### Endpoint de consultation

#### `GET /api/guilds/:guildId/audit-logs` — Consulter le journal

**Requiert :** `VIEW_AUDIT_LOG`

**Paramètres de requête :**
```
?user_id=123456789    (filtrer par auteur de l'action)
?action_type=22       (filtrer par type d'action)
?before=entryId       (pagination — avant cet ID)
?limit=50             (défaut: 50, max: 100)
```

**Réponse 200 :**
```json
{
  "audit_log_entries": [
    {
      "id": "9999999999999999999",
      "user_id": "1111111111111111111",
      "target_id": "2222222222222222222",
      "action_type": 22,
      "reason": "Spam répété",
      "changes": [],
      "options": {},
      "created_at": "2025-01-10T15:30:00.000Z",
      "user": {
        "id": "1111111111111111111",
        "username": "moderateur",
        "avatar": "abc123"
      },
      "target": {
        "id": "2222222222222222222",
        "username": "spammer",
        "avatar": null
      }
    }
  ],
  "users": [...],
  "total_results": 150
}
```

### Interface (Paramètres du serveur → Logs du serveur)

- **Filtres en haut de page :**
  - Dropdown "Filtrer par membre" (recherche d'utilisateur par nom)
  - Dropdown "Filtrer par action" (liste de toutes les actions de l'enum)
  - Bouton "Réinitialiser les filtres"
- **Liste d'entrées :**
  - Chaque entrée affiche : avatar + nom du modérateur, description de l'action (ex: "**moderateur** a banni **spammer**"), timestamp relatif.
  - Entrées avec `changes` : bouton d'expansion → liste des champs modifiés sous forme de diff (ancienne valeur → nouvelle valeur).
  - Raison affichée si présente.
- **Pagination :** chargement infini (scroll) avec curseur `before`.

---

## 7. Niveaux de vérification du serveur

Contrôle qui peut envoyer des messages dans le serveur selon le niveau de vérification. Configuré dans les paramètres du serveur.

```
Guild {
  ...
  verification_level   Int  @default(0)
  ...
}
```

| Valeur | Nom          | Condition requise pour participer |
|--------|--------------|-----------------------------------|
| `0`    | `NONE`       | Aucune restriction |
| `1`    | `LOW`        | Email vérifié sur le compte |
| `2`    | `MEDIUM`     | Compte créé il y a plus de 5 minutes |
| `3`    | `HIGH`       | Membre du serveur depuis plus de 10 minutes |
| `4`    | `VERY_HIGH`  | Numéro de téléphone vérifié *(v2 — non implémenté en v1)* |

**Vérification backend :** à chaque tentative d'envoi de message dans un salon de guild, contrôler `verification_level` et renvoyer `403` avec le code `VERIFICATION_LEVEL_TOO_LOW` si les conditions ne sont pas remplies.

---

## 8. Configuration de sécurité du serveur

### Endpoint de modification

```
PATCH /api/guilds/:guildId
```

**Champs de sécurité modifiables :**
```json
{
  "verification_level": 2,
  "explicit_content_filter": 1,
  "default_message_notifications": 0,
  "mfa_level": 0
}
```

**`explicit_content_filter`** — Filtre du contenu explicite (images) :
| Valeur | Description |
|--------|-------------|
| `0`    | Désactivé |
| `1`    | Analyser les messages des membres sans rôle |
| `2`    | Analyser tous les messages |

**`default_message_notifications`** — Notifications par défaut pour les nouveaux membres :
| Valeur | Description |
|--------|-------------|
| `0`    | Toutes les mentions |
| `1`    | Seulement les @mentions directes |

**`mfa_level`** — 2FA obligatoire pour les actions de modération :
| Valeur | Description |
|--------|-------------|
| `0`    | Désactivé |
| `1`    | Obligatoire pour les modérateurs *(v2)* |

### Interface (Paramètres du serveur → Configuration de Sécurité)

- Section **"Niveau de vérification"** : slider ou radio buttons de 0 à 4 avec description de chaque niveau.
- Section **"Filtre de contenu explicite"** : 3 options radio.
- Section **"Authentification à deux facteurs"** : toggle ON/OFF (conditionnel au compte owner).
- Section **"Notifications par défaut"** : radio "Tous les messages" / "Seulement les @mentions".
- Bouton "Enregistrer les modifications" (déclenche `PATCH /api/guilds/:id`).

---

## 9. Événements Socket.IO liés à la modération

| Événement                         | Déclencheur | Payload |
|-----------------------------------|-------------|---------|
| `GUILD_MEMBER_REMOVE`             | Kick        | `{ guild_id, user }` |
| `GUILD_BAN_ADD`                   | Bannissement | `{ guild_id, user }` |
| `GUILD_BAN_REMOVE`                | Levée de ban | `{ guild_id, user }` |
| `GUILD_MEMBER_UPDATE`             | Timeout appliqué/levé | `{ guild_id, member }` |
| `AUTO_MODERATION_RULE_CREATE`     | Nouvelle règle AutoMod | `{ guild_id, rule }` |
| `AUTO_MODERATION_RULE_UPDATE`     | Règle AutoMod modifiée | `{ guild_id, rule }` |
| `AUTO_MODERATION_RULE_DELETE`     | Règle AutoMod supprimée | `{ guild_id, rule_id }` |
| `AUTO_MODERATION_ACTION_EXECUTION`| Message bloqué par AutoMod | `{ guild_id, action, rule_id, channel_id, message_id, user_id, matched_keyword }` |

---

## 10. Cas limites et règles métier complémentaires

- Un modérateur ne peut pas se bannir/expulser lui-même.
- Un modérateur ne peut pas bannir/expulser le propriétaire du serveur.
- Les entrées d'audit log sont conservées indéfiniment (pas de TTL en v1).
- La suppression en masse de messages (`MESSAGE_BULK_DELETE`) via ban est limitée à 14 jours d'historique maximum.
- En cas d'échec d'une action AutoMod (ex: salon d'alerte supprimé), l'action est ignorée silencieusement et loggée côté backend uniquement.
- Les messages DM ne sont jamais soumis à AutoMod.
- Les messages d'un utilisateur avec `ADMINISTRATOR` ne sont pas analysés par AutoMod.

---

## 11. Signalements utilisateur (User Reports)

### 11.1 Modèle de données

#### Table `reports`

| Champ | Type | Description |
|---|---|---|
| `id` | `String` (snowflake) | Identifiant unique |
| `reporter_id` | `String` | FK → `users.id` — auteur du signalement |
| `guild_id` | `String?` | FK → `guilds.id` — serveur concerné (null pour DM) |
| `reported_user_id` | `String?` | FK → `users.id` — utilisateur signalé |
| `reported_message_id` | `String?` | FK → `messages.id` — message signalé |
| `reported_channel_id` | `String?` | FK → `channels.id` — canal concerné |
| `reason` | `Int` | Catégorie du signalement (voir tableau) |
| `description` | `String?` | Description libre (max 500 caractères) |
| `status` | `Int` | `0`=PENDING, `1`=REVIEWED, `2`=ACTION_TAKEN, `3`=DISMISSED |
| `reviewed_by` | `String?` | FK → `users.id` — administrateur ayant traité |
| `review_note` | `String?` | Note interne du reviewer |
| `created_at` | `DateTime` | Date du signalement |
| `updated_at` | `DateTime` | Date de mise à jour |

### 11.2 Catégories de signalement

| Valeur | Constante | Label |
|---|---|---|
| `0` | `ILLEGAL_CONTENT` | Contenu illégal |
| `1` | `HARASSMENT` | Harcèlement |
| `2` | `SPAM` | Spam ou abus |
| `3` | `NSFW` | Contenu NSFW non autorisé |
| `4` | `SELF_HARM` | Automutilation ou suicide |
| `5` | `IMPERSONATION` | Usurpation d'identité |
| `6` | `MISINFORMATION` | Désinformation |
| `7` | `OTHER` | Autre |

### 11.3 API — Côté utilisateur

**`POST /api/reports`**

Requiert : authentification. Rate limit : **3 signalements / 10 min** par utilisateur.

```json
{
  "guild_id": "1111111111111111111",
  "reported_user_id": "2222222222222222222",
  "reported_message_id": "3333333333333333333",
  "reason": 1,
  "description": "Harcèlement répété dans le canal #général"
}
```

**Validations :**
- Au moins `reported_user_id` ou `reported_message_id` doit être fourni
- L'utilisateur ne peut pas se signaler lui-même
- Un utilisateur ne peut pas soumettre un signalement identique (même cible + même raison) en doublon dans les 24h

**Réponse 201 Created :**
```json
{
  "id": "4444444444444444444",
  "status": 0,
  "created_at": "2025-01-15T10:00:00.000Z"
}
```

### 11.4 API — Côté administration (panneau admin)

**`GET /api/admin/reports`**

Query params : `?status=0&page=1&limit=20&guild_id=...`

**Réponse 200 OK :**
```json
{
  "reports": [
    {
      "id": "...",
      "reporter": { "id": "...", "username": "alice" },
      "reported_user": { "id": "...", "username": "bob" },
      "reported_message": { "id": "...", "content": "...", "channel_id": "..." },
      "guild": { "id": "...", "name": "Mon Serveur" },
      "reason": 1,
      "description": "...",
      "status": 0,
      "created_at": "..."
    }
  ],
  "total": 42,
  "page": 1
}
```

**`PATCH /api/admin/reports/:reportId`**

```json
{
  "status": 2,
  "review_note": "Utilisateur banni pour harcèlement répété"
}
```

**`GET /api/admin/reports/stats`**

```json
{
  "total": 142,
  "pending": 12,
  "reviewed": 80,
  "action_taken": 38,
  "dismissed": 12,
  "by_reason": {
    "HARASSMENT": 45,
    "SPAM": 30,
    "NSFW": 20,
    "OTHER": 47
  }
}
```

### 11.5 Interface — Côté utilisateur

**Accès au signalement :**
- Menu contextuel (clic droit) sur un message → "Signaler le message"
- Menu "⋯" sur le profil d'un utilisateur → "Signaler l'utilisateur"
- Disponible dans le popout de profil et la page de profil

**Modale de signalement :**
1. Titre : "Signaler {username}" ou "Signaler ce message"
2. Si message signalé : aperçu du message (contenu tronqué, auteur, date) dans un encadré `--bg-secondary`
3. Liste de radio buttons pour la catégorie (`reason`)
4. Textarea optionnelle "Détails supplémentaires" (max 500 caractères)
5. Bouton "Soumettre le signalement" (rouge)
6. Après soumission : écran de confirmation "Merci pour votre signalement. Notre équipe l'examinera dans les plus brefs délais."

### 11.6 Interface — Panneau admin (Modération → Signalements)

**Page liste des signalements :**
- Filtres : statut (Tous / En attente / Examiné / Action prise / Rejeté), serveur, catégorie
- Tableau : avatar du reporter, avatar du signalé, catégorie (badge coloré), serveur, date, statut
- Tri par date (plus récent par défaut) ou par statut (en attente d'abord)
- Compteur de signalements en attente dans le badge de la sidebar admin

**Page détail d'un signalement :**
- Informations du reporter (lien vers son profil admin)
- Informations du signalé (lien vers son profil admin)
- Message signalé (rendu complet avec pièces jointes) avec bouton "Voir dans le canal"
- Historique des signalements précédents du signalé (récidive)
- Actions rapides : "Supprimer le message", "Timeout l'utilisateur", "Bannir du serveur", "Désactiver le compte"
- Champ note interne
- Boutons : "Marquer comme examiné", "Action prise", "Rejeter"
