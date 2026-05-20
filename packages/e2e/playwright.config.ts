import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, devices } from '@playwright/test';
import { e2eServerEnv } from './test-env';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repositoryRoot = path.resolve(__dirname, '../..');
const chromeExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable';
const firefoxExecutablePath = process.env.PLAYWRIGHT_FIREFOX_EXECUTABLE_PATH || '/usr/bin/firefox';
const projects = [
  {
    name: 'chromium',
    use: {
      ...devices['Desktop Chrome'],
      browserName: 'chromium' as const,
      launchOptions: {
        executablePath: chromeExecutablePath,
      },
    },
  },
];

if (process.env.PLAYWRIGHT_ENABLE_FIREFOX === 'true') {
  projects.push({
    name: 'firefox',
    use: {
      ...devices['Desktop Firefox'],
      browserName: 'firefox' as const,
      launchOptions: {
        executablePath: firefoxExecutablePath,
        env: {
          MOZ_HEADLESS: '1',
          MOZ_WEBRENDER: '0',
          LIBGL_ALWAYS_SOFTWARE: '1',
        },
      },
      firefoxUserPrefs: {
        'gfx.webrender.software': true,
        'layers.acceleration.disabled': true,
        'media.hardware-video-decoding.enabled': false,
      },
    },
  });
}

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html'], ['list']],
  globalSetup: './global-setup.ts',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    headless: true,
  },
  projects,
  webServer: {
    command: `npm --prefix ${repositoryRoot} run dev`,
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
    env: {
      ...process.env,
      ...e2eServerEnv,
    },
  },
});
