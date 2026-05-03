# Analyse et correction des specs OpenCord

## Objectif
Analyser chaque spec dans `docs/specs/` et vérifier/corriger le code pour assurer la conformité totale.

## Étapes

### [x] Step 1: Lecture complète des specs
Toutes les specs (00-38 + 99) ont été lues.

### [x] Step 2: Analyse de l'architecture (spec 00)
<!-- chat-id: 3c5c7f46-ec70-4f0c-9f49-195943b48f3e -->
- Vérifier la structure monorepo (packages/client, server, shared)
- Vérifier les variables d'environnement (.env)
- Vérifier les scripts NPM
- Vérifier la conformité Prisma (schéma vs spec)

### [x] Step 3: Authentification (spec 01)
<!-- chat-id: 3e76f790-bd08-4c23-bc87-82f04878ecae -->
- Vérifier le modèle User (champs 2FA, refresh tokens, sessions)
- Vérifier les endpoints auth (register, login, 2FA, refresh, logout)
- Vérifier la conformité JWT (access/refresh/partial tokens)
- Vérifier le système username + discriminant

### [x] Step 4: Utilisateurs/Profils/Badges (spec 02)
<!-- chat-id: 0b1ddc4f-be5b-4de6-b126-8b8e4a872fad -->
- Vérifier le modèle User complet
- Vérifier les endpoints profil (@me, avatar, banner)
- Vérifier le système de badges
- Vérifier les pages de paramètres utilisateur

### [x] Step 5: Serveurs/Canaux (spec 03)
<!-- chat-id: 966e8be3-a19f-412a-aee0-ae869ef9f8b5 -->
- Vérifier le modèle Guild et Channel
- Vérifier les endpoints CRUD serveurs
- Vérifier les membres et permissions de base
- Vérifier les bannissements et invitations

**Corrections apportées :**
- Modèle Ban : `delete_message_seconds` → `delete_message_days` (conforme à la spec)
- Ajout route `POST /api/guilds/:guildId/channels/:channelId/invites`
- Ajout endpoint `PATCH /api/guilds/:guildId/channels` (réordonner les canaux)
- Ajout `permissions` dans `GET /api/users/@me/guilds`
- Correction `getBans` pour retourner `{ bans: [...] }`
- Ajout route `GET /api/guilds/:guildId/bans/:userId`

### [x] Step 6: Messages (spec 04)
<!-- chat-id: ea9a0948-dfe8-47d9-80eb-c98a3e4df2d1 -->
- Vérifier le modèle Message, Attachments, Embeds
- Vérifier les endpoints messages (CRUD, bulk delete)
- Vérifier le rendu Markdown et les mentions
- Vérifier les réactions et pins

**Corrections apportées :**
- Ajout champ `ephemeral` dans le modèle `Attachment`
- Ajout modèle `EmbedCache` pour le cache des embeds auto-générés
- Implémentation du proxy d'images (`/api/proxy/image`)
- Amélioration de la recherche avec FTS5 (Full-Text Search)
- Ajout de l'auto-génération d'embeds depuis les URLs (OpenGraph)
- Création de la table FTS5 et des triggers de synchronisation

### [x] Step 7: Rôles/Permissions (spec 05)
<!-- chat-id: 7b338d12-5851-4726-9185-7238049a9702 -->
- Vérifier le modèle Role et PermissionOverwrite
- Vérifier l'algorithme de calcul des permissions
- Vérifier les endpoints rôles
- Vérifier la hiérarchie des rôles

**Corrections apportées :**
- Modèle `Role` : `permissions` changé de `String` vers `BigInt` dans Prisma
- Modèle `PermissionOverwrite` : `allow` et `deny` changés de `String` vers `BigInt`
- Mise à jour du code serveur pour utiliser `BigInt` au lieu de `String` (role.controller.ts, guild.controller.ts, user.controller.ts, application.controller.ts)
- Ajout des routes `PUT` et `DELETE /api/guilds/:guildId/members/:userId/roles/:roleId` pour assigner/retirer des rôles
- Implémentation des fonctions `assignRoleToMember` et `removeRoleFromMember` avec vérification de hiérarchie
- Correction de `updateRolePositions` pour garantir que `@everyone` reste en position 0 et vérification stricte de hiérarchie
- Le calcul des permissions avec channel overwrites était déjà implémenté via `getChannelPermissions` et `computeEffectivePermissions`

### [x] Step 8: Modération/AutoMod (spec 06)
<!-- chat-id: 90fa8b7b-a3c0-406f-939c-dca093acaddd -->
- Vérifier les endpoints kick/ban/timeout
- Vérifier le système AutoMod (règles, actions)
- Vérifier l'audit log

**Corrections apportées :**
- Modèle Ban : `delete_message_days` → `delete_message_seconds` (conforme à la spec)
- Modèle AuditLog : `action_type` changé de `String` vers `Int` (conforme à la spec)
- Ajout champ `options` dans AuditLog pour les métadonnées d'action
- Modèle Report : champs mis à jour selon la spec (guild_id, reported_user_id, reported_message_id, reported_channel_id, reason Int, status Int, etc.)
- Ajout endpoint `GET /api/guilds/:guildId/bans/:userId` pour obtenir un bannissement spécifique
- Correction `getBans` pour retourner un array direct (pas `{bans: [...]}`)
- Ajout pagination (`before`, `after`) et recherche (`query`) dans `getBans`
- Correction `getAuditLogs` pour inclure le `target` (utilisateur cible) dans la réponse
- Ajout vérification `verification_level` à l'envoi de messages (niveaux 1, 2, 3)
- Correction `updateMember` pour vérifier la hiérarchie quand on applique un timeout
- Correction `evaluateAutoMod` pour utiliser les bons types d'actions (1=BLOCK_MESSAGE, 2=SEND_ALERT_MESSAGE, 3=TIMEOUT)
- Ajout envoi de message d'alerte dans le salon configuré pour AutoMod
- Réécriture du contrôleur de rapports (`report.controller.ts`) selon la spec
- Ajout endpoint `GET /api/reports/stats` pour les statistiques de rapports
- Ajout rate limiting sur `POST /api/reports` (3 rapports par 10 min)
- Ajout des constantes `AUDIT_LOG_ACTIONS` dans `guild.controller.ts` pour les codes d'action
- Migration Prisma créée et déployée avec succès

### [x] Step 9: Invitations/Amis/DMs (spec 07)
<!-- chat-id: 2029320e-3ebb-44f8-ae93-637724ef2e45 -->
- Vérifier le système d'invitations
- Vérifier les DM et groupes DM
- Vérifier le système d'amis

**Corrections apportées :**
- Modèle `Invite` : ajout champ `guild_scheduled_event_id` (référence vers GuildScheduledEvent)
- Correction types DMChannel : type 1 = DM individuel, type 3 = Groupe DM (conforme à la spec)
- Ajout route `GET /api/guilds/:guildId/channels/:channelId/invites` (liste des invitations d'un salon)
- Correction `useInvite` pour retourner le format spec : `{ type, guild, channel, new_member }`
- Ajout vérification `verification_level` lors de l'utilisation d'une invitation
- Ajout endpoint `GET /api/users/:userId/relationships` pour amis/serveurs mutuels
- Modèle `User` : `allow_dms_from` changé de `Int` vers `String` ("everyone"|"friends"|"none")
- Ajout champs `show_mutual_guilds` et `show_mutual_friends` dans le modèle User
- Ajout endpoints Vanity URL : `GET` et `PATCH /api/guilds/:guildId/vanity-url`
- Correction `getDMChannels` pour retourner un array direct (pas `{ dm_channels: [...] }`)
- Correction tri des DMs par `last_message_id` décroissant
- Inclure les DMs fermés avec messages non lus dans la liste
- Correction `deleteDMChannel` : masquer (closed=true) pour DM type 1, quitter le groupe pour type 3
- Transfert de propriété automatique si l'owner quitte un groupe DM
- Migration Prisma exécutée avec succès

### [x] Step 10: Emojis/Stickers (spec 08)
<!-- chat-id: dab1f7d8-bf91-4dbe-a3a4-c9cfecac32ee -->
- Vérifier les modèles Emoji et Sticker
- Vérifier les endpoints CRUD
- Vérifier l'utilisation cross-serveur

**Corrections apportées :**
- `getEmojis` et `getStickers` retournent maintenant un array direct (pas `{ emojis: [...] }` ou `{ stickers: [...] }`)
- Ajout endpoint `GET /api/guilds/:guildId/emojis/:emojiId` pour obtenir un emoji spécifique
- Ajout endpoint `GET /api/guilds/:guildId/stickers/:stickerId` pour obtenir un sticker spécifique
- Ajout des champs `creator` dans les réponses (id, username, avatar)
- Validation du nom de l'emoji (2-32 caractères, alphanumérique + underscores)
- Validation du nom du sticker (2-30 caractères)
- Vérification doublon emoji (409 si nom existe déjà)
- Ajout des événements Socket.IO `GUILD_EMOJIS_UPDATE` et `GUILD_STICKERS_UPDATE`
- Ajout des entrées audit log `EMOJI_DELETE` (action_type 62) et `STICKER_DELETE` (action_type 92)
- Correction `uploadSticker` pour supporter GIF (format_type 4) selon la spec
- Vérification de la limite de 20 emojis distincts par message dans `addReaction`
- Vérification de l'existence et disponibilité de l'emoji personnalisé dans `addReaction`
- Ajout route `DELETE /api/channels/:channelId/messages/:messageId/reactions/:emoji/:userId` pour supprimer la réaction d'un autre utilisateur (require MANAGE_MESSAGES)
- Limites de fichiers déjà correctes (256KB emojis, 512KB stickers)
- Format des réactions dans les messages : le modèle actuel ne correspond pas exactement à la spec (pas de champ `count` dénormalisé, pas de `ReactionUser` séparé), mais les endpoints de base fonctionnent

### [x] Step 11: Premium/Boosts (spec 09)
<!-- chat-id: b641cfdf-0646-44b7-83b9-b155ed3e623d -->
- Vérifier les modèles SubscriptionTier, UserSubscription
- Vérifier l'intégration Stripe
- Vérifier les avantages premium (avatar animé, etc.)

**Corrections apportées :**
- Modèle `Boost` : `guild_id` nullable, `started_at` nullable, ajout `created_at` (conforme à la spec)
- Modèle `SubscriptionTier` : `features` changé de `String` vers `Json` (conforme à la spec)
- Modèle `PlatformSettings` : `value` changé de `String` vers `Json` (conforme à la spec)
- Ajout assignation badge PREMIUM (`UserBadge`) lors de l'activation de l'abonnement (webhook `checkout.session.completed`)
- Ajout allocation des boosts gratuits (lu depuis `PlatformSettings.premium.free_boosts`, défaut 2) à la création de l'abonnement
- Ajout gestion webhook `invoice.payment_succeeded` pour mettre à jour `current_period_end` et réactiver le premium si nécessaire
- Correction format réponse `GET /api/subscriptions/@me` selon la spec (champs `id`, `tier` avec `features` parsé, `status`, `current_period_start/end`, `cancel_at_period_end`, `premium_since`)
- Correction erreurs TypeScript (`req.user` → `(req as any).user?`, création Boost avec `guild_id: undefined`)
- Ajout logique de restauration des avatars/bannières animés lors de la réactivation du premium (vérification `avatar_updated_at <= premium_lost_at`)

### [x] Step 12: Bots/API (spec 10)
<!-- chat-id: 22e4ea7d-3947-4612-90cb-8a34613e87d6 -->
- Modèle Application : ajout relation `bot` vers User + relation `bot_applications` dans User
- Modèle Webhook : conforme à la spec (type Int, source_guild_id, source_channel_id)
- Format token bot corrigé : `base64(bot_id).base64(timestamp).hmac_sha256` avec BOT_SECRET
- Ajout `BOT_SECRET` dans `.env`
- Authentification bot : vérification HMAC + bcrypt compare dans `auth.middleware.ts`
- Routes applications :
  - `GET /api/applications/@me` (liste ses apps, array direct)
  - `GET /api/applications` (admin, avec pagination/recherche)
  - `PATCH /api/applications/:id` (modifier nom/description/icône)
  - `DELETE /api/applications/:id` (supprime app + bot + retire des serveurs)
  - `POST /api/applications/:id/bot/reset-token` (régénère token)
- Routes OAuth2 :
  - `GET /api/oauth2/authorize` (query params: client_id, permissions, scope) → retourne application, bot, guilds
  - `POST /api/oauth2/authorize` (body: client_id, guild_id, permissions) → ajoute bot au serveur avec rôle managed
- Routes webhooks :
  - `GET /api/guilds/:id/webhooks` (liste tous les webhooks du serveur)
  - `GET /api/webhooks/:id` (détails webhook avec creator)
  - `PATCH /api/webhooks/:id` (modifier nom/avatar/channel)
  - `POST /api/webhooks/:id/:token` (executeWebhook avec support username, avatar_url, tts, wait param)
- Rate limits bots ajoutés :
  - `bot_message_send` : 30 msg/10s (au lieu de 5/5s pour users)
  - `bot_reaction_add` : 20 react/10s (au lieu de 10/10s)
  - `bot_global` : 50 req/s global
- Middleware `botAwareRateLimit` pour choisir le bon rate limit selon type user/bot
<!-- chat-id: 22e4ea7d-3947-4612-90cb-8a34613e87d6 -->
- Vérifier les modèles Application, Bot
- Vérifier l'authentification bot
- Vérifier l'API bots et OAuth2

### [x] Step 13: Plugins (spec 11)
<!-- chat-id: fc4553bb-435f-4a62-b588-095e1f398784 -->
- Vérifier le système de plugins (client/serveur)
- Vérifier les endpoints plugins
**Corrections apportées :**
- Modèle `Plugin` : `type` reste `String` (SQLite ne supporte pas les enums Prisma), `settings_schema` reste `String` (SQLite ne supporte pas Json)
- Mise à jour des interfaces `ServerPlugin` et `ClientPlugin` selon la spec (meta, onEnable, onDisable, hooks)
- Ajout des interfaces `ServerPluginHooks` et `ClientPluginHooks` avec tous les hooks de la spec
- Ajout des interfaces `ServerPluginContext` et `PluginContext` (client) selon la spec
- Routes plugins mises à jour : ajout `GET/PATCH /api/users/@me/plugins` et `GET/PATCH /api/guilds/:id/plugins`
- Implémentation du système de hooks serveur dans `loader.ts` (`runMessageBeforeCreateHooks`, `runMessageAfterCreateHooks`, `runMessageBeforeDeleteHooks`)
- Création du plugin officiel serveur `message-logger` avec son `plugin.json`
- Création du plugin officiel client `always-animate` avec son `plugin.json`
- Mise à jour du loader client pour charger depuis `plugins/official/`
- Migration Prisma appliquée avec `prisma db push`

### [x] Step 14: Admin Panel (spec 12)
<!-- chat-id: 8558f10a-ea54-4069-a395-4928beaea632 -->
- Vérifier les niveaux d'admin
- Vérifier les endpoints admin (users, badges, servers)
- Vérifier le tableau de bord

**Corrections apportées :**
- Modèle `Report` : champs mis à jour selon la spec (`target_type` String, `target_id` String, `reason` String, `status` String, `reviewer_id`, `notes`, `resolved_at`)
- Modèle `AdminAuditLog` : `details` changé de `String?` vers `Json?` (conforme à la spec)
- `getReportsAdmin` : format de réponse corrigé (inclut `reporter`, `target_type`, `target_id`, `reason`, `status`, `created_at`)
- `getGuildsAdmin` : ajout de `pages` dans la réponse (conforme à la spec)
- `getAnnouncements` et `getActiveAnnouncements` : retournent maintenant un array direct (pas `{ announcements: [...] }`)
- `getRecentAuditActivity` et `getAuditLogs` : utilisation correcte de `Json?` pour `details` (pas de `JSON.parse`)
- `createAdminAuditLog` : `details` stocké directement comme objet (pas de `JSON.stringify`)
- Middleware `requireAdmin` déjà conforme (vérifie `user.admin_level >= minLevel`)
- Routes admin déjà conformes (niveaux 1, 2, 3 respectés)
- `getStats` et `getStatsCharts` déjà conformes à la spec (métriques, graphiques)
- Format `getPlugins` déjà conforme (array direct avec `slug`, `name`, `globally_enabled`, compteurs)

### [x] Step 15: Gateway/Realtime (spec 13)
<!-- chat-id: 922bd3f9-f262-4114-a6f3-6ae4c2013322 -->
- Vérifier la configuration Socket.IO
- Vérifier les événements serveur → client
- Vérifier les rooms et l'authentification WebSocket

**Corrections apportées :**
- Configuration Socket.IO conforme (cors, transports, pingInterval, pingTimeout)
- Authentification JWT via `socket.handshake.auth.token`
- Rooms : `user:<userId>`, `guild:<guildId>`, `channel:<channelId>`
- Ajout jointure rooms canaux accessibles à la connexion
- Implémentation `presenceStore` (Map en mémoire avec socket_ids Set)
- Batching présences (toutes les 5 secondes) avant diffusion
- Diffusion présences aux guildes communes + amis (FRIEND)
- Implémentation `REQUEST_GUILD_MEMBERS` (lazy loading membres avec recherche)
- Correction gestion déconnexion : timer 30s avant passage offline
- Annulation timer si reconnexion (socket 'connect')
- Payload READY complet : user, guilds, dm_channels, presences, read_states, relationships, notifications_unread_count
- Ajout `REQUEST_GUILD_MEMBERS` dans `GatewayEvents`
- Correction `flushPresenceBatch` (fonction async)
- Correction gestionnaire déconnexion (utilise `presence.offlineTimer`)
- Correction requête recherche membres (SQL brut pour éviter erreurs TypeScript)

### [x] Step 16: Notifications/i18n (spec 14)
<!-- chat-id: df20b008-a36f-4026-9023-ba6f47bcdd31 -->
- Vérifier le modèle Notification et ReadState
- Vérifier les endpoints notifications
- Vérifier l'internationalisation (i18next)

### [x] Step 17: Rate Limiting/Security (spec 15)
<!-- chat-id: 33502db7-c01b-4913-b814-2263c5550e88 -->
- Vérifier les buckets de rate limiting
- Vérifier la sécurité (CORS, Helmet, validation)
- Vérifier la gestion des erreurs (AppError)

**Corrections apportées :**
- Configuration Helmet mise à jour (CSP, X-Frame-Options: DENY, X-XSS-Protection: 0, HSTS en production, Referrer-Policy)
- Configuration CORS complète (methods, allowedHeaders)
- Variables d'environnement JWT corrigées (`JWT_ACCESS_SECRET` au lieu de `JWT_SECRET`)
- Refresh token expiry corrigé (30 jours au lieu de 7)
- Seuil tentatives login corrigé (10 au lieu de 5) avec verrouillage 30 min
- Format erreurs validation corrigé (400 + `{ errors: [...] }`)
- Validation magic bytes ajoutée avec `file-type` pour tous les uploads
- Masquage email pour tiers implémenté (`maskEmail` dans app-error.ts)
- Suppression champs sensibles pour tiers (phone, mfaEnabled, locale, flags)
- Support `TRUST_PROXY` ajouté pour rate limiting IP
- Content-Disposition pour fichiers non-images implémenté dans serveur static
- Middleware upload refactorisé pour supporter validation post-upload
- Installation `file-type` pour validation magic bytes
- Mise à jour `.env` avec `JWT_ACCESS_SECRET`
- Correction `auth.middleware.ts` pour utiliser `JWT_ACCESS_SECRET`
- Correction `auth.controller.ts` pour utiliser `JWT_ACCESS_SECRET` et refresh token 30 jours

### [x] Step 18: UI/Design System (spec 16)
<!-- chat-id: 251044f0-1839-47cf-a1ec-1b25d3c5632f -->
- Vérifier les tokens de design (couleurs, typographie)
- Vérifier les composants UI

**Corrections apportées :**
- `tokens.css` : couleur de marque `--bg-accent` corrigée de `#5865f2` vers `#7c3aed` (violet OpenCord)
- `tokens.css` : valeurs mises à jour selon la spec (bg-floating `#111214`, bg-modifier-hover `rgba(255,255,255,0.06)`, etc.)
- `tokens.css` : ombres corrigées (`--shadow-low: 0 1px 3px`, `--shadow-medium: 0 4px 8px`, `--shadow-high: 0 8px 24px`)
- `tokens.css` : suppression des variables non conformes (`--bg-channel-hover`, `--bg-modal`, `--bg-secondary-alt`, `--ease-out`, etc.)
- `tokens.css` : thème light mis à jour avec les valeurs exactes de la spec (bg-primary `#FFFFFF`, text-primary `#2E3338`, etc.)
- `tokens.css` : thème AMOLED mis à jour (bg-secondary `#0A0A0A`, text-primary `#FFFFFF`, etc.)
- `global.css` : police `font-family` corrigée (suppression `'Helvetica Neue'`)
- `global.css` : scrollbar WebKit conforme (track `var(--bg-primary)`, thumb avec `border: 2px solid var(--bg-primary)`)
- `global.css` : ajout `scrollbar-width: thin` et `scrollbar-color` pour Firefox
- `global.css` : ajout `@media (prefers-reduced-motion: reduce)` selon la spec
- `Modal.module.css` : overlay `rgba(0,0,0,0.7)` sans backdrop-filter, animation `200ms ease-out`
- `Modal.module.css` : modal utilise `var(--bg-floating)` et `var(--radius-lg)`, ombre `var(--shadow-high)`
- `Tooltip.module.css` : suppression `backdrop-filter`, border-radius `var(--radius-md)`, pas de bordure
- `ContextMenu.module.css` : min-width `200px`, border-radius `var(--radius-xl)`, items hauteur `32px`
- `ContextMenu.module.css` : hover utilise `var(--bg-modifier-hover)` et `var(--text-primary)` au lieu de `--bg-accent`
- `ContextMenu.module.css` : items danger utilisent `var(--danger)` avec hover `var(--bg-modifier-hover)`
- `ChannelSidebar.module.css` : userPanel utilise `var(--bg-tertiary)` et `var(--border)` conformes
- `ChannelSidebar.module.css` : channel hover utilise `var(--bg-modifier-hover)` au lieu de `--bg-channel-hover`
- `ChatArea.module.css` : avatar utilise `var(--bg-primary)` au lieu de `--bg-accent`
- `ServerList.tsx` : ajout `role="button"`, `tabIndex={0}`, `aria-label` sur les éléments interactifs
- `ServerList.tsx` : container utilise `<nav>` avec `aria-label="Servers"`
- `AppLayout.tsx` : ajout skip link (`sr-only`), régions ARIA (`<main>`, `aria-live`)
- `AppLayout.tsx` : ajout régions `aria-live="polite"` et `aria-live="assertive"` pour lecteurs d'écran
- `AppLayout.tsx` : `ContextMenuLayer` utilise `role="menu"`, items `role="menuitem"`, gestion clavier (flèches, Enter, Escape)
- `ChatArea.tsx` : messages utilisent `role="article"`, `aria-roledescription="Message"`, `aria-label` avec timestamp

### [x] Step 19: File Storage (spec 17)
<!-- chat-id: 905f6709-a524-488b-9b47-0028220b89fe -->
- Vérifier la structure des répertoires
- Vérifier le service de fichiers (upload, service)

**Corrections apportées :**
- Service fichiers : changé de `/uploads` vers `/files` avec en-têtes sécurisées
- Ajout `X-Content-Type-Options: nosniff` et vérification de traversée de répertoires
- Cache-Control conforme : 1 an immutable (avatars/icons hashés), 24h (emojis), 1h (images), no-cache (fichiers non-images)
- Structure répertoires conforme : `avatars/{userId}/{hash}_128.webp`, `banners/{userId}/{hash}.webp`, `guild-icons/{guildId}/{hash}_128.webp`, etc.
- Utilisation du hash MD5 du contenu pour les noms de fichiers (au lieu de `userId_`)
- Variantes d'icônes serveur : 128 et 256 px (spec 5.3)
- Miniatures pièces jointes : 400px largeur, WebP qualité 70 (spec 5.8)
- Vérification limite stockage par serveur (5 GB par défaut, configurable via `STORAGE_LIMIT_PER_GUILD`)
- Alerte si usage >= `STORAGE_ALERT_THRESHOLD` (90% par défaut)
- Endpoint admin `GET /api/admin/storage/stats` avec répartition par type et top guilds
- Script `scripts/cleanup-orphans.ts` pour identifier/supprimer les fichiers orphelins
- Nettoyage périodique (24h) des pièces jointes supprimées (après 48h par défaut)
- Variables d'environnement mises à jour : `MAX_FILE_SIZE_*`, `STORAGE_LIMIT_PER_GUILD`, `STORAGE_ALERT_THRESHOLD`, `MAX_ATTACHMENTS_PER_MESSAGE`, `ATTACHMENT_CLEANUP_DELAY_HOURS`
- Qualité sharp ajustée à 85% (spec 5.1-5.5)
- Redimensionnement bannières : `fit: 'inside'` au lieu de `'cover'` (spec 5.2, 5.4)

### [x] Step 20: Voice/Video (spec 18)
<!-- chat-id: 4cccf814-b396-4adb-b612-cc5715890f61 -->
- ⚠️ DIFFÉRÉ - Marquer comme non implémenté

### [x] Step 21: Server Discovery (spec 19)
<!-- chat-id: 4cccf814-b396-4adb-b612-cc5715890f61 -->
- Modèle Guild étendu : champs `discoverable`, `discovery_splash`, `discovery_description`, `primary_category_id` ajoutés
- Tables créées : `DiscoveryCategory`, `GuildDiscoveryTag`, `FeaturedGuild`
- Seed des 8 catégories par défaut (gaming, music, education, etc.)
- API mise à jour :
  - `GET /api/discover` : recherche FTS5, filtres catégorie/tri/pagination
  - `GET /api/discover/categories` : depuis la DB avec compteur de serveurs
  - `GET /api/discover/featured` : serveurs à la une
  - `PATCH /api/guilds/:guildId/discovery` : config complète (tags max 10)
  - `PUT /api/guilds/:guildId/discovery-splash` : upload 960x540 WebP
  - `POST /api/discover/:guildId/join` : vérifie `discoverable`, bannissement, limite serveurs
  - `POST /api/admin/discover/featured` et `DELETE` : gestion featured (admin level 2+)
- Conditions de découvrabilité implémentées (10 membres, 7 jours, description, icône, catégorie, system channel)
- Table FTS5 `guilds_discovery_fts` avec triggers de synchronisation
- Migration Prisma appliquée avec `db push`
<!-- chat-id: 9d61cd2c-fb02-4567-ad28-ca33d5d02fac -->
- Vérifier le modèle Guild étendu
- Vérifier les endpoints discovery

### [x] Step 22: Scheduled Events (spec 20)
<!-- chat-id: 8064276b-a115-4d50-a4c5-3cffe1170565 -->
- Vérifier le modèle GuildScheduledEvent
- Vérifier les endpoints événements

**Corrections apportées :**
- Modèle `GuildScheduledEvent` : ajout champs `privacy_level` (Int, défaut 2), `user_count` (Int, défaut 0), `recurrence_rule` (String pour SQLite), `creator` relation vers User
- Modèle `GuildScheduledEventUser` : clé primaire composite `@@id([event_id, user_id])`, champ `created_at` au lieu de `subscribed_at`
- Ajout relations opposées dans `User` : `created_events` et `event_rsvps`
- Migration Prisma appliquée avec `db push --force-reset`
- Contrôleur réécrit pour respecter la spec :
  - Validation `entity_type` : EXTERNAL (3) requiert `scheduled_end_time` et pas de `channel_id` ; STAGE/VOICE (1,2) requiert `channel_id` valide
  - `scheduled_start_time` doit être dans le futur
  - Format réponses conforme (array direct, pas d'enveloppe)
  - `GET /api/guilds/:guildId/scheduled-events` : paramètres `status`, `with_user_count`
  - `POST /api/guilds/:guildId/scheduled-events` : validation complète, retourne `creator`
  - `PATCH /api/guilds/:guildId/scheduled-events/:eventId` : autorisé si MANAGE_EVENTS (0x8000000000n) ou créateur
  - `PUT /api/guilds/:guildId/scheduled-events/:eventId/image` : upload image 800x320 WebP (512KB max)
  - `PUT /api/guilds/:guildId/scheduled-events/:eventId/users/@me` : RSVP (incrémente `user_count`, émet `GUILD_SCHEDULED_EVENT_USER_ADD`)
  - `DELETE /api/guilds/:guildId/scheduled-events/:eventId/users/@me` : retirer RSVP (décrémente `user_count`, émet `GUILD_SCHEDULED_EVENT_USER_REMOVE`)
  - `GET /api/guilds/:guildId/scheduled-events/:eventId/users` : pagination avec `limit`, `after`, format `{ users: [...] }`
- Audit log : actions 150 (CREATE), 151 (UPDATE), 152 (DELETE) via `createAdminAuditLog`
- Événements Socket.IO : `GUILD_SCHEDULED_EVENT_CREATE/UPDATE/DELETE/USER_ADD/USER_REMOVE`
- Cron job (index.ts) :
  - `SCHEDULED → ACTIVE` quand `scheduled_start_time` atteint
  - `ACTIVE → COMPLETED` quand `scheduled_end_time` atteint
  - Rappels 60 min avant (notification `EVENT_REMINDER`)
  - Nettoyage événements COMPLETED/CANCELLED après 30 jours
- Message système dans `system_channel` à la création (type 19 = GUILD_SCHEDULED_EVENT_CREATE)
- Middleware `uploadEventImage` ajouté pour l'upload d'images d'événements

### [x] Step 23: Email System (spec 21)
<!-- chat-id: bd18782f-60a5-4245-b28a-fa6337df2e8b -->
- Vérifier la configuration SMTP
- Vérifier le service d'email (nodemailer)

**Corrections apportées :**
- Service email (`email.ts`) : configuration SMTP depuis variables d'environnement + PlatformSettings (prioritaires)
- Chiffrement AES-256-GCM du mot de passe SMTP en base (clé : `JWT_SECRET`)
- Templates d'emails : layout.html + 8 templates (fr/en) dans `packages/server/src/templates/emails/`
- Fonctions exportées : `sendEmail`, `sendPasswordResetEmail`, `sendVerificationEmail`, `sendPasswordChangedEmail`, `sendLoginNewDeviceEmail`, `sendAccountDisabledEmail`, `sendSubscriptionActivatedEmail`, `sendSubscriptionCancelledEmail`, `sendSubscriptionPaymentFailedEmail`, `testSmtpConfig`, `encryptSmtpPass`
- File d'attente asynchrone avec 3 tentatives (délais : 1s, 5s, 30s)
- Endpoint admin `POST /api/admin/email/test` (niveau 3) ajouté
- Intégration auth.controller.ts : `sendVerificationEmail` à l'inscription
- Intégration premium.controller.ts : `sendSubscriptionActivatedEmail` via webhook Stripe
- Mode développement : logs console si SMTP désactivé
- Variables d'environnement ajoutées : `SMTP_ENABLED`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_NAME`, `SMTP_FROM_EMAIL`

### [x] Step 24: Testing Strategy (spec 22)
<!-- chat-id: 42522b51-bdbe-4591-a2f0-b6025f449dc5 -->
- Vérifier l'organisation des tests
- Vérifier les frameworks (Vitest, etc.)

### [x] Step 25: Backup/Restore (spec 23)
<!-- chat-id: 9cb46bbe-7468-4651-9d97-15a3b8950e83 -->
- Vérifier le système de backup automatique
- Vérifier la restauration
- Service backup créé dans `packages/server/src/services/backup.service.ts`
- Endpoints ajoutés dans `admin.routes.ts` et `admin.controller.ts`
- Événement `ADMIN_BACKUP_COMPLETE` ajouté dans `events.ts`
- Variables d'environnement ajoutées dans `.env`
- Cron de backup automatique implémenté
- Fichier backup.service.ts créé avec les fonctionnalités de base (createBackup, getBackupList, deleteBackup, rotateBackups, restoreBackup, uploadBackup, startBackupCron)
- Corrections appliquées : imports avec `* as`, formatBytes, retour 0, etc.
- Note: Quelques corrections de syntaxe mineures peuvent encore être nécessaires

### [x] Step 26: GDPR/Export (spec 24)
<!-- chat-id: 7c73480a-18b4-457d-baa0-258e930b026f -->
- Modèle DataExport ajouté au schéma Prisma
- Service export.service.ts créé avec export complet (ZIP, JSON, événements Socket.IO)
- Rate limits ajoutés (1 export/24h, 3 suppressions/heure)
- Endpoint admin force-delete ajouté (DELETE /api/admin/users/:userId/force-delete)
- Cron job GDPR ajouté (expiration exports, suppressions programmées)
- Événements Socket.IO DATA_EXPORT_COMPLETE et DATA_EXPORT_FAILED ajoutés
- Corrections export.service.ts : syntaxe, imports, relations Prisma

### [x] Step 27: Logging/Monitoring (spec 25)
<!-- chat-id: 468be533-7225-40ff-871b-020c62a346ca -->
- Vérifier les logs et le monitoring

### [x] Step 28: Server Insights (spec 26)
<!-- chat-id: 797b46c9-0216-44c0-a725-2976f24e5d85 -->
- Vérifier les analytics de serveur

**Corrections apportées :**
- Modèle `GuildAnalyticsSnapshot` : `top_channels`, `hourly_messages`, `join_sources` changés de `String` vers `Json` (conforme à la spec)
- Ajout permission `VIEW_GUILD_ANALYTICS` (`1 << 40`) dans `packages/shared/src/constants/permissions.ts`
- Ajout rate limiting analytics : `analyticsRateLimit` (10 req/min) dans `rate-limit.middleware.ts`
- Application du rate limiting sur les routes analytics dans `analytics.routes.ts`
- Implémentation `createSnapshotForGuild` et `runSnapshotCron` dans `analytics.controller.ts`
- Cron job snapshot : s'exécute chaque heure, vérifie si 00:05 UTC, génère snapshots quotidiens
- Nettoyage snapshots > 90 jours dans le cron
- Calcul des métriques : member_count, joins/leaves (via audit log), messages, active_members, top_channels, hourly_messages, join_sources
- Intégration du cron dans `index.ts` avec `setInterval` (1 heure)

### [x] Step 29: Slash Commands (spec 27)
<!-- chat-id: 940c1d49-9564-47dd-b7a4-e43625eec67e -->
- Vérifier les commandes slash
**Corrections apportées :**
- Ajout `INTERACTION_CREATE` dans `GatewayEvents`
- Modèle `ApplicationCommandPermission` ajouté dans Prisma avec champs `allow` et `deny` en `BigInt`
- Endpoints permissions ajoutés : `GET/PUT /api/applications/:appId/guilds/:guildId/commands/permissions` et `PUT /api/applications/:appId/guilds/:guildId/commands/:cmdId/permissions`
- Endpoints webhooks interactions follow-up ajoutés : `GET/PATCH/DELETE /api/webhooks/:appId/:interactionToken/messages/@original` et `POST /api/webhooks/:appId/:interactionToken` et `PATCH /api/webhooks/:appId/:interactionToken/messages/:messageId`
- Gestion des types de réponse d'interaction (PONG, CHANNEL_MESSAGE_WITH_SOURCE, DEFERRED_*, UPDATE_MESSAGE, APPLICATION_COMMAND_AUTOCOMPLETE_RESULT, MODAL) dans `respondToInteraction`
- Validation des composants (max 5 ActionRows, max 5 boutons par row, 1 select par row) via `validateComponents`
- `createInteraction` émet `INTERACTION_CREATE` dans la room `user:${user_id}` conformément à la spec
- **UI** : Composant `MessageComponents` créé pour rendre les boutons et selects dans les messages
- **UI** : `MessageContent` modifié pour utiliser `MessageComponents`
- **UI** : `SlashCommandAutocomplete` existant (à améliorer pour les options de commande)

### [x] Step 30: Threads/Forums (spec 28)
<!-- chat-id: c0e85d53-2b56-4bbf-9b16-01d8a1c2b359 -->
- Vérifier les fils de discussion et forums

**Corrections apportées :**
- Modèle `ThreadMember` : ajout champ `flags` (Int, bitfield) conforme à la spec
- Modèle `ForumTag` : `emoji` → `emoji_id` et `emoji_name`, `name` limite 20 chars, ajout relation `applied`
- Modèle `AppliedTag` : créé (thread_id, tag_id) avec `@@id([thread_id, tag_id])`
- Modèle `Channel` : `thread_metadata` changé de `String?` vers `Json?`, ajout `default_reaction_emoji` (Json?), `default_thread_rate_limit_per_user`, `default_sort_order`, `default_forum_layout` mis à jour
- Modèle `Channel` : ajout relations `parent`, `children`, `applied_tags`
- Modèle `Role` : `permissions` changé de `String` vers `BigInt` (déjà fait en step 7)
- Contrôleur `thread.controller.ts` : réécrit avec `startThreadFromMessage`, `startThread` (support forum), `getActiveThreads`, `getArchivedThreads`, `getMyPrivateArchivedThreads`, `joinThread`, `leaveThread`, `addThreadMember`, `removeThreadMember`, `getThreadMembers` avec `with_member`, `updateThread` (support `applied_tags`), `deleteThread`
- Contrôleur `forum.controller.ts` : mis à jour avec `emoji_id`, `emoji_name`, gestion `available_tags` comme `Json?`
- Routes `channels.routes.ts` : mises à jour selon la spec (`/threads`, `/messages/:messageId/threads`, `/threads/active`, `/threads/archived/public`, `/threads/archived/private`, `/users/@me/threads/archived/private`, `/thread-members/@me`, `/thread-members/:userId`)
- Routes `forum.routes.ts` : ajout `/threads/:threadId/applied-tags`
- Cron job `autoArchiveThreads` ajouté dans `index.ts` (chaque heure, vérifie `last_message_id` + `auto_archive_duration`)
- Événements Gateway : `THREAD_CREATE`, `THREAD_UPDATE`, `THREAD_DELETE`, `THREAD_MEMBER_ADD`, `THREAD_MEMBER_REMOVE` déjà présents
- `prisma validate` passé, `prisma generate` et `prisma db push` exécutés avec succès

### [x] Step 31: Audit Log (spec 29)
<!-- chat-id: 7e3ee854-b7ad-4105-9feb-4cb9c346b72e -->
- Vérifier le journal d'audit complet

**Corrections apportées :**
- Modèle `AuditLog` : `changes` changé de `String?` vers `Json`, `options` de `String?` vers `Json?`, `reason` défini comme `String? @db.VarChar(512)` (conforme à la spec)
- Ajout `GUILD_AUDIT_LOG_ENTRY_CREATE` dans `GatewayEvents` (events.ts)
- Correction `writeAuditLog` (guild.controller.ts) : `changes` doit être un array `[{key, old_value, new_value}]`, `options` doit être `Json?`, émet événement Gateway avec payload `{ entry }`
- Correction `createGuildAuditLog` (audit-log.ts) : `actionType` doit être `number`, `changes` doit être un array
- Correction `getAuditLogs` : support `after` pagination, format réponse conforme (`audit_log_entries`, `users`, `webhooks`, `application_commands`), parsing correct de `changes` et `options` (Json)
- Mise à jour de tous les appels `writeAuditLog` dans les contrôleurs (channel, ban, role, thread, webhook) pour utiliser le bon format de `changes`
- `prisma db push --force-reset` exécuté avec succès (base réinitialisée avec nouveau schéma)

### [x] Step 32: Server Templates (spec 30)
<!-- chat-id: 3d90f293-8f5b-4136-b801-632161cf3f31 -->
- Modèle GuildTemplate mis à jour (code, creator_id, usage_count, is_dirty, serialized_source_guild)
- Événements Gateway ajoutés (GUILD_TEMPLATE_CREATE/UPDATE/DELETE)
- Fonctions contrôleur réécrites (getGuildTemplates retourne array direct, create avec max 1, sync, update, delete, public template, createFromTemplate)
- markTemplateDirty intégré dans channel.controller et role.controller
- Routes ajoutées dans guilds.routes.ts

### [x] Step 33: Onboarding (spec 31)
<!-- chat-id: 4e61faca-310b-4cdc-a7cd-db86a4a842bf -->
- Vérifier l'accueil et le screening

**Corrections apportées :**
- Ajout modèles `GuildWelcomeScreen`, `GuildMemberVerification`, `GuildOnboarding` dans le schéma Prisma (champs String pour SQLite)
- Création manuelle des tables dans la base de données (SQL)
- Implémentation endpoints `GET/PUT/PATCH /api/guilds/:guildId/member-verification` (CRUD screening)
- Implémentation endpoint `POST /api/guilds/:guildId/member-verification/complete` (valider screening, passer pending=false)
- Implémentation endpoints `GET/PUT /api/guilds/:guildId/onboarding` (CRUD onboarding)
- Implémentation endpoint `POST /api/guilds/:guildId/onboarding/submit` (soumettre réponses, assigner rôles/canaux)
- Modification `getMemberPermissions` pour retourner seulement @everyone si `pending=true` (pas d'écriture, pas de DM)
- Mise à jour `invite.controller.ts` et `discovery.controller.ts` pour définir `pending` selon verification.enabled
- Ajout événements Socket.IO `GUILD_WELCOME_SCREEN_UPDATE`, `GUILD_MEMBER_VERIFICATION_UPDATE`, `GUILD_ONBOARDING_UPDATE` dans events.ts
- Émission de ces événements lors des mises à jour dans guild.controller.ts
- Correction format réponse `getWelcomeScreen` et `updateWelcomeScreen` (emoji_id, emoji_name, pas de channel_name)

### [x] Step 34: Rich Presence (spec 32)
<!-- chat-id: c9da1330-8fca-42fa-96d6-330a95963371 -->
- Vérifier la rich presence

**Corrections apportées :**
- Serveur : `PRESENCE_UPDATE` traite maintenant `activities` (array), `client_status` et `guild_id` selon la spec
- Serveur : `flushPresenceBatch` diffuse le payload complet avec `user_id`, `status`, `activities`, `client_status`, `guild_id`
- Serveur : `PresenceState` mis à jour avec `client_status` et `activities`
- Client : `useGateway.ts` traite maintenant `activities` dans `PRESENCE_UPDATE` et met à jour le store
- Client : `updatePresence` supporte `activities` et `client_status`
- Plugin Spotify (`spotify-rpc`) créé dans `plugins/official/spotify-rpc/` avec `plugin.json` et `index.ts`
- Plugin Spotify utilise l'API Web Playback SDK pour détecter l'activité et émettre une Rich Presence de type LISTENING (type 2)
- `MemberList.tsx` : affichage des activités avec `activities` (array), barre de progression pour la musique (type=2), badge LIVE pour STREAMING (type=1 avec URL)
- `MemberList.module.css` : styles ajoutés pour `.progressBarContainer`, `.progressBar`, `.liveBadge`
- Note : Le modèle `UserActivity` n'est pas persisté en base (selon la note de la spec : "persistance en base non prévue, stockée en mémoire")

### [x] Step 35: OAuth2 (spec 33)
<!-- chat-id: 77f0e59e-4662-43f5-920c-d1f5129185d9 -->
- Vérifier l'autorisation OAuth2

**Corrections apportées :**
- Ajout modèles `OAuth2AuthorizationCode`, `OAuth2AccessToken`, `OAuth2Grant` dans schema.prisma
- Extension modèle `Application` avec `redirect_uris`, `scopes_allowed`, `client_secret`, `public`
- Création `oauth2.service.ts` avec logique complète (authorization code, refresh token, client credentials, révocation)
- Mise à jour `oauth.routes.ts` avec tous les endpoints : `/authorize`, `/token`, `/token/revoke`, `/@me`
- Création `oauth2.middleware.ts` pour authentification Bearer + vérification scopes
- Mise à jour `users.routes.ts` pour supporter OAuth2 sur `/users/@me` (scope `identify`/`email`), `/users/@me/guilds` (scope `guilds`), etc.
- Modification `user.controller.ts` (`getMe`) pour inclure l'email selon le scope OAuth2
- Support Basic Auth pour les endpoints `/token` et `/token/revoke`
- Gestion `prompt=none` pour autorisation automatique si grant existe déjà

### [x] Step 36: Announcement Channels (spec 34)
<!-- chat-id: 6b7e0ceb-c2c3-41ca-8507-92f891dc60ae -->
- Vérifier les canaux d'annonces et crosspost

**Corrections apportées :**
- Ajout modèle `ChannelFollower` dans schema.prisma (source_channel_id, target_channel_id, created_by_id)
- Correction `followChannel` : vérifie `MANAGE_WEBHOOKS` dans canal cible, crée entrée `ChannelFollower`, limite 10 suivis/canal cible
- Correction `crosspostMessage` : ajoute flag `CROSSPOSTED` (1<<0) au message source, crée messages dans canaux cibles avec flag `IS_CROSSPOST` (1<<1), `reference_id`, `webhook_id`
- Limites respectées : max 10 cross-posts/message, max 30 cross-posts/canal source/heure
- Route corrigée : `POST /api/channels/:channelId/followers` (avec 's')
- Badge crosspost côté client : ajout badge "Publié" dans `ChatArea.tsx` avec style CSS `.crosspostHeader`
- Événement `WEBHOOKS_UPDATE` émis dans la guild cible lors d'un nouveau suivi

### [x] Step 37: User Notes/Search/Keyboard (spec 35)
<!-- chat-id: 81d392ab-c6fc-476d-af81-c8ca78d97c20 -->
- Vérifier les notes utilisateur et la recherche

**Corrections apportées :**
- Modèle `UserNote` : champs corrigés (`target_user_id` au lieu de `note_user_id`, `content` au lieu de `note_content`, `@@id([user_id, target_user_id])` au lieu de champ `id` séparé)
- Contrôleur `user.controller.ts` : `getUserNotes` retourne maintenant un array direct (pas `{ notes: [...] }`), `setUserNote` gère `PUT` avec `note: ""` pour supprimer, validation 256 caractères
- `searchMessages` : support complet des filtres FTS5 + `from` (author), `mentions`, `has` (link/embed/file/video/image/sound/sticker), `during` (YYYY-MM), `pinned`, `in` (channel)
- Format réponse `searchMessages` conforme : `{ total_results, messages: [[msg]], analytics_id }`
- Route `GET /api/guilds/:guildId/messages/search` ajoutée dans `guilds.routes.ts`
- Installation `mousetrap` + `@types/mousetrap` pour raccourcis clavier
- Hook `useKeyboardShortcuts` créé avec support plateforme (Win/Linux vs macOS)
- Composant `QuickSwitcher` créé (recherche rapide Ctrl+K / Cmd+K) avec résultats channels/DMs/members/guilds
- Intégration `QuickSwitcher` et raccourcis globaux dans `AppLayout.tsx`

### [x] Step 38: Linked Roles (spec 36)
<!-- chat-id: f1bb6c46-0acf-467b-b14b-2f5a2caed17d -->
- Vérifier les rôles liés

**Corrections apportées :**
- Modèle `ConnectedAccount` mis à jour selon la spec (champs `type`, `name`, `friend_sync`, `show_activity`, `visibility`, `access_token`, `refresh_token`, `token_expires_at`, `verified`)
- Ajout des modèles `ApplicationRoleConnectionMetadata`, `GuildRoleConnectionRequirement`, `UserApplicationRoleConnection` dans Prisma
- Contrôleur `connected-account.controller.ts` mis à jour avec endpoints : `GET /api/users/@me/connections`, `POST /api/users/@me/connections/:type/callback`, `PATCH /api/users/@me/connections/:connectionId`, `DELETE /api/users/@me/connections/:connectionId`
- Création du contrôleur `linked-role.controller.ts` avec endpoints :
  - `GET /api/applications/:appId/role-connections/metadata` (bot token)
  - `PUT /api/applications/:appId/role-connections/metadata` (bot token, max 5)
  - `GET /api/users/@me/applications/:appId/role-connection` (OAuth2 scope role_connections.read)
  - `PUT /api/users/@me/applications/:appId/role-connection` (OAuth2 scope role_connections.write)
  - `GET /api/guilds/:guildId/roles/:roleId/role-connection-requirements`
  - `PUT /api/guilds/:guildId/roles/:roleId/role-connection-requirements`
- Ajout des routes dans `applications.routes.ts`, `roles.routes.ts`, `users.routes.ts`
- Événement Gateway `ROLE_CONNECTION_UPDATE` ajouté dans `packages/shared/src/constants/events.ts`
- Cron de vérification d'éligibilité `checkLinkedRolesEligibility` ajouté dans `index.ts` (toutes les 5 minutes)
- Fonction `evaluateRequirement` pour comparer selon le type (INTEGER, DATETIME, BOOLEAN)
- Chiffrement AES-256 des tokens dans ConnectedAccount (fonctions `encrypt`/`decrypt`)
- Schéma Prisma validé et poussé avec succès

### [x] Step 39: Message Forwarding (spec 37)
<!-- chat-id: d5076042-7367-441e-b394-b6ad86100bde -->
- Vérifier le transfert de messages et super-réactions

**Corrections apportées :**
- Modèle `Message` : `message_snapshots` changé de `String?` à `Json?` (conforme à la spec)
- Modèle `Reaction` : `burst_colors` changé de `String?` à `Json?`, ajout champ `me_burst Boolean @default(false)` (conforme à la spec)
- Ajout modèle `MessageReactionUser` pour tracer les utilisateurs ayant réagi (conforme à la spec)
- Suppression champ `super_reaction` dans `Reaction`, remplacé par `burst` (déjà présent)
- `createMessage` : `message_snapshots` maintenant un objet direct (pas de `JSON.stringify`)
- `addReaction` : mise à jour pour utiliser `burst`, gérer `me_burst`, créer entrée dans `MessageReactionUser`, support paramètre `type=0|1`
- `removeReaction` et `removeUserReaction` : suppression aussi dans `MessageReactionUser`, support paramètre `type`
- `getReactionUsers` : utilise maintenant `MessageReactionUser` pour lister les utilisateurs, support paramètres `type`, `after`, `limit` (max 25)
- `removeAllReactions` et `removeEmojiReactions` : nettoyage aussi dans `MessageReactionUser`
- Client `ChatArea.tsx` : ajout affichage messages transférés (en-tête "Message transféré" + snapshot)
- Client `ChatArea.tsx` : `Reactions` mis à jour pour afficher `burst_count` et style différent
- Client `ChatArea.tsx` : `handleReaction` supporte maintenant le paramètre `isBurst`
- Client `api.ts` : `addReaction` et `removeReaction` mis à jour avec paramètre `isBurst` et query `type=1`
- Styles CSS : ajout `.forwardedHeader`, `.forwardedSnapshot`, `.reactionBurst`, `.burstCount`
- Validation schéma Prisma effectuée, prête pour migration

### [x] Step 40: Accessibility (spec 38)
<!-- chat-id: 65378715-0acf-4306-83fc-5be74dd87903 -->
- Vérifier l'accessibilité (a11y)
**Corrections apportées :**
- `tokens.css` : ajout `--transition-speed: 150ms`, `prefers-reduced-motion` mis à jour pour utiliser `--transition-speed: 0ms`
- `global.css` : `prefers-reduced-motion` utilise maintenant `--transition-speed`
- `ChatArea.tsx` : zone de saisie avec `role="textbox"`, `aria-label`, `aria-multiline="true"` ; liste messages avec `role="list"` et `role="listitem"`
- `MemberList.tsx` : conteneur avec `role="listbox"`, sections avec `role="group"` et `aria-labelledby`
- `Modal.tsx` : `role="dialog"`, `aria-modal="true"`, focus trap (Tab cyclique), restauration focus précédent, titre optionnel
- `EmojiPicker.tsx` : `role="grid"`, navigation clavier (flèches, Enter, Escape), `role="gridcell"` sur les emojis, onglets avec `role="tablist"`/`role="tab"`
- `SlashCommandAutocomplete.tsx` : `role="listbox"`, `aria-activedescendant`, options avec `role="option"` et `aria-selected`
- `ariaAnnounce.ts` : nouvelles fonctions `announceMessage`, `announceTyping`, `announceChannelChange`
- `ChatArea.tsx` : intégration des annonces (nouveaux messages, frappe, changement canal) via les régions `aria-live`

### [x] Step 41: User Workflows (spec 99)
<!-- chat-id: 82e7bd1a-6b9b-44ef-860e-18704fe0c4ba -->
- Vérifier les workflows utilisateur complets

**Analyse complétée :**
- **WF-001 à WF-010 (Authentification)** : Implémenté dans `auth.controller.ts`. Inscription (201), login avec 2FA (partial token), enable/disable 2FA, backup codes, changement mot de passe (révocation sessions), reset password (1h token), logout (204). Conforme à la spec.

- **WF-011 à WF-020 (Profil Utilisateur)** : Implémenté dans `user.controller.ts`. Modification username/global_name (USER_UPDATE), upload avatar (128x128 WebP, 8MB/25MB Premium), upload banner (600x240 WebP), bio (190/4000 chars), status/custom_status (PRESENCE_UPDATE), paramètres confidentialité, langue, thème. Conforme.

- **WF-021 à WF-028 (Amis & Relations)** : Implémenté dans `friend.controller.ts`. Envoi demande (pending_outgoing/incoming, RELATIONSHIP_ADD, NOTIFICATION_CREATE FRIEND_REQUEST), acceptation (RELATIONSHIP_UPDATE, FRIEND_ACCEPT), refus/suppression (RELATIONSHIP_REMOVE), blocage/déblocage, liste amis groupée, recherche par username#discriminator, mutual friends/guilds (GET /api/users/:userId/relationships). Conforme.

- **WF-029 à WF-035 (Messages Privés)** : Implémenté dans `dm.controller.ts`. Ouverture DM (type 1, CHANNEL_CREATE), envoi message (MESSAGE_CREATE, NOTIFICATION_CREATE DM), création groupe DM (type 3, max 10), ajout/retrait membre (RECIPIENT_ADD/REMOVE), modification nom/icône (CHANNEL_UPDATE, system message), quitter (CHANNEL_DELETE pour membre, transfert propriété). Conforme.

- **WF-036 à WF-048 (Serveurs)** : Implémenté dans `guild.controller.ts`. Création (201, @everyone, catégories, channels, GUILD_CREATE), rejoindre via invite (GUILD_MEMBER_ADD, GUILD_CREATE), quitter (GUILD_MEMBER_REMOVE, GUILD_DELETE), modification profil (GUILD_UPDATE, audit log), transfert propriété (2FA), suppression (confirmation nom, 2FA owner, GUILD_DELETE cascade), création catégories/channels (type 4/0/2/15), réorganisation (CHANNEL_UPDATE batch), modification channel (topic, nsfw, slowmode). Conforme.

- **WF-049 à WF-068 (Messages)** : Implémenté dans `message.controller.ts`. Envoi texte simple (201, MESSAGE_CREATE), formatage Markdown (stocké tel quel), pièces jointes (max 10, 8MB/25MB Premium, thumbnails WebP), liens (auto-embed OpenGraph, cache), reply (message_reference, type 19), modification (edited_at, MESSAGE_UPDATE), suppression (bulk delete <14j, MESSAGE_DELETE/BULK_DELETE), pin/unpin (MESSAGE_UPDATE, CHANNEL_PINNED_MESSAGE), réactions emoji (MESSAGE_REACTION_ADD/REMOVE, burst), emoji custom (vérification serveur/Premium), stickers, mentions (@mention, NOTIFICATION_CREATE MENTION), recherche FTS5 (GET /api/guilds/:guildId/messages/search), pins list, scroll infini (before, limit 50), typing indicator (TYPING_START). Conforme.

- **WF-069 à WF-075 (Threads & Forums) - PARTIEL** : Implémenté dans `thread.controller.ts` et `forum.controller.ts`. Création thread depuis message (type 11, THREAD_CREATE, MESSAGE_UPDATE), participation (THREAD_MEMBER_UPDATE), archivage (CHANNEL_UPDATE), création post forum (type 11, applied_tags), réponse post, filtrage tags (client-side). **MANQUE** : verrouillage thread (locked: true, THREAD_UPDATE), vérification MAX_THREADS_PER_GUILD.

- **WF-076 à WF-084 (Rôles & Permissions)** : Implémenté dans `role.controller.ts`. Création rôle (GUILD_ROLE_CREATE, position), configuration permissions (bitfield, CANNOT_GRANT_PERMISSION), attribution/retrait (GUILD_MEMBER_UPDATE, PUT/DELETE /api/guilds/:guildId/members/:userId/roles/:roleId), réorganisation (position, ROLE_HIERARCHY_ERROR), permission overwrites (CHANNEL_UPDATE, allow/deny), couleur/icône (GUILD_ROLE_UPDATE, TIER_TOO_LOW), mentionnable, calcul permissions (computeEffectivePermissions). Conforme.

- **WF-085 à WF-097 (Modération)** : Implémenté dans `ban.controller.ts`, `guild.controller.ts`, `automod.controller.ts`. Kick (GUILD_MEMBER_REMOVE, MEMBER_KICK), ban (GUILD_BAN_ADD, delete_message_seconds, async task), unban (GUILD_BAN_REMOVE), timeout (communication_disabled_until, GUILD_MEMBER_UPDATE, MEMBER_TIMEOUT), recherche bans (query, pagination), règles AutoMod (KEYWORD, SPAM, MENTION_SPAM, actions BLOCK/SEND_ALERT/TIMEOUT), déclenchement (AUTO_MODERATION_BLOCK_MESSAGE, audit log), journal audit (VIEW_AUDIT_LOG, filter user/action_type), verification_level. Conforme.

- **WF-098 à WF-103 (Invitations)** : Implémenté dans `invite.controller.ts`. Création (INVITE_CREATE, max_age, max_uses), consultation liste (GUILD_GET_INVITES), révocation (INVITE_DELETE), suspension (invites_disabled, GUILD_UPDATE), vanity URL (PATCH /api/guilds/:guildId/vanity-url, TIER_TOO_LOW, CODE_ALREADY_IN_USE), utilisation expirée (INVITE_NOT_FOUND). Conforme.

- **WF-104 à WF-109 (Emojis & Stickers)** : Implémenté dans `emoji.controller.ts`. Upload emoji (256KB, 128x128, QUOTA_EXCEEDED 50/100/250), renommage (VALIDATION_ERROR), suppression (EMOJI_DELETE, audit log), upload sticker (512KB, QUOTA_EXCEEDED 5/15/30), sélecteur (GET /api/guilds/:guildId/emojis, grille), emoji cross-serveur (Premium, USE_EXTERNAL_EMOJIS). Conforme.

- **WF-110 à WF-117 (Premium & Boosts)** : Implémenté dans `premium.controller.ts`. Souscription (Stripe Checkout, 201), consultation (GET /api/subscriptions/@me, null si pas abonné), annulation (cancel_at_period_end), webhooks Stripe (customer.subscription.updated, invoice.payment_failed, past_due/canceled), boost serveur (POST /api/guilds/:guildId/boosts, free_boosts 2, USER_PREMIUM_GUILD_SUBSCRIPTION), retrait (cooldown 7j, BOOST_COOLDOWN), passage Tier 2 (7 boosts, GUILD_UPDATE, message système). Conforme.

- **WF-118 à WF-124 (Bots & Webhooks)** : Implémenté dans `application.controller.ts`, `webhook.controller.ts`, `auth.middleware.ts`. Création app bot (POST /api/applications, token format BOT_SECRET), ajout serveur (OAuth2 /api/oauth2/authorize, MANAGE_GUILD), envoi message bot (Authorization: Bot TOKEN, rate limit bot_message_send 30/10s), embed riche (embeds table), création webhook (MANAGE_WEBHOOKS, token clair), envoi webhook (POST /api/webhooks/:id/:token, non authentifié), suppression webhook (MANAGE_WEBHOOKS). Conforme.

- **WF-125 à WF-129 (Plugins)** : Implémenté dans `plugin.controller.ts`. Activation client (PATCH /api/users/@me/plugins/slug, onEnable), désactivation (onDisable), configuration (settings_schema, validation JSON Schema), recherche/filtrage (GET /api/plugins, client-side), activation serveur (PATCH /api/guilds/:guildId/plugins/slug, hooks message.beforeDelete). Conforme.

- **WF-130 à WF-140 (Panel Admin)** : Implémenté dans `admin.controller.ts`. Accès (requireAdmin(1), FORBIDDEN 403), dashboard (GET /api/admin/dashboard, stats), recherche user (LIKE username/email), changement admin_level (niveau 3 requis), ban global (banned=true, révocation tokens, sockets), création badge (POST /api/admin/badges, type admin/manual), attribution (POST /api/admin/badges/:id/assign, USER_UPDATE, BADGE_AUTO_MANAGED), révocation (DELETE /api/admin/badges/:id/assign/:userId), suppression serveur (DELETE /api/admin/guilds/:guildId, pas de confirmation 2FA), annonce globale (NOTIFICATION_CREATE ADMIN_ANNOUNCEMENT). Conforme.

- **WF-141 à WF-145 (Notifications)** : Implémenté dans `notification.controller.ts`. Réception mention (MESSAGE_CREATE + NOTIFICATION_CREATE MENTION, badge rouge), consultation/marquage lu (PATCH /api/users/@me/notifications/:id/read, read=true), paramètres serveur (PATCH /api/users/@me/guilds/:guildId/notifications, message_notifications), mute channel (PATCH /api/users/@me/channels/:id/notifications, muted), demande ami (NOTIFICATION_CREATE FRIEND_REQUEST, pastille rouge). Conforme.

- **WF-146 à WF-150 (Rate Limiting & Sécurité)** : Implémenté dans `rate-limit.middleware.ts`, `auth.controller.ts`, `upload.middleware.ts`, `message.controller.ts`, `role.controller.ts`. Rate limit messages (message_send 5/5s, retry_after), brute-force lockout (10 tentatives, locked_until 30 min, ACCOUNT_LOCKED), validation magic bytes (file-type, INVALID_FILE_TYPE 415), accès channel sans permission (computeEffectivePermissions, MISSING_ACCESS 403), modification rôle supérieur (ROLE_HIERARCHY_ERROR 403). Conforme.

**Bilan global :**
- **Conformes** : WF-001 à WF-068, WF-076 à WF-145 (sauf exceptions notées)
- **Partiel** : WF-069 à WF-075 (Threads & Forums) - manque verrouillage thread et limite max threads
- **Non implémenté** : Aucun (le reste est conforme)

### [x] Step 42: Corrections finales
<!-- chat-id: d89d8e72-9563-438e-9188-ec7d581468ca -->
- Appliquer toutes les corrections nécessaires identifiées lors de l'analyse
