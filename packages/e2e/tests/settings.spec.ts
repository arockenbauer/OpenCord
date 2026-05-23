import { expect, test } from '@playwright/test';
import { api, attachFailureGuards, login } from './helpers';

test.describe('Settings E2E', () => {
  test('updates profile fields from settings and persists them', async ({ page }) => {
    const failures = attachFailureGuards(page);
    await login(page);

    const unique = Date.now();
    await page.getByTestId('user-settings-button').click();
    await page.getByRole('button', { name: 'Mon profil' }).click();
    await page.getByTestId('profile-global-name').fill(`Settings User ${unique}`);
    await page.getByTestId('profile-pronouns').fill('iel');
    await page.getByTestId('profile-bio').fill(`Bio settings ${unique}`);
    await page.getByTestId('profile-save').click();
    await expect(page.getByTestId('profile-save')).toContainText(/Enregistré/);

    const me = await api<any>(page, '/api/users/@me');
    expect(me.global_name).toBe(`Settings User ${unique}`);
    expect(me.pronouns).toBe('iel');
    expect(me.bio).toBe(`Bio settings ${unique}`);
    expect(failures).toEqual([]);
  });
});
