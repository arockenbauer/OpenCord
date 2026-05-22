import { expect, test, type Page } from '@playwright/test';
import { e2eAccounts } from '../test-env';

function attachFailureGuards(page: Page): Array<string> {
  const failures: string[] = [];

  page.on('pageerror', (error) => {
    failures.push(`pageerror: ${error.message}`);
  });

  page.on('response', (response) => {
    if (response.status() < 500) return;
    failures.push(`response ${response.status()}: ${response.url()}`);
  });

  return failures;
}

async function login(page: Page, account: { email: string; password: string }): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('login-email').fill(account.email);
  await page.getByTestId('login-password').fill(account.password);
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(/\/channels\/@me/);
}

async function navigateSpa(page: Page, route: string): Promise<void> {
  await page.evaluate((targetRoute) => {
    window.history.pushState({}, '', targetRoute);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, route);
}

test.describe('App smoke', () => {
  test('should register a fresh account without crashing the app shell', async ({ page }) => {
    const failures = attachFailureGuards(page);
    const unique = Date.now();

    await page.goto('/register');
    await page.getByTestId('register-email').fill(`fresh-${unique}@opencord.test`);
    await page.getByTestId('register-username').fill(`freshuser${unique}`);
    await page.getByTestId('register-password').fill('Passw0rd!123');
    await page.getByTestId('register-date-of-birth').fill('1990-01-01');
    await page.getByTestId('register-submit').click();

    await expect(page).toHaveURL(/\/channels\/@me/);
    await expect(page.locator('body')).toContainText(/Amis|Ajouter un ami/i);
    expect(failures).toEqual([]);
  });

  test('should render the user-facing routes without 500s', async ({ page }) => {
    const failures = attachFailureGuards(page);
    await login(page, e2eAccounts.user);

    await expect(page.locator('body')).toContainText(/Amis|Ajouter un ami/i);

    await page.getByLabel(/Explorer les serveurs publics/i).click();
    await page.waitForURL('**/discover');
    await expect(page.locator('body')).toContainText(/Découverte/i);

    await navigateSpa(page, '/premium');
    await expect(page.locator('body')).toContainText(/OpenCord Premium/i);

    expect(failures).toEqual([]);
  });

  test('should submit the forgot password flow without 500s', async ({ page }) => {
    const failures = attachFailureGuards(page);

    await page.goto('/forgot-password');
    await page.getByTestId('forgot-password-email').fill(e2eAccounts.user.email);
    await page.getByTestId('forgot-password-submit').click();

    await expect(page.getByTestId('forgot-password-message')).toBeVisible();
    expect(failures).toEqual([]);
  });
});
