import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { globalRateLimit } from './middleware/rate-limit.middleware.js';
import { errorHandler } from './middleware/error.middleware.js';
import { setupGateway } from './gateway/index.js';

import authRoutes from './routes/auth.routes.js';
import usersRoutes from './routes/users.routes.js';
import guildsRoutes from './routes/guilds.routes.js';
import channelsRoutes, { guildChannelRouter } from './routes/channels.routes.js';
import messagesRoutes from './routes/messages.routes.js';
import rolesRoutes from './routes/roles.routes.js';
import invitesRoutes, { guildInvitesRouter } from './routes/invites.routes.js';
import emojisRoutes from './routes/emojis.routes.js';
import adminRoutes from './routes/admin.routes.js';
import webhooksRoutes from './routes/webhooks.routes.js';
import notificationsRoutes from './routes/notifications.routes.js';
import reportsRoutes from './routes/reports.routes.js';
import badgesRoutes from './routes/badges.routes.js';
import pluginsRoutes from './routes/plugins.routes.js';
import applicationsRoutes from './routes/applications.routes.js';
import oauthRoutes from './routes/oauth.routes.js';
import dmRoutes from './routes/dm.routes.js';
import friendsRoutes from './routes/friends.routes.js';
import premiumRoutes, { guildBoostRouter } from './routes/premium.routes.js';
import discoveryRoutes, { guildDiscoveryRouter } from './routes/discovery.routes.js';
import { getStickerPacks } from './controllers/emoji.controller.js';
import { getActiveAnnouncements } from './controllers/announcement.controller.js';
import { authenticate } from './middleware/auth.middleware.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(globalRateLimit);

const uploadDir = process.env.UPLOAD_DIR || './uploads';
fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(path.resolve(uploadDir)));

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/guilds', guildsRoutes);
app.use('/api/guilds/:guildId/channels', guildChannelRouter);
app.use('/api/guilds/:guildId/roles', rolesRoutes);
app.use('/api/guilds/:guildId/invites', guildInvitesRouter);
app.use('/api/guilds/:guildId', emojisRoutes);
app.use('/api/channels', channelsRoutes);
app.use('/api/channels/:channelId/messages', messagesRoutes);
app.use('/api', invitesRoutes);
app.use('/api', webhooksRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/badges', badgesRoutes);
app.use('/api/plugins', pluginsRoutes);
app.use('/api/applications', applicationsRoutes);
app.use('/api/oauth2', oauthRoutes);
app.get('/api/announcements/active', getActiveAnnouncements);
app.use('/api/dms', dmRoutes);
app.use('/api/relationships', friendsRoutes);
app.use('/api/premium', premiumRoutes);
app.use('/api/discover', discoveryRoutes);
app.use('/api/guilds/:guildId', guildBoostRouter);
app.use('/api/guilds/:guildId', guildDiscoveryRouter);
app.get('/api/sticker-packs', authenticate, getStickerPacks);

const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use(errorHandler);

setupGateway(httpServer);

const PORT = Number(process.env.PORT) || 3001;
httpServer.listen(PORT, () => {
  console.log(`OpenCord server running on port ${PORT}`);
});

export default app;
