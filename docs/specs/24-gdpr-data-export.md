# Spécification 24 — GDPR & Export de Données

> Spécification du système d'export de données utilisateur, de suppression de compte, et de conformité au RGPD.
>
> Dépendances : `00-architecture.md`, `01-authentication.md` (compte utilisateur), `02-users-profiles-badges.md` (profil).

---

## 1. Vue d'ensemble

OpenCord permet à chaque utilisateur de demander un export complet de ses données personnelles et de supprimer définitivement son compte. Ces fonctionnalités répondent aux exigences du RGPD (Règlement Général sur la Protection des Données) : droit d'accès (Article 15) et droit à l'effacement (Article 17).

---

## 2. Export de données

### 2.1 Données incluses

| Catégorie | Données |
|---|---|
| **Profil** | username, email, discriminator, date de naissance, bio, avatar (fichier), bannière (fichier), locale, date de création |
| **Paramètres** | statut, custom status, thème, paramètres de confidentialité, paramètres de notification |
| **Sessions** | liste des sessions actives (device info, IP, dates) |
| **Relations** | liste d'amis, utilisateurs bloqués, demandes en attente |
| **Serveurs** | liste des serveurs dont l'utilisateur est membre (nom, date d'adhésion, surnom) |
| **Messages** | tous les messages envoyés par l'utilisateur (contenu, canal, date, pièces jointes) |
| **DMs** | tous les messages privés envoyés |
| **Réactions** | toutes les réactions ajoutées par l'utilisateur |
| **Badges** | badges assignés |
| **Abonnement** | historique d'abonnement premium, boosts |
| **Audit** | actions de modération subies (kicks, bans, timeouts) |

### 2.2 Format de l'export

Archive `.zip` contenant :

```
opencord-export-username-2025-01-15/
├── account.json           # Profil, paramètres, sessions
├── relationships.json     # Amis, bloqués
├── guilds.json            # Serveurs rejoints
├── messages/
│   ├── index.json         # Index de tous les canaux avec message count
│   ├── guild-123/
│   │   ├── channel-456.json    # Messages du canal
│   │   └── channel-789.json
│   └── dm/
│       ├── user-111.json       # DM avec un utilisateur
│       └── group-222.json      # Groupe DM
├── reactions.json         # Toutes les réactions
├── badges.json            # Badges
├── subscription.json      # Abonnement et boosts
├── moderation.json        # Actions de modération subies
└── files/
    ├── avatar.webp        # Avatar actuel
    ├── banner.webp        # Bannière actuelle
    └── attachments/       # Pièces jointes des messages (optionnel)
```

### 2.3 Structure `account.json`

```json
{
  "id": "1111111111111111111",
  "username": "alice",
  "discriminator": "0042",
  "email": "alice@example.com",
  "date_of_birth": "1995-03-15",
  "bio": "Hello world!",
  "locale": "fr",
  "created_at": "2024-01-01T00:00:00.000Z",
  "settings": {
    "status": "online",
    "custom_status_text": "Coding...",
    "theme": "dark",
    "privacy": {
      "allow_dms_from": "friends",
      "allow_friend_requests_from": "everyone",
      "show_mutual_guilds": true,
      "show_mutual_friends": true
    }
  },
  "sessions": [
    {
      "device_info": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)...",
      "ip_address": "192.168.1.42",
      "last_used_at": "2025-01-15T14:32:00.000Z",
      "created_at": "2025-01-10T09:00:00.000Z"
    }
  ]
}
```

### 2.4 Structure `messages/channel-456.json`

```json
{
  "channel_id": "456",
  "channel_name": "général",
  "guild_name": "Mon Serveur",
  "messages": [
    {
      "id": "msg_1",
      "content": "Bonjour !",
      "created_at": "2025-01-10T09:00:00.000Z",
      "edited_at": null,
      "attachments": [
        {
          "filename": "screenshot.png",
          "size": 245760,
          "url": "files/attachments/msg_1_screenshot.png"
        }
      ]
    }
  ]
}
```

---

## 3. API — Export

### 3.1 Demander un export

**`POST /api/users/@me/data-export`**

Requiert : authentification + mot de passe dans le corps

**Corps de la requête :**
```json
{
  "password": "MotDePass3!Secure",
  "include_attachments": false
}
```

`include_attachments` : si `true`, les pièces jointes des messages sont incluses dans l'archive (peut augmenter considérablement la taille).

**Réponse 202 Accepted :**
```json
{
  "export_id": "export_abc123",
  "status": "processing",
  "estimated_size_mb": 150,
  "created_at": "2025-01-15T10:00:00.000Z"
}
```

**Erreurs :**
- `401` `INVALID_CREDENTIALS` si le mot de passe est faux
- `429` `RATE_LIMITED` si un export a déjà été demandé dans les dernières 24 heures

### 3.2 Vérifier le statut de l'export

**`GET /api/users/@me/data-export`**

**Réponse 200 OK :**
```json
{
  "export_id": "export_abc123",
  "status": "completed",
  "size_bytes": 157286400,
  "size_human": "150 MB",
  "download_url": "/api/users/@me/data-export/download",
  "expires_at": "2025-01-22T10:00:00.000Z",
  "created_at": "2025-01-15T10:00:00.000Z"
}
```

**Statuts possibles :** `processing`, `completed`, `failed`, `expired`

### 3.3 Télécharger l'export

**`GET /api/users/@me/data-export/download`**

Requiert : authentification. Retourne le fichier `.zip` en téléchargement.

L'export est disponible pendant **7 jours** après sa création, puis supprimé automatiquement.

---

## 4. Processus d'export (backend)

1. Créer un job d'export en base (table `data_exports`)
2. Exécuter en arrière-plan (worker asynchrone) :
   a. Requêter toutes les données de l'utilisateur
   b. Copier les fichiers (avatar, bannière, pièces jointes si demandé)
   c. Générer les fichiers JSON
   d. Créer l'archive ZIP
   e. Sauvegarder dans `packages/server/exports/<userId>/<export_id>.zip`
3. Mettre à jour le statut en `completed`
4. Émettre `DATA_EXPORT_COMPLETE` via Socket.IO à l'utilisateur
5. Envoyer un email de notification (si SMTP activé, spec 21)

### Table `data_exports`

| Champ | Type | Description |
|---|---|---|
| `id` | `String` (snowflake) | Identifiant |
| `user_id` | `String` | FK → `users.id` |
| `status` | `String` | `processing`, `completed`, `failed`, `expired` |
| `include_attachments` | `Boolean` | Inclut les pièces jointes |
| `size_bytes` | `Int?` | Taille finale de l'archive |
| `error` | `String?` | Message d'erreur si `failed` |
| `created_at` | `DateTime` | Date de demande |
| `completed_at` | `DateTime?` | Date de complétion |
| `expires_at` | `DateTime?` | Date d'expiration du téléchargement |

---

## 5. Suppression de compte

### 5.1 Demander la suppression

**`POST /api/users/@me/delete`**

Requiert : authentification + mot de passe + code 2FA si activé

**Corps de la requête :**
```json
{
  "password": "MotDePass3!Secure",
  "two_factor_code": "123456"
}
```

**Réponse 202 Accepted :**
```json
{
  "status": "scheduled",
  "scheduled_deletion_at": "2025-01-29T10:00:00.000Z",
  "message": "Votre compte sera supprimé dans 14 jours. Vous pouvez annuler en vous reconnectant."
}
```

### 5.2 Délai de grâce

La suppression n'est pas immédiate. Un délai de **14 jours** est appliqué :
- Le compte est marqué `deletion_scheduled_at` en base
- L'utilisateur peut annuler en se reconnectant pendant cette période
- À la connexion, le système détecte le `deletion_scheduled_at` et propose l'annulation
- Après 14 jours, un cron job exécute la suppression définitive

### 5.3 Annuler la suppression

**`POST /api/users/@me/delete/cancel`**

Requiert : authentification

**Réponse 200 OK :**
```json
{
  "status": "cancelled",
  "message": "La suppression de votre compte a été annulée."
}
```

Remet `deletion_scheduled_at = null`.

### 5.4 Processus de suppression définitive

Exécuté par le cron job après le délai de grâce :

1. **Anonymisation des messages** : les messages ne sont pas supprimés (pour préserver la cohérence des conversations). `author_id` est remplacé par un compte système `DELETED_USER` et le profil auteur est remplacé par "Utilisateur supprimé".
2. **Suppression des données personnelles** :
   - Profil : username → `deleted_user_<id>`, email → `deleted_<id>@opencord.local`, bio → null, avatar → null, bannière → null
   - Relations : toutes supprimées (amis, bloqués)
   - Sessions : tous les refresh tokens révoqués
   - Notifications : toutes supprimées
   - Badges : tous retirés
   - Abonnement : annulé via Stripe si actif, boosts retirés
   - DMs : l'utilisateur est retiré des groupes DM
   - Membership : retiré de tous les serveurs
   - Fichiers : avatar, bannière supprimés du filesystem
3. **Transfert de propriété** : pour chaque serveur dont l'utilisateur est propriétaire, la propriété est transférée au membre avec le rôle le plus élevé. Si aucun autre membre, le serveur est supprimé.
4. **Marquage final** : `user.disabled = true`, `user.deleted = true`

---

## 6. Interface utilisateur

### 6.1 Paramètres → Confidentialité → Export de données

- Bouton "Demander un export de mes données"
- Checkbox "Inclure les pièces jointes" (avec avertissement sur la taille)
- Modale de confirmation avec saisie du mot de passe
- Indicateur de progression si un export est en cours
- Bouton "Télécharger" quand l'export est prêt (avec date d'expiration)

### 6.2 Paramètres → Mon Compte → Supprimer mon compte

- Texte d'avertissement en rouge : "Cette action est irréversible après 14 jours."
- Liste de ce qui sera supprimé vs conservé (messages anonymisés)
- Bouton "Supprimer mon compte" (rouge, `danger` variant)
- Modale de confirmation :
  - Saisie du mot de passe
  - Saisie du code 2FA si activé
  - Checkbox "Je comprends que cette action est irréversible"
  - Bouton "Confirmer la suppression"

### 6.3 Écran de reconnexion pendant le délai de grâce

Si l'utilisateur se reconnecte alors que `deletion_scheduled_at` est défini :
- Bannière d'avertissement : "Votre compte est programmé pour suppression le {{date}}."
- Bouton "Annuler la suppression"
- Bouton "Continuer la suppression" (redirige vers la page de suppression)

---

## 7. Rate Limiting

| Route | Limite | Fenêtre |
|---|---|---|
| `POST /api/users/@me/data-export` | 1 requête | 24 heures |
| `POST /api/users/@me/delete` | 3 requêtes | 1 heure |

---

## 8. Événements Socket.IO

| Événement | Destinataire | Payload |
|---|---|---|
| `DATA_EXPORT_COMPLETE` | `user:<userId>` | `{ export_id, download_url, size_bytes }` |
| `DATA_EXPORT_FAILED` | `user:<userId>` | `{ export_id, error }` |

---

## 9. Admin — Gestion

### Vue d'un utilisateur dans le panneau admin

Le panneau admin affiche :
- Si un export est en cours ou disponible
- Si une suppression est programmée (avec date)
- Bouton "Forcer la suppression immédiate" (requiert `admin_level >= 3`)
- Bouton "Annuler la suppression programmée" (requiert `admin_level >= 2`)

### Endpoint admin

**`DELETE /api/admin/users/:userId/force-delete`**

Requiert : `admin_level >= 3`. Exécute la suppression immédiatement sans délai de grâce.

```json
{
  "reason": "Contenu illégal"
}
```

---

## Références croisées

- `00-architecture.md` — Stack, conventions
- `01-authentication.md` — Authentification, sessions
- `02-users-profiles-badges.md` — Profil utilisateur, badges
- `09-premium-boosts.md` — Abonnement, boosts
- `12-admin-panel.md` — Panneau admin
- `21-email-system.md` — Notification email
