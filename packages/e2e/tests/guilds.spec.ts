import { expect, test } from '@playwright/test';
import { api, attachFailureGuards, login } from './helpers';

test.describe('Guilds E2E', () => {
  test('creates a guild from the UI and opens its default text channel', async ({ page }) => {
    const failures = attachFailureGuards(page);
    await login(page);

    const name = `E2E Guild ${Date.now()}`;
    await page.getByTestId('server-list-create').click();
    await page.getByTestId('create-guild-name').fill(name);
    await page.getByTestId('create-guild-submit').click();

    await expect(page.locator('body')).toContainText(name);
    const response = await api<{ guilds: Array<{ id: string; name: string }> }>(page, '/api/users/@me/guilds');
    const created = response.guilds.find((guild) => guild.name === name);
    expect(created).toBeTruthy();

    const guild = await api<any>(page, `/api/guilds/${created!.id}`);
    const textChannel = guild.channels.find((channel: any) => channel.type === 0);
    expect(textChannel).toBeTruthy();
    await expect(page.getByTestId(`channel-${textChannel.id}`)).toBeVisible();
    await expect(page.getByTestId('message-input')).toBeVisible();
    expect(failures).toEqual([]);
  });
});
