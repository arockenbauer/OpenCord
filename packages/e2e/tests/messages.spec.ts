import { expect, test } from '@playwright/test';
import { api, attachFailureGuards, getSmokeGuild, login } from './helpers';

test.describe('Messages E2E', () => {
  test('sends a guild message from the composer and persists it through the API', async ({ page }) => {
    const failures = attachFailureGuards(page);
    await login(page);

    const guild = await getSmokeGuild(page);
    const textChannel = guild.channels.find((channel: any) => channel.type === 0);
    expect(textChannel).toBeTruthy();

    await page.getByTestId(`guild-icon-${guild.id}`).click();
    await page.getByTestId(`channel-${textChannel.id}`).click();

    const content = `E2E message ${Date.now()}`;
    await page.getByTestId('message-input').fill(content);
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('message-list')).toContainText(content);
    const messages = await api<{ messages: Array<{ content: string }> }>(page, `/api/channels/${textChannel.id}/messages`);
    expect(messages.messages.some((message) => message.content === content)).toBe(true);
    expect(failures).toEqual([]);
  });
});
