# Spécification 27 — Slash Commands & Interactions

## 1. Modèles de données (Prisma)

```prisma
model ApplicationCommand {
  id                       String   @id @default(cuid())
  application_id           String
  guild_id                 String?  // null = global
  type                     Int      // 1=CHAT_INPUT, 2=USER, 3=MESSAGE
  name                     String
  name_localizations       Json?
  description              String
  description_localizations Json?
  options                  Json?
  default_member_permissions BigInt?
  dm_permission            Boolean?
  nsfw                     Boolean?
  version                  String
  created_at               DateTime @default(now())
}

model Interaction {
  id            String   @id @default(cuid())
  application_id String
  type          Int      // 1=PING,2=APPLICATION_COMMAND,3=MESSAGE_COMPONENT,4=APPLICATION_COMMAND_AUTOCOMPLETE,5=MODAL_SUBMIT
  guild_id      String?
  channel_id    String?
  user_id       String
  token         String   // UUID v4, valide 15min
  data          Json?
  responded     Boolean  @default(false)
  created_at    DateTime @default(now())
}

enum ApplicationCommandOptionType {
  SUB_COMMAND = 1
  SUB_COMMAND_GROUP = 2
  STRING = 3
  INTEGER = 4
  BOOLEAN = 5
  USER = 6
  CHANNEL = 7
  ROLE = 8
  MENTIONABLE = 9
  NUMBER = 10
  ATTACHMENT = 11
}

type ApplicationCommandOption {
  type        ApplicationCommandOptionType
  name        String
  description String
  required    Boolean?
  choices     Json?
  options     Json?
  channel_types Json?
  min_value   Int?
  max_value   Int?
  min_length  Int?
  max_length  Int?
  autocomplete Boolean?
}
```

## 2. Endpoints Bot (Authorization: `Bot <token>`)

| Méthode | Chemin | Description |
|--------|--------|-------------|
| **GET** | `/api/applications/:appId/commands` | Lister les commandes globales |
| **POST** | `/api/applications/:appId/commands` | Créer une commande globale |
| **GET** | `/api/applications/:appId/commands/:cmdId` | Obtenir une commande |
| **PATCH** | `/api/applications/:appId/commands/:cmdId` | Modifier une commande |
| **DELETE** | `/api/applications/:appId/commands/:cmdId` | Supprimer une commande |
| **PUT** | `/api/applications/:appId/commands` | Remplacer toutes les commandes globales (bulk overwrite) |
| **GET** | `/api/applications/:appId/guilds/:guildId/commands` | Lister les commandes de guilde |
| **POST** | `/api/applications/:appId/guilds/:guildId/commands` | Créer une commande de guilde |
| **GET** | `/api/applications/:appId/guilds/:guildId/commands/:cmdId` | Obtenir une commande de guilde |
| **PATCH** | `/api/applications/:appId/guilds/:guildId/commands/:cmdId` | Modifier une commande de guilde |
| **DELETE** | `/api/applications/:appId/guilds/:guildId/commands/:cmdId` | Supprimer une commande de guilde |
| **PUT** | `/api/applications/:appId/guilds/:guildId/commands` | Remplacer toutes les commandes de guilde |
| **GET** | `/api/applications/:appId/guilds/:guildId/commands/permissions` | Permissions par commande |
| **PUT** | `/api/applications/:appId/guilds/:guildId/commands/:cmdId/permissions` | Modifier les permissions d'une commande |

### Exemple de corps de création de commande
```json
{
  "name": "kick",
  "description": "Expulse un membre",
  "type": 1,
  "options": [
    {
      "type": 6,
      "name": "user",
      "description": "Membre à expulser",
      "required": true
    }
  ]
}
```

## 3. Réception des interactions (Gateway Socket.IO)

- **Événement** `INTERACTION_CREATE` envoyé dans la room `user:<botId>`.
- Payload complet correspond au modèle `Interaction` avec le champ `data` contenant les informations spécifiques selon le `type`.

## 4. Réponse aux interactions (Authorization: `Bot <token>`)

| Méthode | Chemin | Description |
|--------|--------|-------------|
| **POST** | `/api/interactions/:interactionId/:interactionToken/callback` | Répondre à une interaction |
| **GET** | `/api/webhooks/:appId/:interactionToken/messages/@original` | Récupérer la réponse originale |
| **PATCH** | `/api/webhooks/:appId/:interactionToken/messages/@original` | Modifier la réponse originale |
| **DELETE** | `/api/webhooks/:appId/:interactionToken/messages/@original` | Supprimer la réponse originale |
| **POST** | `/api/webhooks/:appId/:interactionToken` | Envoyer un follow‑up |
| **PATCH** | `/api/webhooks/:appId/:interactionToken/messages/:messageId` | Modifier un follow‑up |

### Types de réponse (code d’interaction)
- Les deux types différés ci-dessous sont maintenant pris en charge côté backend et reflétés côté client.
- `1` : PONG
- `4` : CHANNEL_MESSAGE_WITH_SOURCE
- `5` : DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE — implémenté
- `6` : DEFERRED_UPDATE_MESSAGE — implémenté
- `7` : UPDATE_MESSAGE
- `8` : APPLICATION_COMMAND_AUTOCOMPLETE_RESULT (max 25 choix)
- `9` : MODAL

## 5. Composants de message

```json
// ActionRow
{ "type": 1, "components": [] }

// Button
{ "type": 2, "style": 1, "label": "Clique", "custom_id": "btn1", "disabled": false }

// StringSelect
{ "type": 3, "custom_id": "select1", "options": [], "placeholder": "Choisir", "min_values": 1, "max_values": 1, "disabled": false }

// TextInput (modal only)
{ "type": 4, "custom_id": "txt1", "style": 1, "label": "Nom", "min_length": 1, "max_length": 100, "required": true }
```

**Règles de composition** : max 5 `ActionRow` par message, max 5 boutons par row, 1 select par row.

## 6. Modals

Structure complète :
```json
{
  "custom_id": "modal1",
  "title": "Titre du modal",
  "components": [
    {
      "type": 1,
      "components": [
        {
          "type": 4,
          "custom_id": "input1",
          "style": 1,
          "label": "Champ texte",
          "required": true
        }
      ]
    }
  ]
}
```
Reçu via interaction de type `MODAL_SUBMIT`.

## 7. Autocomplétion

- Déclenchée lorsqu’une option possède `autocomplete: true`.
- Reçue via `INTERACTION_CREATE` avec `type = 4`.
- Réponse avec type `APPLICATION_COMMAND_AUTOCOMPLETE_RESULT` contenant jusqu’à 25 choix.

## 8. Affichage côté client

- Menu d’autocomplétion slash déclenché par `/` dans la zone de saisie.
- Navigation clavier (↑/↓, Tab, Entrée) dans le menu.
- Rendu des composants (boutons, selects) dans les messages.
- Ouverture des modals en overlay.
- Menus contextuels : clic droit sur message → commandes `MESSAGE`, clic droit sur utilisateur → commandes `USER`.

## 9. Permissions des slash commands

- `default_member_permissions` : bitfield des permissions requises par défaut.
- Overrides via la table `application_command_permissions` (voir spec 10).
- Les administrateurs peuvent désactiver ou restreindre des commandes spécifiques à des rôles ou canaux.

---
*Cette spécification s’appuie sur les modèles et endpoints décrits dans `10-bots-api.md` et ajoute les événements `INTERACTION_CREATE` au fichier `13-gateway-realtime.md`.*