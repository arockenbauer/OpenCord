import { Page } from '@playwright/test';

export class LoginPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/login');
  }

  async login(email: string, password: string) {
    await this.page.fill('[data-testid="login-email"]', email);
    await this.page.fill('[data-testid="login-password"]', password);
    
    // Wait for either the plugins response or navigation to channels
    const loginPromise = this.page.click('[data-testid="login-submit"]');
    
    // Set up a response listener for plugins, but don't make it mandatory
    const pluginsResponsePromise = this.page.waitForResponse(response => 
      response.url().includes('/api/users/@me/plugins') && response.status() === 200,
      { timeout: 5000 }
    ).catch(() => null); // Ignore if plugins endpoint is never called
    
    // Wait for navigation to the channels page (successful login)
    const navigationPromise = this.page.waitForURL(/\/channels/, { timeout: 30000 });
    
    await Promise.all([loginPromise, navigationPromise]);
    await pluginsResponsePromise; // Wait for it but don't fail if it doesn't come
  }

  async expectError(message: string) {
    await this.page.locator('[data-testid="login-error"]').toContainText(message);
  }
}
