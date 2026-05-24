import { expect, test, type Page } from '@playwright/test';
import { e2eAccounts } from '../test-env';
import { waitForApiReady } from './helpers';

async function login(page: Page): Promise<void> {
  await waitForApiReady(page);
  await page.goto('/login');
  await page.getByTestId('login-email').fill(e2eAccounts.admin.email);
  await page.getByTestId('login-password').fill(e2eAccounts.admin.password);
  await Promise.all([
    page.waitForURL(/\/channels\/@me/, { timeout: 30000 }),
    page.getByTestId('login-submit').click(),
  ]);
  await expect(page.getByTestId('app-layout')).toBeVisible();
}

async function api<T>(page: Page, url: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  return page.evaluate(async ({ requestUrl, requestOptions }) => {
    const headers: Record<string, string> = {};
    let body: BodyInit | undefined;
    if (requestOptions.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = typeof requestOptions.body === 'string'
        ? requestOptions.body
        : JSON.stringify(requestOptions.body);
    }

    const response = await fetch(requestUrl, {
      method: requestOptions.method || 'GET',
      credentials: 'include',
      headers,
      body,
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const error = data?.error?.message || data?.message || text || response.statusText;
      throw new Error(`${response.status} ${error}`);
    }
    return data;
  }, { requestUrl: url, requestOptions: options }) as Promise<T>;
}

test.describe('Profile, roles, permissions and voice regression flow', () => {
  test('updates profile, role permissions and joins/leaves a voice channel without opening it as text', async ({ page }) => {
    await login(page);

    const unique = Date.now();
    await page.getByTestId('user-settings-button').click();
    await page.getByRole('button', { name: 'Mon profil' }).click();
    await page.getByTestId('profile-global-name').fill(`Smoke Admin ${unique}`);
    await page.getByTestId('profile-pronouns').fill('il/lui');
    await page.getByTestId('profile-bio').fill(`Profil e2e ${unique}`);
    await page.getByTestId('profile-banner-color').fill('#57f287');
    await page.getByTestId('profile-save').click();
    await expect(page.getByTestId('profile-save')).toContainText(/Enregistré/);
    await page.keyboard.press('Escape');

    const me = await api<any>(page, '/api/users/@me');
    expect(me.global_name).toBe(`Smoke Admin ${unique}`);
    expect(me.pronouns).toBe('il/lui');
    expect(me.banner_color).toBe('#57f287');

    const guildsResponse = await api<{ guilds: Array<{ id: string; name: string }> }>(page, '/api/users/@me/guilds');
    const guildId = guildsResponse.guilds.find((guild) => guild.name === 'Smoke Guild')?.id;
    expect(guildId).toBeTruthy();

    const guild = await api<any>(page, `/api/guilds/${guildId}`);
    const textChannel = guild.channels.find((channel: any) => channel.type === 0);
    expect(textChannel).toBeTruthy();

    await page.getByTestId(`guild-icon-${guildId}`).click();
    await expect(page.getByTestId(`channel-${textChannel.id}`)).toBeVisible();

    const role = await api<any>(page, `/api/guilds/${guildId}/roles`, {
      method: 'POST',
      body: { name: `QA ${unique}`, permissions: '1024' },
    });
    const updatedRole = await api<any>(page, `/api/guilds/${guildId}/roles/${role.id}`, {
      method: 'PATCH',
      body: { name: `QA ${unique} updated`, permissions: '3072', mentionable: true },
    });
    expect(updatedRole.name).toBe(`QA ${unique} updated`);
    expect(updatedRole.permissions).toBe('3072');

    const overwrite = await api<any>(page, `/api/channels/${textChannel.id}/permissions`, {
      method: 'POST',
      body: { target_id: role.id, type: 'role', allow: '1024', deny: '0' },
    });
    const patchedOverwrite = await api<any>(page, `/api/channels/${textChannel.id}/permissions/${overwrite.id}`, {
      method: 'PATCH',
      body: { allow: '0', deny: '2048' },
    });
    expect(patchedOverwrite.id).toBe(overwrite.id);
    expect(patchedOverwrite.deny).toBe('2048');

    const voiceChannel = await api<any>(page, `/api/guilds/${guildId}/channels`, {
      method: 'POST',
      body: { name: `vocal-${unique}`, type: 2, user_limit: 2 },
    });
    await expect(page.getByTestId(`channel-${voiceChannel.id}`)).toBeVisible();

    const currentTextInput = page.getByTestId('message-input');
    await expect(currentTextInput).toBeVisible();
    await page.getByTestId(`channel-${voiceChannel.id}`).click();
    await expect(page.getByTestId('voice-leave-button')).toBeVisible();
    await expect(currentTextInput).toBeVisible();
    await expect(page.getByTestId('voice-channel-view')).toHaveCount(0);

    await page.getByTestId('voice-mute-toggle').click();
    await expect(page.getByTestId('voice-mute-toggle')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('voice-deafen-toggle').click();
    await expect(page.getByTestId('voice-deafen-toggle')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('voice-leave-button').click();
    await expect(page.getByTestId('voice-leave-button')).toHaveCount(0);

    const voiceStates = await api<{ voice_states: any[] }>(page, `/api/guilds/${guildId}/voice-states`);
    expect(voiceStates.voice_states.some((state) => state.channel_id === voiceChannel.id)).toBe(false);
  });
});
