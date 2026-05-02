# Spécification 33 — OAuth2 & autorisation tierce

## 1. Modèles de données (Prisma)

```prisma
model OAuth2Application {
  id               String   @id @default(cuid())
  name             String
  redirect_uris    Json     // ["https://example.com/callback", ...]
  scopes_allowed   Json     // ["identify","email","guilds",...]
  client_secret    String   // hash bcrypt
  public           Boolean  @default(false)
  // hérite de `Application` (voir 10‑bots‑api.md)
}

model OAuth2AuthorizationCode {
  code          String   @id @default(random(32)) // 32 caractères aléatoires
  application_id String
  user_id        String
  scopes         Json
  redirect_uri   String
  expires_at     DateTime @default(now()) @updatedAt
  used           Boolean  @default(false)
  created_at     DateTime @default(now())
}

model OAuth2AccessToken {
  id            String   @id @default(cuid())
  application_id String
  user_id        String?
  access_token   String   // hash bcrypt
  refresh_token  String   // hash bcrypt
  scopes         Json
  expires_at     DateTime @default(now()) @updatedAt
  created_at     DateTime @default(now())
}

model OAuth2Grant {
  application_id String
  user_id        String
  scopes         Json
  created_at     DateTime @default(now())
  @@id([application_id, user_id])
}
```

## 2. Flux *Authorization Code*

1. **GET** `/api/oauth2/authorize`
   - Params : `response_type=code`, `client_id`, `redirect_uri`, `scope`, `state`, `prompt` (none|consent)
   - Validation : `redirect_uri` doit appartenir à `OAuth2Application.redirect_uris`.
   - Retour : page de consentement affichant le nom de l’application et les scopes demandés.

2. **POST** `/api/oauth2/authorize`
   - Corps : `{ "accept": true|false }`
   - Si accepté → crée un `OAuth2AuthorizationCode` (validité 10 min) et redirige : `redirect_uri?code=XXXX&state=YYY`.
   - Si refusé → redirige : `redirect_uri?error=access_denied&state=YYY`.

3. **POST** `/api/oauth2/token`
   - `grant_type=authorization_code`
   - Body : `code`, `redirect_uri`
   - Auth : Basic `client_id:client_secret`
   - Vérifie le code, le `redirect_uri` et les scopes, crée un `OAuth2AccessToken` (expire 7 jours) et un `refresh_token`.
   - Réponse :
```json
{ "access_token": "...", "token_type": "Bearer", "expires_in": 604800, "refresh_token": "...", "scope": "identify email" }
```

4. **POST** `/api/oauth2/token` (refresh)
   - `grant_type=refresh_token`
   - Body : `refresh_token`
   - Auth : Basic `client_id:client_secret`
   - Retourne un nouveau `access_token` (et éventuellement un nouveau `refresh_token`).

5. **POST** `/api/oauth2/token/revoke`
   - Body : `{ "token": "..." }`
   - Auth : Basic `client_id:client_secret`
   - Révoque le token (access ou refresh) en le supprimant de la base.

## 3. Endpoints de ressources (Bearer token OAuth2)

| Méthode | Chemin | Scopes requis | Description |
|--------|--------|---------------|-------------|
| **GET** | `/api/users/@me` | `identify` | Retourne le profil public (sans email) |
| **GET** | `/api/users/@me` (avec `email` dans `scope`) | `email` | Ajoute le champ `email` au profil |
| **GET** | `/api/users/@me/guilds` | `guilds` | Liste les guildes de l’utilisateur |
| **PUT** | `/api/guilds/:guildId/members/:userId` | `guilds.join` | Ajoute l’utilisateur à la guilde (bot token requis) |
| **GET** | `/api/users/@me/guilds/:guildId/member` | `guilds.members.read` | Récupère les informations du membre dans la guilde |

## 4. Flux *Client Credentials* (bot‑to‑bot)

**POST** `/api/oauth2/token`
- `grant_type=client_credentials`
- Body : `scope`
- Auth : Basic `client_id:client_secret`
- Retour : `{ "access_token": "...", "token_type": "Bearer", "expires_in": 3600, "scope": "..." }`

## 5. Gestion des autorisations

- **GET** `/api/oauth2/@me` → retourne `{ application, expires, scopes, user }` pour le token fourni.
- **GET** `/api/users/@me/applications/:appId/role-connection` → scope `applications.role_connections.read` (implémenté via le plugin `role-connections`).
- **PUT** `/api/users/@me/applications/:appId/role-connection` → scope `applications.role_connections.write`.

## 6. Interface de gestion utilisateur

Page *Paramètres → Connexions tierces / Applications autorisées* :
- Liste les applications avec leurs scopes, date d’expiration, et bouton **Révoquer l’accès**.
- Révocation : supprime les entrées `OAuth2Grant` et révoque tous les tokens actifs (`OAuth2AccessToken`).

---
*Cette spécification s’appuie sur `10-bots-api.md` pour le modèle `Application` et ajoute les nouveaux endpoints au fichier `13-gateway-realtime.md` (aucun événement spécifique requis).*