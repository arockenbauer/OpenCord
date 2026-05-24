import { expect, test } from '@playwright/test';
import { api, attachFailureGuards, login } from './helpers';

test.describe('Friends E2E', () => {
  test('shows seeded friends and opens an existing DM conversation', async ({ page }) => {
    const failures = attachFailureGuards(page);
    await login(page);

    await expect(page.getByTestId('friends-page')).toBeVisible();
    const relationships = await api<{ relationships: Array<any> }>(page, '/api/relationships');
    const friend = relationships.relationships.find((relationship) => relationship.type === 1);
    expect(friend).toBeTruthy();

    await expect(page.getByTestId(`friend-row-${friend.user.id}`)).toBeVisible();
    await page.getByTestId(`friend-message-${friend.user.id}`).click();
    await expect(page.getByTestId('message-input')).toBeVisible();
    expect(failures).toEqual([]);
  });
});
