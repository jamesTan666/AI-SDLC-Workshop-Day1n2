import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  globalSetup: './tests/global-setup.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Tests share one SQLite database (each test registers its own user); a
  // single worker keeps runs deterministic.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3100',
    timezoneId: 'Asia/Singapore',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ['--enable-features=WebAuthenticationVirtualAuthenticator'],
        },
      },
    },
  ],
  webServer: {
    // Port 3100 avoids clashing with a dev server on the default :3000; the
    // WebAuthn expected origin must match the served origin.
    command: 'npm run dev -- --port 3100',
    url: 'http://localhost:3100/login',
    env: { WEBAUTHN_ORIGIN: 'http://localhost:3100' },
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
