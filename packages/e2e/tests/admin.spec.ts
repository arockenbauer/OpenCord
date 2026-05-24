import { expect, test } from '@playwright/test';
import { e2eAccounts } from '../test-env';
import { api, attachFailureGuards, login } from './helpers';

test.describe('Admin E2E', () => {
  test('redirects non-admin users away from the admin shell', async ({ page }) => {
    const failures = attachFailureGuards(page);
    await login(page, e2eAccounts.user);

    await page.goto('/admin');
    await expect(page).toHaveURL(/\/channels\/@me/);
    await expect(page.getByTestId('app-layout')).toBeVisible();
    expect(failures).toEqual([]);
  });

  test('opens admin shell and loads real admin datasets', async ({ page }) => {
    const failures = attachFailureGuards(page);
    await login(page, e2eAccounts.admin);

    await page.getByTestId('server-list-admin').click();
    await expect(page).toHaveURL(/\/admin/);
    await expect(page.locator('body')).toContainText(/Tableau de bord|Utilisateurs|Serveurs|Sauvegardes/);

    const users = await api<any>(page, '/api/admin/users');
    const guilds = await api<any>(page, '/api/admin/guilds');
    const auditLogs = await api<any>(page, '/api/admin/audit-logs');
    const backups = await api<any>(page, '/api/admin/backups');

    expect(Array.isArray(users.users)).toBe(true);
    expect(Array.isArray(guilds.guilds)).toBe(true);
    expect(Array.isArray(auditLogs.logs)).toBe(true);
    expect(Array.isArray(backups.backups)).toBe(true);
    expect(users.users.some((user: any) => user.email === e2eAccounts.admin.email)).toBe(true);
    expect(guilds.guilds.some((guild: any) => guild.name === 'Smoke Guild')).toBe(true);
    expect(failures).toEqual([]);
  });
});
