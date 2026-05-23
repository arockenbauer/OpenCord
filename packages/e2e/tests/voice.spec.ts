import { expect, test } from '@playwright/test';
import { api, attachFailureGuards, getSmokeGuild, login } from './helpers';

test.describe('Voice E2E', () => {
  test('joins, toggles controls and leaves a voice channel without replacing text chat', async ({ page }) => {
    const failures = attachFailureGuards(page);
    await login(page);

    const guild = await getSmokeGuild(page);
    const textChannel = guild.channels.find((channel: any) => channel.type === 0);
    const voiceChannel = guild.channels.find((channel: any) => channel.type === 2);
    expect(textChannel).toBeTruthy();
    expect(voiceChannel).toBeTruthy();

    await page.getByTestId(`guild-icon-${guild.id}`).click();
    await page.getByTestId(`channel-${textChannel.id}`).click();
    const composer = page.getByTestId('message-input');
    await expect(composer).toBeVisible();

    await page.getByTestId(`channel-${voiceChannel.id}`).click();
    await expect(page.getByTestId('voice-leave-button')).toBeVisible();
    await expect(composer).toBeVisible();
    await expect(page.getByTestId('voice-channel-view')).toHaveCount(0);

    await page.getByTestId('voice-mute-toggle').click();
    await expect(page.getByTestId('voice-mute-toggle')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('voice-deafen-toggle').click();
    await expect(page.getByTestId('voice-deafen-toggle')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('voice-leave-button').click();
    await expect(page.getByTestId('voice-leave-button')).toHaveCount(0);

    const states = await api<{ voice_states: any[] }>(page, `/api/guilds/${guild.id}/voice-states`);
    expect(states.voice_states.some((state) => state.channel_id === voiceChannel.id)).toBe(false);
    expect(failures).toEqual([]);
  });
});
