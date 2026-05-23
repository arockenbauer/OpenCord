import { test, expect } from '@playwright/test';
import { e2eAccounts } from '../test-env';

test.describe('Friends E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-email').fill(e2eAccounts.user.email);
    await page.getByTestId('login-password').fill(e2eAccounts.user.password);
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL(/\/channels\/@me/);

    await page.getByRole('link', { name: /Amis|Friends/i }).click();
    await expect(page).toHaveURL(/\/channels\/@me/);
  });

  test('should view friends list', async ({ page }) => {
    await expect(page.locator('[data-testid="friends-list"]')).toBeVisible();
  });

  test('should add a friend by username', async ({ page }) => {
    await page.getByTestId('add-friend-button').click();
    await page.getByTestId('friend-username-input').fill(e2eAccounts.friend.username);
    await page.getByTestId('send-friend-request').click();
    await expect(page.locator('body')).toContainText(/demande envoyée|request sent/i);
  });

  test('should view pending friend requests', async ({ page }) => {
    await page.getByTestId('pending-requests-tab').click();
    await expect(page.locator('[data-testid="pending-requests"]')).toBeVisible();
  });

  test('should accept friend request', async ({ page }) => {
    await page.getByTestId('pending-requests-tab').click();
    await page.getByTestId('accept-friend-request').first().click();
    await expect(page.locator('body')).toContainText(/ami ajouté|friend added/i);
  });

  test('should remove a friend', async ({ page }) => {
    await page.getByTestId('friend-item').first().click();
    await page.getByTestId('remove-friend').click();
    await page.getByTestId('confirm-remove-friend').click();
    await expect(page.locator('body')).toContainText(/ami supprimé|friend removed/i);
  });
});
