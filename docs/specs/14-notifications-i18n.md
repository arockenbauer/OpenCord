# Spécification 14 — Notifications & Internationalisation (i18n)

## Partie 1 — Système de Notifications

### 1. Modèle Notification

| Champ        | Type      | Description                                                                          |
|--------------|-----------|--------------------------------------------------------------------------------------|
| `id`         | `String`  | Identifiant unique (CUID)                                                            |
| `user_id`    | `String`  | Référence vers `User.id` — destinataire de la notification                           |
| `type`       | `Enum`    | Type de notification (voir tableau ci-dessous)                                       |
| `data`       | `Json`    | Données contextuelles selon le type (voir structure par type)                        |
| `read`       | `Boolean` | `false` par défaut, passe à `true` quand l'utilisateur la marque comme lue           |
| `created_at` | `DateTime`| Date de création                                                                     |

### 2. Types de notifications

| Type                  | Déclencheur                                            | Structure `data`                                                                          |
|-----------------------|--------------------------------------------------------|-------------------------------------------------------------------------------------------|
| `MENTION`             | Quelqu'un vous mentionne dans un message               | `{ message_id, channel_id, guild_id, sender_id }`                                        |
| `DM`                  | Nouveau message DM (hors focus sur ce canal)           | `{ message_id, channel_id, sender_id }`                                                  |
| `FRIEND_REQUEST`      | Quelqu'un vous envoie une demande d'ami                | `{ sender_id }`                                                                           |
| `FRIEND_ACCEPT`       | Quelqu'un accepte votre demande d'ami                  | `{ user_id }`                                                                             |
| `GUILD_INVITE`        | Quelqu'un vous invite dans un serveur                  | `{ guild_id, guild_name, inviter_id, invite_code }`                                      |
| `SYSTEM`              | Notification système (abonnement, maintenance, etc.)   | `{ title, message, action_url? }`                                                        |
| `ADMIN_ANNOUNCEMENT`  | Annonce globale des administrateurs                    | `{ announcement_id, title, type }`                                                       |

### 3. Endpoints de notifications

#### Lister les notifications

**`GET /api/users/@me/notifications`**

Paramètres de requête :
- `page` : numéro de page (défaut : 1)
- `limit` : résultats par page (défaut : 20, max : 100)
- `unread_only` : `true` pour n'afficher que les non lues

Réponse `200 OK` :
```json
{
  "notifications": [
    {
      "id": "clxnotif1",
      "type": "MENTION",
      "data": {
        "message_id": "clxmsg789",
        "channel_id": "clxchannel1",
        "guild_id": "clxguild1",
        "sender_id": "clxuser456"
      },
      "read": false,
      "created_at": "2025-06-15T14:00:00.000Z"
    },
    {
      "id": "clxnotif2",
      "type": "FRIEND_REQUEST",
      "data": {
        "sender_id": "clxuser789"
      },
      "read": true,
      "created_at": "2025-06-14T10:00:00.000Z"
    }
  ],
  "total": 42,
  "unread_count": 5,
  "page": 1,
  "limit": 20
}
```

#### Marquer une notification comme lue

**`PATCH /api/users/@me/notifications/:id/read`**

Aucun corps requis.

Réponse `200 OK` :
```json
{
  "id": "clxnotif1",
  "read": true
}
```

#### Tout marquer comme lu

**`POST /api/users/@me/notifications/read-all`**

Marque **toutes** les notifications non lues de l'utilisateur comme lues.

Réponse `200 OK` :
```json
{
  "updated_count": 5
}
```

#### Supprimer une notification

**`DELETE /api/users/@me/notifications/:id`**

Supprime définitivement la notification.

Réponse `204 No Content`.

---

### 4. Préférences de notifications

#### Modèle NotificationSettings

| Champ                  | Type      | Description                                                              |
|------------------------|-----------|--------------------------------------------------------------------------|
| `user_id`              | `String`  | Référence vers `User.id`                                                 |
| `guild_id`             | `String?` | `null` pour les paramètres globaux, sinon référence vers `Guild.id`      |
| `channel_id`           | `String?` | `null` pour les paramètres de guilde, sinon référence vers `Channel.id`  |
| `muted`                | `Boolean` | Si `true`, aucune notification pour cette entité                         |
| `suppress_everyone`    | `Boolean` | Ignorer les mentions `@everyone` et `@here`                              |
| `suppress_roles`       | `Boolean` | Ignorer les mentions de rôles                                            |
| `message_notifications`| `Int`     | `0` = Tous les messages, `1` = Mentions uniquement, `2` = Rien           |

Clé primaire composite : `(user_id, guild_id, channel_id)`.

#### Hiérarchie des priorités

```
Canal (priorité maximale)
  > Guilde
    > Global (priorité minimale)
```

Si un canal est muté, aucune notification n'est envoyée pour ce canal, même si la guilde n'est pas mutée.

#### Mettre à jour les préférences d'une guilde

**`PATCH /api/users/@me/guilds/:id/notifications`**

Corps :
```json
{
  "muted": false,
  "suppress_everyone": true,
  "suppress_roles": false,
  "message_notifications": 1
}
```

Réponse `200 OK` :
```json
{
  "guild_id": "clxguild1",
  "muted": false,
  "suppress_everyone": true,
  "suppress_roles": false,
  "message_notifications": 1
}
```

#### Mettre à jour les préférences d'un canal

**`PATCH /api/users/@me/channels/:id/notifications`**

Corps :
```json
{
  "muted": true
}
```

Réponse `200 OK` : paramètres du canal mis à jour.

---

### 5. Suivi des non-lus

#### Modèle ReadState

| Champ                   | Type      | Description                                             |
|-------------------------|-----------|---------------------------------------------------------|
| `user_id`               | `String`  | Référence vers `User.id`                                |
| `channel_id`            | `String`  | Référence vers `Channel.id`                             |
| `last_read_message_id`  | `String?` | ID du dernier message lu dans ce canal                  |
| `mention_count`         | `Int`     | Nombre de mentions non lues dans ce canal               |

Clé primaire composite : `(user_id, channel_id)`.

#### Marquer un canal comme lu

**`POST /api/channels/:id/read`**

Enregistre le dernier message visible comme "lu". Met `mention_count` à 0.

Corps :
```json
{
  "message_id": "clxmsg789"
}
```

Réponse `204 No Content`.

#### Indicateurs visuels de non-lus

| Indicateur                  | Emplacement                    | Déclencheur                                          |
|-----------------------------|--------------------------------|------------------------------------------------------|
| Point blanc                 | Nom du canal dans la sidebar   | Canal avec messages non lus (sans mention)           |
| Badge rouge (avec nombre)   | Icône du serveur dans la liste | Mentions directes non lues dans le serveur           |
| Badge rouge sur icône Accueil| Icône maison en haut de la sidebar | DMs non lus ou demandes d'amis en attente        |
| Surbrillance du canal       | Nom du canal en gras           | Messages non lus dans ce canal                       |

---

### 6. Interface utilisateur des notifications

#### Cloche de notifications

- Icône en haut de la barre latérale (ou dans la topbar)
- Badge rouge avec le nombre de notifications non lues (max affiché : `99+`)
- Au clic : dropdown affichant les 10 dernières notifications, groupées par type

#### Dropdown de notifications

- **En-tête** : "Notifications" + bouton "Tout marquer comme lu"
- **Liste** : jusqu'à 10 notifications récentes avec :
  - Icône représentant le type
  - Texte descriptif avec interpolation du nom de l'expéditeur
  - Lien cliquable vers la ressource concernée (message, profil, serveur)
  - Date relative (ex: "il y a 5 minutes")
  - Indicateur visuel de non-lu (fond légèrement coloré)
- **Pied** : lien "Voir toutes les notifications" → `/notifications`

#### Livraison temps réel

Les notifications sont transmises via l'événement Socket.IO `NOTIFICATION_CREATE` (défini dans la spécification 13). Le client les ajoute immédiatement à l'état local sans rechargement.

---

## Partie 2 — Internationalisation (i18n)

### 1. Librairies utilisées

- **[i18next](https://www.i18next.com/)** : moteur d'internationalisation
- **[react-i18next](https://react.i18next.com/)** : intégration React (hook `useTranslation`, composant `Trans`)
- **[i18next-http-backend](https://github.com/i18next/i18next-http-backend)** : chargement des fichiers de traduction à la demande
- **[date-fns](https://date-fns.org/)** : formatage de dates avec support de locale

### 2. Structure des fichiers de traduction

```
packages/client/src/locales/
  en.json      — Traductions anglaises (langue de référence)
  fr.json      — Traductions françaises
```

Chaque fichier suit une structure JSON hiérarchique avec des clés pointées.

### 3. Structure des clés de traduction

```json
{
  "common": {
    "save": "Sauvegarder",
    "cancel": "Annuler",
    "delete": "Supprimer",
    "edit": "Modifier",
    "search": "Rechercher",
    "loading": "Chargement...",
    "error": "Une erreur est survenue",
    "confirm": "Confirmer",
    "close": "Fermer",
    "back": "Retour",
    "next": "Suivant",
    "send": "Envoyer",
    "copy": "Copier",
    "copied": "Copié !",
    "optional": "Optionnel",
    "required": "Requis"
  },

  "auth": {
    "login": "Se connecter",
    "logout": "Se déconnecter",
    "register": "Créer un compte",
    "email": "Adresse e-mail",
    "password": "Mot de passe",
    "username": "Nom d'utilisateur",
    "confirm_password": "Confirmer le mot de passe",
    "forgot_password": "Mot de passe oublié ?",
    "reset_password": "Réinitialiser le mot de passe",
    "no_account": "Pas encore de compte ?",
    "already_account": "Déjà un compte ?",
    "two_factor": {
      "title": "Authentification à deux facteurs",
      "description": "Entrez le code généré par votre application d'authentification.",
      "enter_code": "Entrez votre code 2FA",
      "backup_code": "Utiliser un code de secours",
      "invalid_code": "Code invalide ou expiré"
    }
  },

  "chat": {
    "message_placeholder": "Message #{{channel}}",
    "message_placeholder_dm": "Message {{user}}",
    "edited": "(modifié)",
    "deleted": "Ce message a été supprimé.",
    "pinned": "Messages épinglés",
    "pin_message": "Épingler le message",
    "unpin_message": "Désépingler le message",
    "reply": "Répondre",
    "reply_to": "En réponse à {{user}}",
    "copy_text": "Copier le texte",
    "copy_link": "Copier le lien",
    "mark_unread": "Marquer comme non lu",
    "typing": {
      "one": "{{user}} est en train d'écrire...",
      "two": "{{user1}} et {{user2}} écrivent...",
      "many": "{{count}} personnes écrivent..."
    },
    "jump_to_present": "Aller au présent",
    "load_more": "Charger plus de messages",
    "no_messages": "Aucun message dans ce canal.",
    "start_conversation": "Début de votre conversation avec {{user}}",
    "welcome_channel": "Bienvenue dans #{{channel}} !"
  },

  "server": {
    "create": "Créer un serveur",
    "join": "Rejoindre un serveur",
    "leave": "Quitter le serveur",
    "delete": "Supprimer le serveur",
    "invite": "Inviter des personnes",
    "settings": {
      "title": "Paramètres du serveur",
      "overview": "Présentation",
      "roles": "Rôles",
      "emoji": "Émojis",
      "stickers": "Autocollants",
      "moderation": "Modération",
      "audit_log": "Journal d'audit",
      "bans": "Bans",
      "integrations": "Intégrations",
      "members": "Membres",
      "invites": "Invitations",
      "delete_confirm": "Êtes-vous sûr de vouloir supprimer {{server}} ? Cette action est irréversible."
    },
    "channels": {
      "create": "Créer un canal",
      "text": "Canal textuel",
      "voice": "Canal vocal",
      "category": "Catégorie",
      "delete": "Supprimer le canal",
      "edit": "Modifier le canal"
    },
    "members": {
      "count_one": "{{count}} membre",
      "count_other": "{{count}} membres",
      "online_one": "{{count}} en ligne",
      "online_other": "{{count}} en ligne",
      "kick": "Expulser",
      "ban": "Bannir",
      "timeout": "Mettre en sourdine"
    }
  },

  "settings": {
    "title": "Paramètres",
    "my_account": "Mon compte",
    "privacy": "Confidentialité et sécurité",
    "appearance": "Apparence",
    "notifications": "Notifications",
    "language": "Langue",
    "keybinds": "Raccourcis clavier",
    "accessibility": "Accessibilité",
    "plugins": "Plugins",
    "premium": "OpenCord+",
    "logout": "Se déconnecter",
    "account": {
      "edit_profile": "Modifier le profil",
      "change_password": "Changer le mot de passe",
      "enable_2fa": "Activer l'authentification à deux facteurs",
      "disable_2fa": "Désactiver l'authentification à deux facteurs",
      "delete_account": "Supprimer mon compte",
      "sessions": "Appareils connectés"
    },
    "appearance": {
      "theme": "Thème",
      "theme_dark": "Sombre",
      "theme_light": "Clair",
      "theme_system": "Système",
      "font_size": "Taille de police",
      "compact_mode": "Mode compact",
      "animations": "Animations"
    },
    "notifications": {
      "enable_desktop": "Activer les notifications bureau",
      "enable_sounds": "Sons de notification",
      "suppress_everyone": "Ignorer @everyone et @here",
      "message_preview": "Aperçu du message dans la notification"
    }
  },

  "admin": {
    "title": "Panneau d'administration",
    "dashboard": "Tableau de bord",
    "users": "Utilisateurs",
    "servers": "Serveurs",
    "badges": "Badges",
    "reports": "Signalements",
    "plugins": "Plugins",
    "announcements": "Annonces",
    "audit_log": "Journal d'audit",
    "stats": {
      "total_users": "Utilisateurs total",
      "total_guilds": "Serveurs total",
      "messages_24h": "Messages (24h)",
      "active_connections": "Connexions actives",
      "storage_used": "Stockage utilisé"
    },
    "actions": {
      "ban": "Bannir globalement",
      "unban": "Débannir",
      "disable": "Désactiver le compte",
      "enable": "Réactiver le compte",
      "force_logout": "Déconnecter toutes les sessions",
      "change_level": "Modifier le niveau admin"
    },
    "forbidden": "Accès refusé. Vous n'avez pas les permissions nécessaires."
  },

  "moderation": {
    "kick": "Expulser",
    "kick_reason": "Raison de l'expulsion",
    "ban": "Bannir",
    "ban_reason": "Raison du bannissement",
    "ban_duration": "Durée du bannissement",
    "timeout": "Sourdine temporaire",
    "timeout_duration": "Durée de la sourdine",
    "warn": "Avertir",
    "report": "Signaler",
    "report_reason": "Raison du signalement",
    "report_sent": "Signalement envoyé avec succès."
  },

  "premium": {
    "title": "OpenCord+",
    "description": "Améliorez votre expérience OpenCord avec des fonctionnalités exclusives.",
    "price": "5€/mois",
    "subscribe": "S'abonner",
    "manage": "Gérer l'abonnement",
    "cancel": "Annuler l'abonnement",
    "features": {
      "animated_avatar": "Avatar animé (GIF)",
      "custom_banner": "Bannière de profil personnalisée",
      "larger_uploads": "Uploads jusqu'à 100 Mo",
      "hd_video": "Vidéo HD en streaming vocal",
      "badge": "Badge OpenCord+ exclusif",
      "boost": "2 boosts de serveur inclus"
    },
    "active": "Abonnement actif",
    "expires": "Expire le {{date}}",
    "cancelled": "Abonnement annulé — actif jusqu'au {{date}}"
  },

  "notifications": {
    "title": "Notifications",
    "mark_all_read": "Tout marquer comme lu",
    "empty": "Aucune notification pour le moment.",
    "view_all": "Voir toutes les notifications",
    "types": {
      "MENTION": "{{user}} vous a mentionné dans #{{channel}}",
      "DM": "Nouveau message de {{user}}",
      "FRIEND_REQUEST": "{{user}} vous a envoyé une demande d'ami",
      "FRIEND_ACCEPT": "{{user}} a accepté votre demande d'ami",
      "GUILD_INVITE": "{{user}} vous invite à rejoindre {{guild}}",
      "SYSTEM": "Notification système",
      "ADMIN_ANNOUNCEMENT": "Annonce : {{title}}"
    }
  },

  "friends": {
    "title": "Amis",
    "add": "Ajouter un ami",
    "all": "Tous",
    "online": "En ligne",
    "pending": "En attente",
    "blocked": "Bloqués",
    "request_sent": "Demande envoyée",
    "accept": "Accepter",
    "decline": "Refuser",
    "remove": "Supprimer l'ami",
    "block": "Bloquer",
    "unblock": "Débloquer",
    "message": "Envoyer un message",
    "empty_online": "Aucun ami en ligne pour le moment.",
    "empty_all": "Vous n'avez pas encore d'amis.",
    "empty_pending": "Aucune demande d'ami en attente."
  },

  "errors": {
    "UNAUTHORIZED": "Vous devez être connecté pour effectuer cette action.",
    "FORBIDDEN": "Vous n'avez pas la permission d'effectuer cette action.",
    "NOT_FOUND": "La ressource demandée n'existe pas.",
    "RATE_LIMITED": "Vous effectuez trop de requêtes. Veuillez patienter.",
    "SERVER_ERROR": "Une erreur interne est survenue. Veuillez réessayer.",
    "VALIDATION_ERROR": "Les données envoyées sont invalides.",
    "INVALID_TOKEN": "Votre session a expiré. Veuillez vous reconnecter.",
    "EMAIL_IN_USE": "Cette adresse e-mail est déjà utilisée.",
    "USERNAME_IN_USE": "Ce nom d'utilisateur est déjà pris.",
    "INVALID_CREDENTIALS": "Email ou mot de passe incorrect.",
    "ACCOUNT_DISABLED": "Ce compte a été désactivé.",
    "ACCOUNT_BANNED": "Ce compte a été banni de la plateforme."
  }
}
```

---

### 4. Règles pour les développeurs

Ces règles sont **obligatoires** et doivent être respectées lors de tout développement sur OpenCord.

#### Règle 1 — Jamais de chaînes en dur dans les composants

```tsx
// ❌ INTERDIT
<button>Save</button>

// ✅ CORRECT
const { t } = useTranslation();
<button>{t('common.save')}</button>
```

#### Règle 2 — Interpolation pour les valeurs dynamiques

```tsx
// ❌ INTERDIT
<p>Message de {username}</p>

// ✅ CORRECT
<p>{t('notifications.types.DM', { user: username })}</p>
```

En JSON :
```json
{
  "notifications": {
    "types": {
      "DM": "Nouveau message de {{user}}"
    }
  }
}
```

#### Règle 3 — Pluralisation avec i18next

```tsx
// ✅ CORRECT
<span>{t('server.members.count', { count: memberCount })}</span>
```

En JSON (i18next utilise les suffixes `_one`, `_other`, etc. selon la locale) :
```json
{
  "server": {
    "members": {
      "count_one": "{{count}} membre",
      "count_other": "{{count}} membres"
    }
  }
}
```

#### Règle 4 — Formatage des dates avec date-fns

```tsx
import { format } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';

const { i18n } = useTranslation();
const locale = i18n.language === 'fr' ? fr : enUS;

// ✅ CORRECT
<span>{format(new Date(message.created_at), 'PPP', { locale })}</span>
```

Ne jamais utiliser `new Date().toLocaleDateString()` sans préciser la locale.

#### Règle 5 — Formatage des nombres

```tsx
// ✅ CORRECT
const { i18n } = useTranslation();
const formatted = new Intl.NumberFormat(i18n.language).format(memberCount);
```

#### Règle 6 — Ajouter une nouvelle langue

1. Créer `packages/client/src/locales/<code>.json`
2. Copier `en.json` et traduire toutes les clés
3. Ajouter la locale à la config i18next (`supportedLngs`)
4. Ajouter l'option dans le sélecteur de langue des paramètres
5. Importer la locale `date-fns` correspondante

#### Règle 7 — Convention de nommage des clés

- Format : `section.sous_section.element` (points comme séparateurs)
- Maximum **4 niveaux** de profondeur
- Noms en **snake_case** minuscules
- Être descriptif sans être verbeux

```
// ✅ CORRECT
"auth.two_factor.enter_code"
"server.channels.create"
"settings.appearance.theme_dark"

// ❌ TROP PROFOND (5 niveaux)
"settings.appearance.colors.theme.dark"

// ❌ MAUVAISE CASSE
"auth.twoFactor.enterCode"
"AUTH.TWO_FACTOR.ENTER_CODE"
```

#### Règle 8 — Fallback anglais obligatoire

Toute clé présente dans `fr.json` **doit** exister dans `en.json`. Le fichier `en.json` est la source de vérité. Si une traduction est manquante dans une langue, i18next utilise automatiquement la valeur anglaise.

---

### 5. Configuration i18next

```typescript
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpBackend from 'i18next-http-backend';

i18n
  .use(HttpBackend)
  .use(initReactI18next)
  .init({
    supportedLngs: ['en', 'fr'],
    fallbackLng: 'en',
    defaultNS: 'translation',
    backend: {
      loadPath: '/locales/{{lng}}.json',
    },
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  });

export default i18n;
```

---

### 6. Sélecteur de langue

Accessible via **Paramètres utilisateur → Apparence → Langue**.

- Affiche la liste des langues supportées avec leur nom natif :
  - `en` → "English"
  - `fr` → "Français"
- La sélection est sauvegardée :
  - En `localStorage` (clé : `i18nextLng`) pour la persistance locale
  - Dans le modèle `User` (champ `locale`) pour la synchronisation cross-appareils via **`PATCH /api/users/@me`**

---

### 7. Internationalisation côté backend

Le backend ne traduit pas les messages d'erreur directement. Il retourne des **codes d'erreur** standardisés. Le frontend est responsable de les traduire via les clés `errors.*`.

Exemple de réponse d'erreur backend :
```json
{
  "error": "INVALID_CREDENTIALS",
  "statusCode": 401
}
```

Le frontend traduit :
```tsx
const message = t(`errors.${error.code}`, { defaultValue: t('errors.SERVER_ERROR') });
```

Cette approche garantit que les erreurs sont toujours affichées dans la langue de l'utilisateur, indépendamment de la langue configurée sur le serveur.

---

### 8. Locales supportées

| Code | Langue     | Statut       |
|------|------------|--------------|
| `en` | English    | Référence    |
| `fr` | Français   | Supporté     |

Le système est conçu pour être extensible. L'ajout d'une nouvelle langue ne nécessite aucune modification du code applicatif, uniquement l'ajout d'un fichier JSON et son enregistrement dans la configuration.
