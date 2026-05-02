# Spécification 23 — Backup & Restore

> Spécification du système de sauvegarde et restauration de la base de données SQLite et des fichiers uploadés.
>
> Dépendances : `00-architecture.md` (stack, stockage fichiers), `12-admin-panel.md` (panneau admin).

---

## 1. Vue d'ensemble

OpenCord étant auto-hébergé avec une base SQLite locale et un stockage fichier local, une stratégie de sauvegarde robuste est indispensable. Le système propose des backups automatiques (cron) et manuels (via le panneau admin), avec possibilité de restauration complète.

---

## 2. Composants sauvegardés

| Composant | Chemin | Inclus dans le backup |
|---|---|---|
| Base de données SQLite | `packages/server/prisma/opencord.db` | ✅ |
| WAL journal | `packages/server/prisma/opencord.db-wal` | ✅ |
| SHM file | `packages/server/prisma/opencord.db-shm` | ✅ |
| Fichiers uploadés | `packages/server/uploads/` | ✅ (optionnel, configurable) |

---

## 3. Configuration

### 3.1 Variables d'environnement

| Variable | Type | Défaut | Description |
|---|---|---|---|
| `BACKUP_ENABLED` | `Boolean` | `true` | Active les backups automatiques |
| `BACKUP_CRON` | `String` | `0 3 * * *` | Expression cron (défaut : 3h du matin chaque jour) |
| `BACKUP_RETENTION_DAYS` | `Int` | `30` | Nombre de jours de rétention des backups |
| `BACKUP_INCLUDE_UPLOADS` | `Boolean` | `true` | Inclure les fichiers uploadés dans le backup |
| `BACKUP_DIR` | `String` | `./backups` | Répertoire de stockage des backups |
| `BACKUP_MAX_SIZE_GB` | `Int` | `10` | Taille maximale totale des backups avant rotation |

### 3.2 PlatformSettings

| Clé | Type | Description |
|---|---|---|
| `backup.enabled` | Boolean | Override de `BACKUP_ENABLED` |
| `backup.cron_expression` | String | Override de `BACKUP_CRON` |
| `backup.retention_days` | Int | Override de `BACKUP_RETENTION_DAYS` |
| `backup.include_uploads` | Boolean | Override de `BACKUP_INCLUDE_UPLOADS` |

---

## 4. Processus de backup

### 4.1 Backup de la base de données

SQLite supporte le backup à chaud via l'API `VACUUM INTO` ou la commande `.backup`. OpenCord utilise l'API `better-sqlite3` :

```typescript
import Database from 'better-sqlite3';

async function backupDatabase(destPath: string): Promise<void> {
  const db = new Database(process.env.DATABASE_URL.replace('file:', ''));
  await db.backup(destPath);
  db.close();
}
```

**Avantage** : `better-sqlite3.backup()` crée une copie cohérente de la base sans interrompre les écritures en cours (utilise le mécanisme de snapshot SQLite).

### 4.2 Backup des fichiers uploadés

Si `BACKUP_INCLUDE_UPLOADS = true`, le dossier `uploads/` est archivé via `tar` (ou une implémentation Node.js pure avec `archiver`).

### 4.3 Format du backup

Chaque backup produit un fichier unique :

```
backups/
├── opencord-backup-2025-01-15T03-00-00.tar.gz
├── opencord-backup-2025-01-14T03-00-00.tar.gz
└── opencord-backup-2025-01-13T03-00-00.tar.gz
```

**Structure interne de l'archive :**
```
opencord-backup-2025-01-15T03-00-00/
├── database/
│   └── opencord.db           # Copie cohérente de la base
├── uploads/                   # (si inclus)
│   ├── avatars/
│   ├── banners/
│   ├── attachments/
│   ├── emojis/
│   └── stickers/
└── metadata.json              # Informations sur le backup
```

### 4.4 Fichier `metadata.json`

```json
{
  "version": "1.0.0",
  "created_at": "2025-01-15T03:00:00.000Z",
  "opencord_version": "0.1.0",
  "database_size_bytes": 52428800,
  "uploads_size_bytes": 1073741824,
  "total_size_bytes": 1126170624,
  "includes_uploads": true,
  "user_count": 1250,
  "guild_count": 45,
  "message_count": 125000
}
```

---

## 5. Cron Job

### 5.1 Implémentation

Le cron est géré via `node-cron` (ou un simple `setInterval` vérifiant l'heure).

| Tâche | Fréquence | Description |
|---|---|---|
| Backup automatique | Configurable (défaut: quotidien 3h) | Crée un backup complet |
| Rotation des backups | Après chaque backup | Supprime les backups de plus de `BACKUP_RETENTION_DAYS` jours |
| Vérification de taille | Après chaque backup | Si la taille totale dépasse `BACKUP_MAX_SIZE_GB`, supprime les plus anciens |

### 5.2 Logging

Chaque exécution du cron est loggée :
- `[BACKUP] Starting backup...`
- `[BACKUP] Database backup completed (52 MB)`
- `[BACKUP] Uploads archive completed (1.02 GB)`
- `[BACKUP] Backup saved: opencord-backup-2025-01-15T03-00-00.tar.gz (1.07 GB)`
- `[BACKUP] Rotated 2 old backups`

En cas d'erreur :
- `[BACKUP] ERROR: Failed to backup database: <error message>`

---

## 6. API

### 6.1 Lister les backups

**`GET /api/admin/backups`**

Requiert : `admin_level >= 3`

**Réponse 200 OK :**
```json
{
  "backups": [
    {
      "filename": "opencord-backup-2025-01-15T03-00-00.tar.gz",
      "created_at": "2025-01-15T03:00:00.000Z",
      "size_bytes": 1126170624,
      "size_human": "1.07 GB",
      "includes_uploads": true,
      "metadata": {
        "opencord_version": "0.1.0",
        "user_count": 1250,
        "guild_count": 45,
        "message_count": 125000
      }
    }
  ],
  "total_size_bytes": 3378511872,
  "total_size_human": "3.15 GB",
  "next_scheduled": "2025-01-16T03:00:00.000Z"
}
```

---

### 6.2 Créer un backup manuel

**`POST /api/admin/backups`**

Requiert : `admin_level >= 3`

**Corps de la requête :**
```json
{
  "include_uploads": true
}
```

**Réponse 202 Accepted :**
```json
{
  "status": "in_progress",
  "estimated_duration_seconds": 120
}
```

Le backup est exécuté de manière asynchrone. Un événement `ADMIN_BACKUP_COMPLETE` est émis via Socket.IO à l'admin quand il est terminé.

---

### 6.3 Télécharger un backup

**`GET /api/admin/backups/:filename/download`**

Requiert : `admin_level >= 3`

Retourne le fichier `.tar.gz` en téléchargement direct (Content-Disposition: attachment).

---

### 6.4 Supprimer un backup

**`DELETE /api/admin/backups/:filename`**

Requiert : `admin_level >= 3`

**Réponse 204 No Content**

---

### 6.5 Restaurer un backup

**`POST /api/admin/backups/:filename/restore`**

Requiert : `admin_level >= 3`

**Corps de la requête :**
```json
{
  "confirm": "RESTORE",
  "restore_uploads": true
}
```

Le champ `confirm` doit contenir exactement `"RESTORE"` (protection contre les restaurations accidentelles).

**Réponse 202 Accepted :**
```json
{
  "status": "in_progress",
  "warning": "Le serveur va redémarrer après la restauration. Toutes les sessions seront terminées."
}
```

**Processus de restauration :**
1. Vérifier l'intégrité de l'archive (checksum)
2. Mettre l'application en mode maintenance (rejeter toutes les requêtes sauf `/api/health`)
3. Déconnecter tous les sockets
4. Fermer la connexion Prisma
5. Remplacer `opencord.db` par la copie du backup
6. Si `restore_uploads = true` : remplacer le dossier `uploads/`
7. Redémarrer le processus (via `process.exit(0)` avec un process manager comme PM2 qui redémarre automatiquement)

---

### 6.6 Uploader un backup externe

**`POST /api/admin/backups/upload`**

Requiert : `admin_level >= 3`. Multipart/form-data, champ `file`.

Permet d'uploader un backup `.tar.gz` créé sur une autre instance pour migration.

**Validation :**
- Vérifier que l'archive contient `metadata.json` et `database/opencord.db`
- Vérifier la compatibilité de version (`metadata.opencord_version`)

**Réponse 201 Created :** informations du backup uploadé

---

## 7. Interface admin — Sauvegardes (`/admin/backups`)

### Page de gestion

- **En-tête** : titre "Sauvegardes", taille totale des backups, prochain backup programmé
- **Boutons** : "Créer un backup maintenant", "Uploader un backup"
- **Tableau des backups** :
  - Colonne date/heure
  - Colonne taille
  - Colonne contenu (📦 DB + 📁 Uploads / 📦 DB seule)
  - Colonne version OpenCord
  - Boutons : Télécharger, Restaurer, Supprimer
- **Modale de restauration** :
  - Avertissement en rouge : "Cette action remplacera toutes les données actuelles. Cette opération est irréversible."
  - Checkbox "Restaurer les fichiers uploadés"
  - Champ de confirmation : saisir "RESTORE"
  - Bouton "Restaurer" (rouge, `danger` variant)
- **Section Configuration** :
  - Toggle "Backups automatiques"
  - Champ expression cron (avec aide visuelle : "Tous les jours à 3h")
  - Champ rétention (jours)
  - Toggle "Inclure les fichiers uploadés"
  - Champ taille max des backups (GB)

---

## 8. Audit Log

| Code | Description |
|---|---|
| `BACKUP_CREATE` | Backup manuel créé |
| `BACKUP_DELETE` | Backup supprimé |
| `BACKUP_RESTORE` | Restauration effectuée |
| `BACKUP_UPLOAD` | Backup externe uploadé |

---

## 9. Sécurité

- Les backups contiennent des données sensibles (hashes de mots de passe, tokens, secrets 2FA). Le répertoire `backups/` doit avoir des permissions filesystem restrictives (`chmod 700`).
- L'accès aux endpoints de backup est limité à `admin_level >= 3` (Super Admin uniquement).
- Les téléchargements de backup sont loggés dans l'audit log admin.
- Le contenu des backups n'est jamais mis en cache par Express (headers `Cache-Control: no-store`).

---

## Références croisées

- `00-architecture.md` — Stack, SQLite, structure des uploads
- `12-admin-panel.md` — Panneau admin, niveaux d'administration
- `17-file-storage.md` — Structure du dossier uploads
