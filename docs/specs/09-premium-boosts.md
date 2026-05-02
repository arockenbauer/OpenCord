# Spécification 09 — Premium (OpenCord+) & Boosts de serveur

## Vue d'ensemble

OpenCord propose un abonnement premium mensuel appelé **OpenCord+** à 5€/mois. Les abonnés bénéficient d'avantages personnels et disposent de boosts à offrir aux serveurs. Les serveurs boostés débloquent des fonctionnalités supplémentaires selon leur niveau (tier). Le paiement est géré via **Stripe** en mode local (pas de services cloud tiers).

---

## 1. Modèles de données — Abonnement

### 1.1 SubscriptionTier (configuration des offres)

```
SubscriptionTier {
  id               String    @id (snowflake)
  name             String    (ex: "OpenCord+")
  price_cents      Int       (500 = 5,00 €)
  currency         String    @default("EUR")
  stripe_price_id  String    (ID du prix dans Stripe Dashboard, ex: "price_xyz123")
  features         Json      (voir structure ci-dessous)
  active           Boolean   @default(true)
  created_at       DateTime  @default(now())
}
```

**Structure du champ `features` (JSON) :**
```json
{
  "max_upload_size_mb": 25,
  "animated_avatar": true,
  "animated_banner": true,
  "custom_tag": true,
  "hd_streaming": true,
  "cross_server_emojis": true,
  "cross_server_stickers": true,
  "profile_badge": true,
  "extended_bio": true,
  "extended_bio_max_chars": 4000,
  "profile_themes": true,
  "custom_profile_per_server": true,
  "free_boosts": 2,
  "super_reactions": true
}
```

**Principe de modularité :**
- Pour ajouter un nouveau tier (ex: "OpenCord++ Pro"), il suffit d'insérer une nouvelle ligne dans `SubscriptionTier` avec un objet `features` différent.
- Le code backend vérifie les features **dynamiquement** en lisant `features` depuis la base, sans hard-coding des niveaux.
- Exemple de vérification : `if (user.subscription?.tier.features.cross_server_emojis) { ... }`

**Tier initial (seed) :**
```json
{
  "id": "1",
  "name": "OpenCord+",
  "price_cents": 500,
  "currency": "EUR",
  "stripe_price_id": "price_opencordplus_monthly",
  "features": { ... },
  "active": true
}
```

---

### 1.2 PlatformSettings (configuration globale de la plateforme)

```
PlatformSettings {
  key        String    @id
  value      Json
  updated_by String?   (FK → users.id, admin qui a modifié)
  updated_at DateTime  @updatedAt
}
```

**Clés configurables :**

| Clé | Type | Défaut | Description |
|-----|------|--------|-------------|
| `registration.open` | Boolean | `true` | Inscription ouverte ou fermée |
| `registration.require_email_verification` | Boolean | `false` | Vérification email obligatoire |
| `registration.min_age` | Int | `13` | Âge minimum |
| `limits.max_guilds_per_user` | Int | `100` | Max serveurs par utilisateur |
| `limits.max_channels_per_guild` | Int | `500` | Max canaux par serveur |
| `limits.max_roles_per_guild` | Int | `250` | Max rôles par serveur |
| `limits.max_members_per_guild` | Int | `0` (illimité) | Max membres par serveur |
| `limits.max_message_length` | Int | `2000` | Longueur max d'un message |
| `limits.max_bio_length` | Int | `190` | Longueur bio non-premium |
| `limits.max_bio_length_premium` | Int | `4000` | Longueur bio premium |
| `limits.max_attachments_per_message` | Int | `10` | Max fichiers par message |
| `upload.max_avatar_size` | Int | `8388608` | Taille max avatar (octets) |
| `upload.max_avatar_size_premium` | Int | `10485760` | Taille max avatar premium |
| `upload.max_attachment_size` | Int | `8388608` | Taille max pièce jointe |
| `upload.max_attachment_size_premium` | Int | `26214400` | Taille max pièce jointe premium |
| `upload.max_emoji_size` | Int | `262144` | Taille max emoji |
| `upload.max_sticker_size` | Int | `524288` | Taille max sticker |
| `upload.storage_limit_per_guild` | Int | `5368709120` | Limite stockage par serveur |
| `premium.animated_avatar_enabled` | Boolean | `true` | Avatars animés réservés au premium |
| `premium.animated_banner_enabled` | Boolean | `true` | Bannières animées réservées au premium |
| `premium.cross_server_emojis` | Boolean | `true` | Emojis cross-serveur pour premium |
| `premium.custom_tag` | Boolean | `true` | Tag personnalisé pour premium |
| `premium.extended_bio` | Boolean | `true` | Bio étendue pour premium |
| `premium.profile_themes` | Boolean | `true` | Thèmes de profil pour premium |
| `premium.per_server_profile` | Boolean | `true` | Profil par serveur pour premium |
| `premium.free_boosts` | Int | `2` | Boosts gratuits avec abonnement |
| `boosts.tier1_threshold` | Int | `2` | Boosts requis tier 1 |
| `boosts.tier2_threshold` | Int | `7` | Boosts requis tier 2 |
| `boosts.tier3_threshold` | Int | `14` | Boosts requis tier 3 |
| `rate_limits.message_send.count` | Int | `5` | Messages par fenêtre |
| `rate_limits.message_send.window_seconds` | Int | `5` | Fenêtre en secondes |
| `rate_limits.auth_login.count` | Int | `5` | Tentatives login par fenêtre |
| `rate_limits.auth_login.window_seconds` | Int | `60` | Fenêtre login en secondes |
| `moderation.default_verification_level` | Int | `0` | Niveau de vérification par défaut |
| `moderation.require_2fa_admin` | Boolean | `false` | 2FA obligatoire pour admin serveur |
| `appearance.default_locale` | String | `"fr"` | Langue par défaut |
| `appearance.available_themes` | String[] | `["dark"]` | Thèmes disponibles |

- Toutes les valeurs sont modifiables via le panneau admin (`/admin/settings`), voir spec `12-admin-panel.md`.
- Le backend charge les settings au démarrage et les met en cache mémoire. Les changements via l'admin invalident le cache et émettent `PLATFORM_SETTINGS_UPDATE` via Socket.IO aux admins connectés.
- Les valeurs `.env` servent de fallback initial. Une fois qu'un setting est défini en base, il a priorité sur `.env`.
- L'API `GET /api/admin/settings` retourne tous les settings. `PATCH /api/admin/settings` met à jour un ou plusieurs settings.

---

### 1.3 UserSubscription (abonnement actif d'un utilisateur)

```
UserSubscription {
  id                       String    @id (snowflake)
  user_id                  String    @unique (référence vers User)
  tier_id                  String    (référence vers SubscriptionTier)
  stripe_customer_id       String    (ID client Stripe, ex: "cus_abc123")
  stripe_subscription_id   String    @unique (ID abonnement Stripe, ex: "sub_xyz789")
  status                   String    (voir enum)
  current_period_start     DateTime
  current_period_end       DateTime
  cancel_at_period_end     Boolean   @default(false)
  canceled_at              DateTime?
  created_at               DateTime  @default(now())
  updated_at               DateTime  @updatedAt
}
```

**Enum `status` :**
| Valeur       | Description |
|--------------|-------------|
| `active`     | Abonnement actif, fonctionnalités disponibles |
| `cancelled`  | Annulé, actif jusqu'à `current_period_end` |
| `past_due`   | Paiement échoué, tentative en cours |
| `expired`    | Période terminée sans renouvellement |
| `trialing`   | Période d'essai *(v2)* |

**Champ `user.premium` (sur le modèle User) :**
```
User {
  ...
  premium          Boolean   @default(false)
  premium_since    DateTime? (date de début du premier abonnement)
  ...
}
```
- `user.premium = true` quand `status IN ('active', 'cancelled')` (encore dans la période en cours).
- Mis à jour automatiquement lors des webhooks Stripe.

---

## 2. Avantages OpenCord+

### 2.1 Avatar et bannière animés

> **Fonctionnalité admin-configurable** : `premium.animated_avatar_enabled` et `premium.animated_banner_enabled` dans `PlatformSettings`. Si désactivé, tous les utilisateurs peuvent utiliser des GIF.

#### Comportement à l'upload

**Tous les utilisateurs** peuvent uploader des fichiers GIF. Le système stocke **toujours les deux versions** :
- **Version statique** : première frame du GIF extraite et convertie en WebP (toutes les variantes de taille)
- **Version animée** : le GIF original conservé tel quel (`{hash}_animated.gif`)

La **version servie** dépend du statut premium de l'utilisateur :
- **Utilisateur premium** (`user.premium = true`) : l'URL retournée pointe vers la version animée (`.gif`)
- **Utilisateur non-premium** : l'URL retournée pointe vers la version statique (`.webp`)

#### Comportement à l'expiration du premium

Lorsque le webhook Stripe `customer.subscription.deleted` est reçu :
1. `user.premium` passe à `false`
2. Les URLs d'avatar et bannière sont recalculées pour pointer vers la version **statique**
3. Les fichiers animés sur disque sont **conservés** (pas de suppression)
4. Le flag `user.avatar_animated` et `user.banner_animated` restent à `true` (indiquant qu'une version GIF existe)
5. Un timestamp `user.premium_lost_at` est enregistré
6. Émission `USER_UPDATE` avec les nouvelles URLs statiques

#### Comportement à la réactivation du premium

Lorsque le webhook Stripe `checkout.session.completed` ou `customer.subscription.updated` (status=active) est reçu :
1. `user.premium` passe à `true`
2. Le système vérifie si l'utilisateur a changé son avatar/bannière depuis `premium_lost_at` :
   - Si `user.avatar_updated_at > user.premium_lost_at` → l'utilisateur a changé d'avatar depuis, **ne pas restaurer** la version animée (elle a peut-être été écrasée par un nouveau fichier statique)
   - Si `user.avatar_updated_at <= user.premium_lost_at` ET `user.avatar_animated = true` → **restaurer automatiquement** la version animée
   - Même logique pour la bannière avec `banner_updated_at` et `banner_animated`
3. Émission `USER_UPDATE` avec les URLs mises à jour (animées si restauration)

#### Champs utilisateur associés (ajoutés au modèle User)

| Champ | Type | Description |
|---|---|---|
| `avatar_animated` | `Boolean` | `true` si une version GIF existe sur disque |
| `banner_animated` | `Boolean` | `true` si une version GIF existe sur disque |
| `avatar_updated_at` | `DateTime` | Dernière modification de l'avatar |
| `banner_updated_at` | `DateTime` | Dernière modification de la bannière |
| `premium_lost_at` | `DateTime?` | Date de dernière perte du premium |

#### Résolution d'URL (helper backend)

```typescript
function resolveAvatarUrl(user: User): string | null {
  if (!user.avatarHash) return null;
  const animated = user.avatar_animated && user.premium;
  const ext = animated ? 'gif' : 'webp';
  const suffix = animated ? '_animated' : '_128';
  return `/files/avatars/${user.id}/${user.avatarHash}${suffix}.${ext}`;
}
```

#### Changement d'avatar pendant la période non-premium

Si un utilisateur non-premium uploade un nouveau fichier (qu'il soit GIF ou non) :
1. L'ancien fichier (y compris l'ancienne version animée) est **supprimé**
2. Le nouveau fichier est traité normalement (GIF → versions statique + animée stockées, PNG/JPEG → version statique uniquement)
3. `avatar_updated_at` est mis à jour
4. Si le fichier est un GIF, `avatar_animated = true` ; sinon `avatar_animated = false`
5. L'URL retournée reste **statique** tant que l'utilisateur n'est pas premium

Format accepté : GIF, JPEG, PNG, WebP. Max 8MB standard, 10MB premium (configurable via `PlatformSettings`).

### 2.2 Taille d'upload augmentée
- Non-premium : **8 MB** maximum par fichier joint.
- OpenCord+ : **25 MB** maximum par fichier joint.
- Vérification : `if (fileSize > maxUploadSize) return 413 REQUEST_TOO_LARGE`.
- La limite effective est lue depuis `tier.features.max_upload_size_mb`.

### 2.3 Tag/discriminant personnalisé
- Les utilisateurs premium peuvent choisir librement leur tag 4 chiffres (ex: `#1234`).
- `PATCH /api/users/@me` avec `{ "discriminator": "1234" }`.
- Unicité vérifiée sur `(username, discriminator)`.
- Non-premium : tag assigné aléatoirement, non modifiable.
- Validation : `if (!user.premium) return 403 PREMIUM_REQUIRED`.

### 2.4 Emojis et stickers cross-serveur
- Décrit en détail dans la spec 08.
- Feature flag : `cross_server_emojis` et `cross_server_stickers`.

### 2.5 Streaming HD
- **DIFFÉRÉ — v2**
- Feature flag : `hd_streaming = true`
- En v1 : flag présent dans la structure mais aucun comportement associé.

### 2.6 Badge OpenCord+ sur le profil
- Badge auto-assigné à l'activation de l'abonnement.
- Retiré automatiquement à l'expiration.
- Géré via le système de badges de la spec 02 : `UserBadge { user_id, badge_type: "PREMIUM" }`.
- Visible sur la fiche profil et à côté du nom dans les messages *(optionnel, configurable)*.

### 2.7 Bio étendue
- Non-premium : bio limitée à **190 caractères**.
- OpenCord+ : bio limitée à **4000 caractères** (`extended_bio_max_chars`).
- Validation backend : `if (bio.length > maxBioLength) return 400`.

### 2.8 Thèmes et couleurs de profil
- Les utilisateurs premium peuvent définir une couleur d'accent pour leur profil.
- `PATCH /api/users/@me` avec `{ "accent_color": "#FF5733" }`.
- Affichée comme fond dégradé sur la fiche de profil.
- Non-premium : `accent_color` ignoré.

### 2.9 Profil personnalisé par serveur
- Les utilisateurs premium peuvent avoir un avatar, une bio et un nom d'affichage différents par serveur.
- Géré via `GuildMemberProfile { guild_id, user_id, avatar, bio, display_name }`.
- `PATCH /api/guilds/:guildId/members/@me` avec `{ "avatar": "...", "bio": "...", "nick": "..." }`.
- Si pas de profil par serveur défini, fallback sur le profil global.

### 2.10 Boosts offerts
- Les abonnés OpenCord+ reçoivent **2 boosts gratuits** utilisables sur n'importe quel serveur.
- Ces boosts sont liés à l'abonnement : retirés si l'abonnement expire.

---

## 3. Flux de paiement Stripe

### 3.1 Vue d'ensemble du flux

```
Utilisateur → Clic "S'abonner"
    → POST /api/subscriptions/checkout
    → Backend crée une Stripe Checkout Session
    → Frontend redirige vers l'URL Stripe
    → Utilisateur paie sur Stripe
    → Stripe appelle POST /api/webhooks/stripe
    → Backend active l'abonnement
    → Utilisateur redirigé vers page de succès
```

### 3.2 Configuration Stripe (backend `.env`)

```env
STRIPE_SECRET_KEY=sk_live_...        # Clé secrète Stripe (backend seulement)
STRIPE_WEBHOOK_SECRET=whsec_...      # Secret de vérification des webhooks
STRIPE_PUBLISHABLE_KEY=pk_live_...   # Clé publique (peut être exposée au frontend)
FRONTEND_URL=http://localhost:5173   # Pour les redirections après paiement
```

**Ces clés ne doivent JAMAIS apparaître dans le code source ni dans les logs.**

---

### 3.3 Endpoints

#### `POST /api/subscriptions/checkout` — Créer une session de paiement

**Requiert :** Authentification

**Corps de la requête :**
```json
{
  "tier_id": "1"
}
```

**Comportement :**
1. Vérifier que l'utilisateur n'a pas déjà un abonnement actif.
2. Récupérer ou créer un `stripe_customer_id` pour cet utilisateur (stocker en base si nouveau).
3. Créer une Stripe Checkout Session via l'API Stripe avec :
   - `mode: "subscription"`
   - `line_items: [{ price: tier.stripe_price_id, quantity: 1 }]`
   - `success_url: "${FRONTEND_URL}/premium/success?session_id={CHECKOUT_SESSION_ID}"`
   - `cancel_url: "${FRONTEND_URL}/premium"`
   - `customer: stripe_customer_id`
   - `metadata: { user_id: user.id, tier_id: tier.id }`
4. Retourner l'URL de la session.

**Réponse 200 :**
```json
{
  "url": "https://checkout.stripe.com/c/pay/cs_test_...",
  "session_id": "cs_test_..."
}
```

**Erreurs :**
- `409` avec `ALREADY_SUBSCRIBED` si l'utilisateur a déjà un abonnement actif.
- `404` si le `tier_id` n'existe pas.

---

#### `POST /api/subscriptions/portal` — Accéder au portail client Stripe

**Requiert :** Authentification + abonnement existant

**Corps de la requête :** `{}`

**Comportement :**
1. Vérifier que l'utilisateur a un `stripe_customer_id`.
2. Créer une Stripe Customer Portal Session.
3. Retourner l'URL du portail.

**Réponse 200 :**
```json
{
  "url": "https://billing.stripe.com/session/..."
}
```

Le portail Stripe permet à l'utilisateur de : modifier son moyen de paiement, voir ses factures, annuler son abonnement.

---

#### `GET /api/subscriptions/@me` — Obtenir son abonnement actuel

**Requiert :** Authentification

**Réponse 200 (avec abonnement) :**
```json
{
  "id": "9999999999999999999",
  "tier": {
    "id": "1",
    "name": "OpenCord+",
    "price_cents": 500,
    "currency": "EUR",
    "features": {
      "max_upload_size_mb": 25,
      "animated_avatar": true,
      "custom_tag": true,
      "cross_server_emojis": true,
      "profile_badge": true,
      "extended_bio": true,
      "free_boosts": 2
    }
  },
  "status": "active",
  "current_period_start": "2025-01-01T00:00:00.000Z",
  "current_period_end": "2025-02-01T00:00:00.000Z",
  "cancel_at_period_end": false,
  "premium_since": "2024-06-15T00:00:00.000Z"
}
```

**Réponse 200 (sans abonnement) :**
```json
{
  "subscription": null,
  "premium": false
}
```

---

#### `POST /api/subscriptions/cancel` — Annuler l'abonnement

**Requiert :** Authentification + abonnement actif

**Corps de la requête :** `{}`

**Comportement :**
1. Appeler l'API Stripe pour marquer `cancel_at_period_end = true`.
2. Mettre à jour `UserSubscription.cancel_at_period_end = true` et `status = "cancelled"`.
3. L'abonnement reste actif jusqu'à `current_period_end`.
4. Pas de remboursement automatique en v1.

**Réponse 200 :**
```json
{
  "cancel_at_period_end": true,
  "current_period_end": "2025-02-01T00:00:00.000Z",
  "message": "Votre abonnement sera annulé le 01/02/2025"
}
```

---

### 3.4 Webhook Stripe

#### `POST /api/webhooks/stripe`

**Headers attendus :**
```
Stripe-Signature: t=...,v1=...
```

**Vérification d'authenticité :**
```typescript
const event = stripe.webhooks.constructEvent(
  req.body,           // raw body (Buffer, pas parsé)
  req.headers['stripe-signature'],
  process.env.STRIPE_WEBHOOK_SECRET
);
```

**Important :** Le body de la requête doit être reçu en **raw bytes** (pas parsé en JSON) pour que la signature soit valide. Utiliser `express.raw({ type: 'application/json' })` sur cette route uniquement.

**Événements gérés :**

---

**`checkout.session.completed`**

Déclencheur : Paiement initial réussi, abonnement créé.

```json
{
  "type": "checkout.session.completed",
  "data": {
    "object": {
      "id": "cs_test_...",
      "customer": "cus_abc123",
      "subscription": "sub_xyz789",
      "metadata": {
        "user_id": "1111111111111111111",
        "tier_id": "1"
      },
      "payment_status": "paid"
    }
  }
}
```

**Traitement :**
1. Récupérer les détails de l'abonnement Stripe via `stripe.subscriptions.retrieve(subscription_id)`.
2. Créer (ou mettre à jour) l'entrée `UserSubscription` en base.
3. Mettre `user.premium = true` et `user.premium_since = now()` (si premier abonnement).
4. Assigner le badge "PREMIUM" à l'utilisateur.
5. Donner N boosts à l'utilisateur (N = `PlatformSettings.premium.free_boosts`, défaut 2).
6. **Restauration des avatars/bannières animés** : si `user.avatar_animated = true` ET `user.avatar_updated_at <= user.premium_lost_at` → recalculer l'URL avatar vers la version animée. Idem pour la bannière.
7. Émettre `USER_UPDATE` via Socket.IO à l'utilisateur (avec URLs animées restaurées si applicable).

---

**`customer.subscription.updated`**

Déclencheur : Renouvellement, changement de plan, modification.

```json
{
  "type": "customer.subscription.updated",
  "data": {
    "object": {
      "id": "sub_xyz789",
      "status": "active",
      "current_period_start": 1735689600,
      "current_period_end": 1738368000,
      "cancel_at_period_end": false,
      "items": {
        "data": [{ "price": { "id": "price_opencordplus_monthly" } }]
      }
    }
  }
}
```

**Traitement :**
1. Retrouver `UserSubscription` par `stripe_subscription_id`.
2. Mettre à jour : `status`, `current_period_start`, `current_period_end`, `cancel_at_period_end`.
3. Si `status = "active"` : s'assurer que `user.premium = true`.
4. Si `cancel_at_period_end = true` et `status = "active"` : mettre `status = "cancelled"` en base.

---

**`customer.subscription.deleted`**

Déclencheur : Abonnement terminé (fin de période après annulation, échec de paiement définitif).

```json
{
  "type": "customer.subscription.deleted",
  "data": {
    "object": {
      "id": "sub_xyz789",
      "status": "canceled"
    }
  }
}
```

**Traitement :**
1. Mettre `UserSubscription.status = "expired"`.
2. Mettre `user.premium = false`.
3. Enregistrer `user.premium_lost_at = now()`.
4. Retirer le badge "PREMIUM" de l'utilisateur.
5. Retirer les boosts non alloués (ceux sans `guild_id`).
6. Si des boosts alloués existent : les conserver jusqu'à `boost.ends_at` puis les retirer via un cron job.
7. Si `user.avatar_animated = true` → recalculer l'URL avatar vers la version statique.
8. Si `user.banner_animated = true` → recalculer l'URL bannière vers la version statique.
9. Si `premium.animated_avatar_enabled` dans PlatformSettings est `false`, skip étapes 7-8.
10. Émettre `USER_UPDATE` via Socket.IO avec les URLs recalculées.

---

**`invoice.payment_succeeded`**

Déclencheur : Paiement de facture réussi (renouvellement mensuel).

**Traitement :**
1. Mettre à jour `UserSubscription.current_period_end`.
2. S'assurer que `status = "active"`.

---

**`invoice.payment_failed`**

Déclencheur : Échec de paiement (carte refusée, etc.).

**Traitement :**
1. Mettre `UserSubscription.status = "past_due"`.
2. Envoyer une notification à l'utilisateur (message système ou email en v2).
3. Ne pas retirer `user.premium` immédiatement — Stripe retentera automatiquement.
4. Si échec définitif : `customer.subscription.deleted` sera déclenché.

---

**Réponse webhook :** Toujours répondre `200 OK` rapidement (idéalement < 5 secondes). Traitement asynchrone si nécessaire. Renvoyer `400` uniquement si la signature est invalide.

---

## 4. Boosts de serveur

### 4.1 Modèle de données

```
Boost {
  id          String    @id (snowflake)
  guild_id    String?   (null si boost non alloué — "en stock" chez l'utilisateur)
  user_id     String    (propriétaire du boost)
  started_at  DateTime? (null si non alloué)
  ends_at     DateTime? (null si boost permanent — lié à l'abonnement actif)
  created_at  DateTime  @default(now())
}
```

**États d'un boost :**
- `guild_id = null` : boost disponible, non alloué.
- `guild_id = <id>` et `starts_at = <date>` : boost actif sur un serveur.
- Un boost est retiré quand `user.premium = false` et `ends_at` est passé (ou null → immédiat).

---

### 4.2 Tiers de boost des serveurs

Le tier d'un serveur est calculé dynamiquement en comptant les boosts actifs (`guild_id = server.id` et `user.premium = true`).

| Tier | Boosts requis | Avantages |
|------|---------------|-----------|
| **0** | 0            | Quotas de base |
| **1** | 2            | +50 emojis statiques et animés, audio 128kbps, icône de serveur animée, splash d'invitation personnalisé, 15 stickers |
| **2** | 7            | +150 emojis, audio 256kbps, bannière de serveur, 30 stickers, upload 50MB pour tous les membres |
| **3** | 14           | +250 emojis, audio 384kbps, URL personnalisée (vanity), bannière animée, 60 stickers, upload 100MB pour tous |

**Calcul du tier (backend, en temps réel) :**
```typescript
function getGuildTier(boostCount: number): 0 | 1 | 2 | 3 {
  if (boostCount >= 14) return 3;
  if (boostCount >= 7)  return 2;
  if (boostCount >= 2)  return 1;
  return 0;
}
```

Le champ `guild.premium_tier` est recalculé et mis en cache à chaque ajout/retrait de boost.

---

### 4.3 Endpoints

#### `POST /api/guilds/:guildId/boosts` — Booster un serveur

**Requiert :** Authentification + `user.premium = true` + avoir un boost non alloué

**Corps de la requête :** `{}`

**Comportement :**
1. Vérifier que l'utilisateur est membre du serveur.
2. Vérifier qu'il a au moins 1 boost disponible (`Boost` avec `guild_id = null`).
3. Allouer le boost : mettre à jour `Boost.guild_id = guildId` et `Boost.started_at = now()`.
4. Recalculer le tier du serveur.
5. Si le tier change, émettre `GUILD_UPDATE` avec le nouveau tier.
6. Envoyer un message système dans le salon système du serveur : "**username** vient de booster le serveur ! Le serveur a maintenant X boosts."

**Réponse 200 :**
```json
{
  "boost_id": "8888888888888888888",
  "guild_id": "5555555555555555555",
  "started_at": "2025-01-01T00:00:00.000Z",
  "guild_premium_tier": 1,
  "guild_premium_subscription_count": 3
}
```

**Erreurs :**
- `403` avec `PREMIUM_REQUIRED` si l'utilisateur n'est pas OpenCord+.
- `403` avec `NO_BOOST_AVAILABLE` si tous les boosts sont déjà alloués.

---

#### `DELETE /api/guilds/:guildId/boosts` — Retirer son boost d'un serveur

**Requiert :** Authentification + avoir un boost alloué à ce serveur

**Corps de la requête :** `{}`

**Comportement :**
1. Retrouver le boost alloué à ce serveur par cet utilisateur.
2. Remettre `Boost.guild_id = null` et `Boost.started_at = null`.
3. Recalculer le tier.
4. Si le tier descend :
   - Désactiver les emojis/stickers en surnombre (`available = false`).
   - Si perte du vanity (Tier 3 → Tier 2) : libérer le code vanity après 30 jours de grâce.
   - Émettre `GUILD_UPDATE`.

**Réponse 204** (pas de corps)

---

#### `GET /api/guilds/:guildId/boosts` — Lister les boosters d'un serveur

**Requiert :** Être membre du serveur

**Réponse 200 :**
```json
{
  "premium_tier": 1,
  "premium_subscription_count": 3,
  "boosters": [
    {
      "user": {
        "id": "1111111111111111111",
        "username": "alice",
        "avatar": "abc123",
        "global_name": "Alice"
      },
      "boost_count": 2,
      "premium_since": "2025-01-01T00:00:00.000Z"
    }
  ]
}
```

---

### 4.4 Message système de boost

Quand un utilisateur boost un serveur, un message système est créé dans `guild.system_channel_id` :

```json
{
  "type": 8,
  "system_message_type": "USER_PREMIUM_GUILD_SUBSCRIPTION",
  "content": "",
  "author": { ... },
  "embeds": [],
  "mentions": [],
  "referenced_message": null
}
```

Rendu côté client : "🚀 **Alice** vient de booster le serveur !"

Si le serveur atteint un nouveau tier lors du boost :
```
"🎉 **Alice** vient de booster le serveur ! **Mon Serveur** a atteint le niveau 1 !"
```

---

## 5. Interface utilisateur

### 5.1 Page de présentation OpenCord+ (`/premium`)

**Sections :**

1. **Hero** : titre "OpenCord+" avec badge animé, sous-titre "5€/mois", bouton CTA "S'abonner".
2. **Avantages personnels** : liste des features avec icônes :
   - Avatar et bannière animés
   - Upload jusqu'à 25MB
   - Tag personnalisé
   - Emojis et stickers cross-serveur
   - Bio étendue (4000 caractères)
   - Badge exclusif OpenCord+
   - Thèmes de profil
   - 2 boosts offerts
3. **Avantages serveur** (présentation des tiers) : tableau comparatif Tier 1 / 2 / 3.
4. **FAQ** : questions fréquentes sur l'abonnement.
5. **Bouton "Gérer mon abonnement"** visible si déjà abonné (redirige vers portail Stripe).

**État "déjà abonné" :**
- Badge "OpenCord+ Actif" en haut de page.
- Date de renouvellement.
- Bouton "Gérer" (portail Stripe).
- Bouton "Annuler" (avec confirmation modale).

---

### 5.2 Page succès abonnement (`/premium/success`)

Affichée après retour de Stripe (`success_url`).

**Contenu :**
- Animation de confettis.
- Message "Bienvenue dans OpenCord+ ! 🎉"
- Récapitulatif des avantages débloqués.
- Bouton "Commencer à explorer".

**Comportement :**
- Récupérer `GET /api/subscriptions/@me` pour confirmer l'activation.
- Si pas encore actif (webhook pas encore reçu) : afficher un spinner + polling toutes les 2 secondes (max 30 secondes).

---

### 5.3 Page des avantages de boost (Paramètres du serveur → Avantages de boost)

**Sections :**

1. **Tier actuel** : badge visuel du tier (0-3), nombre de boosts actifs / nécessaires pour le prochain tier.
2. **Barre de progression** : "3 / 7 boosts pour le Tier 2" avec barre visuelle.
3. **Liste des perks du tier actuel** : ✅ Emoji slots, ✅ Audio quality, etc.
4. **Perks du prochain tier** : grises avec cadenas, "Encore X boosts nécessaires".
5. **Liste des boosters** : avatars + noms des utilisateurs qui ont boosté, avec date de début.
6. **Bouton "Inviter des membres à booster"** (copie un message d'invitation).

**Affichage du tier :**
- Tier 0 : pas d'icône spéciale.
- Tier 1 : badge violet niveau 1.
- Tier 2 : badge violet niveau 2.
- Tier 3 : badge doré niveau 3.

---

### 5.4 Affichage du boost dans le profil du serveur

Dans la fiche d'informations d'un serveur :
- Icône de flamme 🔥 + "X boosts" si `premium_subscription_count > 0`.
- Badge tier si `premium_tier > 0`.
- Dans la liste des membres, les boosters ont une icône de boost 🚀 à côté de leur nom.

---

## 6. Événements Socket.IO liés au premium

| Événement           | Déclencheur | Destinataires | Payload |
|---------------------|-------------|---------------|---------|
| `USER_UPDATE`       | Activation/expiration abonnement | L'utilisateur | `{ user: { premium, premium_since } }` |
| `GUILD_UPDATE`      | Changement de tier | Membres de la guild | `{ guild: { premium_tier, premium_subscription_count } }` |
| `MESSAGE_CREATE`    | Message système de boost | Membres de la guild | `{ message (type 8) }` |

---

## 7. Sécurité et bonnes pratiques

### 7.1 Protection des clés Stripe
- `STRIPE_SECRET_KEY` : uniquement côté backend, **jamais** retournée dans les réponses API.
- `STRIPE_PUBLISHABLE_KEY` : peut être exposée au frontend via `GET /api/config/public`.
- `STRIPE_WEBHOOK_SECRET` : uniquement côté backend.
- Ne jamais logger ces valeurs dans la console ou les fichiers de log.

### 7.2 Idempotence des webhooks
- Chaque webhook Stripe peut être reçu plusieurs fois. Utiliser `event.id` pour dédupliquer :
```typescript
const existing = await db.stripeEvent.findUnique({ where: { id: event.id } });
if (existing) return res.status(200).json({ received: true });
await db.stripeEvent.create({ data: { id: event.id, type: event.type } });
```

### 7.3 Table de log des événements Stripe

```
StripeEvent {
  id          String    @id (ID Stripe de l'événement, ex: "evt_xyz")
  type        String    (type de l'événement)
  processed   Boolean   @default(false)
  created_at  DateTime  @default(now())
}
```

### 7.4 Gestion des erreurs Stripe
- Si l'API Stripe est inaccessible lors de `POST /api/subscriptions/checkout` : retourner `503 Service Unavailable`.
- Toutes les erreurs Stripe doivent être catchées et loggées côté backend (sans exposer les détails au client).
- Message générique au client : `"Une erreur de paiement est survenue. Veuillez réessayer."`.

---

## 8. Cas limites et règles métier

- Un utilisateur ne peut souscrire qu'à un seul tier à la fois.
- Les boosts liés à un abonnement annulé (mais encore dans la période en cours) restent actifs jusqu'à `current_period_end`.
- Si un utilisateur supprime son compte avec un abonnement actif, annuler l'abonnement Stripe automatiquement.
- Le vanity URL conservé pendant 30 jours après descente sous Tier 3, puis libéré.
- Les emojis/stickers désactivés suite à un downgrade de boost peuvent être réactivés si le serveur remonte de tier.
- Un utilisateur peut distribuer ses 2 boosts sur le même serveur (2 boosts × 1 serveur) ou sur des serveurs différents (1 boost × 2 serveurs).
- L'achat de boosts supplémentaires (au-delà des 2 offerts par OpenCord+) est **décrit mais non implémenté en v1**. Prévoir l'architecture pour l'ajouter en v2 via un endpoint `POST /api/boosts/purchase`.
- Rate limiting sur les endpoints de paiement : 5 requêtes par minute par utilisateur.
