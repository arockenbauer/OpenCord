# Spécification 26 — Server Insights (Statistiques serveur)

> Spécification du dashboard de statistiques par serveur : croissance des membres, activité, canaux populaires, rétention, heures de pointe.
>
> Dépendances : `00-architecture.md` (stack), `03-servers-channels.md` (guilds, canaux), `05-roles-permissions.md` (permissions).

---

## 1. Vue d'ensemble

Server Insights fournit aux administrateurs de serveur un tableau de bord analytique montrant l'activité et la croissance de leur communauté. Contrairement au panneau admin global (spec 12), ces statistiques sont **par serveur** et accessibles aux utilisateurs ayant la permission `VIEW_GUILD_ANALYTICS`.

---

## 2. Permission requise

| Permission | Bit | Description |
|---|---|---|
| `VIEW_GUILD_ANALYTICS` | `1 << 40` | Accéder aux statistiques du serveur |

Par défaut, seuls les rôles avec `ADMINISTRATOR` ont cette permission. Le propriétaire du serveur peut l'accorder à d'autres rôles.

---

## 3. Collecte de données — Table `guild_analytics_snapshots`

Les statistiques sont pré-calculées et stockées dans des snapshots quotidiens pour éviter les requêtes lourdes en temps réel.

### 3.1 Modèle de données

#### Table `guild_analytics_snapshots`

| Champ | Type | Description |
|---|---|---|
| `id` | `String` (snowflake) | Identifiant |
| `guild_id` | `String` | FK → `guilds.id` |
| `date` | `DateTime` | Date du snapshot (00:00 UTC du jour) |
| `member_count` | `Int` | Nombre total de membres à la fin du jour |
| `member_joins` | `Int` | Nombre de membres ayant rejoint ce jour |
| `member_leaves` | `Int` | Nombre de membres ayant quitté/été kick/ban ce jour |
| `message_count` | `Int` | Nombre de messages envoyés ce jour |
| `active_members` | `Int` | Nombre de membres ayant envoyé au moins 1 message ce jour |
| `active_communicators` | `Int` | Nombre de membres ayant envoyé au moins 1 message ET interagi (réaction, thread) ce jour |
| `voice_minutes` | `Int` | Nombre total de minutes en vocal ce jour (DIFFÉRÉ — 0 en v1) |
| `top_channels` | `Json` | JSON array des 10 canaux les plus actifs : `[{ channel_id, message_count }]` |
| `hourly_messages` | `Json` | JSON array de 24 valeurs : nombre de messages par heure `[h0, h1, ..., h23]` |
| `join_sources` | `Json` | JSON object : `{ "invite": N, "discovery": N, "vanity": N, "bot": N }` |
| `created_at` | `DateTime` | Date de création du snapshot |

Contrainte : `@@unique([guild_id, date])`

### 3.2 Cron de snapshot

Un cron job tourne **chaque jour à 00:05 UTC** et génère un snapshot pour chaque serveur :

1. Compter les membres actuels (`guild_members` WHERE `guild_id`)
2. Compter les joins/leaves du jour (événements `GUILD_MEMBER_ADD` / `GUILD_MEMBER_REMOVE` dans l'audit log ou table de tracking)
3. Compter les messages du jour
4. Identifier les membres actifs
5. Calculer les top canaux
6. Calculer la distribution horaire des messages
7. Agréger les sources de join
8. Insérer le snapshot

**Rétention :** les snapshots sont conservés **90 jours**. Un cron hebdomadaire supprime les snapshots plus anciens.

### 3.3 Tracking des sources de join

Pour distinguer la source d'un nouveau membre, un champ `join_source` est ajouté au tracking interne :

| Source | Description |
|---|---|
| `invite` | Rejoint via un lien d'invitation standard |
| `discovery` | Rejoint via Server Discovery |
| `vanity` | Rejoint via le lien vanity URL |
| `bot` | Ajouté par un bot via l'API |

---

## 4. API

### 4.1 Aperçu global

**`GET /api/guilds/:guildId/analytics/overview`**

Requiert : `VIEW_GUILD_ANALYTICS`

**Query params :**

| Param | Type | Défaut | Description |
|---|---|---|---|
| `period` | `String` | `7d` | Période : `24h`, `7d`, `30d` |

**Réponse 200 OK :**

```json
{
  "guild_id": "1111111111111111111",
  "period": "7d",
  "member_count": 1520,
  "member_count_change": +45,
  "total_joins": 78,
  "total_leaves": 33,
  "total_messages": 12340,
  "total_messages_change_percent": 12.5,
  "active_members": 320,
  "active_members_percent": 21.1,
  "top_channels": [
    { "channel_id": "ch1", "channel_name": "général", "message_count": 3200 },
    { "channel_id": "ch2", "channel_name": "dev", "message_count": 1800 },
    { "channel_id": "ch3", "channel_name": "memes", "message_count": 1200 }
  ],
  "join_sources": {
    "invite": 50,
    "discovery": 18,
    "vanity": 8,
    "bot": 2
  }
}
```

### 4.2 Données historiques (graphiques)

**`GET /api/guilds/:guildId/analytics/timeseries`**

**Query params :**

| Param | Type | Défaut | Description |
|---|---|---|---|
| `metric` | `String` | (requis) | Métrique : `members`, `messages`, `joins`, `leaves`, `active_members` |
| `period` | `String` | `30d` | Période : `7d`, `30d`, `90d` |

**Réponse 200 OK :**

```json
{
  "metric": "members",
  "period": "30d",
  "data": [
    { "date": "2025-01-01", "value": 1420 },
    { "date": "2025-01-02", "value": 1425 },
    { "date": "2025-01-03", "value": 1430 }
  ]
}
```

### 4.3 Distribution horaire

**`GET /api/guilds/:guildId/analytics/hourly`**

**Query params :** `?period=7d` (agrège les données horaires sur la période)

**Réponse 200 OK :**

```json
{
  "period": "7d",
  "hours": [120, 85, 45, 30, 22, 15, 25, 60, 150, 280, 350, 380, 400, 420, 390, 370, 340, 310, 290, 320, 350, 280, 220, 160]
}
```

Les 24 valeurs représentent le nombre moyen de messages par heure (0h–23h UTC).

### 4.4 Rétention

**`GET /api/guilds/:guildId/analytics/retention`**

Calcul de la rétention des nouveaux membres sur les 4 dernières semaines.

**Réponse 200 OK :**

```json
{
  "weeks": [
    {
      "cohort_start": "2024-12-23",
      "cohort_size": 50,
      "retention": [100, 72, 58, 48]
    },
    {
      "cohort_start": "2024-12-30",
      "cohort_size": 45,
      "retention": [100, 68, 55]
    },
    {
      "cohort_start": "2025-01-06",
      "cohort_size": 60,
      "retention": [100, 75]
    },
    {
      "cohort_start": "2025-01-13",
      "cohort_size": 52,
      "retention": [100]
    }
  ]
}
```

Chaque valeur de `retention` est un pourcentage : semaine 0 = 100% (arrivée), semaine 1 = % encore présent après 7 jours, etc.

**Logique :** un membre est "retenu" s'il est toujours membre du serveur à la fin de la semaine N.

---

## 5. Interface — Paramètres du serveur → Insights

### 5.1 Navigation

Accessible via **Paramètres du serveur → Insights** (visible uniquement si l'utilisateur a `VIEW_GUILD_ANALYTICS`).

### 5.2 Sélecteur de période

Barre en haut de page avec 3 boutons pill : **24h** | **7 jours** | **30 jours**. Sélection affecte tous les widgets en dessous.

### 5.3 Cartes KPI (rangée horizontale)

4 cartes en haut de page :

| Carte | Valeur | Sous-valeur |
|---|---|---|
| **Membres** | `1 520` | `+45 ↑` (vert si positif, rouge si négatif) |
| **Messages** | `12 340` | `+12.5% ↑` vs période précédente |
| **Membres actifs** | `320` | `21.1% du total` |
| **Arrivées / Départs** | `78 / 33` | Barres proportionnelles vert/rouge |

### 5.4 Graphiques

**Graphique principal — Croissance des membres :**
- Graphique en lignes (line chart), axe X = dates, axe Y = nombre de membres
- Couleur : `--bg-accent`
- Tooltip au hover : date + valeur exacte
- Dropdown pour changer la métrique : Membres / Messages / Membres actifs

**Graphique — Arrivées vs Départs :**
- Graphique en barres empilées
- Barres vertes (joins) et rouges (leaves)
- Axe X = dates

**Graphique — Heures de pointe :**
- Graphique en barres horizontal ou heatmap
- 24 barres (0h–23h), hauteur proportionnelle au nombre de messages
- Couleur gradient de `--text-muted` à `--bg-accent` selon l'intensité
- Label : "{N} messages en moyenne" au hover

### 5.5 Top Canaux

Tableau des 10 canaux les plus actifs :

| Colonne | Description |
|---|---|
| # | Position (1–10) |
| Canal | `#nom` avec icône de type |
| Messages | Nombre de messages sur la période |
| % | Pourcentage du total des messages |
| Barre | Barre de progression proportionnelle |

### 5.6 Sources d'arrivée

Graphique en anneau (donut chart) :
- Segments : Invitations (bleu), Discovery (vert), Vanity URL (violet), Bot (gris)
- Centre : nombre total d'arrivées
- Légende à droite avec pourcentages

### 5.7 Rétention

Tableau de rétention type cohorte :
- Lignes : cohortes hebdomadaires (4 dernières semaines)
- Colonnes : Semaine 0, Semaine 1, Semaine 2, Semaine 3
- Cellules : pourcentage avec code couleur (vert foncé = élevé, rouge = faible)
- Tooltip : "{N} membres sur {total}" au hover

### 5.8 Empty State

Si le serveur a moins de 7 jours d'existence ou moins de 10 membres :
- Message : "Les statistiques seront disponibles lorsque votre serveur aura plus d'historique."
- Illustration placeholder

---

## 6. Performances et limites

- Les endpoints analytics sont rate-limités à **10 requêtes/minute** par utilisateur
- Les snapshots sont calculés en arrière-plan (cron), jamais en temps réel pour éviter les requêtes SQL lourdes
- Les données `top_channels` et `hourly_messages` sont stockées en JSON pour éviter des tables de jointure supplémentaires
- L'endpoint `retention` effectue un calcul à la demande (pas de snapshot) mais est caché côté serveur pendant 1 heure
- Les serveurs avec plus de 50 000 membres ont un snapshot limité aux 20 top canaux

---

## Références croisées

- `00-architecture.md` — Stack, cron jobs
- `03-servers-channels.md` — Guilds, canaux
- `05-roles-permissions.md` — Permissions (`VIEW_GUILD_ANALYTICS`)
- `07-invitations-friends-dms.md` — Sources d'invitation, vanity URL
- `12-admin-panel.md` — Dashboard admin global (statistiques plateforme)
- `19-server-discovery.md` — Source "discovery" pour les joins
