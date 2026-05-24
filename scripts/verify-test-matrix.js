const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function fileExists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function listFiles(dir, predicate) {
  const absolute = path.join(root, dir);
  const output = [];
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const full = path.join(absolute, entry.name);
    const rel = path.relative(root, full).replace(/\\/g, '/');
    if (entry.isDirectory()) output.push(...listFiles(rel, predicate));
    else if (predicate(rel)) output.push(rel);
  }
  return output;
}

function fail(message) {
  failures.push(message);
}

const failures = [];

const requiredTestFiles = [
  'packages/shared/src/validators/auth.validators.test.ts',
  'packages/shared/src/validators/guild.validators.test.ts',
  'packages/shared/src/validators/message.validators.test.ts',
  'packages/shared/src/validators/role.validators.test.ts',
  'packages/shared/src/validators/invite.validators.test.ts',
  'packages/shared/src/constants/permissions.test.ts',
  'packages/server/src/routes/admin.routes.integration.test.ts',
  'packages/server/src/routes/auth.routes.integration.test.ts',
  'packages/server/src/routes/guilds.routes.integration.test.ts',
  'packages/server/src/routes/users.routes.integration.test.ts',
  'packages/server/src/routes/voice-permissions.integration.test.ts',
  'packages/server/src/routes/interactions.integration.test.ts',
  'packages/server/src/routes/messages.routes.integration.test.ts',
  'packages/server/src/routes/social-dm.routes.integration.test.ts',
  'packages/server/src/routes/guild-icon-upload.integration.test.ts',
  'packages/server/src/routes/app-smoke.integration.test.ts',
  'packages/server/src/controllers/friend.controller.test.ts',
  'packages/server/src/controllers/moderation.test.ts',
  'packages/server/src/controllers/automod.controller.test.ts',
  'packages/server/src/controllers/bulk-delete.test.ts',
  'packages/server/src/controllers/message.permissions.test.ts',
  'packages/server/src/controllers/sensitive-permissions.test.ts',
  'packages/server/src/controllers/oauth2-authorization.test.ts',
  'packages/server/src/controllers/timeout.test.ts',
  'packages/server/src/middleware/bot-auth.test.ts',
  'packages/server/src/middleware/rate-limit.middleware.test.ts',
  'packages/server/src/middleware/upload.validation.test.ts',
  'packages/server/src/services/oauth2.service.test.ts',
  'packages/server/src/services/voice-state.service.test.ts',
  'packages/server/src/services/voice-media.service.test.ts',
  'packages/server/src/services/badge.service.test.ts',
  'packages/server/src/utils/audit-log.test.ts',
  'packages/client/src/pages/routes.smoke.test.tsx',
  'packages/client/src/stores/authStore.test.ts',
  'packages/client/src/stores/guildStore.test.ts',
  'packages/client/src/stores/messageStore.test.ts',
  'packages/client/src/stores/voiceStore.test.ts',
  'packages/client/src/components/ChannelSidebar/ChannelSidebar.test.tsx',
  'packages/client/src/components/NotificationBell/NotificationBell.test.tsx',
  'packages/e2e/tests/auth.spec.ts',
  'packages/e2e/tests/app-smoke.spec.ts',
  'packages/e2e/tests/complete-app.spec.ts',
  'packages/e2e/tests/guilds.spec.ts',
  'packages/e2e/tests/messages.spec.ts',
  'packages/e2e/tests/friends.spec.ts',
  'packages/e2e/tests/settings.spec.ts',
  'packages/e2e/tests/admin.spec.ts',
  'packages/e2e/tests/voice.spec.ts',
  'packages/e2e/tests/voice-profile-roles.spec.ts',
  'packages/e2e/tests/visual-regression.spec.ts',
];

for (const testFile of requiredTestFiles) {
  if (!fileExists(testFile)) fail(`Required test file is missing: ${testFile}`);
}

const specCoverage = {
  '00-architecture.md': ['packages/server/src/routes/app-smoke.integration.test.ts', 'packages/e2e/tests/app-smoke.spec.ts'],
  '01-authentication.md': ['packages/server/src/routes/auth.routes.integration.test.ts', 'packages/e2e/tests/auth.spec.ts'],
  '02-users-profiles-badges.md': ['packages/server/src/routes/users.routes.integration.test.ts', 'packages/server/src/services/badge.service.test.ts', 'packages/e2e/tests/settings.spec.ts'],
  '03-servers-channels.md': ['packages/server/src/routes/guilds.routes.integration.test.ts', 'packages/server/src/routes/voice-permissions.integration.test.ts', 'packages/e2e/tests/guilds.spec.ts'],
  '04-messages.md': ['packages/server/src/routes/messages.routes.integration.test.ts', 'packages/server/src/controllers/message.permissions.test.ts', 'packages/server/src/controllers/bulk-delete.test.ts', 'packages/e2e/tests/messages.spec.ts'],
  '05-roles-permissions.md': ['packages/shared/src/constants/permissions.test.ts', 'packages/server/src/controllers/sensitive-permissions.test.ts', 'packages/server/src/routes/voice-permissions.integration.test.ts'],
  '06-moderation-automod.md': ['packages/server/src/controllers/moderation.test.ts', 'packages/server/src/controllers/automod.controller.test.ts'],
  '07-invitations-friends-dms.md': ['packages/shared/src/validators/invite.validators.test.ts', 'packages/server/src/routes/social-dm.routes.integration.test.ts', 'packages/server/src/controllers/friend.controller.test.ts', 'packages/e2e/tests/friends.spec.ts'],
  '08-emojis-stickers.md': ['packages/server/src/middleware/upload.validation.test.ts', 'packages/server/src/routes/app-smoke.integration.test.ts'],
  '09-premium-boosts.md': ['packages/e2e/tests/complete-app.spec.ts', 'packages/e2e/tests/visual-regression.spec.ts'],
  '10-bots-api.md': ['packages/server/src/middleware/bot-auth.test.ts', 'packages/server/src/routes/interactions.integration.test.ts'],
  '11-plugins.md': ['packages/server/src/routes/app-smoke.integration.test.ts', 'packages/e2e/tests/admin.spec.ts'],
  '12-admin-panel.md': ['packages/server/src/routes/admin.routes.integration.test.ts', 'packages/e2e/tests/admin.spec.ts', 'packages/server/src/routes/app-smoke.integration.test.ts'],
  '13-gateway-realtime.md': ['packages/server/src/services/system-message.service.test.ts', 'packages/server/src/routes/interactions.integration.test.ts'],
  '14-notifications-i18n.md': ['packages/client/src/components/NotificationBell/NotificationBell.test.tsx', 'packages/e2e/tests/complete-app.spec.ts'],
  '15-rate-limiting-security.md': ['packages/server/src/middleware/rate-limit.middleware.test.ts', 'packages/server/src/middleware/upload.validation.test.ts'],
  '16-ui-design-system.md': ['packages/client/src/components/Button.test.tsx', 'packages/e2e/tests/visual-regression.spec.ts'],
  '17-file-storage.md': ['packages/server/src/middleware/upload.validation.test.ts', 'packages/server/src/routes/guild-icon-upload.integration.test.ts'],
  '18-voice-video-soundboard.md': ['packages/server/src/services/voice-state.service.test.ts', 'packages/server/src/services/voice-media.service.test.ts', 'packages/e2e/tests/voice.spec.ts'],
  '19-server-discovery.md': ['packages/client/src/pages/routes.smoke.test.tsx', 'packages/e2e/tests/complete-app.spec.ts'],
  '20-scheduled-events.md': ['packages/server/src/routes/app-smoke.integration.test.ts'],
  '21-email-system.md': ['packages/server/src/routes/auth.routes.integration.test.ts', 'packages/server/src/routes/app-smoke.integration.test.ts'],
  '22-testing-strategy.md': ['scripts/verify-test-matrix.js'],
  '23-backup-restore.md': ['packages/e2e/tests/admin.spec.ts', 'packages/server/src/routes/app-smoke.integration.test.ts'],
  '24-gdpr-data-export.md': ['packages/server/src/routes/app-smoke.integration.test.ts'],
  '25-logging-monitoring-status.md': ['packages/server/src/routes/app-smoke.integration.test.ts'],
  '26-server-insights.md': ['packages/server/src/routes/app-smoke.integration.test.ts'],
  '27-slash-commands-interactions.md': ['packages/server/src/routes/interactions.integration.test.ts'],
  '28-threads-forums-detailed.md': ['packages/server/src/routes/app-smoke.integration.test.ts'],
  '29-audit-log-complete.md': ['packages/server/src/utils/audit-log.test.ts', 'packages/e2e/tests/admin.spec.ts'],
  '30-server-templates.md': ['packages/server/src/routes/app-smoke.integration.test.ts'],
  '31-onboarding-welcome-screening.md': ['packages/server/src/routes/app-smoke.integration.test.ts'],
  '32-rich-presence-activity.md': ['packages/client/src/stores/authStore.test.ts', 'packages/server/src/routes/app-smoke.integration.test.ts'],
  '33-oauth2-authorization.md': ['packages/server/src/services/oauth2.service.test.ts', 'packages/server/src/controllers/oauth2-authorization.test.ts'],
  '34-announcement-channels-crosspost.md': ['packages/server/src/routes/app-smoke.integration.test.ts', 'packages/e2e/tests/visual-regression.spec.ts'],
  '35-user-notes-search-keyboard.md': ['packages/server/src/routes/app-smoke.integration.test.ts', 'packages/client/src/pages/routes.smoke.test.tsx'],
  '36-linked-roles-connections.md': ['packages/server/src/controllers/oauth2-authorization.test.ts', 'packages/server/src/routes/app-smoke.integration.test.ts'],
  '37-message-forwarding-super-reactions.md': ['packages/client/src/components/MessageComponents.test.tsx', 'packages/server/src/routes/app-smoke.integration.test.ts'],
  '38-accessibility-a11y.md': ['packages/e2e/tests/visual-regression.spec.ts', 'packages/client/src/components/NotificationBell/NotificationBell.test.tsx'],
  '99-user-workflows.md': ['packages/e2e/tests/complete-app.spec.ts', 'packages/e2e/tests/app-smoke.spec.ts'],
};

const specFiles = fs.readdirSync(path.join(root, 'docs/specs'))
  .filter((name) => name.endsWith('.md') && name !== 'testing-matrix.md')
  .sort();

for (const specFile of specFiles) {
  const coverage = specCoverage[specFile];
  if (!coverage) {
    fail(`Spec file has no coverage entry: docs/specs/${specFile}`);
    continue;
  }
  for (const testFile of coverage) {
    if (!fileExists(testFile)) fail(`Coverage entry for ${specFile} points to missing file: ${testFile}`);
  }
}

for (const specFile of Object.keys(specCoverage)) {
  if (!specFiles.includes(specFile)) fail(`Coverage entry points to missing spec: ${specFile}`);
}

const routeFiles = listFiles('packages/server/src/routes', (file) => file.endsWith('.routes.ts')).sort();
const routeCoverage = {
  'packages/server/src/routes/admin.routes.ts': ['packages/server/src/routes/admin.routes.integration.test.ts', 'packages/e2e/tests/admin.spec.ts', 'packages/server/src/routes/app-smoke.integration.test.ts'],
  'packages/server/src/routes/analytics.routes.ts': ['packages/server/src/routes/app-smoke.integration.test.ts'],
  'packages/server/src/routes/applications.routes.ts': ['packages/server/src/routes/app-smoke.integration.test.ts'],
  'packages/server/src/routes/auth.routes.ts': ['packages/server/src/routes/auth.routes.integration.test.ts'],
  'packages/server/src/routes/badges.routes.ts': ['packages/server/src/services/badge.service.test.ts', 'packages/server/src/routes/app-smoke.integration.test.ts'],
  'packages/server/src/routes/channels.routes.ts': ['packages/server/src/routes/voice-permissions.integration.test.ts', 'packages/e2e/tests/voice-profile-roles.spec.ts'],
  'packages/server/src/routes/connected-accounts.routes.ts': ['packages/server/src/controllers/connected-account.controller.integration.test.ts'],
  'packages/server/src/routes/discovery.routes.ts': ['packages/client/src/pages/routes.smoke.test.tsx', 'packages/e2e/tests/complete-app.spec.ts'],
  'packages/server/src/routes/dm.routes.ts': ['packages/e2e/tests/friends.spec.ts', 'packages/server/src/routes/social-dm.routes.integration.test.ts'],
  'packages/server/src/routes/emojis.routes.ts': ['packages/server/src/middleware/upload.validation.test.ts', 'packages/server/src/routes/app-smoke.integration.test.ts'],
  'packages/server/src/routes/forum.routes.ts': ['packages/server/src/routes/app-smoke.integration.test.ts'],
  'packages/server/src/routes/friends.routes.ts': ['packages/server/src/routes/social-dm.routes.integration.test.ts', 'packages/server/src/controllers/friend.controller.test.ts'],
  'packages/server/src/routes/guilds.routes.ts': ['packages/server/src/routes/guilds.routes.integration.test.ts', 'packages/server/src/routes/voice-permissions.integration.test.ts'],
  'packages/server/src/routes/interactions.routes.ts': ['packages/server/src/routes/interactions.integration.test.ts'],
  'packages/server/src/routes/invites.routes.ts': ['packages/e2e/tests/visual-regression.spec.ts', 'packages/server/src/routes/app-smoke.integration.test.ts'],
  'packages/server/src/routes/messages.routes.ts': ['packages/server/src/routes/messages.routes.integration.test.ts', 'packages/e2e/tests/messages.spec.ts', 'packages/server/src/controllers/bulk-delete.test.ts'],
  'packages/server/src/routes/monitoring.routes.ts': ['packages/server/src/routes/app-smoke.integration.test.ts'],
  'packages/server/src/routes/notifications.routes.ts': ['packages/client/src/components/NotificationBell/NotificationBell.test.tsx', 'packages/e2e/tests/complete-app.spec.ts'],
  'packages/server/src/routes/oauth.routes.ts': ['packages/server/src/controllers/oauth2-authorization.test.ts'],
  'packages/server/src/routes/plugins.routes.ts': ['packages/server/src/routes/app-smoke.integration.test.ts'],
  'packages/server/src/routes/poll.routes.ts': ['packages/server/src/routes/app-smoke.integration.test.ts'],
  'packages/server/src/routes/premium.routes.ts': ['packages/e2e/tests/complete-app.spec.ts', 'packages/server/src/routes/app-smoke.integration.test.ts'],
  'packages/server/src/routes/proxy.routes.ts': ['packages/server/src/routes/app-smoke.integration.test.ts'],
  'packages/server/src/routes/reports.routes.ts': ['packages/e2e/tests/admin.spec.ts', 'packages/server/src/routes/app-smoke.integration.test.ts'],
  'packages/server/src/routes/roles.routes.ts': ['packages/server/src/routes/voice-permissions.integration.test.ts', 'packages/e2e/tests/voice-profile-roles.spec.ts'],
  'packages/server/src/routes/stage.routes.ts': ['packages/server/src/routes/app-smoke.integration.test.ts'],
  'packages/server/src/routes/user-notes.routes.ts': ['packages/server/src/routes/app-smoke.integration.test.ts'],
  'packages/server/src/routes/users.routes.ts': ['packages/server/src/routes/users.routes.integration.test.ts', 'packages/e2e/tests/settings.spec.ts'],
  'packages/server/src/routes/webhooks.routes.ts': ['packages/server/src/routes/app-smoke.integration.test.ts'],
};

for (const routeFile of routeFiles) {
  const coverage = routeCoverage[routeFile];
  if (!coverage) {
    fail(`Route file has no coverage entry: ${routeFile}`);
    continue;
  }
  for (const testFile of coverage) {
    if (!fileExists(testFile)) fail(`Route coverage entry for ${routeFile} points to missing file: ${testFile}`);
  }
}

const e2ePackage = JSON.parse(read('packages/e2e/package.json'));
if (!e2ePackage.scripts['test:cross-browser']?.includes('PLAYWRIGHT_ENABLE_FIREFOX=true')) {
  fail('E2E package must expose a Firefox-enabled cross-browser test script.');
}

const rootPackage = JSON.parse(read('package.json'));
if (!rootPackage.scripts.test?.includes('test:matrix')) {
  fail('Root npm test must include test:matrix so coverage drift breaks the gate.');
}
if (!rootPackage.scripts['test:e2e']?.includes('test:cross-browser')) {
  fail('Root test:e2e must run the cross-browser Playwright suite.');
}

const smokeApi = read('packages/server/src/routes/app-smoke.integration.test.ts');
if (!smokeApi.includes('keeps') || !smokeApi.includes('discovered API routes below 500')) {
  fail('API smoke coverage test was removed; keep it as a non-contract crash detector.');
}

if (failures.length > 0) {
  console.error('Test matrix verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Test matrix verified: ${specFiles.length} specs, ${routeFiles.length} route files, ${requiredTestFiles.length} required test files.`);
