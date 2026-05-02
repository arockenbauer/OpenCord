# Spécification 20 — Événements Programmés (Scheduled Events)

> Spécification complète du système d'événements serveur : création, RSVP, notifications, récurrence.
>
> Dépendances : `00-architecture.md`, `03-servers-channels.md` (guilds, canaux), `05-roles-permissions.md` (permissions).

---

## 1. Modèle de données

### 1.1 Table `guild_scheduled_events`

| Champ | Type | Description |
|---|---|---|
| `id` | `String` (snowflake) | Identifiant unique |
| `guild_id` | `String` | FK → `guilds.id` |
| `creator_id` | `String` | FK → `users.id` — créateur de l'événement |
| `channel_id` | `String?` | FK → `channels.id` — canal vocal/stage associé (null si externe) |
| `name` | `String` | Nom de l'événement (1–100 caractères) |
| `description` | `String?` | Description (max 1000 caractères, supporte le Markdown) |
| `image` | `String?` | Image de couverture (800×320 WebP) |
| `scheduled_start_time` | `DateTime` | Date/heure de début |
| `scheduled_end_time` | `DateTime?` | Date/heure de fin (obligatoire pour les événements externes) |
| `entity_type` | `Int` | Type d'entité : `1`=STAGE, `2`=VOICE, `3`=EXTERNAL |
| `entity_metadata` | `Json?` | Métadonnées selon le type (voir ci-dessous) |
| `status` | `Int` | `1`=SCHEDULED, `2`=ACTIVE, `3`=COMPLETED, `4`=CANCELLED |
| `privacy_level` | `Int` | `2`=GUILD_ONLY (seul niveau supporté en v1) |
| `user_count` | `Int` | Nombre d'utilisateurs intéressés (dénormalisé) |
| `recurrence_rule` | `Json?` | Règle de récurrence (voir section 5) |
| `created_at` | `DateTime` | Date de création |

### Structure `entity_metadata` (pour `entity_type = 3` EXTERNAL)

```json
{
  "location": "Paris, France — Salle des Congrès"
}
```

### 1.2 Table `guild_scheduled_event_users` (RSVP)

| Champ | Type | Description |
|---|---|---|
| `event_id` | `String` | FK → `guild_scheduled_events.id` |
| `user_id` | `String` | FK → `users.id` |
| `created_at` | `DateTime` | Date d'inscription |

Contrainte : `@@id([event_id, user_id])`

---

## 2. Types d'événements

| `entity_type` | Nom | Description |
|---|---|---|
| `1` | `STAGE_INSTANCE` | Événement lié à un canal scène ⚠️ DIFFÉRÉ |
| `2` | `VOICE` | Événement lié à un canal vocal ⚠️ DIFFÉRÉ |
| `3` | `EXTERNAL` | Événement externe (lieu physique ou lien URL) |

En v1, seul le type `EXTERNAL` est pleinement fonctionnel. Les types `STAGE` et `VOICE` sont créables mais la fonctionnalité temps réel est DIFFÉRÉE (l'événement est affiché mais le canal vocal/stage associé n'a pas de comportement spécial).

---

## 3. Cycle de vie

```
SCHEDULED → ACTIVE → COMPLETED
    ↓
 CANCELLED
```

| Transition | Déclencheur |
|---|---|
| SCHEDULED → ACTIVE | Automatique quand `scheduled_start_time` est atteint (cron job toutes les minutes) OU manuellement par le créateur |
| ACTIVE → COMPLETED | Automatique quand `scheduled_end_time` est atteint OU manuellement |
| SCHEDULED → CANCELLED | Manuellement par le créateur ou un admin (`MANAGE_EVENTS`) |
| ACTIVE → CANCELLED | Manuellement |

Un événement `COMPLETED` ou `CANCELLED` est conservé en base pendant **30 jours** puis supprimé par un job de nettoyage.

---

## 4. API

### 4.1 Créer un événement

**`POST /api/guilds/:guildId/scheduled-events`**

Requiert : `MANAGE_EVENTS`

**Corps de la requête :**
```json
{
  "name": "Soirée Jeux de Société",
  "description": "Venez jouer avec nous ! Apportez vos jeux préférés.",
  "scheduled_start_time": "2025-02-15T19:00:00.000Z",
  "scheduled_end_time": "2025-02-15T23:00:00.000Z",
  "entity_type": 3,
  "entity_metadata": {
    "location": "Café Le Pixel, 12 rue des Arcades, Lyon"
  },
  "privacy_level": 2
}
```

**Réponse 201 Created :**
```json
{
  "id": "event_123",
  "guild_id": "guild_456",
  "creator_id": "user_789",
  "name": "Soirée Jeux de Société",
  "description": "Venez jouer avec nous !...",
  "scheduled_start_time": "2025-02-15T19:00:00.000Z",
  "scheduled_end_time": "2025-02-15T23:00:00.000Z",
  "entity_type": 3,
  "entity_metadata": { "location": "Café Le Pixel..." },
  "status": 1,
  "privacy_level": 2,
  "user_count": 0,
  "creator": { "id": "user_789", "username": "axel", "avatar": "..." },
  "created_at": "2025-01-20T10:00:00.000Z"
}
```

**Validation :**
- `scheduled_start_time` doit être dans le futur
- `scheduled_end_time` obligatoire si `entity_type = 3` et doit être après `scheduled_start_time`
- `channel_id` obligatoire si `entity_type = 1 ou 2`, doit être un canal du bon type

---

### 4.2 Lister les événements d'un serveur

**`GET /api/guilds/:guildId/scheduled-events`**

**Paramètres de requête :**
- `with_user_count` : `true` pour inclure `user_count` (défaut: true)
- `status` : filtrer par statut (`1`, `2`, `3`, `4`)

**Réponse 200 OK :** tableau d'objets événement

---

### 4.3 Obtenir un événement

**`GET /api/guilds/:guildId/scheduled-events/:eventId`**

**Réponse 200 OK :** objet événement complet avec `creator`

---

### 4.4 Modifier un événement

**`PATCH /api/guilds/:guildId/scheduled-events/:eventId`**

Requiert : `MANAGE_EVENTS` ou être le créateur

**Corps de la requête (tous optionnels) :**
```json
{
  "name": "Nouveau nom",
  "description": "Nouvelle description",
  "scheduled_start_time": "2025-02-16T19:00:00.000Z",
  "status": 2
}
```

**Réponse 200 OK :** événement mis à jour

---

### 4.5 Supprimer un événement

**`DELETE /api/guilds/:guildId/scheduled-events/:eventId`**

Requiert : `MANAGE_EVENTS`

**Réponse 204 No Content**

---

### 4.6 Upload de l'image de couverture

**`PUT /api/guilds/:guildId/scheduled-events/:eventId/image`**

Multipart/form-data, champ `file`. Traitement : 800×320 WebP via `sharp`.

**Réponse 200 OK :** `{ "image": "/uploads/events/eventId.webp" }`

---

### 4.7 RSVP — Marquer son intérêt

**`PUT /api/guilds/:guildId/scheduled-events/:eventId/users/@me`**

**Réponse 204 No Content**

**Logique :**
1. Créer l'entrée dans `guild_scheduled_event_users`
2. Incrémenter `user_count` sur l'événement
3. Émettre `GUILD_SCHEDULED_EVENT_USER_ADD`

---

### 4.8 RSVP — Retirer son intérêt

**`DELETE /api/guilds/:guildId/scheduled-events/:eventId/users/@me`**

**Réponse 204 No Content**

**Logique :** supprimer l'entrée, décrémenter `user_count`, émettre `GUILD_SCHEDULED_EVENT_USER_REMOVE`

---

### 4.9 Lister les utilisateurs intéressés

**`GET /api/guilds/:guildId/scheduled-events/:eventId/users`**

**Paramètres :** `limit` (défaut: 100, max: 100), `after` (pagination curseur)

**Réponse 200 OK :**
```json
{
  "users": [
    {
      "user": { "id": "...", "username": "alice", "avatar": "..." },
      "guild_scheduled_event_id": "event_123"
    }
  ]
}
```

---

## 5. Récurrence

### Structure `recurrence_rule`

```json
{
  "frequency": "weekly",
  "interval": 1,
  "by_weekday": [5],
  "count": null,
  "end_date": "2025-06-01T00:00:00.000Z"
}
```

| Champ | Type | Description |
|---|---|---|
| `frequency` | `String` | `daily`, `weekly`, `monthly` |
| `interval` | `Int` | Intervalle (ex: `2` = toutes les 2 semaines) |
| `by_weekday` | `Int[]?` | Jours de la semaine (0=lundi … 6=dimanche) |
| `count` | `Int?` | Nombre max d'occurrences (null = infini) |
| `end_date` | `DateTime?` | Date de fin de récurrence |

**Logique :** Un cron job crée automatiquement la prochaine occurrence lorsqu'un événement récurrent passe en `COMPLETED`. Le nouvel événement hérite de toutes les propriétés (nom, description, image, metadata) avec les dates recalculées.

---

## 6. Notifications

### 6.1 Notifications automatiques

| Moment | Action |
|---|---|
| Création de l'événement | Message système dans `system_channel` : "📅 **Axel** a créé l'événement **Soirée JdS** — 15 février à 19h" |
| 60 minutes avant le début | Notification `NOTIFICATION_CREATE` de type `EVENT_REMINDER` aux utilisateurs RSVP |
| Début de l'événement | Notification aux utilisateurs RSVP : "🎉 L'événement **Soirée JdS** commence maintenant !" |

### 6.2 Message système d'événement

Un message de type `GUILD_SCHEDULED_EVENT_CREATE` est posté dans le `system_channel` du serveur. Ce message contient un embed avec :
- Titre de l'événement (cliquable)
- Date et heure formatées
- Lieu (si externe)
- Bouton "Intéressé(e)" en reaction

---

## 7. Événements Socket.IO

| Événement | Déclencheur | Payload |
|---|---|---|
| `GUILD_SCHEDULED_EVENT_CREATE` | Nouvel événement | `{ guild_id, event }` |
| `GUILD_SCHEDULED_EVENT_UPDATE` | Modification/changement de statut | `{ guild_id, event }` |
| `GUILD_SCHEDULED_EVENT_DELETE` | Suppression/annulation | `{ guild_id, event_id }` |
| `GUILD_SCHEDULED_EVENT_USER_ADD` | Utilisateur intéressé | `{ guild_id, event_id, user_id }` |
| `GUILD_SCHEDULED_EVENT_USER_REMOVE` | Retrait d'intérêt | `{ guild_id, event_id, user_id }` |

---

## 8. Interface utilisateur

### 8.1 Affichage dans le serveur

- **Barre d'événements** : bandeau affiché en haut de la liste des canaux quand un événement est SCHEDULED ou ACTIVE
  - Icône 📅 + nom tronqué + heure de début relative ("dans 2h" / "en cours")
  - Clic → popup de détail de l'événement
  - Compteur d'intéressés

### 8.2 Popup de détail

- Image de couverture (800×320)
- Nom, description (Markdown rendu)
- Date/heure formatée selon la locale de l'utilisateur
- Lieu (si externe) avec lien cliquable si URL détectée
- Créateur (avatar + nom)
- Compteur d'intéressés + avatars des 5 premiers
- Bouton "Intéressé(e) ✋" (toggle)
- Bouton "Modifier" (si `MANAGE_EVENTS`)
- Bouton "Annuler" (si `MANAGE_EVENTS` ou créateur)

### 8.3 Modale de création

- Champ "Nom de l'événement"
- Sélecteur de type : "Lieu externe" / "Canal vocal" / "Canal scène"
- Si externe : champ "Lieu"
- Si vocal/scène : dropdown de sélection du canal
- Date picker + time picker pour début et fin
- Textarea "Description" (Markdown)
- Upload image de couverture (drag & drop)
- Toggle "Récurrence" → sélecteurs de fréquence/intervalle/jours
- Bouton "Créer l'événement"

### 8.4 Paramètres du serveur — Événements

Accessible via **Paramètres du serveur → Événements** (si `MANAGE_EVENTS`).

- Liste de tous les événements (passés, en cours, à venir) avec filtres par statut
- Bouton "Créer un événement" en haut à droite
- Chaque entrée : nom, date, statut (badge coloré), intéressés, boutons modifier/supprimer

---

## 9. Audit Log

| Action type | Nom | Description |
|---|---|---|
| `150` | `GUILD_SCHEDULED_EVENT_CREATE` | Événement créé |
| `151` | `GUILD_SCHEDULED_EVENT_UPDATE` | Événement modifié |
| `152` | `GUILD_SCHEDULED_EVENT_DELETE` | Événement supprimé |

---

## Références croisées

- `00-architecture.md` — Stack, conventions
- `03-servers-channels.md` — Guilds, canaux vocaux/stage
- `06-moderation-automod.md` — Audit log
- `14-notifications-i18n.md` — Notifications, i18n
