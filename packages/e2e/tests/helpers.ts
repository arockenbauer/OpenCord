import { expect, type Page } from '@playwright/test';
import { e2eAccounts, e2eApiUrl, e2eClientUrl } from '../test-env';

export async function waitForApiReady(page: Page): Promise<void> {
  await expect.poll(async () => {
    const [apiResponse, clientResponse] = await Promise.all([
      page.request.get(`${e2eApiUrl}/api/health`).catch(() => null),
      page.request.get(`${e2eClientUrl}/login`).catch(() => null),
    ]);
    return (apiResponse?.ok() ?? false) && (clientResponse?.ok() ?? false);
  }, { timeout: 30000, intervals: [250, 500, 1000] }).toBe(true);
}

export function attachFailureGuards(page: Page): string[] {
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
  page.on('response', (response) => {
    if (response.status() >= 500) failures.push(`response ${response.status()}: ${response.url()}`);
  });
  return failures;
}

export async function login(page: Page, account: { email: string; password: string } = e2eAccounts.user): Promise<void> {
  await waitForApiReady(page);
  await page.goto('/login');
  await page.getByTestId('login-email').fill(account.email);
  await page.getByTestId('login-password').fill(account.password);
  await Promise.all([
    page.waitForURL(/\/channels\/@me/, { timeout: 30000 }),
    page.getByTestId('login-submit').click(),
  ]);
  await expect(page.getByTestId('app-layout')).toBeVisible();
}

export async function api<T>(page: Page, url: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  return page.evaluate(async ({ requestUrl, requestOptions }) => {
    const headers: Record<string, string> = {};
    let body: BodyInit | undefined;
    if (requestOptions.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(requestOptions.body);
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
      const message = data?.error?.message || data?.message || text || response.statusText;
      throw new Error(`${response.status} ${message}`);
    }
    return data;
  }, { requestUrl: url, requestOptions: options }) as Promise<T>;
}

export async function getSmokeGuild(page: Page): Promise<any> {
  const response = await api<{ guilds: Array<{ id: string; name: string }> }>(page, '/api/users/@me/guilds');
  const guildId = response.guilds.find((guild) => guild.name === 'Smoke Guild')?.id;
  expect(guildId).toBeTruthy();
  return api<any>(page, `/api/guilds/${guildId}`);
}
