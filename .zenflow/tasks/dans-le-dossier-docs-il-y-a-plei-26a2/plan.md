# Analyse et correction des specs OpenCord

Analyse de toutes les specs du dossier `docs/specs/` et correction des violations trouvées, principalement dans les specs 00 (architecture), 01 (auth) et leurs impacts sur le frontend.

### [x] Step: Analyse et correction des violations de specs

Fichiers modifiés :
- `packages/server/src/middleware/error.middleware.ts` — Format des erreurs conforme à la spec (wrapper `{ error: { ... } }`)
- `packages/server/src/middleware/validate.middleware.ts` — Status HTTP 422 pour VALIDATION_ERROR (était 400)
- `packages/server/src/middleware/rate-limit.middleware.ts` — Format de la réponse 429 conforme + rate limits séparés (global 100/15min, register 3/h, login 5/min)
- `packages/server/src/controllers/auth.controller.ts` — Bug 2FA : révocation des tokens déplacée de enable() vers verify() ; messages de réponse normalisés (reset_email_sent, password_reset_success, email_verified, password_changed)
- `packages/server/src/routes/auth.routes.ts` — Route `/change-password` → `/password/change` ; rate limits différenciés
- `packages/server/src/routes/users.routes.ts` — Endpoints sessions ajoutés à `GET/DELETE /users/@me/sessions[/:id]`
- `packages/client/src/services/api.ts` — handleResponse adapté au nouveau format `{ error: { ... } }`
- `packages/client/src/pages/Settings/UserSettingsPage.tsx` — Routes mises à jour + champ `old_password` (était `current_password`)
