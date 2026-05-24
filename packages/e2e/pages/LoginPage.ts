import { expect, Page } from '@playwright/test';
import { e2eApiUrl, e2eClientUrl } from '../test-env';

async function waitForApiReady(page: Page): Promise<void> {
  await expect.poll(async () => {
    const [apiResponse, clientResponse] = await Promise.all([
      page.request.get(`${e2eApiUrl}/api/health`).catch(() => null),
      page.request.get(`${e2eClientUrl}/login`).catch(() => null),
    ]);
    return (apiResponse?.ok() ?? false) && (clientResponse?.ok() ?? false);
  }, { timeout: 30000, intervals: [250, 500, 1000] }).toBe(true);
}

export class LoginPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/login');
  }

  async login(email: string, password: string) {
    await waitForApiReady(this.page);
    await this.page.fill('[data-testid="login-email"]', email);
    await this.page.fill('[data-testid="login-password"]', password);
    
    // Set up a response listener for plugins, but don't make it mandatory
    const pluginsResponsePromise = this.page.waitForResponse(response => 
      response.url().includes('/api/users/@me/plugins') && response.status() === 200,
      { timeout: 5000 }
    ).catch(() => null); // Ignore if plugins endpoint is never called
    
    // Wait for navigation to the channels page (successful login)
    const navigationPromise = this.page.waitForURL(/\/channels/, { timeout: 30000 });
    
    await Promise.all([
      navigationPromise,
      this.page.click('[data-testid="login-submit"]'),
    ]);
    await pluginsResponsePromise; // Wait for it but don't fail if it doesn't come
  }

  async expectError(message: string) {
    await this.page.locator('[data-testid="login-error"]').toContainText(message);
  }
}
