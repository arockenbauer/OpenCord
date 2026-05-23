import { expect, test } from '@playwright/test';
import { attachFailureGuards, login } from './helpers';

test.describe('Complete App E2E', () => {
  test('navigates main authenticated surfaces and opens notifications/profile', async ({ page }) => {
    const failures = attachFailureGuards(page);
    await login(page);

    await expect(page.getByTestId('friends-page')).toBeVisible();

    await page.getByTestId('server-list-discovery').click();
    await page.waitForURL('**/discover');
    await expect(page.locator('body')).toContainText(/Découverte/);

    await page.evaluate(() => {
      window.history.pushState({}, '', '/premium');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await expect(page.locator('body')).toContainText(/OpenCord Premium/);

    await page.evaluate(() => {
      window.history.pushState({}, '', '/channels/@me');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await page.getByTestId('notification-bell').click();
    await expect(page.getByTestId('notification-panel')).toBeVisible();

    await page.getByTestId('own-profile-trigger').click();
    await expect(page.getByTestId('user-profile-popout')).toBeVisible();
    expect(failures).toEqual([]);
  });
});
