# Spécification 35 — Notes utilisateurs, recherche avancée & raccourcis clavier

## 1. Notes utilisateurs

```prisma
model UserNote {
  user_id        String // auteur de la note
  target_user_id String // utilisateur noté
  content        String @db.VarChar(256)
  created_at     DateTime @default(now())
  updated_at     DateTime @updatedAt
  @@id([user_id, target_user_id])
}
```

### Endpoints
| Méthode | Chemin | Description |
|--------|--------|-------------|
| **PUT** | `/api/users/@me/notes/:userId` | Crée ou met à jour une note (corps `{ "note": "..." }`) |
| **DELETE** | `/api/users/@me/notes/:userId` | Supprime la note (ou `PUT` avec `note: ""`) |
| **GET** | `/api/users/@me/notes` | Liste toutes les notes de l’utilisateur (privées) |

## 2. Recherche avancée de messages

Endpoint : **GET** `/api/guilds/:guildId/messages/search` (ou `/api/channels/:channelId/messages/search`).

### Paramètres de requête avancés
- `content` : texte libre (FTS5)
- `from` : `user_id`
- `in` : `channel_id` (pour la route guild)
- `mentions` : `user_id`
- `has` : `link|embed|file|video|image|sound|sticker`
- `before` / `after` : date ISO ou snowflake
- `during` : `YYYY‑MM`
- `pinned` : `true|false`
- `limit` : 1‑25 (défaut 25)
- `offset` : pagination offset

### Réponse
```json
{
  "total_results": 142,
  "messages": [
    [ { "id": "msg1", "content": "...", "author_id": "u1", "channel_id": "c1", "created_at": "..." }, { "context_before": [...] }, { "context_after": [...] } ]
  ],
  "analytics_id": "uuid-search-session"
}
```

**Implémentation** :
- Utiliser SQLite FTS5 sur le champ `content` de la table `Message`.
- Ajouter des index Prisma sur `author_id`, `channel_id`, `created_at`, `pinned`.
- Composer les filtres avec Prisma `where` clauses.

## 3. Raccourcis clavier (client uniquement)

| Action | Raccourci Windows/Linux | Raccourci macOS |
|--------|------------------------|-----------------|
| Marquer le serveur comme lu | Échap | Échap |
| Naviguer canal suivant non‑lu | Alt+↓ | Option+↓ |
| Naviguer canal précédent non‑lu | Alt+↑ | Option+↑ |
| Naviguer serveur suivant non‑lu | Alt+Shift+↓ | Option+Shift+↓ |
| Naviguer serveur précédent non‑lu | Alt+Shift+↑ | Option+Shift+↑ |
| Ouvrir la recherche rapide | Ctrl+K | Cmd+K |
| Ouvrir la recherche de messages | Ctrl+F | Cmd+F |
| Sauter au canal non‑lu | Ctrl+Shift+Alt+↓ | Cmd+Shift+Option+↓ |
| Activer/désactiver le micro | Ctrl+Shift+M | Cmd+Shift+M |
| Activer/désactiver la caméra | Ctrl+Shift+V | Cmd+Shift+V |
| Mentionner le message (répondre) | R (hover) | R (hover) |
| Modifier son dernier message | ↑ (champ vide) | ↑ (champ vide) |
| Annuler édition | Échap | Échap |
| Envoyer (multiline) | Ctrl+Entrée | Cmd+Entrée |
| Nouvelle ligne | Shift+Entrée | Shift+Entrée |
| Ouvrir emoji picker | Ctrl+E | Cmd+E |
| Ouvrir les paramètres | Ctrl+, | Cmd+, |
| Activer/désactiver la sidebar membres | Ctrl+U | Cmd+U |
| Passer en plein écran | F11 | Ctrl+Cmd+F |
| Déconnexion audio (DIFFÉRÉ) | Ctrl+Shift+D | Cmd+Shift+D |

### Implémentation
- Hook `useKeyboardShortcuts` enregistré dans le composant racine (`App.tsx`).
- Priorité : lorsqu’un champ de saisie est focus, les raccourcis de texte sont désactivés.
- Utilisation de `Mousetrap` ou `react-hotkeys` pour la gestion.

## 4. Recherche rapide (Quick Switcher)

- Accessible via `Ctrl+K` (Windows/Linux) ou `Cmd+K` (macOS).
- Overlay affichant en temps réel les résultats parmi :
  - Canaux du serveur courant (`#nom`)
  - DM ouverts (`@nom`)
  - Membres du serveur (`@nom`)
  - Autres serveurs (icône serveur)
- Tri : priorité aux correspondances de préfixe, puis à la fréquence d’utilisation récente.
- Navigation clavier : ↑/↓ pour sélectionner, Entrée pour ouvrir, Échap pour fermer.

---
*Cette spécification complète les sections `04-messages.md` et `03-servers-channels.md` et n’ajoute aucun nouvel événement au fichier `13-gateway-realtime.md`.*