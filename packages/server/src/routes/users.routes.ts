import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { authenticateOAuth2, requireScope } from '../middleware/oauth2.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { userProfileUpdateRateLimit, dataExportRateLimit, deleteAccountRateLimit } from '../middleware/rate-limit.middleware.js';
import { uploadAvatar, uploadBanner } from '../middleware/upload.middleware.js';
import { updateUserSchema } from '@opencord/shared';
import { AppError } from '../utils/app-error.js';
import * as users from '../controllers/user.controller.js';
import * as plugins from '../controllers/plugin.controller.js';
import * as auth from '../controllers/auth.controller.js';
import * as linkedRole from '../controllers/linked-role.controller.js';

const router = Router();

// Endpoints avec authentification normale (JWT)
router.get('/@me', authenticate, (req: any, res: any, next: any) => users.getMe(req, res, next));
router.patch('/@me', authenticate, userProfileUpdateRateLimit, validate(updateUserSchema), users.updateMe);
router.patch('/@me/avatar', authenticate, userProfileUpdateRateLimit, uploadAvatar, users.updateAvatar);
router.patch('/@me/banner', authenticate, userProfileUpdateRateLimit, uploadBanner, users.updateBanner);
router.delete('/@me', authenticate, users.deleteAccount);
router.delete('/@me/avatar', authenticate, users.updateAvatar);
router.delete('/@me/banner', authenticate, users.updateBanner);
router.get('/@me/notification-settings', authenticate, users.getNotificationSettings);
router.get('/@me/notes', authenticate, users.getUserNotes);
router.get('/@me/notes/:targetId', authenticate, users.getUserNotes);
router.post('/@me/notes/:userId', authenticate, users.setUserNote);
router.put('/@me/notes/:userId', authenticate, users.setUserNote);
router.delete('/@me/notes/:userId', authenticate, users.deleteUserNote);
router.get('/@me/connections', authenticate, users.getConnections);
router.post('/@me/connections', authenticate, users.createConnection);
router.delete('/@me/connections/:platform/:platformUserId', authenticate, users.deleteConnection);
router.get('/@me/activities', authenticate, users.getActivities);
router.post('/@me/activities', authenticate, users.updateActivity);
router.delete('/@me/activities/:sessionId', authenticate, users.deleteActivity);
router.get('/@me/settings', authenticate, users.getUserSettings);
router.patch('/@me/settings', authenticate, users.updateUserSettings);
router.patch('/@me/status', authenticate, users.updateStatus);
router.get('/@me/games', authenticate, users.getGames);
router.post('/@me/games', authenticate, users.addGame);
router.delete('/@me/games/:gameId', authenticate, users.deleteGame);
router.get('/@me/plugins', authenticate, plugins.getUserPlugins);
router.patch('/@me/plugins/:slug', authenticate, plugins.updateUserPlugin);
router.post('/@me/data-export', authenticate, dataExportRateLimit, users.requestDataExport);
router.get('/@me/data-export', authenticate, users.requestDataExport);
router.get('/@me/data-export/download', authenticate, users.requestDataExport);
router.post('/@me/delete', authenticate, deleteAccountRateLimit, users.deleteAccount);
router.post('/@me/delete/cancel', authenticate, users.deleteAccount);
router.get('/@me/boosts', authenticate, users.getMyBoosts);
router.get('/@me/sessions', authenticate, (req, res, next) => users.getMe(req, res, next));
router.delete('/@me/sessions/:sessionId', authenticate, (req, res, next) => users.deleteAccount(req, res, next));
router.get('/:userId', authenticate, users.getUser);

// Endpoints OAuth2 avec scopes
// GET /api/users/@me - scope: identify (sans email) ou identify+email (avec email)
router.get('/@me', authenticateOAuth2, (req: any, res: any, next: any) => {
  // Vérifier scope identify
  if (!req.oauth2?.scopes.includes('identify')) {
    return next(new AppError(403, 'INSUFFICIENT_SCOPE', 'Missing required scope: identify'));
  }
  // Si scope email présent, ajouter l'email
  users.getMe(req, res, next);
});

// GET /api/users/@me/guilds - scope: guilds
router.get('/@me/guilds', authenticateOAuth2, requireScope('guilds'), users.getMyGuilds);

// GET /api/users/@me/guilds/:guildId/member - scope: guilds.members.read
router.get('/@me/guilds/:guildId/member', authenticateOAuth2, requireScope('guilds.members.read'), async (req: any, res: any, next: any) => {
  // TODO: Implémenter dans user.controller.ts
  res.status(501).json({ error: 'Not implemented yet' });
});

// PUT /api/guilds/:guildId/members/:userId - scope: guilds.join (bot token)
router.put('/@me/guilds/:guildId/member', authenticateOAuth2, requireScope('guilds.join'), async (req: any, res: any, next: any) => {
  // TODO: Implémenter l'ajout d'un utilisateur à un serveur via OAuth2
  res.status(501).json({ error: 'Not implemented yet' });
});

// User Application Role Connections (OAuth2 scope role_connections.read/write)
router.get('/@me/applications/:appId/role-connection', authenticateOAuth2, requireScope('applications.role_connections.read'), linkedRole.getUserRoleConnection);
router.put('/@me/applications/:appId/role-connection', authenticateOAuth2, requireScope('applications.role_connections.write'), linkedRole.updateUserRoleConnection);

export default router;
