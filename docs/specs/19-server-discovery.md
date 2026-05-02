# Spécification 19 — Server Discovery (Explorer)

> Spécification complète du système de découverte et d'exploration de serveurs publics.
>
> Dépendances : `00-architecture.md`, `03-servers-channels.md` (guilds), `05-roles-permissions.md` (permissions).

---

## 1. Vue d'ensemble

Le système Server Discovery permet aux utilisateurs de trouver et rejoindre des serveurs publics sans avoir besoin d'un lien d'invitation. Un serveur peut être rendu « découvrable » par son propriétaire, ce qui le rend visible dans l'annuaire public accessible via le bouton **Explorer** de la sidebar.

---

## 2. Modèle de données

### 2.1 Extension du modèle Guild

Champs ajoutés à la table `guilds` :

| Champ | Type | Description |
|---|---|---|
| `discoverable` | `Boolean` | Le serveur apparaît dans l'annuaire public |
| `discovery_splash` | `String?` | Image de couverture pour la page de découverte (960×540 WebP) |
| `discovery_description` | `String?` | Description longue pour la page de découverte (max 300 caractères) |
| `primary_category_id` | `String?` | FK → `discovery_categories.id` — catégorie principale |

### 2.2 Table `discovery_categories`

| Champ | Type | Description |
|---|---|---|
| `id` | `String` (snowflake) | Identifiant unique |
| `name` | `String` UNIQUE | Nom technique (ex: `gaming`, `music`, `education`) |
| `label_key` | `String` | Clé i18n pour le nom affiché (ex: `discovery.categories.gaming`) |
| `icon` | `String` | Emoji unicode représentant la catégorie |
| `position` | `Int` | Ordre d'affichage |

### Catégories prédéfinies (seed)

| `name` | `icon` | `label_key` |
|---|---|---|
| `gaming` | `🎮` | `discovery.categories.gaming` |
| `music` | `🎵` | `discovery.categories.music` |
| `education` | `📚` | `discovery.categories.education` |
| `science_tech` | `🔬` | `discovery.categories.science_tech` |
| `entertainment` | `🎬` | `discovery.categories.entertainment` |
| `community` | `🤝` | `discovery.categories.community` |
| `creative` | `🎨` | `discovery.categories.creative` |
| `other` | `💬` | `discovery.categories.other` |

### 2.3 Table `guild_discovery_tags`

| Champ | Type | Description |
|---|---|---|
| `guild_id` | `String` | FK → `guilds.id` |
| `tag` | `String` | Mot-clé de recherche (max 20 caractères, lowercase) |

Contrainte : `@@id([guild_id, tag])`. Maximum **10 tags** par serveur.

### 2.4 Table `featured_guilds`

| Champ | Type | Description |
|---|---|---|
| `guild_id` | `String` | FK → `guilds.id` |
| `featured_by` | `String` | FK → `users.id` (admin plateforme) |
| `position` | `Int` | Ordre d'affichage dans la section "À la une" |
| `featured_at` | `DateTime` | Date de mise en avant |
| `expires_at` | `DateTime?` | Date d'expiration (null = permanent) |

---

## 3. Conditions de découvrabilité

Un serveur ne peut activer `discoverable = true` que si **toutes** les conditions suivantes sont remplies :

| Condition | Seuil |
|---|---|
| Nombre de membres | ≥ 10 |
| Ancienneté du serveur | ≥ 7 jours |
| Description remplie | `description` non null et ≥ 10 caractères |
| Icône définie | `icon` non null |
| Catégorie primaire définie | `primary_category_id` non null |
| Canal de règles ou système | `system_channel_id` non null |

Le backend vérifie ces conditions lors de l'activation et **désactive automatiquement** `discoverable` si une condition n'est plus remplie (ex: membres passent sous 10 suite à des départs).

---

## 4. API

### 4.1 Activer/configurer la découvrabilité

**`PATCH /api/guilds/:guildId/discovery`**

Requiert : `MANAGE_GUILD`

**Corps de la requête :**
```json
{
  "discoverable": true,
  "discovery_description": "Le serveur francophone de référence pour les développeurs TypeScript.",
  "primary_category_id": "cat_science_tech",
  "tags": ["typescript", "nodejs", "react", "open-source"]
}
```

**Réponse 200 OK :**
```json
{
  "discoverable": true,
  "discovery_description": "Le serveur francophone de référence...",
  "primary_category_id": "cat_science_tech",
  "tags": ["typescript", "nodejs", "react", "open-source"],
  "requirements_met": true
}
```

**Erreurs :**
- `400` avec `DISCOVERY_REQUIREMENTS_NOT_MET` et la liste des conditions non remplies
- `403` si `MANAGE_GUILD` manquant

---

### 4.2 Upload de l'image discovery splash

**`PUT /api/guilds/:guildId/discovery-splash`**

Requiert : `MANAGE_GUILD`. Multipart/form-data avec un champ `file`.

Traitement : redimensionnement à 960×540 via `sharp`, conversion WebP.

**Réponse 200 OK :** `{ "discovery_splash": "/uploads/discovery/guildId.webp" }`

---

### 4.3 Explorer les serveurs publics

**`GET /api/discovery/guilds`**

Route publique (optionalAuth — comportement enrichi si connecté).

**Paramètres de requête :**

| Param | Type | Description |
|---|---|---|
| `category` | `String?` | Filtrer par catégorie (`gaming`, `music`…) |
| `query` | `String?` | Recherche textuelle (nom, description, tags) |
| `sort` | `String?` | `member_count_desc` (défaut), `member_count_asc`, `created_at_desc` |
| `limit` | `Int?` | Résultats par page (défaut: 24, max: 48) |
| `offset` | `Int?` | Pagination offset |

**Réponse 200 OK :**
```json
{
  "guilds": [
    {
      "id": "9876543210987654321",
      "name": "TypeScript France",
      "icon": "/uploads/guild-icons/guild123.webp",
      "discovery_splash": "/uploads/discovery/guild123.webp",
      "description": "Le serveur francophone de référence...",
      "discovery_description": "Description longue...",
      "member_count": 1250,
      "presence_count": 340,
      "primary_category": { "id": "...", "name": "science_tech", "icon": "🔬" },
      "tags": ["typescript", "nodejs"],
      "premium_tier": 2,
      "features": ["COMMUNITY", "DISCOVERABLE"],
      "is_member": false
    }
  ],
  "total": 156
}
```

Le champ `is_member` n'est renseigné que si l'utilisateur est authentifié. `presence_count` est le nombre de membres actuellement en ligne (via le presenceStore).

---

### 4.4 Lister les catégories

**`GET /api/discovery/categories`**

Route publique.

**Réponse 200 OK :**
```json
{
  "categories": [
    { "id": "cat_gaming", "name": "gaming", "label_key": "discovery.categories.gaming", "icon": "🎮", "guild_count": 42 }
  ]
}
```

`guild_count` est calculé dynamiquement (ou mis en cache 5 minutes).

---

### 4.5 Serveurs à la une (featured)

**`GET /api/discovery/featured`**

Route publique. Retourne les serveurs mis en avant par l'administration.

**Réponse 200 OK :**
```json
{
  "featured": [
    {
      "guild": { "...même format que discovery listing..." },
      "position": 1,
      "featured_at": "2025-01-01T00:00:00.000Z"
    }
  ]
}
```

### Admin — Gérer les serveurs à la une

**`POST /api/admin/discovery/featured`** — Mettre un serveur en avant

Requiert `admin_level >= 2`.

```json
{
  "guild_id": "9876543210987654321",
  "position": 1,
  "expires_at": "2025-02-01T00:00:00.000Z"
}
```

**`DELETE /api/admin/discovery/featured/:guildId`** — Retirer un serveur de la une

---

### 4.6 Rejoindre un serveur depuis la discovery

**`POST /api/discovery/guilds/:guildId/join`**

Requiert : authentification.

**Logique :**
1. Vérifier que le serveur est `discoverable = true`
2. Vérifier que l'utilisateur n'est pas banni du serveur
3. Vérifier la limite de serveurs par utilisateur
4. Ajouter l'utilisateur dans `guild_members` avec le rôle `@everyone`
5. Émettre `GUILD_MEMBER_ADD` à la guilde et `GUILD_CREATE` au nouvel utilisateur

**Réponse 200 OK :** objet Guild complet

**Erreurs :**
- `403` `BANNED_FROM_GUILD`
- `403` `MAX_GUILDS_REACHED`
- `404` `GUILD_NOT_DISCOVERABLE`

---

## 5. Interface utilisateur

### 5.1 Page Explorer (`/explore`)

Accessible via le bouton **boussole** dans la sidebar des serveurs.

**Structure :**

1. **Hero** en haut : titre "Découvrir des communautés", sous-titre "Trouvez votre prochain serveur préféré", barre de recherche centrée
2. **Serveurs à la une** : carrousel horizontal de 3–4 cartes larges (960×200px) avec `discovery_splash` en fond, nom et description en overlay
3. **Catégories** : grille de boutons avec emoji + label + compteur de serveurs
4. **Résultats / Listing** : grille de cartes serveur (3 colonnes sur desktop, 2 sur tablette)

### 5.2 Carte de serveur

- **Image** : `discovery_splash` ou fallback sur `icon` avec fond dégradé
- **Nom** en gras
- **Description** tronquée à 2 lignes
- **Footer** : icône membres `👥 1,250 membres` + icône en ligne `🟢 340 en ligne`
- **Tags** : pilules grises avec les tags (max 3 affichés)
- **Badge boost** si `premium_tier > 0`
- **Bouton "Rejoindre"** au hover (ou "Membre ✓" si déjà membre)

### 5.3 Page de détail d'un serveur (`/explore/:guildId`)

- **Bannière** : `discovery_splash` en plein écran (960×300px)
- **Section info** : icône, nom, `discovery_description`, catégorie, tags
- **Statistiques** : membres, en ligne, boosts, date de création
- **Bouton "Rejoindre le serveur"** proéminent
- **Aperçu des canaux publics** : liste des 10 premiers canaux visibles par `@everyone`
- **Émojis du serveur** : grille des emojis customs du serveur (aperçu)

---

## 6. Paramètres du serveur — Découvrabilité

Section ajoutée dans les paramètres du serveur, accessible avec `MANAGE_GUILD`.

**Onglet "Découvrabilité" :**
- Toggle "Rendre ce serveur découvrable"
- Checklist des conditions requises avec ✅/❌ en temps réel
- Champ "Description de découverte" (textarea, max 300 caractères)
- Sélecteur de catégorie primaire (dropdown)
- Champ de tags (input avec chips, max 10)
- Upload du splash de découverte (drag & drop)
- Aperçu de la carte telle qu'elle apparaîtra dans l'annuaire

---

## 7. Événements Socket.IO

| Événement | Déclencheur | Payload |
|---|---|---|
| `GUILD_UPDATE` | Changement de discoverable/description/catégorie | `{ guild }` (aux membres) |

---

## 8. Indexation et performance

- Les requêtes de recherche utilisent SQLite FTS5 sur `guilds.name`, `guilds.description`, `guilds.discovery_description` et `guild_discovery_tags.tag`
- Table FTS virtuelle :
```sql
CREATE VIRTUAL TABLE guilds_discovery_fts USING fts5(
  name, description, discovery_description,
  content='guilds',
  content_rowid='rowid',
  tokenize='unicode61'
);
```
- Le `presence_count` est mis en cache en mémoire (Map) et rafraîchi toutes les 60 secondes
- Le `guild_count` par catégorie est mis en cache 5 minutes

---

## Références croisées

- `00-architecture.md` — Stack, conventions
- `03-servers-channels.md` — Modèle Guild, canaux
- `12-admin-panel.md` — Gestion admin des serveurs featured
- `17-file-storage.md` — Upload et traitement des images
