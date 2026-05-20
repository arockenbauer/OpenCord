import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { e2eAccounts } from '../test-env';

test.describe('Authentication', () => {
  test('should display login page', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await expect(page.locator('[data-testid="login-email"]')).toBeVisible();
  });

  test('should login with the seeded smoke user', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(e2eAccounts.user.email, e2eAccounts.user.password);
    await page.waitForURL('**/channels/@me');
    await expect(page.locator('body')).toContainText(/Amis|Ajouter un ami/i);
  });
});
