import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { e2eAccounts } from '../test-env';
import { attachFailureGuards, waitForApiReady } from './helpers';

test.describe('Authentication', () => {
  test('should display login page', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await expect(page.locator('[data-testid="login-email"]')).toBeVisible();
  });

  test('should login with the seeded smoke user', async ({ page }) => {
    const failures = attachFailureGuards(page);
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(e2eAccounts.user.email, e2eAccounts.user.password);
    await expect(page).toHaveURL(/\/channels\/@me/);
    await expect(page.getByTestId('app-layout')).toBeVisible();
    await expect(page.getByTestId('own-profile-trigger')).toBeVisible();
    expect(failures).toEqual([]);
  });

  test('should keep invalid credentials on the login page with a visible error', async ({ page }) => {
    const failures = attachFailureGuards(page);
    await waitForApiReady(page);

    await page.goto('/login');
    await page.getByTestId('login-email').fill(e2eAccounts.user.email);
    await page.getByTestId('login-password').fill('WrongPassw0rd!123');
    await page.getByTestId('login-submit').click();

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByTestId('login-error')).toBeVisible();
    await expect(page.getByTestId('app-layout')).toHaveCount(0);
    expect(failures).toEqual([]);
  });
});
