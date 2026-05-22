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
    await expect(page).toHaveURL(/\/channels\/@me/);
    await expect(page.getByTestId('app-layout')).toBeVisible();
    await expect(page.getByTestId('own-profile-trigger')).toBeVisible();
  });
});
