# OpenCord - Workflows Utilisateurs (1-50)

## AUTHENTIFICATION (1-10)

### WF-001 — Inscription d'un nouveau compte
**Acteur:** Visiteur
**Préconditions:** L'email n'est pas déjà utilisé dans la base de données.
**Étapes:**
1. L'utilisateur soumet email, username, password, et date_of_birth via `POST /api/auth/register`.
2. Le système vérifie l'unicité dans la table `users`.
3. Assignation d'un `discriminator` et hachage du mot de passe (bcrypt).
4. Création dans `users` et génération des JWT et refresh tokens (stockés dans `refresh_tokens`).
**Résultat attendu:** Code 201 Created, tokens retournés.
**Cas d'erreur:**
- `EMAIL_TAKEN` (409) si l'email est déjà enregistré.
- `VALIDATION_ERROR` (422) si format Zod invalide.

### WF-002 — Connexion avec email/mot de passe
**Acteur:** Utilisateur
**Préconditions:** Le compte existe, 2FA désactivée.
**Étapes:**
1. L'utilisateur envoie ses identifiants via `POST /api/auth/login`.
2. Recherche dans `users` et comparaison bcrypt.
3. Le système génère les tokens et enregistre la session dans `refresh_tokens` avec IP et User-Agent.
4. Émission Socket.IO `READY` lors de la connexion WebSocket.
**Résultat attendu:** Code 200 OK, accès autorisé.
**Cas d'erreur:**
- `INVALID_CREDENTIALS` (401) si email/mot de passe incorrect.

### WF-003 — Connexion avec 2FA activé
**Acteur:** Utilisateur
**Préconditions:** Le compte existe et `two_factor_enabled = true`.
**Étapes:**
1. Envoi identifiants via `POST /api/auth/login`.
2. Le système retourne 200 OK avec `two_factor_required: true` et un `partial_token`.
3. L'utilisateur saisit son code TOTP via `POST /api/auth/2fa/login` avec le `partial_token`.
4. Le backend vérifie via `otplib` et retourne les tokens complets.
**Résultat attendu:** Code 200 OK après l'étape 3.
**Cas d'erreur:**
- `INVALID_2FA_CODE` (401) si le code TOTP est erroné.

### WF-004 — Activation de la 2FA (Google Authenticator)
**Acteur:** Utilisateur connecté
**Préconditions:** Session active, 2FA non activée.
**Étapes:**
1. Appel `POST /api/auth/2fa/enable` avec mot de passe.
2. Le serveur génère un secret TOTP et retourne le QR code en base64 + les `two_factor_backup_codes`.
3. L'utilisateur valide l'activation via `POST /api/auth/2fa/verify` avec le code de son app.
4. `two_factor_enabled` passe à `true` dans la table `users`.
**Résultat attendu:** 200 OK, 2FA activée.
**Cas d'erreur:**
- `INVALID_CREDENTIALS` (401) au step 1 si mot de passe erroné.

### WF-005 — Désactivation de la 2FA
**Acteur:** Utilisateur connecté
**Préconditions:** 2FA activée.
**Étapes:**
1. L'utilisateur fait un `DELETE /api/auth/2fa/disable` en fournissant un code 2FA valide.
2. Le système passe `two_factor_enabled` à `false` dans `users` et efface `two_factor_secret`.
**Résultat attendu:** 200 OK.
**Cas d'erreur:**
- `INVALID_2FA_CODE` (401) si le code est faux.

### WF-006 — Utilisation d'un code de secours 2FA
**Acteur:** Utilisateur
**Préconditions:** Compte existant avec 2FA et codes de secours non épuisés.
**Étapes:**
1. Connexion via `POST /api/auth/login` retourne un `partial_token`.
2. Appel `POST /api/auth/2fa/login` en passant un code de secours au lieu du code TOTP.
3. Le serveur compare (bcrypt) avec `two_factor_backup_codes` dans `users`.
4. Le code est retiré de la liste.
**Résultat attendu:** 200 OK avec tokens d'accès complets.
**Cas d'erreur:**
- `INVALID_BACKUP_CODE` (401) si code erroné ou déjà utilisé.

### WF-007 — Changement de mot de passe
**Acteur:** Utilisateur connecté
**Préconditions:** Connaît l'ancien mot de passe.
**Étapes:**
1. Soumission `PATCH /api/users/@me/password` avec ancien et nouveau mot de passe.
2. Le système vérifie l'ancien mot de passe.
3. Hashage bcrypt du nouveau, mise à jour dans `users`.
4. Toutes les autres sessions (`refresh_tokens`) sont révoquées sauf la courante.
**Résultat attendu:** 200 OK, mot de passe modifié.
**Cas d'erreur:**
- `INVALID_CREDENTIALS` (401) si l'ancien mot de passe est faux.

### WF-008 — Réinitialisation de mot de passe oublié
**Acteur:** Visiteur
**Préconditions:** L'email existe dans le système.
**Étapes:**
1. Envoi de l'email via `POST /api/auth/forgot-password`.
2. Le système génère un `password_reset_token` dans `users` et simule l'envoi de mail.
3. L'utilisateur utilise le token via `POST /api/auth/reset-password` avec le nouveau mot de passe.
**Résultat attendu:** 200 OK, mot de passe changé.
**Cas d'erreur:**
- `TOKEN_EXPIRED` (401) si le `password_reset_expires` est dépassé.

### WF-009 — Déconnexion
**Acteur:** Utilisateur connecté
**Préconditions:** JWT valide fourni.
**Étapes:**
1. Envoi du token de rafraîchissement via `POST /api/auth/logout`.
2. Le système met `is_revoked = true` dans la table `refresh_tokens`.
3. Le socket Socket.IO est déconnecté manuellement côté client.
**Résultat attendu:** 204 No Content.
**Cas d'erreur:**
- `TOKEN_REVOKED` (401) si déjà déconnecté.

### WF-010 — Suppression de compte
**Acteur:** Utilisateur connecté
**Préconditions:** Ne doit pas être propriétaire d'un serveur unique.
**Étapes:**
1. Envoi `DELETE /api/users/@me` avec le mot de passe actuel.
2. Le système vérifie le mot de passe.
3. Pseudonymisation des messages et suppression du profil dans `users`.
4. Émission `GUILD_MEMBER_REMOVE` sur tous les serveurs.
**Résultat attendu:** 204 No Content.
**Cas d'erreur:**
- `MUST_TRANSFER_GUILD_OWNERSHIP` (400) s'il possède un serveur.

## PROFIL UTILISATEUR (11-20)

### WF-011 — Modification du nom d'affichage
**Acteur:** Utilisateur connecté
**Préconditions:** Aucune.
**Étapes:**
1. Envoi `PATCH /api/users/@me` avec `{ "global_name": "NouveauNom" }` (ou modif du `username`).
2. Mise à jour de la table `users`.
3. Émission Socket.IO `USER_UPDATE` aux amis et membres de serveurs communs.
**Résultat attendu:** 200 OK, profil mis à jour.
**Cas d'erreur:**
- `VALIDATION_ERROR` (422) si nom trop long.

### WF-012 — Changement d'avatar
**Acteur:** Utilisateur connecté
**Préconditions:** Fichier image max 8MB (10MB si Premium).
**Étapes:**
1. Upload multipart via `PATCH /api/users/@me/avatar`.
2. Le serveur valide avec `multer` et traite avec `sharp` (redimensionnement à 128x128 WebP).
3. Sauvegarde dans `uploads/avatars/`.
4. Mise à jour de `users.avatar`.
**Résultat attendu:** 200 OK avec le nouveau chemin `/files/avatars/...`.
**Cas d'erreur:**
- `FILE_TOO_LARGE` (413) si fichier > limite.
- `INVALID_FILE_TYPE` (415) si format non autorisé.

### WF-013 — Changement de bannière de profil
**Acteur:** Utilisateur connecté
**Préconditions:** Fichier image valide.
**Étapes:**
1. Upload multipart via `PATCH /api/users/@me/banner`.
2. Le serveur utilise `sharp` pour générer un format WebP 600x240.
3. Mise à jour de `users.banner`.
**Résultat attendu:** 200 OK.
**Cas d'erreur:**
- `FILE_TOO_LARGE` (413).

### WF-014 — Modification de la bio
**Acteur:** Utilisateur connecté
**Préconditions:** Bio max 190 caractères (4000 si Premium).
**Étapes:**
1. Appel `PATCH /api/users/@me` avec `{ "bio": "Hello World" }`.
2. Mise à jour en base de données.
**Résultat attendu:** 200 OK.
**Cas d'erreur:**
- `VALIDATION_ERROR` (422) si la limite de caractères est dépassée (sans Premium).

### WF-015 — Changement de statut (en ligne/absent/ne pas déranger/invisible)
**Acteur:** Utilisateur connecté
**Préconditions:** Connecté via WebSocket.
**Étapes:**
1. Appel `PATCH /api/users/@me` avec `{ "status": "dnd" }`.
2. Enregistrement dans `users.status`.
3. Le serveur émet `PRESENCE_UPDATE` via Socket.IO à tous les canaux pertinents.
**Résultat attendu:** 200 OK, la pastille change en rouge côté client.
**Cas d'erreur:**
- `VALIDATION_ERROR` (422) si statut invalide.

### WF-016 — Définition d'un statut personnalisé avec emoji
**Acteur:** Utilisateur connecté
**Préconditions:** Emoji disponible.
**Étapes:**
1. Appel `PATCH /api/users/@me` avec `custom_status_text` et `custom_status_emoji`.
2. Sauvegarde en base de données.
3. Diffusion de `PRESENCE_UPDATE` via Socket.IO.
**Résultat attendu:** 200 OK.
**Cas d'erreur:**
- `VALIDATION_ERROR` (422) texte > 128 caractères.

### WF-017 — Consultation du profil d'un autre utilisateur
**Acteur:** Utilisateur connecté
**Préconditions:** Doit partager un serveur ou être ami.
**Étapes:**
1. Clic sur un avatar déclenche `GET /api/users/:userId`.
2. Le serveur vérifie les `mutual_guilds` ou `mutual_friends`.
3. Retourne les infos publiques (avatar, bio, badges, etc.) sans les données privées (email).
**Résultat attendu:** 200 OK avec JSON du profil.
**Cas d'erreur:**
- `USER_NOT_FOUND` (404).

### WF-018 — Modification des paramètres de confidentialité
**Acteur:** Utilisateur connecté
**Préconditions:** Aucune.
**Étapes:**
1. Appel `PATCH /api/users/@me` avec `{ "explicit_content_filter": 1, "allow_dms_from": 1 }`.
2. Mise à jour en base.
**Résultat attendu:** 200 OK.
**Cas d'erreur:**
- `VALIDATION_ERROR` (422) si valeurs hors limites d'Enum.

### WF-019 — Changement de langue (FR/EN)
**Acteur:** Utilisateur connecté
**Préconditions:** Aucune.
**Étapes:**
1. Choix de la langue dans les paramètres, appel `PATCH /api/users/@me` avec `{ "locale": "en" }`.
2. Le client met à jour `i18next`.
3. L'interface se traduit instantanément.
**Résultat attendu:** 200 OK.
**Cas d'erreur:**
- `VALIDATION_ERROR` (422) si langue non supportée.

### WF-020 — Modification du thème/apparence
**Acteur:** Utilisateur connecté
**Préconditions:** Aucune.
**Étapes:**
1. Appel `PATCH /api/users/@me` avec `{ "theme": "dark" }`.
2. Mise à jour en base et rafraîchissement local des variables CSS (Tokens).
**Résultat attendu:** 200 OK.
**Cas d'erreur:**
- `VALIDATION_ERROR` (422).

## AMIS & RELATIONS (21-28)

### WF-021 — Envoi d'une demande d'ami
**Acteur:** Utilisateur A
**Préconditions:** Cible non bloquée.
**Étapes:**
1. Appel `POST /api/users/@me/relationships` avec `{ "username": "Bob", "discriminator": "1337" }`.
2. Création de `pending_outgoing` pour A et `pending_incoming` pour B dans `friends`.
3. Émission Socket.IO `RELATIONSHIP_ADD` (pour A) et `NOTIFICATION_CREATE` de type `FRIEND_REQUEST` (pour B).
**Résultat attendu:** 201 Created.
**Cas d'erreur:**
- `USER_NOT_FOUND` (404) si utilisateur inexistant.
- `BLOCKED_BY_USER` (403) si A est bloqué par B.

### WF-022 — Acceptation d'une demande d'ami
**Acteur:** Utilisateur B
**Préconditions:** Demande en attente de A.
**Étapes:**
1. Appel `PUT /api/users/@me/relationships/:userId_A`.
2. Les types de relation passent de `pending` à `friend` pour A et B.
3. Émission `RELATIONSHIP_UPDATE` aux deux.
4. Création `NOTIFICATION_CREATE` de type `FRIEND_ACCEPT` pour A.
**Résultat attendu:** 200 OK.
**Cas d'erreur:**
- `NO_PENDING_REQUEST` (404) si aucune demande.

### WF-023 — Refus d'une demande d'ami
**Acteur:** Utilisateur B
**Préconditions:** Demande en attente.
**Étapes:**
1. Appel `DELETE /api/users/@me/relationships/:userId_A`.
2. Suppression des entrées dans `friends`.
3. Émission `RELATIONSHIP_REMOVE` aux deux via Socket.IO.
**Résultat attendu:** 204 No Content.
**Cas d'erreur:**
- `RELATIONSHIP_NOT_FOUND` (404).

### WF-024 — Suppression d'un ami
**Acteur:** Utilisateur A
**Préconditions:** A et B sont amis.
**Étapes:**
1. Appel `DELETE /api/users/@me/relationships/:userId_B`.
2. Suppression des enregistrements dans la table `friends`.
3. Émission `RELATIONSHIP_REMOVE`.
**Résultat attendu:** 204 No Content.
**Cas d'erreur:**
- `NOT_FRIENDS` (400) si non amis.

### WF-025 — Blocage d'un utilisateur
**Acteur:** Utilisateur A
**Préconditions:** Aucune.
**Étapes:**
1. Appel `PUT /api/users/@me/relationships/:userId_B` avec `type=blocked`.
2. Si A et B étaient amis, suppression, puis création d'une entrée `blocked` pour A vers B.
3. B est retiré de la liste d'amis visible de A (via Socket).
**Résultat attendu:** 200 OK.
**Cas d'erreur:**
- `USER_NOT_FOUND` (404).

### WF-026 — Déblocage d'un utilisateur
**Acteur:** Utilisateur A
**Préconditions:** A a bloqué B.
**Étapes:**
1. Appel `DELETE /api/users/@me/relationships/:userId_B`.
2. L'entrée `blocked` est supprimée de `friends`.
3. Émission Socket.IO `RELATIONSHIP_REMOVE`.
**Résultat attendu:** 204 No Content.
**Cas d'erreur:**
- `NOT_BLOCKED` (400) si B n'était pas bloqué.

### WF-027 — Consultation de la liste d'amis
**Acteur:** Utilisateur connecté
**Préconditions:** Aucune.
**Étapes:**
1. Appel `GET /api/users/@me/relationships`.
2. Le serveur retourne un JSON groupant les amis par statuts (online, offline), en attente et bloqués.
**Résultat attendu:** 200 OK, JSON `Relationship[]`.
**Cas d'erreur:**
- Aucun spécifique.

### WF-028 — Recherche d'un utilisateur pour ajouter en ami
**Acteur:** Utilisateur connecté
**Préconditions:** La chaîne saisie contient le username et le discriminator.
**Étapes:**
1. Saisie dans le champ côté client de "Bob#1337".
2. Clic sur "Envoyer la demande d'ami" (équivalent au WF-021).
**Résultat attendu:** Demande envoyée avec succès.
**Cas d'erreur:**
- `FORMAT_ERROR` (400) si l'utilisateur n'inclut pas `#`.

## MESSAGES PRIVÉS (29-35)

### WF-029 — Ouverture d'un DM avec un ami
**Acteur:** Utilisateur A
**Préconditions:** A et B ne sont pas bloqués.
**Étapes:**
1. Appel `POST /api/users/@me/channels` avec `{ "recipient_id": "B_ID" }`.
2. Vérification s'il existe déjà un canal DM (`type=1`) entre A et B.
3. Si oui, retourne le `dm_channel` existant. Si non, création en base (`dm_channels` et `dm_members`).
4. Émission `CHANNEL_CREATE`.
**Résultat attendu:** 200 OK (existant) ou 201 Created (nouveau).
**Cas d'erreur:**
- `RECIPIENT_BLOCKED` (403) si l'un a bloqué l'autre.

### WF-030 — Envoi d'un message privé
**Acteur:** Utilisateur A
**Préconditions:** DM Channel existant avec B.
**Étapes:**
1. Appel `POST /api/channels/:channelId/messages` avec `content`.
2. Vérification des droits et stockage dans `messages`.
3. Émission Socket.IO `MESSAGE_CREATE` vers `channel:DM_ID`.
4. Si B n'a pas le channel visible (fermé), émission `NOTIFICATION_CREATE` (type `DM`) vers B.
**Résultat attendu:** 201 Created.
**Cas d'erreur:**
- `RATE_LIMITED` (429) bucket `message_send`.

### WF-031 — Création d'un groupe DM
**Acteur:** Utilisateur A
**Préconditions:** Utilisateurs B et C disponibles.
**Étapes:**
1. Appel `POST /api/users/@me/channels` avec plusieurs `recipient_ids`.
2. Création d'un `dm_channel` de `type=3`.
3. Insertion de A, B et C dans `dm_members`.
4. Émission Socket.IO `CHANNEL_CREATE` pour tous.
**Résultat attendu:** 201 Created.
**Cas d'erreur:**
- `MAX_GROUP_SIZE_REACHED` (400) si > 10 membres.

### WF-032 — Ajout d'un membre à un groupe DM
**Acteur:** Utilisateur A (déjà membre du groupe)
**Préconditions:** Groupe non plein.
**Étapes:**
1. Appel `POST /api/channels/:channelId/recipients/:userId_D`.
2. Ajout de D dans `dm_members`.
3. Un message système de type `RECIPIENT_ADD` est inséré dans `messages`.
4. Émission `MESSAGE_CREATE` et `CHANNEL_UPDATE` à tous.
**Résultat attendu:** 200 OK.
**Cas d'erreur:**
- `MAX_GROUP_SIZE_REACHED` (400) si groupe déjà à 10.

### WF-033 — Retrait d'un membre d'un groupe DM
**Acteur:** Utilisateur A (créateur du groupe)
**Préconditions:** Le membre est dans le groupe.
**Étapes:**
1. Appel `DELETE /api/channels/:channelId/recipients/:userId_B`.
2. Retrait de B de `dm_members`. B n'a plus accès.
3. Génération d'un message `RECIPIENT_REMOVE` en base.
4. Émission `CHANNEL_DELETE` pour B, et `MESSAGE_CREATE` pour le groupe.
**Résultat attendu:** 204 No Content.
**Cas d'erreur:**
- `MISSING_PERMISSIONS` (403) si A n'est pas `owner_id`.

### WF-034 — Quitter un groupe DM
**Acteur:** Utilisateur B
**Préconditions:** Fait partie du groupe.
**Étapes:**
1. Appel `DELETE /api/channels/:channelId/recipients/@me`.
2. B est retiré de `dm_members`.
3. Message système `RECIPIENT_REMOVE` généré.
4. B quitte la room Socket.IO.
**Résultat attendu:** 204 No Content.
**Cas d'erreur:**
- `NOT_A_MEMBER` (404) si B n'est pas dans le groupe.

### WF-035 — Modification du nom/icône d'un groupe DM
**Acteur:** Membre du groupe
**Préconditions:** Groupe DM (type 3).
**Étapes:**
1. Appel `PATCH /api/channels/:channelId` avec `{ "name": "La Famille" }` ou `multipart/form-data` pour l'icône.
2. Mise à jour de `dm_channels`.
3. Message système `CHANNEL_NAME_CHANGE` / `CHANNEL_ICON_CHANGE` généré.
4. Émission `CHANNEL_UPDATE` via Socket.IO.
**Résultat attendu:** 200 OK.
**Cas d'erreur:**
- `FILE_TOO_LARGE` (413) pour l'icône.

## SERVEURS (36-48)

### WF-036 — Création d'un serveur
**Acteur:** Utilisateur
**Préconditions:** N'a pas atteint la limite de serveurs (100).
**Étapes:**
1. Appel `POST /api/guilds` avec `{ "name": "Mon Serveur" }`.
2. Création dans `guilds`.
3. Création automatique de `@everyone`, d'une catégorie et de 2 canaux (#général textuel et vocal) dans `channels`.
4. Ajout de l'utilisateur en tant qu'`owner_id` et dans `guild_members`.
5. Émission `GUILD_CREATE` vers le client créateur.
**Résultat attendu:** 201 Created, retourne l'objet Guild.
**Cas d'erreur:**
- `MAX_GUILDS_REACHED` (403) si l'utilisateur possède déjà trop de guildes.

### WF-037 — Rejoindre un serveur via lien d'invitation
**Acteur:** Utilisateur externe
**Préconditions:** Code d'invitation valide.
**Étapes:**
1. Appel `POST /api/invites/:code`.
2. Vérification que l'invite est valide, non expirée, et non banni (`bans`).
3. Incrémentation de `uses` sur la table `invites`.
4. Ajout dans `guild_members` avec les rôles de base.
5. Émission `GUILD_MEMBER_ADD` à la guilde et `GUILD_CREATE` à l'utilisateur.
**Résultat attendu:** 200 OK.
**Cas d'erreur:**
- `INVITE_MAX_USES_REACHED` (403).
- `BANNED_FROM_GUILD` (403).

### WF-038 — Quitter un serveur
**Acteur:** Membre (non-propriétaire)
**Préconditions:** Est membre du serveur.
**Étapes:**
1. Appel `DELETE /api/guilds/:guildId/members/@me`.
2. Retrait de `guild_members`.
3. Émission Socket.IO `GUILD_MEMBER_REMOVE` sur le namespace guilde, et `GUILD_DELETE` pour l'utilisateur.
**Résultat attendu:** 204 No Content.
**Cas d'erreur:**
- `OWNER_CANNOT_LEAVE` (400) si l'utilisateur est `owner_id`.

### WF-039 — Modification du profil du serveur
**Acteur:** Propriétaire ou admin (`MANAGE_GUILD`)
**Préconditions:** Permissions requises.
**Étapes:**
1. Appel `PATCH /api/guilds/:guildId` avec nouveau nom/description.
2. Mise à jour dans `guilds`.
3. Entrée dans le journal d'audit (`GUILD_UPDATE`).
4. Émission `GUILD_UPDATE` à tous les membres.
**Résultat attendu:** 200 OK.
**Cas d'erreur:**
- `MISSING_PERMISSIONS` (403).

### WF-040 — Modification des paramètres de participation
**Acteur:** Admin (`MANAGE_GUILD`)
**Préconditions:** Permissions adéquates.
**Étapes:**
1. Appel `PATCH /api/guilds/:guildId` modifiant `system_channel_id`, `system_channel_flags`, et `default_message_notifications`.
2. Mise à jour de la table `guilds`.
3. Enregistrement en audit log.
4. Émission `GUILD_UPDATE`.
**Résultat attendu:** 200 OK.
**Cas d'erreur:**
- `MISSING_PERMISSIONS` (403).

### WF-041 — Transfert de propriété du serveur
**Acteur:** Propriétaire actuel
**Préconditions:** Le futur propriétaire est membre.
**Étapes:**
1. Appel `PATCH /api/guilds/:guildId` avec `{ "owner_id": "newOwnerId" }`.
2. L'appelant doit fournir un code 2FA s'il l'a activée.
3. Mise à jour de `owner_id` en base.
4. Audit log `GUILD_UPDATE`.
**Résultat attendu:** 200 OK.
**Cas d'erreur:**
- `MISSING_PERMISSIONS` (403) si appelant n'est pas l'ancien propriétaire.

### WF-042 — Suppression d'un serveur
**Acteur:** Propriétaire
**Préconditions:** Vérification du nom du serveur / code 2FA.
**Étapes:**
1. Appel `DELETE /api/guilds/:guildId` avec `{ "confirmation": "Nom Serveur" }`.
2. Suppression en cascade des `channels`, `messages`, `roles`, `guild_members`, `emojis` associés à `guild_id`.
3. Émission Socket.IO `GUILD_DELETE` pour expulser tous les membres côté client.
**Résultat attendu:** 204 No Content.
**Cas d'erreur:**
- `INVALID_CONFIRMATION` (400) si la chaîne de confirmation ne correspond pas.

### WF-043 — Création d'une catégorie de channels
**Acteur:** Admin (`MANAGE_CHANNELS`)
**Préconditions:** Permissions requises.
**Étapes:**
1. Appel `POST /api/guilds/:guildId/channels` avec `{ "name": "Text Channels", "type": 4 }` (type 4 = catégorie).
2. Insertion dans `channels`.
3. Émission `CHANNEL_CREATE` sur le namespace serveur.
**Résultat attendu:** 201 Created.
**Cas d'erreur:**
- `MISSING_PERMISSIONS` (403).

### WF-044 — Création d'un channel textuel
**Acteur:** Admin (`MANAGE_CHANNELS`)
**Préconditions:** Permissions requises.
**Étapes:**
1. Appel `POST /api/guilds/:guildId/channels` avec `{ "name": "général", "type": 0, "parent_id": "cat_id" }`.
2. Héritage optionnel des `permission_overwrites` du parent.
3. Insertion dans `channels`.
4. Émission `CHANNEL_CREATE`.
**Résultat attendu:** 201 Created.
**Cas d'erreur:**
- `VALIDATION_ERROR` (422) si le nom contient des espaces ou des majuscules (doit être kebab-case).

### WF-045 — Création d'un channel vocal (structure DIFFÉRÉE)
**Acteur:** Admin (`MANAGE_CHANNELS`)
**Préconditions:** Permissions requises.
**Étapes:**
1. Appel `POST /api/guilds/:guildId/channels` avec `{ "name": "Vocal 1", "type": 2, "parent_id": "cat_id" }`.
2. Insertion dans `channels` avec bitrate et `user_limit` par défaut.
3. Émission `CHANNEL_CREATE`.
**Résultat attendu:** 201 Created.
**Cas d'erreur:**
- `MISSING_PERMISSIONS` (403).

### WF-046 — Création d'un channel forum
**Acteur:** Admin (`MANAGE_CHANNELS`)
**Préconditions:** Permissions.
**Étapes:**
1. Appel `POST /api/guilds/:guildId/channels` avec `{ "name": "Aide", "type": 15, "available_tags": [...] }`.
2. Stockage en base de données.
3. Émission `CHANNEL_CREATE`.
**Résultat attendu:** 201 Created.
**Cas d'erreur:**
- `VALIDATION_ERROR` (422) tags invalides.

### WF-047 — Réorganisation des channels (drag & drop)
**Acteur:** Admin (`MANAGE_CHANNELS`)
**Préconditions:** Permissions.
**Étapes:**
1. L'UI drag&drop génère un array de `{id, position}`.
2. Appel `PATCH /api/guilds/:guildId/channels` avec cet array.
3. Le serveur met à jour les champs `position` en transaction.
4. Émission Socket.IO d'un événement `CHANNEL_UPDATE` multiple (ou un reload).
**Résultat attendu:** 200 OK.
**Cas d'erreur:**
- `RATE_LIMITED` (429) bucket `channel_manage` si appelé trop vite (nécessite debounce côté client).

### WF-048 — Modification des paramètres d'un channel
**Acteur:** Admin (`MANAGE_CHANNELS`)
**Préconditions:** Permissions.
**Étapes:**
1. Appel `PATCH /api/channels/:channelId` modifiant `topic`, `nsfw`, ou `rate_limit_per_user` (slowmode).
2. Mise à jour de `channels`.
3. Audit log `CHANNEL_UPDATE`.
4. Émission `CHANNEL_UPDATE`.
**Résultat attendu:** 200 OK.
**Cas d'erreur:**
- `MISSING_PERMISSIONS` (403).

### WF-049 — Envoi d'un message texte simple
**Acteur:** Membre
**Préconditions:** Permission `SEND_MESSAGES` et channel existant.
**Étapes:**
1. Appel `POST /api/channels/:channelId/messages` avec `{ "content": "Salut !" }`.
2. Enregistrement dans `messages` et mise à jour de `last_message_id` du channel.
3. Émission `MESSAGE_CREATE` vers la room `channel:<channelId>`.
**Résultat attendu:** 201 Created, objet Message.
**Cas d'erreur:**
- `RATE_LIMITED` (429) bucket `message_send`.
- `MISSING_PERMISSIONS` (403) si channel en lecture seule.

### WF-050 — Envoi d'un message avec formatage Markdown
**Acteur:** Membre
**Préconditions:** `SEND_MESSAGES`.
**Étapes:**
1. Appel `POST /api/channels/:channelId/messages` avec `content: "**Gras** et *Italique*"`.
2. Le backend stocke tel quel dans `messages`.
3. À la réception de `MESSAGE_CREATE`, le frontend utilise `markdown-it` pour faire le rendu HTML sécurisé (avec DOMPurify).
**Résultat attendu:** Message stocké et rendu visuellement correct.
**Cas d'erreur:**
- La longueur dépasse 2000 caractères → `VALIDATION_ERROR` (422).


## MESSAGES (51-68)

### WF-051 — Envoi d'un message avec une image en pièce jointe
**Acteur:** Membre
**Préconditions:** Permission `ATTACH_FILES`.
**Étapes:**
1. L'utilisateur uploade un fichier image via `POST /api/channels/:channelId/messages` (multipart/form-data).
2. Le backend valide la taille (max 8MB, ou 25MB si Premium).
3. Traitement via `sharp` pour générer un thumbnail WebP.
4. Sauvegarde dans `uploads/attachments/`.
5. Insertion dans `messages` et `attachments`. Émission `MESSAGE_CREATE`.
**Résultat attendu:** 201 Created. L'image s'affiche dans le chat.
**Cas d'erreur:**
- `FILE_TOO_LARGE` (413).
- `INVALID_FILE_TYPE` (415) si l'extension n'est pas whitelistée.

### WF-052 — Envoi d'un message avec plusieurs fichiers
**Acteur:** Membre
**Préconditions:** `ATTACH_FILES` et max 10 fichiers.
**Étapes:**
1. Appel multipart `/messages` avec plusieurs fichiers.
2. Le système traite et enregistre chaque fichier séquentiellement ou en parallèle.
3. Le message est créé avec un tableau `attachments` lié.
**Résultat attendu:** Message avec une grille de fichiers.
**Cas d'erreur:**
- `VALIDATION_ERROR` (422) si plus de 10 fichiers attachés.

### WF-053 — Envoi d'un message avec un lien (preview embed auto-généré)
**Acteur:** Membre
**Préconditions:** `EMBED_LINKS`.
**Étapes:**
1. Envoi message avec "Regarde : https://github.com/".
2. Le backend parse le texte, détecte l'URL.
3. Un worker asynchrone fetch l'URL, extrait les meta OpenGraph (Titre, Image, Desc).
4. Création d'une entrée dans `embeds` liée au message.
5. Émission de `MESSAGE_UPDATE` pour inclure l'embed généré.
**Résultat attendu:** 201 Created pour le message, puis un embed s'affiche.
**Cas d'erreur:**
- URL inaccessible (silencieux, pas d'embed généré).

### WF-054 — Réponse à un message (reply)
**Acteur:** Membre
**Préconditions:** Le message d'origine existe.
**Étapes:**
1. Appel `POST /api/channels/:channelId/messages` avec `message_reference: { message_id: "ID" }`.
2. Le backend vérifie si le message de référence existe (sinon flag `SOURCE_MESSAGE_DELETED`).
3. Création du message de type `19 (REPLY)`.
4. Émission `MESSAGE_CREATE`.
**Résultat attendu:** 201 Created.
**Cas d'erreur:**
- `MESSAGE_NOT_FOUND` (404) si l'ID référencé n'existe pas dans le même channel.

### WF-055 — Modification d'un message
**Acteur:** Auteur du message
**Préconditions:** Est l'auteur du message.
**Étapes:**
1. Appel `PATCH /api/channels/:channelId/messages/:messageId` avec `{ "content": "Nouveau" }`.
2. Le système met à jour `content` et `edited_at` dans `messages`.
3. Émission Socket.IO `MESSAGE_UPDATE`.
**Résultat attendu:** 200 OK avec le champ `edited_at` rempli.
**Cas d'erreur:**
- `MISSING_PERMISSIONS` (403) si l'appelant n'est pas l'auteur.

### WF-056 — Suppression d'un message
**Acteur:** Auteur ou Modérateur
**Préconditions:** Est l'auteur OU possède `MANAGE_MESSAGES`.
**Étapes:**
1. Appel `DELETE /api/channels/:channelId/messages/:messageId`.
2. Suppression physique des fichiers `attachments` liés.
3. Suppression en base (messages, reactions, embeds).
4. Émission `MESSAGE_DELETE`.
**Résultat attendu:** 204 No Content.
**Cas d'erreur:**
- `MISSING_PERMISSIONS` (403).

### WF-057 — Suppression en masse de messages (bulk delete)
**Acteur:** Modérateur
**Préconditions:** `MANAGE_MESSAGES`.
**Étapes:**
1. Appel `POST /api/channels/:channelId/messages/bulk-delete` avec un tableau `ids`.
2. Le système vérifie que les messages ont moins de 14 jours.
3. Suppression en transaction et suppression physique des pièces jointes.
4. Émission Socket.IO `MESSAGE_BULK_DELETE`.
**Résultat attendu:** 204 No Content.
**Cas d'erreur:**
- `MESSAGE_TOO_OLD` (400) si certains messages datent de > 14 jours.

### WF-058 — Épinglage d'un message
**Acteur:** Modérateur
**Préconditions:** `MANAGE_MESSAGES`.
**Étapes:**
1. Appel `PUT /api/channels/:channelId/pins/:messageId`.
2. Mise à jour de `pinned = true` dans `messages`.
3. Insertion d'un message système `CHANNEL_PINNED_MESSAGE`.
4. Émission `MESSAGE_UPDATE` et `MESSAGE_CREATE` (système).
**Résultat attendu:** 204 No Content.
**Cas d'erreur:**
- `MAX_PINS_REACHED` (400) si le channel a déjà 50 épingles.

### WF-059 — Désépinglage d'un message
**Acteur:** Modérateur
**Préconditions:** `MANAGE_MESSAGES`, message épinglé.
**Étapes:**
1. Appel `DELETE /api/channels/:channelId/pins/:messageId`.
2. Mise à jour `pinned = false` dans la table `messages`.
3. Émission `MESSAGE_UPDATE`.
**Résultat attendu:** 204 No Content.
**Cas d'erreur:**
- `NOT_PINNED` (400) si le message n'était pas épinglé.

### WF-060 — Ajout d'une réaction emoji à un message
**Acteur:** Membre
**Préconditions:** `ADD_REACTIONS` et `READ_MESSAGE_HISTORY`.
**Étapes:**
1. Appel `PUT /api/channels/:channelId/messages/:messageId/reactions/:emoji/@me`.
2. Le système crée/met à jour dans `reactions`.
3. Émission `MESSAGE_REACTION_ADD`.
**Résultat attendu:** 204 No Content.
**Cas d'erreur:**
- `RATE_LIMITED` (429) bucket `reaction_add`.

### WF-061 — Retrait d'une réaction
**Acteur:** Membre (la sienne) ou Modérateur (n'importe laquelle)
**Préconditions:** A réagi, ou `MANAGE_MESSAGES`.
**Étapes:**
1. Appel `DELETE /api/channels/:channelId/messages/:messageId/reactions/:emoji/@me` (ou `/:userId`).
2. Suppression de l'entrée dans `reactions`.
3. Émission `MESSAGE_REACTION_REMOVE`.
**Résultat attendu:** 204 No Content.
**Cas d'erreur:**
- `REACTION_NOT_FOUND` (404).

### WF-062 — Envoi d'un message avec un emoji custom du serveur
**Acteur:** Membre
**Préconditions:** L'emoji appartient au serveur, ou l'utilisateur a OpenCord+.
**Étapes:**
1. L'utilisateur envoie `content: "<:nom:ID>"` via `POST /api/channels/:channelId/messages`.
2. Le serveur parse les IDs d'emoji et vérifie leur validité.
3. Stockage du message.
**Résultat attendu:** Le client render l'image de l'emoji.
**Cas d'erreur:**
- `USE_EXTERNAL_EMOJIS` (403) si l'utilisateur tente d'utiliser un emoji externe sans la permission/premium.

### WF-063 — Envoi d'un sticker
**Acteur:** Membre
**Préconditions:** Le sticker est disponible.
**Étapes:**
1. Appel `POST /api/channels/:channelId/messages` avec `{ "sticker_ids": ["ID"] }`.
2. Le serveur valide l'ID et l'appartenance au serveur (ou Premium).
3. Le message est stocké sans `content` mais avec l'objet sticker lié.
**Résultat attendu:** 201 Created.
**Cas d'erreur:**
- `STICKER_NOT_FOUND` (404).

### WF-064 — Utilisation de la commande @mention
**Acteur:** Membre
**Préconditions:** Aucune.
**Étapes:**
1. L'utilisateur écrit `<@ID>` dans le message.
2. Le backend parse la mention lors du `POST`.
3. Stockage et émission de `MESSAGE_CREATE`.
4. Le système génère une entrée `NOTIFICATION_CREATE` de type `MENTION` pour la cible.
**Résultat attendu:** 201 Created, la cible reçoit un badge rouge.
**Cas d'erreur:**
- Si mention `@everyone` sans `MENTION_EVERYONE`, la mention est traitée en texte brut (pas de notif).

### WF-065 — Recherche de messages dans un serveur
**Acteur:** Membre
**Préconditions:** `READ_MESSAGE_HISTORY`.
**Étapes:**
1. Appel `GET /api/guilds/:guildId/messages/search?content=hello`.
2. Le backend utilise SQLite FTS5 (Full Text Search) sur la table `messages`.
3. Renvoie la liste paginée des messages avec leur contexte.
**Résultat attendu:** 200 OK, JSON avec les résultats.
**Cas d'erreur:**
- `RATE_LIMITED` (429) bucket `search`.

### WF-066 — Consultation des messages épinglés
**Acteur:** Membre
**Préconditions:** `VIEW_CHANNEL`.
**Étapes:**
1. Clic sur l'icône Punaise appelle `GET /api/channels/:channelId/pins`.
2. Le serveur requête `messages` où `pinned = true`.
3. Retourne le tableau.
**Résultat attendu:** 200 OK, liste des épinglés.
**Cas d'erreur:**
- `MISSING_PERMISSIONS` (403).

### WF-067 — Scroll infini / chargement de l'historique des messages
**Acteur:** Membre
**Préconditions:** `READ_MESSAGE_HISTORY`.
**Étapes:**
1. L'utilisateur scrolle vers le haut.
2. Appel `GET /api/channels/:channelId/messages?before=LAST_MSG_ID&limit=50`.
3. Le serveur renvoie les 50 messages précédents chronologiquement.
**Résultat attendu:** 200 OK, tableau de 50 messages.
**Cas d'erreur:**
- `MISSING_PERMISSIONS` (403).

### WF-068 — Indicateur de frappe (typing indicator)
**Acteur:** Membre
**Préconditions:** `SEND_MESSAGES`.
**Étapes:**
1. L'utilisateur commence à taper. Le client appelle `POST /api/channels/:channelId/typing`.
2. Le backend émet `TYPING_START` via Socket.IO sur la room du channel.
3. L'événement inclut un timestamp (le client cache après 10s).
**Résultat attendu:** 204 No Content.
**Cas d'erreur:**
- Requêtes trop fréquentes droppées silencieusement (rate limit spécial).

## THREADS & FORUMS (69-75)

### WF-069 — Création d'un thread depuis un message
**Acteur:** Membre
**Préconditions:** `CREATE_PUBLIC_THREADS`.
**Étapes:**
1. Appel `POST /api/channels/:channelId/messages/:messageId/threads` avec `{ "name": "Sujet de discussion" }`.
2. Le serveur crée un objet `channel` de type `11 (PUBLIC_THREAD)`.
3. Ajout de `thread_id` au message d'origine.
4. Émission `CHANNEL_CREATE` et `MESSAGE_UPDATE`.
**Résultat attendu:** 201 Created.
**Cas d'erreur:**
- `ALREADY_HAS_THREAD` (400) si le message a déjà un thread.

### WF-070 — Participation à un thread existant
**Acteur:** Membre
**Préconditions:** `SEND_MESSAGES_IN_THREADS`.
**Étapes:**
1. Clic sur le thread, appel `PUT /api/channels/:threadId/thread-members/@me`.
2. Ajout dans `thread_members`.
3. Émission `THREAD_MEMBER_UPDATE`.
4. L'utilisateur peut ensuite `POST` un message dans ce thread (WF-049).
**Résultat attendu:** 204 No Content.
**Cas d'erreur:**
- `THREAD_LOCKED` (403).

### WF-071 — Archivage d'un thread
**Acteur:** Propriétaire du thread ou Modérateur
**Préconditions:** `MANAGE_THREADS` ou owner.
**Étapes:**
1. Appel `PATCH /api/channels/:threadId` avec `{ "archived": true }`.
2. Mise à jour du channel.
3. Émission `CHANNEL_UPDATE` et le thread disparaît de la sidebar active.
**Résultat attendu:** 200 OK.
**Cas d'erreur:**
- `MISSING_PERMISSIONS` (403).

### WF-072 — Création d'un post dans un channel forum
**Acteur:** Membre
**Préconditions:** Channel type `15`, `SEND_MESSAGES`.
**Étapes:**
1. Appel `POST /api/channels/:channelId/threads` avec `name` (titre du post), `message.content` et `applied_tags`.
2. Création du thread (type `11`) et création simultanée du message initial.
3. Émission `CHANNEL_CREATE` (le post) et `MESSAGE_CREATE`.
**Résultat attendu:** 201 Created (Post).
**Cas d'erreur:**
- `VALIDATION_ERROR` (422) titre obligatoire manquant.

### WF-073 — Réponse à un post de forum
**Acteur:** Membre
**Préconditions:** `SEND_MESSAGES_IN_THREADS`.
**Étapes:**
1. L'utilisateur ouvre le post (thread) et envoie un message : `POST /api/channels/:threadId/messages`.
2. Le message est stocké comme dans un canal normal.
3. Émission `MESSAGE_CREATE`.
**Résultat attendu:** 201 Created.
**Cas d'erreur:**
- `THREAD_ARCHIVED` (403) nécessite un un-archive d'abord.

### WF-074 — Filtrage des posts de forum par tag
**Acteur:** Membre
**Préconditions:** Channel forum existant.
**Étapes:**
1. Le client sélectionne un tag dans l'UI.
2. L'UI filtre localement les objets `threads` (posts) reçus lors du `GET /api/guilds/:guildId/channels`.
**Résultat attendu:** Affichage réduit aux posts correspondants.
**Cas d'erreur:**
- Aucun (purement client si données pré-chargées).

### WF-075 — Verrouillage d'un thread
**Acteur:** Modérateur
**Préconditions:** `MANAGE_THREADS`.
**Étapes:**
1. Appel `PATCH /api/channels/:threadId` avec `{ "locked": true }`.
2. Mise à jour en base, empêchant les membres normaux d'y écrire ou de le désarchiver.
3. Émission `CHANNEL_UPDATE`.
**Résultat attendu:** 200 OK.
**Cas d'erreur:**
- `MISSING_PERMISSIONS` (403).

## RÔLES & PERMISSIONS (76-84)

### WF-076 — Création d'un rôle
**Acteur:** Admin (`MANAGE_ROLES`)
**Préconditions:** Permissions requises.
**Étapes:**
1. Appel `POST /api/guilds/:guildId/roles` avec nom, couleur, permissions de base.
2. Le serveur assigne la `position` (juste au-dessus d'`@everyone`).
3. Sauvegarde dans `roles`.
4. Audit log `ROLE_CREATE` et émission `GUILD_ROLE_CREATE`.
**Résultat attendu:** 201 Created.
**Cas d'erreur:**
- `MAX_ROLES_REACHED` (400) limite de 250 rôles.

### WF-077 — Configuration des permissions d'un rôle (bitfield)
**Acteur:** Admin
**Préconditions:** Hiérarchie de l'admin > rôle cible.
**Étapes:**
1. L'admin toggle des permissions dans l'UI.
2. Le client calcule le nouveau BigInt et appelle `PATCH /api/guilds/:guildId/roles/:roleId` avec `{ "permissions": "104324673" }`.
3. Le backend vérifie que l'admin possède lui-même les permissions qu'il tente de donner.
4. Émission `GUILD_ROLE_UPDATE`.
**Résultat attendu:** 200 OK.
**Cas d'erreur:**
- `CANNOT_GRANT_PERMISSION` (403) si l'admin n'a pas cette permission globale.

### WF-078 — Attribution d'un rôle à un membre
**Acteur:** Admin
**Préconditions:** Hiérarchie admin > rôle cible.
**Étapes:**
1. Appel `PUT /api/guilds/:guildId/members/:userId/roles/:roleId`.
2. Insertion dans la table de jointure `role_members`.
3. Émission `GUILD_MEMBER_UPDATE`.
**Résultat attendu:** 204 No Content.
**Cas d'erreur:**
- `ROLE_HIERARCHY_ERROR` (403) si le rôle est au-dessus du rôle le plus haut de l'admin.

### WF-079 — Retrait d'un rôle d'un membre
**Acteur:** Admin
**Préconditions:** Hiérarchie admin > rôle cible.
**Étapes:**
1. Appel `DELETE /api/guilds/:guildId/members/:userId/roles/:roleId`.
2. Suppression de `role_members`.
3. Émission `GUILD_MEMBER_UPDATE`.
**Résultat attendu:** 204 No Content.
**Cas d'erreur:**
- `ROLE_HIERARCHY_ERROR` (403).

### WF-080 — Réorganisation des rôles (drag & drop hiérarchie)
**Acteur:** Admin
**Préconditions:** `MANAGE_ROLES`.
**Étapes:**
1. L'UI envoie un tableau de `{ id, position }` via `PATCH /api/guilds/:guildId/roles`.
2. Le backend vérifie que l'admin ne déplace que des rôles inférieurs à sa propre position max.
3. Transaction de mise à jour des positions.
4. Émission d'un batch `GUILD_ROLE_UPDATE`.
**Résultat attendu:** 200 OK, liste des rôles avec nouvelles positions.
**Cas d'erreur:**
- `ROLE_HIERARCHY_ERROR` (403).

### WF-081 — Configuration des permission overwrites sur un channel
**Acteur:** Admin
**Préconditions:** `MANAGE_ROLES` ou `MANAGE_CHANNELS`.
**Étapes:**
1. Appel `PUT /api/channels/:channelId/permissions/:targetId` avec `{ "type": "role", "allow": "1024", "deny": "2048" }`.
2. Création/mise à jour dans `permission_overwrites`.
3. L'algorithme de permission du backend prendra cela en compte pour ce channel.
4. Émission `CHANNEL_UPDATE`.
**Résultat attendu:** 204 No Content.
**Cas d'erreur:**
- `MISSING_PERMISSIONS` (403).

### WF-082 — Modification de la couleur et icône d'un rôle
**Acteur:** Admin
**Préconditions:** `MANAGE_ROLES`, Serveur Tier 2 (pour l'icône).
**Étapes:**
1. Appel `PATCH /api/guilds/:guildId/roles/:roleId` avec `{ "color": "#FF0000" }` ou multipart pour l'icône.
2. Stockage du hash de l'icône, mise à jour du rôle.
3. Émission `GUILD_ROLE_UPDATE`.
**Résultat attendu:** 200 OK.
**Cas d'erreur:**
- `TIER_TOO_LOW` (403) pour l'icône si serveur < Tier 2.

### WF-083 — Rendre un rôle mentionnable
**Acteur:** Admin
**Préconditions:** `MANAGE_ROLES`.
**Étapes:**
1. Appel `PATCH /api/guilds/:guildId/roles/:roleId` avec `{ "mentionable": true }`.
2. Mise à jour en base.
3. Tout membre pourra mentionner ce rôle (ping tous ses possesseurs).
**Résultat attendu:** 200 OK.
**Cas d'erreur:**
- `ROLE_HIERARCHY_ERROR` (403).

### WF-084 — Test de l'accès d'un membre à un channel (vérif)
**Acteur:** Système / Membre
**Préconditions:** Le membre tente d'accéder à un channel.
**Étapes:**
1. L'utilisateur clique sur un channel. Client effectue `GET /api/channels/:channelId/messages`.
2. Le middleware backend appelle `computePermissions()`.
3. Étape 1 : Base (`@everyone` + rôles). Étape 2 : Vérif `ADMINISTRATOR`. Étape 3 : Overwrites du channel (`@everyone` -> rôles -> user).
4. Le bit `VIEW_CHANNEL` est vérifié dans le BigInt final.
**Résultat attendu:** Le flux passe et renvoie 200 OK.
**Cas d'erreur:**
- `MISSING_ACCESS` (403) si le bit est à 0.

## MODÉRATION (85-97)

### WF-085 — Kick d'un membre
**Acteur:** Modérateur
**Préconditions:** `KICK_MEMBERS`, hiérarchie supérieure.
**Étapes:**
1. Appel `DELETE /api/guilds/:guildId/members/:userId` avec optionnel `reason`.
2. Suppression de `guild_members`.
3. Audit log `MEMBER_KICK`.
4. Émission `GUILD_MEMBER_REMOVE`.
**Résultat attendu:** 204 No Content.
**Cas d'erreur:**
- `ROLE_HIERARCHY_ERROR` (403) si la cible a un rôle supérieur/égal.

### WF-086 — Ban d'un membre (avec raison + suppression de messages)
**Acteur:** Modérateur
**Préconditions:** `BAN_MEMBERS`, hiérarchie supérieure.
**Étapes:**
1. Appel `PUT /api/guilds/:guildId/bans/:userId` avec `{ "reason": "Spam", "delete_message_seconds": 86400 }`.
2. Expulsion du serveur (s'il y est encore).
3. Ajout dans la table `bans`.
4. Tâche asynchrone pour supprimer les messages du membre des dernières 24h.
5. Audit log `MEMBER_BAN_ADD` et émission `GUILD_BAN_ADD`.
**Résultat attendu:** 204 No Content.
**Cas d'erreur:**
- `ROLE_HIERARCHY_ERROR` (403).

### WF-087 — Unban d'un membre
**Acteur:** Modérateur
**Préconditions:** `BAN_MEMBERS`, l'utilisateur est banni.
**Étapes:**
1. Appel `DELETE /api/guilds/:guildId/bans/:userId`.
2. Suppression de l'entrée dans `bans`.
3. Audit log `MEMBER_BAN_REMOVE` et émission `GUILD_BAN_REMOVE`.
**Résultat attendu:** 204 No Content.
**Cas d'erreur:**
- `NOT_BANNED` (404).

### WF-088 — Timeout/mute d'un membre
**Acteur:** Modérateur
**Préconditions:** `MODERATE_MEMBERS`, hiérarchie supérieure.
**Étapes:**
1. Appel `PATCH /api/guilds/:guildId/members/:userId` avec `{ "communication_disabled_until": "ISO_DATE" }`.
2. Enregistrement en base.
3. Le membre est immédiatement restreint (tous ses envois de messages échoueront avec `403 MEMBER_COMMUNICATION_DISABLED`).
4. Émission `GUILD_MEMBER_UPDATE`.
**Résultat attendu:** 200 OK.
**Cas d'erreur:**
- `DURATION_TOO_LONG` (400) si la durée > 28 jours.

### WF-089 — Recherche dans la liste des bans
**Acteur:** Modérateur
**Préconditions:** `BAN_MEMBERS`.
**Étapes:**
1. L'UI (Paramètres Serveur -> Bans) appelle `GET /api/guilds/:guildId/bans?query=troll`.
2. Recherche sur le username/ID dans la table `bans`.
3. Retour paginé.
**Résultat attendu:** 200 OK, liste des objets Ban.
**Cas d'erreur:**
- `MISSING_PERMISSIONS` (403).

### WF-090 — Création d'une règle AutoMod (filtre de mots-clés)
**Acteur:** Admin
**Préconditions:** `MANAGE_GUILD`.
**Étapes:**
1. Appel `POST /api/guilds/:guildId/auto-moderation/rules` avec `trigger_type: 1 (KEYWORD)`, metadata: `keyword_filter: ["*insulte*"]`, et `actions: [{ type: 1 (BLOCK) }]`.
2. Insertion dans `automod_rules`.
**Résultat attendu:** 201 Created.
**Cas d'erreur:**
- `MAX_RULES_REACHED` (400) max 6 règles par guilde.

### WF-091 — Création d'une règle AutoMod (anti-spam)
**Acteur:** Admin
**Préconditions:** `MANAGE_GUILD`.
**Étapes:**
1. Appel `POST` idem, mais avec `trigger_type: 3 (SPAM)`. Sans métadonnées de mots.
2. Le système activera ses heuristiques internes (flood de même message).
**Résultat attendu:** 201 Created.
**Cas d'erreur:**
- `RULE_ALREADY_EXISTS` (409) une seule règle anti-spam autorisée.

### WF-092 — Création d'une règle AutoMod (limite de mentions)
**Acteur:** Admin
**Préconditions:** `MANAGE_GUILD`.
**Étapes:**
1. Appel avec `trigger_type: 5 (MENTION_SPAM)` et `mention_total_limit: 5`.
2. L'action est configurée sur `type: 3 (TIMEOUT)` pour 60 secondes.
**Résultat attendu:** 201 Created.
**Cas d'erreur:**
- `VALIDATION_ERROR` (422) si limite > 50.

### WF-093 — Déclenchement d'une règle AutoMod (message bloqué)
**Acteur:** Spammer (Membre)
**Préconditions:** Règle Mots-Clés active (bloquer).
**Étapes:**
1. Membre envoie `POST /api/channels/:id/messages` avec "grosse insulte".
2. Le handler intercepte, exécute l'évaluation AutoMod.
3. Match positif. L'action est `BLOCK_MESSAGE`.
4. La création en base est avortée.
5. Une entrée Audit Log `AUTO_MODERATION_BLOCK_MESSAGE` est créée.
**Résultat attendu:** Code 403 avec message custom d'erreur pour l'utilisateur. Le message n'apparaît pas.
**Cas d'erreur:**
- Si le membre a un rôle exempté (`exempt_roles`), l'évaluation est skip et le message passe (201).

### WF-094 — Consultation du journal d'audit
**Acteur:** Admin
**Préconditions:** `VIEW_AUDIT_LOG`.
**Étapes:**
1. Appel `GET /api/guilds/:guildId/audit-logs`.
2. Le serveur retourne les entrées de la table `audit_logs` avec les informations sur les utilisateurs (qui a fait quoi) et les changements `changes` (avant/après).
**Résultat attendu:** 200 OK.
**Cas d'erreur:**
- `MISSING_PERMISSIONS` (403).

### WF-095 — Filtrage du journal d'audit par utilisateur
**Acteur:** Admin
**Préconditions:** `VIEW_AUDIT_LOG`.
**Étapes:**
1. Appel `GET /api/guilds/:guildId/audit-logs?user_id=MOD_ID`.
2. Le serveur filtre les requêtes SQL `WHERE user_id = MOD_ID`.
**Résultat attendu:** 200 OK.
**Cas d'erreur:**
- Aucun spécifique.

### WF-096 — Filtrage du journal d'audit par type d'action
**Acteur:** Admin
**Préconditions:** `VIEW_AUDIT_LOG`.
**Étapes:**
1. Appel `GET /api/guilds/:guildId/audit-logs?action_type=20 (MEMBER_KICK)`.
2. Le serveur renvoie uniquement les kicks.
**Résultat attendu:** 200 OK.
**Cas d'erreur:**
- `VALIDATION_ERROR` (422) si type invalide.

### WF-097 — Modification du niveau de vérification du serveur
**Acteur:** Propriétaire / Admin
**Préconditions:** `MANAGE_GUILD`.
**Étapes:**
1. Appel `PATCH /api/guilds/:guildId` avec `{ "verification_level": 3 }` (ex: 3 = Haute, doit être membre du serveur depuis 10 min).
2. Sauvegarde en base.
3. Les nouveaux membres devront attendre avant d'envoyer un message.
**Résultat attendu:** 200 OK.
**Cas d'erreur:**
- `MISSING_PERMISSIONS` (403).

## INVITATIONS (98-100)

### WF-098 — Création d'un lien d'invitation
**Acteur:** Membre
**Préconditions:** `CREATE_INSTANT_INVITE` sur le channel ciblé.
**Étapes:**
1. Appel `POST /api/channels/:channelId/invites` avec options (ex: `max_age=86400, max_uses=0`).
2. Le backend génère un code alphanumérique aléatoire (ex: `aBcD3F`).
3. Insertion dans `invites`.
**Résultat attendu:** 200 OK, retourne l'objet Invite avec le code.
**Cas d'erreur:**
- `MISSING_PERMISSIONS` (403).

### WF-099 — Consultation de la liste des invitations actives
**Acteur:** Admin
**Préconditions:** `MANAGE_GUILD`.
**Étapes:**
1. Dans l'onglet "Invitations", le client appelle `GET /api/guilds/:guildId/invites`.
2. Le serveur liste toutes les invitations non expirées, avec leur créateur, et le nombre d'`uses`.
**Résultat attendu:** 200 OK.
**Cas d'erreur:**
- `MISSING_PERMISSIONS` (403).

### WF-100 — Révocation d'une invitation
**Acteur:** Admin ou Créateur de l'invitation
**Préconditions:** `MANAGE_GUILD` ou être `inviter_id`.
**Étapes:**
1. Appel `DELETE /api/invites/:code`.
2. Suppression de la table `invites`.
**Résultat attendu:** 200 OK, objet révoqué.
**Cas d'erreur:**
- `INVITE_NOT_FOUND` (404) si déjà supprimée ou expirée.

### WF-101 — Suspension de toutes les invitations
**Acteur:** Propriétaire / Admin
**Préconditions:** `MANAGE_GUILD`.
**Étapes:**
1. Appel `PATCH /api/guilds/:guildId` avec `{ "invites_disabled": true }`.
2. Mise à jour de la guilde en base. Les invites existantes sont temporairement bloquées.
3. Émission `GUILD_UPDATE`.
**Résultat attendu:** 200 OK.
**Cas d'erreur:**
- `MISSING_PERMISSIONS` (403) si non admin.

### WF-102 — Configuration d'une vanity URL
**Acteur:** Propriétaire / Admin
**Préconditions:** Serveur Tier 3.
**Étapes:**
1. Appel `PATCH /api/guilds/:guildId/vanity-url` avec `{ "code": "mon-serveur" }`.
2. Le système vérifie l'unicité et met à jour `vanity_url_code`.
**Résultat attendu:** 200 OK.
**Cas d'erreur:**
- `TIER_TOO_LOW` (403) si le serveur n'est pas Tier 3.
- `CODE_ALREADY_IN_USE` (409) si un autre serveur l'utilise.

### WF-103 — Utilisation d'un lien d'invitation expiré (cas d'erreur)
**Acteur:** Utilisateur
**Préconditions:** Invitation existait mais a expiré.
**Étapes:**
1. Appel `POST /api/invites/:code`.
2. Le backend vérifie `expires_at` dans `invites`.
3. Date dépassée -> supprime l'entrée.
**Résultat attendu:** `INVITE_NOT_FOUND` (404).
**Cas d'erreur:**
- C'est le flux d'erreur attendu.

## EMOJIS & STICKERS (104-109)

### WF-104 — Upload d'un emoji custom sur un serveur
**Acteur:** Admin (`MANAGE_EMOJIS_AND_STICKERS`)
**Préconditions:** Quota du tier non atteint.
**Étapes:**
1. Appel `POST /api/guilds/:guildId/emojis` (multipart) avec nom et fichier.
2. Vérification limite max 256KB et format (PNG/GIF).
3. Redimensionnement `sharp` max 128x128. Stockage physique.
4. Création dans la table `emojis`.
**Résultat attendu:** 201 Created. Retourne l'emoji complet.
**Cas d'erreur:**
- `QUOTA_EXCEEDED` (400) si 50 emojis (Tier 0) déjà atteints.
- `FILE_TOO_LARGE` (413) > 256KB.

### WF-105 — Renommage d'un emoji custom
**Acteur:** Admin
**Préconditions:** `MANAGE_EMOJIS_AND_STICKERS`.
**Étapes:**
1. Appel `PATCH /api/guilds/:guildId/emojis/:emojiId` avec `{ "name": "nouveau_nom" }`.
2. Mise à jour de `emojis.name`.
**Résultat attendu:** 200 OK.
**Cas d'erreur:**
- `MISSING_PERMISSIONS` (403).
- `VALIDATION_ERROR` (422) nom invalide.

### WF-106 — Suppression d'un emoji custom
**Acteur:** Admin
**Préconditions:** `MANAGE_EMOJIS_AND_STICKERS`.
**Étapes:**
1. Appel `DELETE /api/guilds/:guildId/emojis/:emojiId`.
2. Suppression physique du fichier sur le serveur.
3. Suppression de la table `emojis`. Audit Log `EMOJI_DELETE`.
**Résultat attendu:** 204 No Content.
**Cas d'erreur:**
- `EMOJI_NOT_FOUND` (404).

### WF-107 — Upload d'un sticker custom
**Acteur:** Admin
**Préconditions:** `MANAGE_EMOJIS_AND_STICKERS`, Tier de serveur adéquat.
**Étapes:**
1. Appel `POST /api/guilds/:guildId/stickers` (multipart, max 512KB).
2. Traitement et stockage dans `uploads/stickers/`.
3. Insertion dans `stickers` avec ses `tags`.
**Résultat attendu:** 201 Created.
**Cas d'erreur:**
- `QUOTA_EXCEEDED` (400) max 5 stickers sans Tier 1.

### WF-108 — Utilisation du sélecteur d'emojis
**Acteur:** Utilisateur
**Préconditions:** Serveur avec emojis.
**Étapes:**
1. Le client récupère `GET /api/guilds/:guildId/emojis` à l'ouverture (ou mis en cache).
2. L'UI du picker affiche la grille (SVG standards et ceux du serveur).
3. Le clic ajoute la chaîne `:nom:` ou `<:nom:id>` à la zone de texte.
**Résultat attendu:** Emoji inséré localement avant envoi.
**Cas d'erreur:**
- Si l'utilisateur clique sur un emoji externe sans premium, grisé côté client (pas d'API call).

### WF-109 — Utilisation d'un emoji cross-serveur (OpenCord+)
**Acteur:** Abonné OpenCord+
**Préconditions:** `user.premium = true`. Est membre du serveur source.
**Étapes:**
1. L'utilisateur envoie un message contenant `<:nom:externalId>`.
2. Le middleware `POST /api/channels/:channelId/messages` détecte l'utilisation externe.
3. Vérifie si l'utilisateur a `premium == true` et fait partie du serveur hébergeant `externalId`.
**Résultat attendu:** Le message est enregistré avec l'ID valide et rendu.
**Cas d'erreur:**
- `USE_EXTERNAL_EMOJIS` (403) si l'utilisateur n'est pas premium.

## PREMIUM & BOOSTS (110-117)

### WF-110 — Souscription à OpenCord+
**Acteur:** Utilisateur
**Préconditions:** Pas d'abonnement actif.
**Étapes:**
1. Appel `POST /api/subscriptions/checkout` avec `{ "tier_id": "1" }`.
2. Le backend crée une Stripe Checkout Session et retourne l'URL.
3. Le navigateur redirige vers Stripe. L'utilisateur paie.
**Résultat attendu:** 200 OK avec URL Stripe.
**Cas d'erreur:**
- `ALREADY_SUBSCRIBED` (409) si déjà premium.

### WF-111 — Consultation de son abonnement actif
**Acteur:** Abonné
**Préconditions:** Connecté.
**Étapes:**
1. Appel `GET /api/subscriptions/@me`.
2. Retourne l'objet d'abonnement (status, périodes, etc).
**Résultat attendu:** 200 OK, JSON Subscription.
**Cas d'erreur:**
- Si pas abonné, retourne `subscription: null` (200 OK).

### WF-112 — Annulation de l'abonnement OpenCord+
**Acteur:** Abonné
**Préconditions:** Abonnement actif.
**Étapes:**
1. Appel `POST /api/subscriptions/cancel`.
2. Le backend contacte Stripe et passe `cancel_at_period_end = true`.
3. Mise à jour de la table `user_subscriptions`.
**Résultat attendu:** 200 OK. Garde l'accès jusqu'à la fin de la période.
**Cas d'erreur:**
- `NO_ACTIVE_SUBSCRIPTION` (404).

### WF-113 — Renouvellement automatique de l'abonnement (webhook Stripe)
**Acteur:** Stripe
**Préconditions:** Abonnement mensuel récurrent.
**Étapes:**
1. Stripe appelle `POST /api/webhooks/stripe` avec l'événement `customer.subscription.updated` (nouveau `current_period_end`).
2. Le backend valide la signature brute.
3. Mise à jour de `user_subscriptions` en base.
**Résultat attendu:** Le compte reste Premium un mois de plus.
**Cas d'erreur:**
- Si signature invalide -> 400 Bad Request.

### WF-114 — Échec de paiement (webhook Stripe)
**Acteur:** Stripe
**Préconditions:** Carte expirée.
**Étapes:**
1. Événement `invoice.payment_failed` sur webhook.
2. Le statut de l'abonnement passe à `past_due`.
3. Si trop de tentatives, passe à `canceled`. L'utilisateur perd ses 2 boosts.
**Résultat attendu:** Rétrogradation automatique en cas de non-paiement définitif.
**Cas d'erreur:** N/A.

### WF-115 — Boost d'un serveur
**Acteur:** Abonné OpenCord+
**Préconditions:** Possède un boost gratuit inutilisé.
**Étapes:**
1. Appel `POST /api/guilds/:guildId/boosts`.
2. Le backend vérifie l'inventaire de boosts de l'utilisateur.
3. Le serveur `premium_subscription_count` est incrémenté. Table `boosts` mise à jour.
4. Message système `USER_PREMIUM_GUILD_SUBSCRIPTION` injecté dans le canal système.
**Résultat attendu:** 200 OK.
**Cas d'erreur:**
- `NO_AVAILABLE_BOOSTS` (400).

### WF-116 — Retrait d'un boost
**Acteur:** Booster
**Préconditions:** Le serveur est boosté par lui.
**Étapes:**
1. Appel `DELETE /api/guilds/:guildId/boosts/:boostId` après la période de "cooldown" (7 jours).
2. Le compte de boost descend.
**Résultat attendu:** 204 No Content.
**Cas d'erreur:**
- `BOOST_COOLDOWN` (400) si boosté il y a < 7j.

### WF-117 — Passage du serveur au tier 2
**Acteur:** Système
**Préconditions:** Un 7ème boost est ajouté (WF-115).
**Étapes:**
1. Suite au boost, le compte total passe à 7.
2. Le backend recalcule `premium_tier = 2`.
3. Émission `GUILD_UPDATE` avec `premium_tier: 2`. Message système "Tier 2 atteint !".
**Résultat attendu:** Nouvelles features débloquées (Bannière).
**Cas d'erreur:** N/A.

## BOTS & WEBHOOKS (118-124)

### WF-118 — Création d'une application bot
**Acteur:** Développeur
**Préconditions:** Connecté.
**Étapes:**
1. Appel `POST /api/applications` puis `POST /api/applications/:id/bot`.
2. Le backend génère un utilisateur `bot: true` et un Token secret (format `part1.part2.hmac`).
**Résultat attendu:** 201 Created, token affiché 1 seule fois.
**Cas d'erreur:**
- `VALIDATION_ERROR` (422) sur le nom de l'app.

### WF-119 — Ajout d'un bot à un serveur (OAuth2)
**Acteur:** Admin du serveur
**Préconditions:** `MANAGE_GUILD`.
**Étapes:**
1. Admin visite `/oauth2/authorize?client_id=APP_ID&permissions=8`.
2. Clic sur "Autoriser", déclenche `POST /api/oauth2/authorize`.
3. Le bot est ajouté à la guilde avec le rôle géré.
**Résultat attendu:** 200 OK, bot rejoint le serveur.
**Cas d'erreur:**
- `MISSING_PERMISSIONS` (403).

### WF-120 — Envoi d'un message par un bot
**Acteur:** Script Externe (Bot)
**Préconditions:** Connecté via en-tête `Authorization: Bot TOKEN`.
**Étapes:**
1. Appel `POST /api/channels/:id/messages`.
2. Le middleware valide le token (bcrypt hash) au lieu du JWT.
3. Applique un Rate Limiting généreux (x1.5).
**Résultat attendu:** 201 Created.
**Cas d'erreur:**
- `TOKEN_INVALID` (401) si token incorrect.

### WF-121 — Envoi d'un embed riche par un bot
**Acteur:** Bot
**Préconditions:** Token valide, `EMBED_LINKS` sur le channel.
**Étapes:**
1. Appel `/messages` avec le tableau `embeds: [{ title: "Alerte", color: 16711680 }]`.
2. Stockage dans la table `embeds` liée au message.
**Résultat attendu:** 201 Created.
**Cas d'erreur:**
- `VALIDATION_ERROR` (422) si l'embed dépasse 6000 caractères globaux.

### WF-122 — Création d'un webhook
**Acteur:** Admin
**Préconditions:** `MANAGE_WEBHOOKS`.
**Étapes:**
1. Appel `POST /api/channels/:id/webhooks` avec `{ "name": "Captain Hook" }`.
2. Création dans la table `webhooks` avec un token généré aléatoirement en clair.
**Résultat attendu:** 201 Created, retourne l'URL `.../api/webhooks/:id/:token`.
**Cas d'erreur:**
- `MISSING_PERMISSIONS` (403).

### WF-123 — Envoi via webhook
**Acteur:** Script externe (GitHub, etc)
**Préconditions:** Connaît l'URL du webhook.
**Étapes:**
1. Appel POST non authentifié sur `/api/webhooks/:id/:token` avec le payload JSON du message.
2. Le serveur identifie le channel, vérifie le token en clair, poste le message.
**Résultat attendu:** 204 No Content.
**Cas d'erreur:**
- `INVALID_WEBHOOK_TOKEN` (401).

### WF-124 — Suppression d'un webhook
**Acteur:** Admin
**Préconditions:** `MANAGE_WEBHOOKS`.
**Étapes:**
1. Appel `DELETE /api/channels/:id/webhooks/:webhookId`.
2. Suppression de la table `webhooks`.
**Résultat attendu:** 204 No Content.
**Cas d'erreur:**
- `WEBHOOK_NOT_FOUND` (404).

## PLUGINS (125-129)

### WF-125 — Activation d'un plugin client
**Acteur:** Utilisateur
**Préconditions:** Client OpenCord.
**Étapes:**
1. L'utilisateur va dans Paramètres -> Plugins et clique sur le switch pour "always-animate".
2. Appel `PATCH /api/users/@me/plugins/always-animate` avec `{ "enabled": true }`.
3. Le backend sauvegarde dans `user_plugin_settings`.
4. Le client exécute `plugin.onEnable()`.
**Résultat attendu:** Plugin actif instantanément côté client.
**Cas d'erreur:**
- `PLUGIN_NOT_FOUND` (404) si le slug n'existe pas.

### WF-126 — Désactivation d'un plugin client
**Acteur:** Utilisateur
**Préconditions:** Plugin actif.
**Étapes:**
1. Clic sur le switch pour désactiver.
2. Appel `PATCH /api/users/@me/plugins/slug` avec `enabled: false`.
3. Client exécute `plugin.onDisable()`.
**Résultat attendu:** 200 OK.
**Cas d'erreur:** N/A.

### WF-127 — Configuration des paramètres d'un plugin
**Acteur:** Utilisateur
**Préconditions:** Plugin avec `settings_schema`.
**Étapes:**
1. Clic sur l'engrenage. Formulaire généré selon le JSON Schema.
2. Soumission `PATCH /api/users/@me/plugins/slug` avec `{ "settings": { "speed": 2 } }`.
3. Validation du backend contre le JSON Schema du plugin officiel.
**Résultat attendu:** 200 OK.
**Cas d'erreur:**
- `VALIDATION_ERROR` (400) si le format des settings ne respecte pas le schema.

### WF-128 — Recherche et filtrage des plugins
**Acteur:** Utilisateur
**Préconditions:** Aucune.
**Étapes:**
1. Sur la page Paramètres, barre de recherche textuelle "animate".
2. Le client filtre le tableau retourné par `GET /api/plugins`.
**Résultat attendu:** Affichage dynamique, aucune requête réseau supplémentaire.
**Cas d'erreur:** N/A.

### WF-129 — Activation d'un plugin serveur
**Acteur:** Admin du serveur
**Préconditions:** `MANAGE_GUILD`. Plugin serveur de type "Message Logger".
**Étapes:**
1. Dans "Paramètres Serveur -> Plugins", clic switch.
2. Appel `PATCH /api/guilds/:guildId/plugins/message-logger` avec `enabled: true`.
3. Le backend charge le hook de ce plugin pour ce serveur (`message.beforeDelete`).
**Résultat attendu:** 200 OK. Le serveur loggera désormais.
**Cas d'erreur:**
- `MISSING_PERMISSIONS` (403).

## PANEL ADMIN (130-140)

### WF-130 — Accès au panel admin
**Acteur:** Super Admin (`admin_level=3`)
**Préconditions:** Connecté, niveau suffisant.
**Étapes:**
1. L'utilisateur navigue vers `/admin`.
2. Le frontend vérifie le profil. L'API `GET /api/admin/users` nécessite l'authentification et passe le middleware `requireAdmin(1)`.
**Résultat attendu:** Page admin affichée.
**Cas d'erreur:** N/A (si autorisé).

### WF-131 — Tentative d'accès non autorisé (403)
**Acteur:** Utilisateur normal (`admin_level=0`)
**Préconditions:** Aucune.
**Étapes:**
1. Tente d'appeler `GET /api/admin/users`.
2. Le middleware constate `admin_level < 1`.
**Résultat attendu:** `FORBIDDEN` (403), le frontend redirige vers `/admin/forbidden`.
**Cas d'erreur:** Flux d'erreur maîtrisé.

### WF-132 — Consultation du dashboard
**Acteur:** Super Admin
**Préconditions:** `admin_level >= 1`.
**Étapes:**
1. Chargement de l'accueil admin, exécute `GET /api/admin/dashboard`.
2. Le serveur calcule SUM de `users`, `guilds`, requêtes SQLite FTS.
**Résultat attendu:** 200 OK avec stats.
**Cas d'erreur:** N/A.

### WF-133 — Recherche d'un user
**Acteur:** Admin
**Préconditions:** `admin_level >= 1`.
**Étapes:**
1. `GET /api/admin/users?search=axel`.
2. Le serveur cherche (LIKE) sur `username` ou `email`.
**Résultat attendu:** 200 OK, paginé.
**Cas d'erreur:** N/A.

### WF-134 — Changement d'admin_level
**Acteur:** Super Admin (`admin_level=3`)
**Préconditions:** Niveau 3 obligatoire.
**Étapes:**
1. Appel `PATCH /api/admin/users/:id` avec `{ "admin_level": 2 }`.
2. Mise à jour de la table `users`.
**Résultat attendu:** 200 OK. La cible obtient accès admin.
**Cas d'erreur:**
- `FORBIDDEN` (403) si l'appelant est niveau < 3.

### WF-135 — Ban global d'un utilisateur
**Acteur:** Admin (`admin_level >= 2`)
**Préconditions:** Niveau requis.
**Étapes:**
1. Appel `POST /api/admin/users/:id/ban` avec `{ "reason": "Raison" }`.
2. Le serveur invalide ses tokens de rafraîchissement, déconnecte ses sockets et update `users.banned=true`.
**Résultat attendu:** 200 OK. L'utilisateur est jeté hors plateforme.
**Cas d'erreur:**
- Impossible de ban un admin de niveau supérieur ou égal.

### WF-136 — Création d'un badge
**Acteur:** Admin (`admin_level >= 2`)
**Préconditions:** Niveau requis.
**Étapes:**
1. Appel `POST /api/admin/badges` avec `{ "name": "Staff", "type": "admin" }`.
2. Sauvegarde dans `badges`.
**Résultat attendu:** 201 Created.
**Cas d'erreur:**
- `VALIDATION_ERROR` (422) manque icône.

### WF-137 — Attribution d'un badge
**Acteur:** Admin (`admin_level >= 2`)
**Préconditions:** Badge de type `admin`.
**Étapes:**
1. Appel `POST /api/admin/badges/:id/assign` avec `{ "userId": "TARGET_ID" }`.
2. Sauvegarde `user_badges`.
3. Émission Socket `USER_UPDATE` à tout le système.
**Résultat attendu:** 200 OK.
**Cas d'erreur:**
- `BADGE_AUTO_MANAGED` (400) si tentative sur un badge géré auto (ex: Premium).

### WF-138 — Révocation d'un badge
**Acteur:** Admin
**Préconditions:** Badge manuel.
**Étapes:**
1. Appel `DELETE /api/admin/badges/:id/assign/:userId`.
2. Suppression de l'association.
**Résultat attendu:** 204 No Content.
**Cas d'erreur:**
- `NOT_ASSIGNED` (404).

### WF-139 — Suppression forcée d'un serveur
**Acteur:** Admin (`admin_level >= 2`)
**Préconditions:** Serveur existe.
**Étapes:**
1. Appel `DELETE /api/admin/guilds/:guildId`.
2. Suppression en cascade, sans code de confirmation 2FA du propriétaire.
**Résultat attendu:** 204 No Content.
**Cas d'erreur:** N/A.

### WF-140 — Création d'une annonce globale
**Acteur:** Admin (`admin_level >= 2`)
**Préconditions:** Niveau requis.
**Étapes:**
1. Appel `POST /api/admin/announcements` avec titre et texte.
2. Le backend crée une notification de type `ADMIN_ANNOUNCEMENT` pour tous les utilisateurs actifs.
3. Émission `NOTIFICATION_CREATE` générale.
**Résultat attendu:** 201 Created. La bannière bleue d'annonce apparaît pour tous.
**Cas d'erreur:** N/A.

## NOTIFICATIONS (141-145)

### WF-141 — Réception d'une notification de mention
**Acteur:** Membre
**Préconditions:** Actif sur un autre channel.
**Étapes:**
1. Un autre membre l'identifie par `<@ID>`.
2. Le système émet `MESSAGE_CREATE` et génère un `NOTIFICATION_CREATE` avec type `MENTION` via Socket.IO.
3. Le client reçoit l'event, incrémente le badge rouge, joue un son (si configuré).
**Résultat attendu:** Interface màj sans refresh.
**Cas d'erreur:** N/A.

### WF-142 — Consultation et marquage comme lu
**Acteur:** Utilisateur
**Préconditions:** Notification reçue.
**Étapes:**
1. Clic sur la cloche pour voir la notif, clic dessus pour y aller (message).
2. Client appelle `PATCH /api/users/@me/notifications/:id/read`.
3. Mise à jour `read=true` en base. Badge rouge décrémenté localement.
**Résultat attendu:** 200 OK.
**Cas d'erreur:** N/A.

### WF-143 — Configuration des préférences de notification par serveur
**Acteur:** Membre
**Préconditions:** Serveur rejoint.
**Étapes:**
1. Clic droit Serveur -> Paramètres de notifs -> Mentions seulement.
2. Appel `PATCH /api/users/@me/guilds/:guildId/notifications` avec `message_notifications: 1`.
3. Mise à jour en base `NotificationSettings`.
**Résultat attendu:** 200 OK.
**Cas d'erreur:**
- `VALIDATION_ERROR` (422).

### WF-144 — Mute d'un channel spécifique
**Acteur:** Membre
**Préconditions:** Channel existant.
**Étapes:**
1. Appel `PATCH /api/users/@me/channels/:id/notifications` avec `muted: true`.
2. Les prochains messages dans ce channel ne déclencheront plus le "point blanc" de non-lu.
**Résultat attendu:** 200 OK.
**Cas d'erreur:** N/A.

### WF-145 — Notification de demande d'ami
**Acteur:** Système
**Préconditions:** A ajoute B.
**Étapes:**
1. B reçoit `NOTIFICATION_CREATE` de type `FRIEND_REQUEST`.
2. Le client affiche un badge rouge sur l'icône "Accueil".
**Résultat attendu:** Pastille rouge sur le menu Amis.
**Cas d'erreur:** N/A.

## RATE LIMITING & SÉCURITÉ (146-150)

### WF-146 — Déclenchement du rate limit sur l'envoi de messages
**Acteur:** Membre (Spammeur)
**Préconditions:** Bucket `message_send` (5 par 5 sec).
**Étapes:**
1. Envoie 6 messages en 2 secondes (`POST /messages`).
2. Le middleware `express-rate-limit` intercepte la 6e requête.
3. Retourne 429 Too Many Requests avec `{ "retry_after": 3.0 }`.
**Résultat attendu:** 429 Too Many Requests.
**Cas d'erreur:** Flux de rate limit natif.

### WF-147 — Tentative de connexion brute-force (lockout)
**Acteur:** Attaquant
**Préconditions:** 10 tentatives échouées successives (via bucket `auth`).
**Étapes:**
1. L'attaquant spamme `/api/auth/login`.
2. À la 10e tentative erronée, l'utilisateur est verrouillé (lockout) pendant 30 min (`locked_until`).
3. Toute tentative suivante retourne `ACCOUNT_LOCKED`.
**Résultat attendu:** 403 `ACCOUNT_LOCKED`.
**Cas d'erreur:** Flux de sécurité natif.

### WF-148 — Upload d'un fichier avec type MIME invalide
**Acteur:** Membre
**Préconditions:** Fichier renommé en `.png` mais est un `.exe`.
**Étapes:**
1. Appel `/messages` avec pièce jointe `virus.png`.
2. Le backend (`file-type`) lit les "magic bytes" (en-tête binaire).
3. Détecte `application/x-msdownload`.
4. Rejet avant stockage permanent.
**Résultat attendu:** 415 `INVALID_FILE_TYPE`.
**Cas d'erreur:** Flux de sécurité natif.

### WF-149 — Tentative d'accès à un channel sans permission
**Acteur:** Membre
**Préconditions:** Channel avec `@everyone` `deny: VIEW_CHANNEL`.
**Étapes:**
1. Le client falsifié tente `GET /api/channels/:id/messages`.
2. Le serveur calcule les perms via `computePermissions()`. Bit `VIEW_CHANNEL` absent.
3. Rejet de la requête.
**Résultat attendu:** 403 `MISSING_ACCESS`.
**Cas d'erreur:** Flux de sécurité natif.

### WF-150 — Modif de rôle supérieur au sien (403)
**Acteur:** Modérateur
**Préconditions:** `MANAGE_ROLES`, position max 5.
**Étapes:**
1. Le modérateur tente de modifier les perms du rôle de position 6 via `PATCH`.
2. Le contrôleur compare la hiérarchie.
3. Rejet immédiat.
**Résultat attendu:** 403 `ROLE_HIERARCHY_ERROR`.
**Cas d'erreur:** Flux de sécurité natif.
