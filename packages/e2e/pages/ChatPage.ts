import { Page } from '@playwright/test';

export class ChatPage {
  constructor(private page: Page) {}

  async goto(channelId: string) {
    await this.page.goto(`/channels/@me/${channelId}`);
  }

  async sendMessage(content: string) {
    await this.page.fill('[data-testid="message-input"]', content);
    await this.page.locator('[data-testid="message-input"]').press('Enter');
  }

  async expectMessageVisible(content: string) {
    await this.page.locator(`[data-testid^="message-"]`).filter({ hasText: content }).first().waitFor();
  }
}
