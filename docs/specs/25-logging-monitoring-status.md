# Spécification 25 — Logging, Monitoring & Page de Statut

> Spécification du système de logging structuré, d'export SFTP des logs, du monitoring applicatif, et de la page de statut publique style BetterStack.
>
> Dépendances : `00-architecture.md` (stack), `12-admin-panel.md` (panneau admin).

---

## 1. Vue d'ensemble

OpenCord implémente un système de logging structuré (JSON) via **Pino**, un export optionnel des logs via SFTP, un système de monitoring interne avec health checks, et une page de statut publique inspirée de BetterStack permettant aux utilisateurs de consulter l'état de la plateforme.

---

## 2. Stack

| Technologie | Version | Rôle |
|---|---|---|
| pino | 9+ | Logger structuré JSON haute performance |
| pino-pretty | 11+ | Formatage lisible en développement |
| pino-rotate | 1+ | Rotation automatique des fichiers de log |
| ssh2-sftp-client | 9+ | Export SFTP des logs |

---

## 3. Logging structuré

### 3.1 Configuration du logger

Fichier : `packages/server/src/utils/logger.ts`

```typescript
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development'
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
    : undefined,
  serializers: {
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
    err: pino.stdSerializers.err,
  },
  redact: {
    paths: ['req.headers.authorization', 'password', 'token', 'secret', 'two_factor_secret'],
    censor: '[REDACTED]',
  },
});
```

### 3.2 Niveaux de log

| Niveau | Valeur | Usage |
|---|---|---|
| `fatal` | 60 | Erreur fatale, le processus doit s'arrêter |
| `error` | 50 | Erreur récupérable mais anormale |
| `warn` | 40 | Situation inattendue mais gérée |
| `info` | 30 | Événement métier important (login, création serveur, backup) |
| `debug` | 20 | Information de débogage détaillée |
| `trace` | 10 | Traçage très détaillé (requêtes SQL, payloads Socket.IO) |

### 3.3 Variables d'environnement

| Variable | Type | Défaut | Description |
|---|---|---|---|
| `LOG_LEVEL` | `String` | `info` | Niveau minimum de log |
| `LOG_FILE_ENABLED` | `Boolean` | `true` | Écrire les logs dans un fichier |
| `LOG_FILE_PATH` | `String` | `./logs/opencord.log` | Chemin du fichier de log |
| `LOG_FILE_MAX_SIZE` | `String` | `50m` | Taille max avant rotation |
| `LOG_FILE_MAX_FILES` | `Int` | `30` | Nombre de fichiers de rotation conservés |

### 3.4 Format des logs (production)

```json
{
  "level": 30,
  "time": 1705312800000,
  "pid": 12345,
  "hostname": "opencord-server",
  "msg": "User logged in",
  "module": "auth",
  "userId": "1111111111111111111",
  "ip": "192.168.1.42",
  "duration_ms": 45
}
```

### 3.5 Middleware Express de logging

```typescript
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info({
      module: 'http',
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration_ms: Date.now() - start,
      ip: req.ip,
      userId: req.user?.userId,
    });
  });
  next();
});
```

### 3.6 Conventions de logging par module

| Module | Événements loggés (info) |
|---|---|
| `auth` | login, register, 2FA enable/disable, password change, token refresh |
| `guild` | create, delete, member join/leave, ownership transfer |
| `channel` | create, delete, permission change |
| `message` | bulk delete (avec count), pin/unpin |
| `moderation` | kick, ban, timeout, automod action |
| `admin` | toutes les actions admin (user ban, badge assign, setting change) |
| `backup` | backup start/complete/fail, restore |
| `email` | email sent/failed (sans contenu sensible) |
| `stripe` | webhook received, subscription change |
| `gateway` | connection, disconnection, error |

---

## 4. Rotation des logs

### 4.1 Rotation locale

Les fichiers de log sont rotationnés automatiquement :
- Par taille : quand `LOG_FILE_MAX_SIZE` est atteint
- Nommage : `opencord.log`, `opencord.log.1`, `opencord.log.2`, ... `opencord.log.{MAX_FILES}`
- Les fichiers au-delà de `LOG_FILE_MAX_FILES` sont supprimés automatiquement

### 4.2 Structure du dossier logs

```
packages/server/logs/
├── opencord.log           # Log actuel
├── opencord.log.1         # Rotation précédente
├── opencord.log.2
└── ...
```

---

## 5. Export SFTP des logs

### 5.1 Configuration

| Variable | Type | Défaut | Description |
|---|---|---|---|
| `SFTP_EXPORT_ENABLED` | `Boolean` | `false` | Active l'export SFTP |
| `SFTP_HOST` | `String` | `""` | Hôte du serveur SFTP |
| `SFTP_PORT` | `Int` | `22` | Port SFTP |
| `SFTP_USER` | `String` | `""` | Utilisateur SFTP |
| `SFTP_PASSWORD` | `String?` | `null` | Mot de passe SFTP |
| `SFTP_PRIVATE_KEY_PATH` | `String?` | `null` | Chemin de la clé privée SSH |
| `SFTP_REMOTE_PATH` | `String` | `/logs/opencord/` | Chemin distant de dépôt |
| `SFTP_EXPORT_CRON` | `String` | `0 */6 * * *` | Expression cron (défaut : toutes les 6h) |

### 5.2 PlatformSettings

| Clé | Type | Description |
|---|---|---|
| `logging.sftp_enabled` | Boolean | Override de `SFTP_EXPORT_ENABLED` |
| `logging.sftp_host` | String | Override de `SFTP_HOST` |
| `logging.sftp_port` | Int | Override de `SFTP_PORT` |
| `logging.sftp_user` | String | Override |
| `logging.sftp_password` | String | Stocké chiffré (AES-256-GCM) |
| `logging.sftp_remote_path` | String | Override |
| `logging.sftp_cron` | String | Override |

### 5.3 Processus d'export

1. Le cron job collecte tous les fichiers de log rotationnés depuis le dernier export
2. Connexion SFTP avec authentification par mot de passe ou clé privée
3. Upload des fichiers dans `SFTP_REMOTE_PATH/YYYY-MM-DD/`
4. Log du résultat (succès avec nombre de fichiers, ou erreur)
5. Les fichiers exportés sont marqués (via un fichier `.exported` marker) pour ne pas être ré-exportés

---

## 6. Monitoring & Health Checks

### 6.1 Endpoint de santé

**`GET /api/health`**

Route publique, pas d'authentification requise.

**Réponse 200 OK :**
```json
{
  "status": "healthy",
  "version": "0.1.0",
  "uptime_seconds": 345600,
  "checks": {
    "database": { "status": "healthy", "latency_ms": 2 },
    "filesystem": { "status": "healthy", "disk_free_gb": 45.2 },
    "memory": {
      "status": "healthy",
      "heap_used_mb": 128,
      "heap_total_mb": 256,
      "rss_mb": 310
    }
  },
  "timestamp": "2025-01-15T10:00:00.000Z"
}
```

**Réponse 503 Service Unavailable :** si un check est en erreur :
```json
{
  "status": "unhealthy",
  "checks": {
    "database": { "status": "unhealthy", "error": "SQLITE_BUSY" }
  }
}
```

### 6.2 Endpoint de métriques détaillées (admin)

**`GET /api/admin/metrics`**

Requiert : `admin_level >= 1`

**Réponse 200 OK :**
```json
{
  "system": {
    "uptime_seconds": 345600,
    "uptime_human": "4 jours",
    "node_version": "v20.11.0",
    "platform": "linux",
    "arch": "x64",
    "cpu_count": 4,
    "load_average": [0.5, 0.7, 0.6]
  },
  "memory": {
    "heap_used_mb": 128,
    "heap_total_mb": 256,
    "external_mb": 12,
    "rss_mb": 310
  },
  "database": {
    "size_mb": 52,
    "wal_size_mb": 3,
    "latency_ms": 2
  },
  "storage": {
    "uploads_size_mb": 1024,
    "backups_size_mb": 3150,
    "logs_size_mb": 200,
    "disk_free_gb": 45.2
  },
  "connections": {
    "socket_count": 340,
    "unique_users": 312
  },
  "counters": {
    "total_users": 1250,
    "total_guilds": 45,
    "messages_today": 4520,
    "messages_this_hour": 312
  }
}
```

### 6.3 Monitoring interne

Le serveur effectue des health checks internes **toutes les 60 secondes** :

| Check | Action si échec |
|---|---|
| Database ping (`SELECT 1`) | Log `error`, marquer `unhealthy` |
| Espace disque < 1 GB | Log `warn` |
| Espace disque < 100 MB | Log `fatal`, marquer `unhealthy` |
| Heap memory > 90% | Log `warn` |
| Heap memory > 95% | Log `error`, force garbage collection si possible |

---

## 7. Page de statut publique

### 7.1 Modèle de données

#### Table `status_monitors`

| Champ | Type | Description |
|---|---|---|
| `id` | `String` (snowflake) | Identifiant |
| `name` | `String` | Nom du service (ex: "API", "WebSocket", "Base de données") |
| `description` | `String?` | Description du service |
| `type` | `String` | `http`, `database`, `websocket`, `custom` |
| `endpoint` | `String?` | URL ou identifiant du check |
| `interval_seconds` | `Int` | Intervalle de vérification (défaut: 60) |
| `enabled` | `Boolean` | Monitor actif |
| `position` | `Int` | Ordre d'affichage |
| `created_at` | `DateTime` | Date de création |

#### Table `status_checks`

| Champ | Type | Description |
|---|---|---|
| `id` | `String` (snowflake) | Identifiant |
| `monitor_id` | `String` | FK → `status_monitors.id` |
| `status` | `String` | `up`, `down`, `degraded` |
| `latency_ms` | `Int?` | Temps de réponse |
| `error` | `String?` | Message d'erreur si `down` |
| `checked_at` | `DateTime` | Date du check |

Rétention : **90 jours** de données de checks. Les données plus anciennes sont agrégées en résumés journaliers puis supprimées.

#### Table `status_incidents`

| Champ | Type | Description |
|---|---|---|
| `id` | `String` (snowflake) | Identifiant |
| `title` | `String` | Titre de l'incident (ex: "Ralentissements de l'API") |
| `status` | `String` | `investigating`, `identified`, `monitoring`, `resolved` |
| `impact` | `String` | `none`, `minor`, `major`, `critical` |
| `created_by` | `String` | FK → `users.id` (admin) |
| `created_at` | `DateTime` | Date de début |
| `resolved_at` | `DateTime?` | Date de résolution |

#### Table `status_incident_updates`

| Champ | Type | Description |
|---|---|---|
| `id` | `String` (snowflake) | Identifiant |
| `incident_id` | `String` | FK → `status_incidents.id` |
| `status` | `String` | Statut au moment de la mise à jour |
| `message` | `String` | Message de mise à jour (Markdown) |
| `created_by` | `String` | FK → `users.id` |
| `created_at` | `DateTime` | Date |

#### Table `status_maintenances`

| Champ | Type | Description |
|---|---|---|
| `id` | `String` (snowflake) | Identifiant |
| `title` | `String` | Titre (ex: "Maintenance planifiée — mise à jour v0.2.0") |
| `description` | `String` | Description (Markdown) |
| `scheduled_start` | `DateTime` | Début prévu |
| `scheduled_end` | `DateTime` | Fin prévue |
| `status` | `String` | `scheduled`, `in_progress`, `completed` |
| `auto_maintenance_mode` | `Boolean` | Active automatiquement le mode maintenance au début |
| `created_by` | `String` | FK → `users.id` |
| `created_at` | `DateTime` | Date de création |

---

### 7.2 Monitors prédéfinis (seed)

| Nom | Type | Description |
|---|---|---|
| API | `http` | Vérifie `GET /api/health` |
| WebSocket | `websocket` | Vérifie la connexion Socket.IO |
| Base de données | `database` | Vérifie `SELECT 1` sur SQLite |
| Stockage fichiers | `custom` | Vérifie l'accès en lecture/écriture au dossier uploads |

---

### 7.3 API publique de la page de statut

#### `GET /api/status`

Route publique. Retourne l'état global de la plateforme.

**Réponse 200 OK :**
```json
{
  "overall_status": "operational",
  "monitors": [
    {
      "id": "mon_1",
      "name": "API",
      "status": "up",
      "uptime_percentage_30d": 99.95,
      "latency_ms": 12,
      "last_checked_at": "2025-01-15T10:00:00.000Z"
    },
    {
      "id": "mon_2",
      "name": "WebSocket",
      "status": "up",
      "uptime_percentage_30d": 99.99,
      "latency_ms": 3,
      "last_checked_at": "2025-01-15T10:00:00.000Z"
    }
  ],
  "active_incidents": [],
  "upcoming_maintenances": [
    {
      "id": "maint_1",
      "title": "Mise à jour v0.2.0",
      "scheduled_start": "2025-01-20T02:00:00.000Z",
      "scheduled_end": "2025-01-20T02:30:00.000Z",
      "status": "scheduled"
    }
  ]
}
```

`overall_status` : `operational`, `degraded`, `partial_outage`, `major_outage`

Calcul : si un monitor est `down` → au moins `partial_outage`. Si >50% sont `down` → `major_outage`.

#### `GET /api/status/history`

**Paramètres :** `days` (défaut: 90, max: 90)

Retourne l'historique des checks agrégé par jour :

```json
{
  "monitors": [
    {
      "id": "mon_1",
      "name": "API",
      "daily_history": [
        { "date": "2025-01-15", "uptime_percentage": 100, "avg_latency_ms": 11, "incidents": 0 },
        { "date": "2025-01-14", "uptime_percentage": 99.8, "avg_latency_ms": 15, "incidents": 1 }
      ]
    }
  ]
}
```

#### `GET /api/status/incidents`

**Paramètres :** `status` (filtrer), `limit` (défaut: 20), `offset`

Retourne les incidents avec leurs mises à jour.

---

### 7.4 API admin — Gestion du statut

#### Incidents

**`POST /api/admin/status/incidents`** — Créer un incident

Requiert : `admin_level >= 1`

```json
{
  "title": "Ralentissements de l'API",
  "status": "investigating",
  "impact": "minor",
  "message": "Nous investiguons des temps de réponse élevés sur l'API."
}
```

**`POST /api/admin/status/incidents/:id/updates`** — Ajouter une mise à jour

```json
{
  "status": "identified",
  "message": "La cause a été identifiée : charge élevée sur la base de données. Correction en cours."
}
```

**`PATCH /api/admin/status/incidents/:id`** — Résoudre un incident

```json
{
  "status": "resolved",
  "message": "Le problème a été résolu. Les performances sont revenues à la normale."
}
```

#### Maintenances

**`POST /api/admin/status/maintenances`** — Planifier une maintenance

Requiert : `admin_level >= 2`

```json
{
  "title": "Mise à jour vers v0.2.0",
  "description": "Mise à jour incluant les événements programmés et le server discovery.",
  "scheduled_start": "2025-01-20T02:00:00.000Z",
  "scheduled_end": "2025-01-20T02:30:00.000Z",
  "auto_maintenance_mode": true
}
```

**`PATCH /api/admin/status/maintenances/:id`** — Modifier/compléter une maintenance

#### Monitors

**`POST /api/admin/status/monitors`** — Créer un monitor custom

**`PATCH /api/admin/status/monitors/:id`** — Modifier (activer/désactiver, changer l'intervalle)

**`DELETE /api/admin/status/monitors/:id`** — Supprimer un monitor

---

## 8. Interface — Page de statut publique (`/status`)

### 8.1 Structure de la page

1. **Header** : logo OpenCord + titre "Statut du système"
2. **Bannière de statut global** :
   - ✅ Vert : "Tous les systèmes sont opérationnels"
   - 🟡 Jaune : "Performances dégradées"
   - 🟠 Orange : "Panne partielle"
   - 🔴 Rouge : "Panne majeure"
3. **Maintenance à venir** : bannière bleue si une maintenance est programmée dans les 72h
4. **Liste des monitors** : chaque monitor est une ligne avec :
   - Nom du service
   - Badge de statut (Up ✅ / Dégradé 🟡 / Down 🔴)
   - Barre de disponibilité 90 jours : 90 barres verticales (1 par jour), vertes/jaunes/rouges selon le pourcentage d'uptime
   - Pourcentage d'uptime sur 30 jours
   - Latence actuelle
5. **Incidents récents** : liste des 10 derniers incidents avec timeline de mises à jour
6. **Historique des incidents** : liste paginée, groupée par mois

### 8.2 Barre de disponibilité (90 jours)

Chaque barre représente un jour :
- **Vert** (`#57F287`) : uptime ≥ 99.5%
- **Jaune** (`#FEE75C`) : uptime entre 95% et 99.5%
- **Rouge** (`#ED4245`) : uptime < 95%
- **Gris** (`#4F545C`) : pas de données

Au hover d'une barre : tooltip avec la date, le pourcentage d'uptime, le nombre d'incidents.

### 8.3 Timeline d'un incident

```
🔴 Investigating — 15 janv. 10:00
  "Nous investiguons des temps de réponse élevés..."

🟡 Identified — 15 janv. 10:15
  "La cause a été identifiée..."

🟢 Resolved — 15 janv. 10:45
  "Le problème a été résolu."
```

### 8.4 Design

- Page accessible sans authentification
- Fond : `#1a1a2e` (plus sombre que l'app principale pour se démarquer)
- Police : même système typographique que l'app
- Responsive : fonctionne sur mobile (barres de disponibilité adaptatives)
- Pas de sidebar, pas de navigation de l'app — page autonome

---

## 9. Interface admin — Monitoring (`/admin/monitoring`)

### 9.1 Dashboard monitoring

- **Métriques en temps réel** : CPU, mémoire, connexions, messages/heure (graphiques sparkline)
- **Monitors** : état de chaque monitor avec bouton enable/disable
- **Logs récents** : 50 dernières lignes du log (streaming en temps réel via Socket.IO)

### 9.2 Gestion des incidents

- Bouton "Déclarer un incident"
- Liste des incidents ouverts avec boutons "Mettre à jour" et "Résoudre"
- Historique des incidents passés

### 9.3 Gestion des maintenances

- Calendrier des maintenances programmées
- Bouton "Planifier une maintenance"
- Formulaire : titre, description, date début/fin, toggle mode maintenance auto

### 9.4 Configuration du logging

- Sélecteur de niveau de log (`trace` → `fatal`)
- Toggle "Écriture fichier"
- Configuration SFTP : hôte, port, identifiants, chemin distant, cron
- Bouton "Tester la connexion SFTP"
- Bouton "Exporter les logs maintenant" (force un export SFTP immédiat)

---

## 10. Mode maintenance

Quand le mode maintenance est activé (manuellement ou via `auto_maintenance_mode` d'une maintenance programmée) :

- Toutes les routes API retournent `503 Service Unavailable` avec :
```json
{
  "error": "MAINTENANCE_MODE",
  "message": "OpenCord est en maintenance. Veuillez réessayer plus tard.",
  "retry_after": 1800,
  "maintenance": {
    "title": "Mise à jour v0.2.0",
    "scheduled_end": "2025-01-20T02:30:00.000Z"
  }
}
```
- Exception : `/api/health`, `/api/status`, et routes `/api/admin/*` restent accessibles
- Le frontend affiche une page de maintenance dédiée avec le titre et l'heure de fin estimée
- Les connexions Socket.IO existantes reçoivent `MAINTENANCE_MODE` et sont déconnectées gracieusement

---

## 11. Audit Log

| Code | Description |
|---|---|
| `INCIDENT_CREATE` | Incident déclaré |
| `INCIDENT_UPDATE` | Mise à jour d'incident |
| `INCIDENT_RESOLVE` | Incident résolu |
| `MAINTENANCE_CREATE` | Maintenance planifiée |
| `MAINTENANCE_START` | Maintenance démarrée |
| `MAINTENANCE_COMPLETE` | Maintenance terminée |
| `LOG_LEVEL_CHANGE` | Niveau de log modifié |
| `SFTP_EXPORT` | Export SFTP exécuté |

---

## Références croisées

- `00-architecture.md` — Stack, conventions
- `12-admin-panel.md` — Panneau admin, PlatformSettings
- `15-rate-limiting-security.md` — Sécurité, headers
- `23-backup-restore.md` — Backups (mode maintenance pendant restore)
