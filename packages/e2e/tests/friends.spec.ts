import { expect, test, type Page } from '@playwright/test';
import { e2eAccounts } from '../test-env';

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('login-email').fill(e2eAccounts.user.email);
  await page.getByTestId('login-password').fill(e2eAccounts.user.password);
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(/\/channels\/@me/);
  await expect(page.getByTestId('app-layout')).toBeVisible();
}

async function navigateSpa(page: Page, route: string): Promise<void> {
  await page.evaluate((targetRoute) => {
    window.history.pushState({}, '', targetRoute);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, route);
}

test.describe('Friends flows', () => {
  test('opens a DM from the friends page', async ({ page }) => {
    await login(page);
    await navigateSpa(page, '/friends');

    await expect(page).toHaveURL(/\/friends/);
    await expect(page.getByTestId('friends-page')).toBeVisible();
    await expect(page.locator('body')).toContainText(/smokeadmin/i);
    await page.getByTestId('friends-search').fill('smokeadmin');
    await expect(page.locator('[data-testid^="friend-row-"]').first()).toContainText(/smokeadmin/i);

    await page.locator('[data-testid^="friend-message-"]').first().click();

    await expect(page).toHaveURL(/\/channels/);
    await expect(page.locator('body')).toContainText(/smokeadmin/i);
  });
});
