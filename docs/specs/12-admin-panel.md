# Spécification 12 — Panneau d'Administration

## 1. Contrôle d'accès

### Niveaux d'administration

Le champ `admin_level` sur le modèle `User` détermine les droits d'accès au panneau d'administration :

| Niveau | Rôle               | Accès                                                                        |
|--------|--------------------|------------------------------------------------------------------------------|
| `0`    | Utilisateur normal | **Aucun accès** — 403 sur toutes les routes `/admin`                         |
| `1`    | Modérateur global  | Consultation des signalements, modération des utilisateurs                   |
| `2`    | Administrateur     | Accès complet au panneau (sauf gestion des niveaux admin)                    |
| `3`    | Super Admin        | Accès total, y compris modification des niveaux admin et paramètres système  |

### Middleware

Le middleware `requireAdmin(minLevel: number)` est appliqué à toutes les routes d'administration :

1. Vérifie que l'utilisateur est authentifié (JWT valide)
2. Vérifie que `user.admin_level >= minLevel`
3. En cas d'échec : retourne `403 Forbidden`

```json
{
  "error": "FORBIDDEN",
  "message": "Vous n'avez pas les permissions nécessaires pour accéder à cette ressource."
}
```

### Structure des routes

- **API** : toutes les routes admin sous `/api/admin/*`
- **Frontend** : toutes les routes admin sous `/admin/*`
- La page `/admin` est une SPA séparée (ou une section protégée de l'application principale)
- Toute tentative d'accès direct à `/admin` sans le niveau requis redirige vers `/admin/forbidden`

---

## 2. Tableau de bord (`/admin`)

Page d'accueil du panneau d'administration.

### Cartes de statistiques globales

Affichées en haut de page, en rangée horizontale :

| Métrique                       | Description                                          |
|-------------------------------|------------------------------------------------------|
| Utilisateurs total            | Nombre total de comptes (bots exclus)                |
| Serveurs total                | Nombre total de guildes actives                      |
| Messages (24h)                | Nombre de messages envoyés dans les 24 dernières heures |
| Connexions actives            | Nombre de sockets Socket.IO actuellement connectées  |
| Stockage utilisé              | Taille totale des fichiers uploadés (en MB/GB)       |

### Graphiques

- **Nouveaux utilisateurs (30 jours)** : graphique en barres — un point par jour
- **Messages par jour (30 jours)** : graphique en lignes
- **Utilisateurs actifs par jour (30 jours)** : graphique en lignes (utilisateurs ayant envoyé au moins 1 message)

### Activité récente

Liste des 10 dernières actions admin avec : admin, action, cible, date.

### Santé du système

- **Uptime** du serveur Node.js (en jours/heures/minutes)
- **Utilisation mémoire** : heap used / heap total
- **Taille de la base de données** SQLite en MB
- **Version** de l'application

---

## 3. Gestion des utilisateurs (`/admin/users`)

### Liste des utilisateurs

**`GET /api/admin/users`**

Paramètres de requête :
- `search` : recherche par nom d'utilisateur, email ou ID
- `page` : numéro de page (défaut : 1)
- `limit` : résultats par page (défaut : 50, max : 100)
- `admin_level` : filtrer par niveau admin (0, 1, 2, 3)
- `status` : `active`, `disabled`, `banned`
- `sort` : `created_at_desc`, `created_at_asc`, `username_asc`

Réponse `200 OK` :
```json
{
  "users": [
    {
      "id": "clxuser123",
      "username": "axel",
      "discriminator": "0001",
      "email": "axel@example.com",
      "avatar": null,
      "admin_level": 3,
      "disabled": false,
      "banned": false,
      "created_at": "2025-01-01T00:00:00.000Z",
      "guild_count": 12,
      "subscription": {
        "active": true,
        "plan": "opencord_plus"
      }
    }
  ],
  "total": 1542,
  "page": 1,
  "limit": 50,
  "pages": 31
}
```

### Interface (tableau)

Colonnes affichées :
- Avatar + Nom d'utilisateur#discriminator
- Email
- Date d'inscription
- Niveau admin (badge coloré)
- Statut (Actif / Désactivé / Banni)
- Abonnement (OpenCord+ ou non)
- Actions : **Voir**, **Modifier**, **Bannir**

### Vue détaillée d'un utilisateur

**`GET /api/admin/users/:id`**

Réponse `200 OK` :
```json
{
  "id": "clxuser123",
  "username": "axel",
  "discriminator": "0001",
  "email": "axel@example.com",
  "avatar": null,
  "banner": null,
  "bio": "Développeur OpenCord",
  "admin_level": 3,
  "disabled": false,
  "banned": false,
  "ban_reason": null,
  "created_at": "2025-01-01T00:00:00.000Z",
  "last_seen_at": "2025-06-15T14:30:00.000Z",
  "locale": "fr",
  "mfa_enabled": true,
  "subscription": {
    "active": true,
    "plan": "opencord_plus",
    "started_at": "2025-03-01T00:00:00.000Z",
    "expires_at": "2025-07-01T00:00:00.000Z"
  },
  "badges": [
    { "id": "clxbadge1", "name": "Super Admin", "icon": "👑" }
  ],
  "guilds": [
    { "id": "clxguild1", "name": "Mon Serveur", "member_count": 42 }
  ],
  "sessions_count": 2
}
```

### Actions disponibles sur un utilisateur

#### Modifier le niveau admin

**`PATCH /api/admin/users/:id`**

Requiert `admin_level = 3` (Super Admin uniquement).

Corps :
```json
{
  "admin_level": 1
}
```

Réponse `200 OK` : utilisateur mis à jour.

#### Désactiver / Réactiver un compte

**`PATCH /api/admin/users/:id`**

Corps :
```json
{
  "disabled": true
}
```

Un compte désactivé ne peut pas se connecter (erreur 403 au login).

#### Bannissement global

**`POST /api/admin/users/:id/ban`**

Le bannissement global empêche toute connexion à la plateforme (différent d'un ban de serveur).

Corps :
```json
{
  "reason": "Violation grave des conditions d'utilisation"
}
```

Réponse `200 OK` :
```json
{
  "user_id": "clxuser123",
  "banned": true,
  "ban_reason": "Violation grave des conditions d'utilisation",
  "banned_at": "2025-06-15T15:00:00.000Z",
  "banned_by": "clxadmin456"
}
```

#### Lever un bannissement global

**`DELETE /api/admin/users/:id/ban`**

Réponse `200 OK` : utilisateur débanni.

#### Forcer la déconnexion de toutes les sessions

**`POST /api/admin/users/:id/force-logout`**

Invalide tous les tokens de refresh de l'utilisateur et déconnecte toutes ses sessions Socket.IO actives.

Réponse `200 OK` :
```json
{
  "sessions_terminated": 2
}
```

#### Assigner / Révoquer un badge

Voir la section **Gestion des badges**.

---

## 4. Gestion des badges (`/admin/badges`)

### Liste des badges

**`GET /api/admin/badges`**

Réponse `200 OK` :
```json
[
  {
    "id": "clxbadge1",
    "name": "OpenCord CEO",
    "description": "Fondateur et PDG d'OpenCord",
    "icon": "👑",
    "type": "system",
    "auto_rule": null,
    "assigned_count": 1,
    "created_at": "2025-01-01T00:00:00.000Z"
  },
  {
    "id": "clxbadge2",
    "name": "OpenCord+",
    "description": "Abonné OpenCord+",
    "icon": "⭐",
    "type": "auto",
    "auto_rule": { "condition": "subscription.active == true" },
    "assigned_count": 234,
    "created_at": "2025-01-01T00:00:00.000Z"
  }
]
```

### Types de badges

| Type     | Description                                                           |
|----------|-----------------------------------------------------------------------|
| `system` | Badge réservé à l'équipe (CEO, Staff, Security Team)                  |
| `admin`  | Badge assigné manuellement par un administrateur                      |
| `auto`   | Badge assigné automatiquement selon une règle (`auto_rule`)           |

### Créer un badge

**`POST /api/admin/badges`**

Requiert `admin_level >= 2`.

Corps :
```json
{
  "name": "Équipe Sécurité",
  "description": "Membre de l'équipe de sécurité OpenCord",
  "icon": "🛡️",
  "type": "system",
  "auto_rule": null
}
```

Réponse `201 Created` : badge créé.

### Modifier un badge

**`PATCH /api/admin/badges/:id`**

Corps (tous les champs sont optionnels) :
```json
{
  "name": "Security Team",
  "description": "Membre de l'équipe de sécurité",
  "icon": "🔒"
}
```

### Supprimer un badge

**`DELETE /api/admin/badges/:id`**

Requiert une confirmation (le frontend affiche un modal de confirmation). La suppression retire le badge de **tous** les utilisateurs qui le possèdent.

Réponse `204 No Content`.

### Assigner un badge à un utilisateur

**`POST /api/admin/badges/:id/assign`**

Corps :
```json
{
  "userId": "clxuser123"
}
```

Réponse `200 OK` :
```json
{
  "badge_id": "clxbadge1",
  "user_id": "clxuser123",
  "assigned_at": "2025-06-15T15:00:00.000Z",
  "assigned_by": "clxadmin456"
}
```

### Révoquer un badge

**`DELETE /api/admin/badges/:id/assign/:userId`**

Réponse `204 No Content`.

### Lister les utilisateurs avec un badge

**`GET /api/admin/badges/:id/users`**

Paramètres : `page`, `limit`.

Réponse `200 OK` :
```json
{
  "users": [
    {
      "id": "clxuser123",
      "username": "axel",
      "avatar": null,
      "assigned_at": "2025-01-01T00:00:00.000Z"
    }
  ],
  "total": 1
}
```

### Attribution en masse

L'interface permet de sélectionner plusieurs utilisateurs via des cases à cocher et d'assigner ou révoquer un badge pour tous en une seule action.

---

## 5. Gestion des serveurs (`/admin/servers`)

### Liste des serveurs

**`GET /api/admin/guilds`**

Paramètres : `search`, `page`, `limit`.

Réponse `200 OK` :
```json
{
  "guilds": [
    {
      "id": "clxguild123",
      "name": "Mon Grand Serveur",
      "icon": null,
      "owner": {
        "id": "clxuser123",
        "username": "axel"
      },
      "member_count": 1250,
      "boost_tier": 2,
      "created_at": "2025-01-15T00:00:00.000Z",
      "features": []
    }
  ],
  "total": 387,
  "page": 1,
  "limit": 50
}
```

### Vue détaillée d'un serveur

**`GET /api/admin/guilds/:id`**

Réponse `200 OK` :
```json
{
  "id": "clxguild123",
  "name": "Mon Grand Serveur",
  "icon": null,
  "description": null,
  "owner": { "id": "clxuser123", "username": "axel" },
  "member_count": 1250,
  "channel_count": 24,
  "role_count": 8,
  "boost_tier": 2,
  "boost_count": 15,
  "features": ["COMMUNITY", "NEWS"],
  "created_at": "2025-01-15T00:00:00.000Z",
  "ban_count": 3
}
```

### Supprimer un serveur (force delete)

**`DELETE /api/admin/guilds/:id`**

Requiert `admin_level >= 2`. Supprime le serveur, ses canaux, ses messages et ses membres.

Corps :
```json
{
  "reason": "Contenu illégal signalé"
}
```

Réponse `204 No Content`.

### Modifier les fonctionnalités d'un serveur

**`PATCH /api/admin/guilds/:id`**

Permet d'activer ou désactiver des feature flags sur un serveur.

Corps :
```json
{
  "features": ["COMMUNITY", "NEWS", "VERIFIED"]
}
```

Réponse `200 OK` : guilde mise à jour.

---

## 6. Gestion des signalements (`/admin/reports`)

### Modèle Report

| Champ         | Type      | Description                                                                      |
|---------------|-----------|----------------------------------------------------------------------------------|
| `id`          | `String`  | Identifiant unique                                                               |
| `reporter_id` | `String`  | Référence vers `User.id` du signaleur                                            |
| `target_type` | `Enum`    | `user`, `message`, ou `guild`                                                    |
| `target_id`   | `String`  | ID de la cible (selon `target_type`)                                             |
| `reason`      | `String`  | Raison du signalement                                                            |
| `status`      | `Enum`    | `pending`, `reviewed`, `resolved`, `dismissed`                                   |
| `reviewer_id` | `String?` | Admin ayant traité le signalement                                                |
| `notes`       | `String?` | Notes internes du modérateur                                                     |
| `created_at`  | `DateTime`| Date du signalement                                                              |
| `resolved_at` | `DateTime?`| Date de résolution                                                              |

### Liste des signalements

**`GET /api/admin/reports`**

Paramètres : `status`, `target_type`, `page`, `limit`.

Réponse `200 OK` :
```json
{
  "reports": [
    {
      "id": "clxreport1",
      "reporter": { "id": "clxuser1", "username": "user1" },
      "target_type": "message",
      "target_id": "clxmsg123",
      "reason": "Contenu haineux",
      "status": "pending",
      "created_at": "2025-06-15T10:00:00.000Z"
    }
  ],
  "total": 12,
  "page": 1
}
```

### Traiter un signalement

**`PATCH /api/admin/reports/:id`**

Corps :
```json
{
  "status": "resolved",
  "notes": "Utilisateur averti, message supprimé."
}
```

Réponse `200 OK` : signalement mis à jour.

---

## 7. Gestion des plugins (`/admin/plugins`)

### Activer ou désactiver un plugin globalement

**`GET /api/admin/plugins`**

Liste tous les plugins avec leur statut global et leurs statistiques d'utilisation.

Réponse `200 OK` :
```json
[
  {
    "slug": "always-animate",
    "name": "Always Animate",
    "globally_enabled": true,
    "users_enabled_count": 423,
    "guilds_enabled_count": 12
  }
]
```

**`PATCH /api/admin/plugins/:slug`**

Corps :
```json
{
  "globally_enabled": false
}
```

Un plugin désactivé globalement ne peut pas être activé par les utilisateurs.

---

## 8. Annonces globales (`/admin/announcements`)

### Modèle Announcement

| Champ        | Type      | Description                                                             |
|--------------|-----------|-------------------------------------------------------------------------|
| `id`         | `String`  | Identifiant unique                                                      |
| `title`      | `String`  | Titre de l'annonce                                                      |
| `content`    | `String`  | Contenu (supporte le Markdown basique)                                  |
| `type`       | `Enum`    | `info` (bleu), `warning` (orange), `critical` (rouge)                  |
| `active`     | `Boolean` | Si l'annonce est affichée actuellement                                  |
| `created_by` | `String`  | Référence vers `User.id` de l'admin créateur                            |
| `created_at` | `DateTime`| Date de création                                                        |
| `expires_at` | `DateTime?`| Date d'expiration automatique (null = permanente jusqu'à désactivation)|

### Endpoints

**`GET /api/admin/announcements`** — lister toutes les annonces

**`POST /api/admin/announcements`** — créer une annonce

Corps :
```json
{
  "title": "Maintenance planifiée",
  "content": "OpenCord sera en maintenance le **20 juin à 2h00 UTC** pendant environ 30 minutes.",
  "type": "warning",
  "active": true,
  "expires_at": "2025-06-20T02:30:00.000Z"
}
```

**`PATCH /api/admin/announcements/:id`** — modifier une annonce (activer/désactiver, changer le contenu)

**`DELETE /api/admin/announcements/:id`** — supprimer une annonce

### Affichage côté client

Les annonces actives sont affichées sous forme de **bannière horizontale** en haut de l'application :
- Couleur de fond selon le type (`info` = bleu, `warning` = jaune/orange, `critical` = rouge)
- Icône à gauche (ℹ️ / ⚠️ / 🚨)
- Titre en gras + contenu
- Bouton de fermeture (× ) — masque la bannière pour la session en cours uniquement
- Les annonces `critical` ne peuvent pas être fermées

Les annonces sont récupérées via **`GET /api/announcements/active`** (route publique, pas sous `/admin`).

---

## 9. Journal d'audit admin

Chaque action effectuée dans le panneau d'administration est automatiquement journalisée.

### Modèle AdminAuditLog

| Champ         | Type      | Description                                                  |
|---------------|-----------|--------------------------------------------------------------|
| `id`          | `String`  | Identifiant unique                                           |
| `admin_id`    | `String`  | Référence vers `User.id` de l'admin ayant effectué l'action  |
| `action`      | `String`  | Code de l'action (ex: `USER_BAN`, `BADGE_ASSIGN`, `GUILD_DELETE`) |
| `target_type` | `String`  | Type de la cible (`user`, `guild`, `badge`, `plugin`, etc.)  |
| `target_id`   | `String?` | ID de la cible                                               |
| `details`     | `Json?`   | Données supplémentaires (diff avant/après, raison, etc.)     |
| `ip_address`  | `String`  | Adresse IP de l'admin au moment de l'action                  |
| `created_at`  | `DateTime`| Horodatage de l'action                                       |

### Codes d'action

| Code                  | Description                                          |
|-----------------------|------------------------------------------------------|
| `USER_BAN`            | Bannissement global d'un utilisateur                 |
| `USER_UNBAN`          | Levée d'un bannissement global                       |
| `USER_DISABLE`        | Désactivation d'un compte                            |
| `USER_ENABLE`         | Réactivation d'un compte                             |
| `USER_LEVEL_CHANGE`   | Modification du niveau admin                         |
| `USER_FORCE_LOGOUT`   | Déconnexion forcée de toutes les sessions            |
| `BADGE_CREATE`        | Création d'un badge                                  |
| `BADGE_DELETE`        | Suppression d'un badge                               |
| `BADGE_ASSIGN`        | Attribution d'un badge à un utilisateur              |
| `BADGE_REVOKE`        | Révocation d'un badge                                |
| `GUILD_DELETE`        | Suppression forcée d'un serveur                      |
| `GUILD_FEATURE_UPDATE`| Modification des feature flags d'un serveur          |
| `PLUGIN_TOGGLE`       | Activation/désactivation globale d'un plugin         |
| `ANNOUNCEMENT_CREATE` | Création d'une annonce globale                       |
| `ANNOUNCEMENT_DELETE` | Suppression d'une annonce                            |
| `REPORT_RESOLVE`      | Résolution d'un signalement                          |

### Consultation du journal

**`GET /api/admin/audit-logs`**

Requiert `admin_level >= 2`.

Paramètres : `admin_id`, `action`, `target_type`, `page`, `limit`, `from`, `to`.

Réponse `200 OK` :
```json
{
  "logs": [
    {
      "id": "clxlog1",
      "admin": { "id": "clxadmin1", "username": "axel" },
      "action": "USER_BAN",
      "target_type": "user",
      "target_id": "clxuser999",
      "details": { "reason": "Spam massif" },
      "ip_address": "192.168.1.1",
      "created_at": "2025-06-15T15:30:00.000Z"
    }
  ],
  "total": 1847,
  "page": 1
}
```
