import { expect, test } from '@playwright/test';
import { e2eAccounts } from '../test-env';
import { api, attachFailureGuards, login } from './helpers';

test.describe('Admin E2E', () => {
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
    expect(failures).toEqual([]);
  });
});
