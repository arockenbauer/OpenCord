import fs from 'fs';
import path from 'path';
import request, { type Response, type SuperAgentTest } from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import app from '../index.js';
import { rebuildTestDatabase, clearTestData, seedSmokeScenario, type SeededAccount, type SmokeScenario } from '../test/test-db.js';
import { serverRoot } from '../test/test-env.js';

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';
type AgentMode = 'anonymous' | 'user' | 'admin';

interface RouteMount {
  file: string;
  routerName: string;
  basePaths: string[];
}

interface SmokeRoute {
  method: HttpMethod;
  path: string;
  source: string;
  agent: AgentMode;
}

const allowedErrorStatuses = new Map<string, number>([
  ['POST /api/admin/logging/sftp/test', 503],
  ['POST /api/admin/logging/sftp/export', 503],
  ['POST /api/connected-accounts/discord/callback', 501],
  ['POST /api/premium/checkout', 503],
  ['POST /api/premium/portal', 503],
]);

const routeMounts: RouteMount[] = [
  { file: 'admin.routes.ts', routerName: 'router', basePaths: ['/api/admin'] },
  { file: 'applications.routes.ts', routerName: 'router', basePaths: ['/api/applications'] },
  { file: 'auth.routes.ts', routerName: 'router', basePaths: ['/api/auth'] },
  { file: 'badges.routes.ts', routerName: 'router', basePaths: ['/api/badges'] },
  { file: 'channels.routes.ts', routerName: 'router', basePaths: ['/api/channels', '/api/guilds/:guildId/channels'] },
  { file: 'connected-accounts.routes.ts', routerName: 'router', basePaths: ['/api/connected-accounts'] },
  { file: 'discovery.routes.ts', routerName: 'router', basePaths: ['/api/discover'] },
  { file: 'discovery.routes.ts', routerName: 'guildDiscoveryRouter', basePaths: ['/api/guilds/:guildId'] },
  { file: 'discovery.routes.ts', routerName: 'adminDiscoveryRouter', basePaths: ['/api/admin/discover'] },
  { file: 'dm.routes.ts', routerName: 'router', basePaths: ['/api/dms'] },
  { file: 'emojis.routes.ts', routerName: 'router', basePaths: ['/api/guilds/:guildId'] },
  { file: 'forum.routes.ts', routerName: 'router', basePaths: ['/api/guilds/:guildId/channels'] },
  { file: 'friends.routes.ts', routerName: 'router', basePaths: ['/api/relationships'] },
  { file: 'guilds.routes.ts', routerName: 'router', basePaths: ['/api/guilds'] },
  { file: 'interactions.routes.ts', routerName: 'router', basePaths: ['/api'] },
  { file: 'invites.routes.ts', routerName: 'router', basePaths: ['/api'] },
  { file: 'invites.routes.ts', routerName: 'guildInvitesRouter', basePaths: ['/api/guilds/:guildId/invites'] },
  { file: 'messages.routes.ts', routerName: 'router', basePaths: ['/api/channels/:channelId/messages'] },
  { file: 'monitoring.routes.ts', routerName: 'router', basePaths: ['/api'] },
  { file: 'notifications.routes.ts', routerName: 'router', basePaths: ['/api/notifications'] },
  { file: 'oauth.routes.ts', routerName: 'router', basePaths: ['/api/oauth2'] },
  { file: 'plugins.routes.ts', routerName: 'router', basePaths: ['/api/plugins'] },
  { file: 'premium.routes.ts', routerName: 'router', basePaths: ['/api/premium'] },
  { file: 'premium.routes.ts', routerName: 'guildBoostRouter', basePaths: ['/api/guilds/:guildId'] },
  { file: 'proxy.routes.ts', routerName: 'router', basePaths: ['/api/proxy'] },
  { file: 'reports.routes.ts', routerName: 'router', basePaths: ['/api/reports'] },
  { file: 'roles.routes.ts', routerName: 'router', basePaths: ['/api/guilds/:guildId/roles'] },
  { file: 'user-notes.routes.ts', routerName: 'router', basePaths: ['/api/users/@me/notes'] },
  { file: 'users.routes.ts', routerName: 'router', basePaths: ['/api/users'] },
  { file: 'webhooks.routes.ts', routerName: 'router', basePaths: ['/api'] },
];

function joinPath(basePath: string, routePath: string): string {
  if (routePath === '/') return basePath;
  return `${basePath.replace(/\/$/, '')}/${routePath.replace(/^\//, '')}`.replace(/\/{2,}/g, '/');
}

function classifyAgent(pathname: string, method: HttpMethod): AgentMode {
  const publicPaths = [
    '/api/health',
    '/api/status',
    '/api/status/history',
    '/api/status/incidents',
    '/api/discover',
    '/api/discover/categories',
    '/api/discover/featured',
    '/api/premium/tiers',
    '/api/proxy/image',
  ];

  if (pathname.startsWith('/api/admin')) return 'admin';
  if (pathname.startsWith('/api/auth/register') || pathname.startsWith('/api/auth/login')) return 'anonymous';
  if (pathname.startsWith('/api/invites/') && method === 'get') return 'anonymous';
  if (publicPaths.some((candidate) => pathname === candidate || pathname.startsWith(`${candidate}/`))) return 'anonymous';
  return 'user';
}

function extractRoutes(): SmokeRoute[] {
  const routesDir = path.join(serverRoot, 'src', 'routes');
  const pattern = /\b([A-Za-z_][A-Za-z0-9_]*)\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/g;
  const routes: SmokeRoute[] = [];

  for (const mount of routeMounts) {
    const filePath = path.join(routesDir, mount.file);
    const source = fs.readFileSync(filePath, 'utf8');
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(source)) !== null) {
      const [, routerName, method, routePath] = match;
      if (routerName !== mount.routerName) continue;

      for (const basePath of mount.basePaths) {
        const pathname = joinPath(basePath, routePath);
        routes.push({
          method: method as HttpMethod,
          path: pathname,
          source: `${mount.file}:${routerName}`,
          agent: classifyAgent(pathname, method as HttpMethod),
        });
      }
    }
  }

  const deduped = new Map<string, SmokeRoute>();
  for (const route of routes) {
    deduped.set(`${route.method} ${route.path}`, route);
  }

  return [...deduped.values()].sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

function replaceParams(pathname: string, scenario: SmokeScenario): string {
  return pathname
    .replace(/:guildId\b/g, scenario.guildId)
    .replace(/:channelId\b/g, scenario.channelId)
    .replace(/:userId\b/g, scenario.admin.id)
    .replace(/:targetId\b/g, scenario.admin.id)
    .replace(/:roleId\b/g, 'missing-role')
    .replace(/:messageId\b/g, 'missing-message')
    .replace(/:ruleId\b/g, 'missing-rule')
    .replace(/:eventId\b/g, 'missing-event')
    .replace(/:commandId\b/g, 'missing-command')
    .replace(/:cmdId\b/g, 'missing-command')
    .replace(/:badgeId\b/g, 'missing-badge')
    .replace(/:announcementId\b/g, 'missing-announcement')
    .replace(/:backupId\b/g, 'missing-backup')
    .replace(/:filename\b/g, 'missing-backup.zip')
    .replace(/:sessionId\b/g, 'missing-session')
    .replace(/:platform\b/g, 'discord')
    .replace(/:platformUserId\b/g, '123456')
    .replace(/:connectionId\b/g, 'missing-connection')
    .replace(/:type\b/g, 'discord')
    .replace(/:overwriteId\b/g, 'missing-overwrite')
    .replace(/:appId\b/g, 'missing-app')
    .replace(/:applicationId\b/g, 'missing-app')
    .replace(/:interactionId\b/g, 'missing-interaction')
    .replace(/:interactionToken\b/g, 'missing-token')
    .replace(/:token\b/g, pathname.includes('/invites/') ? scenario.inviteCode : 'missing-token')
    .replace(/:code\b/g, pathname.includes('/invites/') ? scenario.inviteCode : 'missing-code')
    .replace(/:slug\b/g, 'missing-plugin');
}

function buildPayload(route: SmokeRoute, scenario: SmokeScenario): Record<string, unknown> | undefined {
  if (route.method === 'get' || route.method === 'delete') return undefined;

  if (route.path === '/api/auth/register') {
    return {
      email: `register-${Date.now()}@opencord.test`,
      username: `register${Date.now()}`,
      password: 'Passw0rd!123',
      date_of_birth: '1990-01-01',
    };
  }

  if (route.path === '/api/auth/login') {
    return { email: scenario.user.email, password: scenario.user.password };
  }

  if (route.path === '/api/auth/2fa/login') {
    return { code: '000000', partial_token: 'missing-partial-token' };
  }

  if (route.path === '/api/auth/password/change') {
    return { old_password: scenario.user.password, new_password: 'NewPassw0rd!123' };
  }

  if (route.path === '/api/auth/password/reset-request') {
    return { email: scenario.user.email };
  }

  if (route.path === '/api/auth/password/reset') {
    return { token: 'missing-reset-token', new_password: 'NewPassw0rd!123' };
  }

  if (route.path === '/api/auth/verify-email') {
    return { token: 'missing-verify-token' };
  }

  if (route.path === '/api/auth/2fa/enable' || route.path === '/api/auth/2fa/backup-codes') {
    return { password: scenario.user.password };
  }

  if (route.path === '/api/auth/2fa/verify' || route.path === '/api/auth/2fa/disable') {
    return { password: scenario.user.password, code: '000000' };
  }

  return {};
}

async function loginAs(agent: SuperAgentTest, account: SeededAccount): Promise<void> {
  const response = await agent
    .post('/api/auth/login')
    .send({ email: account.email, password: account.password });

  expect(response.status, `login failed for ${account.email}`).toBe(200);
}

async function performRequest(agent: SuperAgentTest, route: SmokeRoute, scenario: SmokeScenario): Promise<Response> {
  const targetPath = replaceParams(route.path, scenario);
  const req = agent[route.method](targetPath)
    .set('Accept', 'application/json')
    .redirects(0);

  const payload = buildPayload(route, scenario);
  if (payload !== undefined) {
    req.send(payload);
  }

  return req;
}

const smokeRoutes = extractRoutes();

function isAcceptedStatus(route: SmokeRoute, scenario: SmokeScenario, status: number): boolean {
  if (status < 500) return true;
  const resolvedPath = replaceParams(route.path, scenario);
  return allowedErrorStatuses.get(`${route.method.toUpperCase()} ${resolvedPath}`) === status;
}

describe('API smoke coverage', () => {
  let scenario: SmokeScenario;
  let anonymousAgent: SuperAgentTest;
  let userAgent: SuperAgentTest;
  let adminAgent: SuperAgentTest;

  beforeAll(async () => {
    await rebuildTestDatabase();
  });

  beforeEach(async () => {
    await clearTestData();
    scenario = await seedSmokeScenario();
    anonymousAgent = request.agent(app);
    userAgent = request.agent(app);
    adminAgent = request.agent(app);
    await loginAs(userAgent, scenario.user);
    await loginAs(adminAgent, scenario.admin);
  });

  it(`keeps ${smokeRoutes.length} discovered API routes below 500`, async () => {
    for (const route of smokeRoutes) {
      const agent = route.agent === 'admin'
        ? adminAgent
        : route.agent === 'user'
          ? userAgent
          : anonymousAgent;

      const response = await performRequest(agent, route, scenario);
      expect(
        isAcceptedStatus(route, scenario, response.status),
        `${route.method.toUpperCase()} ${replaceParams(route.path, scenario)} from ${route.source} returned ${response.status}`,
      ).toBe(true);
    }
  });
});
