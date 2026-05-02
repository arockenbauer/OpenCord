# Spécification 21 — Système d'Email (SMTP)

> Spécification du système d'envoi d'emails : configuration SMTP, templates, file d'attente, intégration avec l'authentification et les notifications.
>
> Dépendances : `00-architecture.md`, `01-authentication.md` (reset password, vérification email).

---

## 1. Vue d'ensemble

OpenCord utilise **Nodemailer** pour l'envoi d'emails transactionnels via SMTP. Le système est conçu pour fonctionner en auto-hébergement avec n'importe quel serveur SMTP (Postfix local, Gmail, Mailgun, etc.). En l'absence de configuration SMTP, les emails sont loggés en console (mode développement).

---

## 2. Dépendance

| Technologie | Version | Rôle |
|---|---|---|
| nodemailer | 6+ | Envoi d'emails via SMTP |

---

## 3. Configuration

### 3.1 Variables d'environnement

| Variable | Type | Défaut | Description |
|---|---|---|---|
| `SMTP_ENABLED` | `Boolean` | `false` | Active l'envoi réel d'emails |
| `SMTP_HOST` | `String` | `""` | Hôte du serveur SMTP |
| `SMTP_PORT` | `Int` | `587` | Port SMTP (`587` pour STARTTLS, `465` pour SSL) |
| `SMTP_SECURE` | `Boolean` | `false` | Utiliser SSL/TLS direct (`true` pour port 465) |
| `SMTP_USER` | `String` | `""` | Nom d'utilisateur SMTP |
| `SMTP_PASS` | `String` | `""` | Mot de passe SMTP |
| `SMTP_FROM_NAME` | `String` | `"OpenCord"` | Nom de l'expéditeur |
| `SMTP_FROM_EMAIL` | `String` | `"noreply@opencord.local"` | Adresse de l'expéditeur |

### 3.2 Surcharge via PlatformSettings

Les clés suivantes sont ajoutées à `PlatformSettings` (spec 09) pour permettre la configuration depuis le panneau admin :

| Clé | Type | Description |
|---|---|---|
| `email.smtp_enabled` | Boolean | Override de `SMTP_ENABLED` |
| `email.smtp_host` | String | Override de `SMTP_HOST` |
| `email.smtp_port` | Int | Override de `SMTP_PORT` |
| `email.smtp_secure` | Boolean | Override de `SMTP_SECURE` |
| `email.smtp_user` | String | Override de `SMTP_USER` |
| `email.smtp_pass` | String | Stocké chiffré en base (AES-256-GCM avec `JWT_SECRET` comme clé) |
| `email.from_name` | String | Override de `SMTP_FROM_NAME` |
| `email.from_email` | String | Override de `SMTP_FROM_EMAIL` |

Les valeurs en base ont priorité sur les variables d'environnement.

---

## 4. Service d'envoi

### 4.1 Architecture

Fichier : `packages/server/src/services/email.service.ts`

```typescript
interface EmailOptions {
  to: string;
  subject: string;
  template: EmailTemplate;
  context: Record<string, string>;
  locale?: string;
}

type EmailTemplate =
  | 'email_verification'
  | 'password_reset'
  | 'password_changed'
  | 'login_new_device'
  | 'account_disabled'
  | 'subscription_activated'
  | 'subscription_cancelled'
  | 'subscription_payment_failed';
```

### 4.2 Comportement

```
1. Construire le transporter Nodemailer avec la config SMTP
2. Charger le template HTML correspondant
3. Injecter les variables de contexte (username, lien, date…)
4. Sélectionner la traduction selon la locale de l'utilisateur
5. Envoyer l'email via le transporter
6. Logger le résultat (succès/échec) sans données sensibles
```

### 4.3 Mode développement (SMTP désactivé)

Si `SMTP_ENABLED = false` :
- Les emails ne sont pas envoyés
- Le contenu complet (destinataire, sujet, lien) est loggé en console avec le niveau `info`
- Format du log : `[EMAIL] To: alice@example.com | Subject: Vérification d'email | Link: http://localhost:5173/verify?token=abc123`

---

## 5. Templates d'emails

Les templates sont des fichiers HTML stockés dans `packages/server/src/templates/emails/`.

### Structure des fichiers

```
packages/server/src/templates/emails/
├── layout.html                    # Layout commun (header, footer, styles inline)
├── email_verification.html
├── password_reset.html
├── password_changed.html
├── login_new_device.html
├── account_disabled.html
├── subscription_activated.html
├── subscription_cancelled.html
└── subscription_payment_failed.html
```

### 5.1 Layout commun (`layout.html`)

- En-tête : logo OpenCord (inline base64 ou URL hébergée)
- Corps : zone de contenu injectée via `{{content}}`
- Pied de page : "Cet email a été envoyé par OpenCord. Si vous n'avez pas demandé cette action, ignorez cet email."
- Styles : CSS inline uniquement (compatibilité email)
- Couleurs : fond `#313338`, texte `#DBDEE1`, accent `#7C3AED`, boutons avec `border-radius: 4px`

### 5.2 Templates détaillés

#### `email_verification`

| Variable | Description |
|---|---|
| `{{username}}` | Nom d'utilisateur |
| `{{verification_url}}` | Lien complet de vérification |
| `{{expires_in}}` | Durée de validité ("24 heures") |

Sujet : "Vérifiez votre adresse email — OpenCord"

Contenu : "Bonjour {{username}}, cliquez sur le bouton ci-dessous pour vérifier votre adresse email." + bouton "Vérifier mon email"

#### `password_reset`

| Variable | Description |
|---|---|
| `{{username}}` | Nom d'utilisateur |
| `{{reset_url}}` | Lien de réinitialisation |
| `{{expires_in}}` | "1 heure" |
| `{{ip_address}}` | IP ayant demandé le reset |

Sujet : "Réinitialisation de mot de passe — OpenCord"

#### `password_changed`

| Variable | Description |
|---|---|
| `{{username}}` | Nom d'utilisateur |
| `{{date}}` | Date et heure du changement |
| `{{ip_address}}` | IP de la requête |

Sujet : "Votre mot de passe a été modifié — OpenCord"

#### `login_new_device`

| Variable | Description |
|---|---|
| `{{username}}` | Nom d'utilisateur |
| `{{device_info}}` | User-Agent simplifié |
| `{{ip_address}}` | IP |
| `{{date}}` | Date/heure |
| `{{sessions_url}}` | Lien vers la page des sessions |

Sujet : "Nouvelle connexion détectée — OpenCord"

#### `account_disabled`

| Variable | Description |
|---|---|
| `{{username}}` | Nom d'utilisateur |
| `{{reason}}` | Raison de la désactivation |

Sujet : "Votre compte OpenCord a été désactivé"

#### `subscription_activated`

| Variable | Description |
|---|---|
| `{{username}}` | Nom d'utilisateur |
| `{{plan_name}}` | Nom du plan ("OpenCord+") |
| `{{price}}` | Prix ("5,00 €/mois") |
| `{{features_url}}` | Lien vers la page premium |

Sujet : "Bienvenue dans OpenCord+ ! 🎉"

#### `subscription_cancelled`

| Variable | Description |
|---|---|
| `{{username}}` | Nom d'utilisateur |
| `{{end_date}}` | Date de fin d'abonnement |

Sujet : "Votre abonnement OpenCord+ a été annulé"

#### `subscription_payment_failed`

| Variable | Description |
|---|---|
| `{{username}}` | Nom d'utilisateur |
| `{{retry_date}}` | Date de la prochaine tentative |
| `{{manage_url}}` | Lien vers le portail Stripe |

Sujet : "Échec de paiement — OpenCord+"

---

## 6. Internationalisation des emails

- Chaque template existe en version `fr` et `en`
- Le dossier est organisé par locale : `emails/fr/password_reset.html`, `emails/en/password_reset.html`
- La locale est déterminée par `user.locale` en base
- Fallback sur `en` si la locale n'est pas supportée

---

## 7. File d'attente d'envoi

Les emails sont envoyés de manière **asynchrone** pour ne pas bloquer les routes API :

1. L'envoi d'email est dispatché via une fonction `queueEmail(options: EmailOptions)` qui retourne immédiatement
2. Un worker interne (simple `setImmediate` ou `setTimeout(0)`) traite les emails en séquence
3. En cas d'échec d'envoi (erreur SMTP), le système retente **3 fois** avec un backoff exponentiel (1s, 5s, 30s)
4. Après 3 échecs, l'email est marqué comme `failed` et loggé avec le niveau `error`
5. Pas de persistance en base des emails envoyés en v1 (les logs suffisent)

---

## 8. Panneau admin — Configuration email

Section ajoutée dans **Admin → Paramètres → Email** (requiert `admin_level >= 3`).

### Interface

- Toggle "Activer l'envoi d'emails"
- Champs de configuration SMTP : hôte, port, SSL, identifiants
- Champ "Adresse expéditeur" + "Nom expéditeur"
- Bouton **"Tester la configuration"** → envoie un email de test à l'admin connecté
- Indicateur d'état : ✅ "SMTP connecté" ou ❌ "SMTP inaccessible" (vérifié via `transporter.verify()`)

### Endpoint de test

**`POST /api/admin/email/test`**

Requiert : `admin_level >= 3`

Envoie un email de test à l'adresse de l'admin connecté.

**Réponse 200 OK :** `{ "sent": true, "message_id": "..." }`

**Erreur 500 :** `{ "sent": false, "error": "Connection refused" }`

---

## 9. Intégration avec les specs existantes

### 9.1 Spec 01 — Authentication

Les appels suivants déclenchent maintenant un envoi d'email si `SMTP_ENABLED = true` :

| Route | Email envoyé |
|---|---|
| `POST /api/auth/register` | `email_verification` (si `registration.require_email_verification = true`) |
| `POST /api/auth/password/reset-request` | `password_reset` |
| `POST /api/auth/password/change` | `password_changed` |
| `POST /api/auth/login` (nouveau device) | `login_new_device` |

### 9.2 Spec 09 — Premium

| Webhook Stripe | Email envoyé |
|---|---|
| `checkout.session.completed` | `subscription_activated` |
| `customer.subscription.deleted` | `subscription_cancelled` |
| `invoice.payment_failed` | `subscription_payment_failed` |

### 9.3 Spec 12 — Admin Panel

| Action admin | Email envoyé |
|---|---|
| Désactivation d'un compte | `account_disabled` |

---

## 10. Sécurité

- Les identifiants SMTP ne sont **jamais** retournés dans les réponses API (masqués par `****` dans l'interface admin)
- Le mot de passe SMTP en base est chiffré (AES-256-GCM)
- Les liens dans les emails (reset, verify) utilisent `process.env.CLIENT_URL` comme base
- Les liens expirent selon les durées définies dans la spec 01 (1h pour reset, 24h pour verify)
- Rate limiting sur les routes de reset et verify (spec 15) pour éviter le spam d'emails

---

## Références croisées

- `00-architecture.md` — Stack, variables d'environnement
- `01-authentication.md` — Reset password, vérification email
- `09-premium-boosts.md` — Webhooks Stripe, abonnements
- `12-admin-panel.md` — Panneau admin, PlatformSettings
- `15-rate-limiting-security.md` — Rate limiting
