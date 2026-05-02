# Spécification 11 — Système de Plugins

## 1. Philosophie

OpenCord intègre un système de plugins **officiel** permettant d'étendre les fonctionnalités de la plateforme. Tous les plugins sont **officiels** — revus, approuvés et maintenus par l'équipe OpenCord. Aucun plugin tiers n'est autorisé pour des raisons de sécurité.

L'objectif est de permettre une personnalisation significative de l'expérience sans compromettre la sécurité ni la stabilité de la plateforme.

---

## 2. Modèles de données

### Plugin

| Champ               | Type      | Description                                                              |
|---------------------|-----------|--------------------------------------------------------------------------|
| `id`                | `String`  | Identifiant unique (CUID)                                                |
| `name`              | `String`  | Nom affiché du plugin                                                    |
| `slug`              | `String`  | Identifiant unique URL-friendly (ex: `always-animate`)                   |
| `description`       | `String`  | Description courte du plugin                                             |
| `version`           | `String`  | Version sémantique (ex: `1.0.0`)                                         |
| `type`              | `Enum`    | `CLIENT`, `SERVER`, ou `BOTH`                                            |
| `author`            | `String`  | Nom de l'auteur (toujours l'équipe OpenCord)                             |
| `icon`              | `String?` | Emoji ou URL d'icône                                                     |
| `enabled_by_default`| `Boolean` | Si `true`, activé pour tous les nouveaux utilisateurs/serveurs            |
| `settings_schema`   | `Json?`   | JSON Schema décrivant les options de configuration du plugin              |
| `created_at`        | `DateTime`| Date de création                                                         |
| `updated_at`        | `DateTime`| Date de dernière mise à jour                                             |

### UserPluginSettings

Stocke les préférences d'un utilisateur pour un plugin donné.

| Champ       | Type      | Description                                        |
|-------------|-----------|-----------------------------------------------------|
| `user_id`   | `String`  | Référence vers `User.id`                            |
| `plugin_id` | `String`  | Référence vers `Plugin.id`                          |
| `enabled`   | `Boolean` | Si l'utilisateur a activé ce plugin                 |
| `settings`  | `Json?`   | Configuration JSON correspondant au `settings_schema`|

Clé primaire composite : `(user_id, plugin_id)`.

### GuildPluginSettings

Stocke les préférences d'un serveur pour un plugin donné.

| Champ       | Type      | Description                                        |
|-------------|-----------|-----------------------------------------------------|
| `guild_id`  | `String`  | Référence vers `Guild.id`                           |
| `plugin_id` | `String`  | Référence vers `Plugin.id`                          |
| `enabled`   | `Boolean` | Si le serveur a activé ce plugin                    |
| `settings`  | `Json?`   | Configuration JSON correspondant au `settings_schema`|

Clé primaire composite : `(guild_id, plugin_id)`.

---

## 3. Plugins côté client

### Architecture des fichiers

Chaque plugin client réside dans :
```
packages/client/src/plugins/official/<slug>/
  index.ts           — Point d'entrée principal du plugin
  plugin.json        — Manifeste du plugin
  components/        — Composants React optionnels
  styles/            — Styles CSS Modules optionnels
```

### Manifeste (`plugin.json`)

```json
{
  "name": "Always Animate",
  "slug": "always-animate",
  "description": "Anime tout ce qui peut être animé.",
  "version": "1.0.0",
  "author": "Équipe OpenCord",
  "icon": "✨",
  "type": "CLIENT",
  "settingsSchema": {
    "type": "object",
    "properties": {
      "speed": {
        "type": "number",
        "title": "Vitesse d'animation",
        "default": 1,
        "minimum": 0.1,
        "maximum": 3
      }
    }
  },
  "hooks": [
    "message.render",
    "channel.header"
  ]
}
```

### Interface d'un plugin client

Chaque plugin exporte un objet conforme à l'interface suivante :

```typescript
interface ClientPlugin {
  meta: PluginMeta;
  onEnable(context: PluginContext): void;
  onDisable(): void;
  hooks: Partial<ClientPluginHooks>;
}
```

### Système de hooks côté client

Les hooks permettent au plugin d'intervenir à des points précis du rendu de l'interface.

| Hook                | Déclencheur                             | Paramètres disponibles                  |
|---------------------|-----------------------------------------|-----------------------------------------|
| `message.render`    | Rendu de chaque message                 | `message`, `element`                    |
| `channel.header`    | Rendu de l'en-tête de canal             | `channel`                               |
| `user.profile`      | Ouverture du profil utilisateur         | `user`, `member?`                       |
| `user.popout`       | Ouverture du popout utilisateur         | `user`                                  |
| `settings.page`     | Injection d'une page dans les paramètres| `registerPage(id, label, component)`    |
| `context.menu`      | Ouverture d'un menu contextuel          | `type`, `target`, `addItem(item)`       |
| `toolbar`           | Rendu de la barre d'outils du canal     | `channel`, `addButton(button)`          |
| `message.input`     | Rendu de la zone de saisie              | `channel`, `addElement(element)`        |

### Contexte du plugin (`PluginContext`)

Le contexte fourni au plugin est une API restreinte, exposant uniquement ce dont le plugin a besoin :

```typescript
interface PluginContext {
  currentUser: Readonly<User>;
  getSettings<T>(): T;
  saveSettings<T>(settings: T): Promise<void>;
  t(key: string, options?: object): string;
}
```

### Restrictions de sécurité côté client

- **Interdit** : accès à `localStorage`, `sessionStorage`, `document.cookie`
- **Interdit** : accès aux tokens JWT ou credentials
- **Interdit** : requêtes réseau vers des domaines extérieurs à l'API OpenCord
- **Interdit** : modification du DOM en dehors des hooks fournis
- **Autorisé** : lecture des données utilisateur via le contexte
- **Autorisé** : appels à l'API OpenCord via un client HTTP injecté par le contexte

---

## 4. Plugins côté serveur

### Architecture des fichiers

Chaque plugin serveur réside dans :
```
packages/server/src/plugins/official/<slug>/
  index.ts           — Point d'entrée principal du plugin
  plugin.json        — Manifeste du plugin
```

### Manifeste serveur (`plugin.json`)

```json
{
  "name": "Message Logger",
  "slug": "message-logger",
  "description": "Journalise les messages édités et supprimés.",
  "version": "1.0.0",
  "author": "Équipe OpenCord",
  "type": "SERVER",
  "hooks": [
    "message.beforeCreate",
    "message.afterCreate",
    "message.beforeDelete"
  ]
}
```

### Interface d'un plugin serveur

```typescript
interface ServerPlugin {
  meta: PluginMeta;
  onEnable(context: ServerPluginContext): void;
  onDisable(): void;
  hooks: Partial<ServerPluginHooks>;
}
```

### Système de hooks côté serveur

| Hook                      | Déclencheur                                    | Retour possible              |
|---------------------------|------------------------------------------------|-------------------------------|
| `message.beforeCreate`    | Avant l'enregistrement d'un message            | Message modifié ou `null` pour bloquer |
| `message.afterCreate`     | Après l'enregistrement d'un message            | Aucun (async side-effect)    |
| `message.beforeDelete`    | Avant la suppression d'un message              | `false` pour bloquer         |
| `member.join`             | Quand un membre rejoint un serveur             | Aucun                        |
| `member.leave`            | Quand un membre quitte un serveur              | Aucun                        |
| `guild.update`            | Quand les paramètres d'un serveur changent     | Aucun                        |
| `channel.create`          | Quand un canal est créé                        | Aucun                        |
| `channel.update`          | Quand un canal est modifié                     | Aucun                        |
| `channel.delete`          | Quand un canal est supprimé                    | Aucun                        |
| `role.create`             | Quand un rôle est créé                         | Aucun                        |
| `role.update`             | Quand un rôle est modifié                      | Aucun                        |
| `role.delete`             | Quand un rôle est supprimé                     | Aucun                        |

### Contexte serveur (`ServerPluginContext`)

```typescript
interface ServerPluginContext {
  services: {
    messages: MessageService;
    channels: ChannelService;
    guilds: GuildService;
    users: UserService;
  };
  getGuildSettings<T>(guildId: string): Promise<T>;
  emit(event: string, room: string, data: unknown): void;
}
```

### Restrictions de sécurité côté serveur

- **Interdit** : accès direct à Prisma ou à la base de données
- **Interdit** : accès au système de fichiers (`fs`, `path`)
- **Interdit** : création de processus enfants (`child_process`, `exec`, `spawn`)
- **Interdit** : requêtes réseau sortantes
- **Interdit** : accès aux variables d'environnement (`process.env`)
- **Autorisé** : utilisation des services injectés via le contexte
- **Autorisé** : émission d'événements Socket.IO via `context.emit()`

---

## 5. Interface de gestion des plugins

Accessible via **Paramètres utilisateur → Plugins**.

### Mise en page

L'interface de gestion des plugins est inspirée de Vencord avec une mise en page claire et fonctionnelle :

- **En-tête** : titre "Gestion des plugins" avec une courte explication
- **Barre de recherche** : champ de recherche par nom de plugin
- **Filtres** : boutons radio — "Tous", "Activés", "Désactivés"
- **Grille principale** : 2 colonnes de cartes de plugins

### Carte de plugin

Chaque carte affiche :
- **Icône** du plugin (emoji ou image)
- **Nom** du plugin en gras
- **Description** courte en texte secondaire
- **Icône engrenage** (⚙️) si le plugin a des paramètres configurables → ouvre la modal de configuration
- **Icône information** (ℹ️) → affiche la description complète
- **Toggle** à bascule (activé/désactivé) à droite

### Modal de configuration du plugin

Quand l'utilisateur clique sur l'engrenage d'un plugin qui possède un `settings_schema` :
- Titre : nom du plugin
- **Formulaire généré dynamiquement** à partir du JSON Schema :
  - `type: "boolean"` → toggle à bascule
  - `type: "string"` avec `enum` → menu déroulant
  - `type: "string"` → champ texte
  - `type: "number"` avec `minimum`/`maximum` → curseur ou champ numérique
  - `type: "array"` → liste de tags éditables
- Boutons : **Sauvegarder** / **Annuler**
- Les valeurs actuelles sont pré-remplies

---

## 6. Endpoints API

### Lister tous les plugins

**`GET /api/plugins`**

Réponse `200 OK` :
```json
[
  {
    "id": "clxplugin1",
    "name": "Always Animate",
    "slug": "always-animate",
    "description": "Anime tout ce qui peut être animé.",
    "version": "1.0.0",
    "type": "CLIENT",
    "author": "Équipe OpenCord",
    "icon": "✨",
    "enabled_by_default": false,
    "settings_schema": null
  },
  {
    "id": "clxplugin2",
    "name": "Message Logger",
    "slug": "message-logger",
    "description": "Journalise les messages édités et supprimés.",
    "version": "1.0.0",
    "type": "SERVER",
    "author": "Équipe OpenCord",
    "icon": "📋",
    "enabled_by_default": false,
    "settings_schema": {
      "type": "object",
      "properties": {
        "logChannel": {
          "type": "string",
          "title": "Canal de journalisation",
          "description": "ID du canal où envoyer les logs"
        }
      }
    }
  }
]
```

### Obtenir un plugin

**`GET /api/plugins/:slug`**

Réponse `200 OK` : détails complets du plugin.

### Obtenir les paramètres de plugins d'un utilisateur

**`GET /api/users/@me/plugins`**

Réponse `200 OK` :
```json
[
  {
    "plugin": {
      "slug": "always-animate",
      "name": "Always Animate",
      "type": "CLIENT"
    },
    "enabled": true,
    "settings": {
      "speed": 1.5
    }
  },
  {
    "plugin": {
      "slug": "better-notes-box",
      "name": "BetterNotesBox",
      "type": "CLIENT"
    },
    "enabled": false,
    "settings": null
  }
]
```

### Mettre à jour les paramètres d'un plugin (utilisateur)

**`PATCH /api/users/@me/plugins/:slug`**

Corps de la requête :
```json
{
  "enabled": true,
  "settings": {
    "speed": 2.0
  }
}
```

Réponse `200 OK` :
```json
{
  "plugin_slug": "always-animate",
  "enabled": true,
  "settings": {
    "speed": 2.0
  }
}
```

> Si `settings` ne respecte pas le `settings_schema`, le serveur retourne `400 Bad Request` avec les erreurs de validation.

### Obtenir les paramètres de plugins d'un serveur

**`GET /api/guilds/:id/plugins`**

Requiert d'être administrateur du serveur. Retourne la même structure que les plugins utilisateur mais pour le serveur.

### Mettre à jour les paramètres d'un plugin (serveur)

**`PATCH /api/guilds/:id/plugins/:slug`**

Requiert `MANAGE_GUILD`. Même corps que pour les plugins utilisateur.

---

## 7. Plugins officiels initiaux (descriptions)

Ces plugins sont **décrits** ici pour la documentation — leur implémentation est une tâche distincte.

### AlwaysAnimate

- **Type** : CLIENT
- **Description** : Anime les GIFs et éléments animés qui sont normalement stoppés hors focus (avatars, emojis GIF, stickers animés).
- **Paramètres** : vitesse de lecture (multiplicateur).
- **Hook** : `message.render`, `user.profile`

### BetterNotesBox

- **Type** : CLIENT
- **Description** : Améliore la zone de notes du profil utilisateur. Permet de masquer la zone de notes ou de désactiver la vérification orthographique dans celle-ci.
- **Paramètres** :
  - `hideNotes` (boolean) : masquer complètement la zone de notes
  - `disableSpellCheck` (boolean) : désactiver le correcteur orthographique
- **Hook** : `user.profile`, `user.popout`

### MessageLogger

- **Type** : BOTH
- **Description** : Journalise les messages édités et supprimés. Côté client, les messages supprimés restent affichés en rouge barré. Côté serveur, les messages supprimés sont archivés dans un canal de log configurable.
- **Paramètres** (serveur) : `logChannelId` — canal où envoyer les logs.
- **Hook client** : `message.render`
- **Hook serveur** : `message.beforeDelete`, `message.afterCreate`

### BetterRoleDot

- **Type** : CLIENT
- **Description** : Permet de copier la couleur hexadécimale d'un rôle dans le presse-papier en cliquant sur le point de couleur dans la liste des membres.
- **Paramètres** : aucun.
- **Hook** : `user.popout`, `user.profile`

### QuickReact

- **Type** : CLIENT
- **Description** : Ajoute une barre de réactions rapides lors du survol d'un message, affichant les emojis les plus fréquemment utilisés par l'utilisateur.
- **Paramètres** :
  - `count` (number) : nombre d'emojis affichés (défaut : 5, max : 8)
  - `favorites` (array) : liste d'emojis favoris fixes
- **Hook** : `message.render`
