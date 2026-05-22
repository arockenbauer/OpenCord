import { expect, test, type Locator, type Page } from '@playwright/test';
import { e2eAccounts, e2eInviteCode } from '../test-env';

async function stabilize(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
        scroll-behavior: auto !important;
      }
    `,
  });
  await page.evaluate(async () => {
    if ('fonts' in document) {
      await document.fonts.ready;
    }
  });
}

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

async function expectPageScreenshot(page: Page, name: string): Promise<void> {
  await stabilize(page);
  await expect(page).toHaveScreenshot(name, {
    fullPage: true,
    animations: 'disabled',
    caret: 'hide',
  });
}

async function expectLocatorScreenshot(locator: Locator, name: string): Promise<void> {
  await expect(locator).toHaveScreenshot(name, {
    animations: 'disabled',
    caret: 'hide',
  });
}

test.describe('Visual regression', () => {
  test('login page', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByTestId('login-submit')).toBeVisible();
    await expectPageScreenshot(page, 'login-page.png');
  });

  test('register page', async ({ page }) => {
    await page.goto('/register');
    await expect(page.getByTestId('register-submit')).toBeVisible();
    await expectPageScreenshot(page, 'register-page.png');
  });

  test('forgot password page', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page.getByTestId('forgot-password-submit')).toBeVisible();
    await expectPageScreenshot(page, 'forgot-password-page.png');
  });

  test('invite page', async ({ page }) => {
    await page.goto(`/invite/${e2eInviteCode}`);
    await expect(page.getByTestId('invite-accept-submit')).toBeVisible();
    await expectPageScreenshot(page, 'invite-page.png');
  });

  test('friends page', async ({ page }) => {
    await login(page);
    await navigateSpa(page, '/friends');
    await expect(page).toHaveURL(/\/friends/);
    await expect(page.getByTestId('friends-page')).toBeVisible();
    await expectPageScreenshot(page, 'friends-page.png');
  });

  test('discovery page', async ({ page }) => {
    await login(page);
    await navigateSpa(page, '/discover');
    await expect(page).toHaveURL(/\/discover/);
    await expect(page.getByText('Découverte')).toBeVisible();
    await expectPageScreenshot(page, 'discovery-page.png');
  });

  test('premium page', async ({ page }) => {
    await login(page);
    await navigateSpa(page, '/premium');
    await expect(page).toHaveURL(/\/premium/);
    await expect(page.locator('body')).toContainText(/OpenCord Premium/i);
    await page.waitForLoadState('networkidle');
    await expectPageScreenshot(page, 'premium-page.png');
  });

  test('app shell and profile popout', async ({ page }) => {
    await login(page);
    await expect(page.getByTestId('app-layout')).toBeVisible();
    await expectLocatorScreenshot(page.getByTestId('app-layout'), 'app-shell.png');

    await expect(page.getByTestId('own-profile-trigger')).toBeVisible();
    await page.getByTestId('own-profile-trigger').dispatchEvent('click');
    const popout = page.locator('[data-user-popout="true"]');
    await expect(popout).toBeVisible();
    await stabilize(page);
    await expectLocatorScreenshot(popout, 'profile-popout.png');
  });
});
