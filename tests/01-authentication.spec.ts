import { expect, test } from '@playwright/test';
import { login, register, registerNewUser, setupVirtualAuthenticator, uniqueUsername } from './helpers';

test.describe('Authentication (WebAuthn)', () => {
  test('redirects unauthenticated visitors from / to /login', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL('/login');
    await expect(page.getByRole('heading', { name: 'Todo App' })).toBeVisible();
  });

  test('redirects unauthenticated visitors from /calendar to /login', async ({ page }) => {
    await page.goto('/calendar');
    await page.waitForURL('/login');
  });

  test('registers a new account with a passkey and lands on the todo page', async ({ page }) => {
    const username = await registerNewUser(page);
    await expect(page.getByTestId('current-user')).toContainText(username);
    await expect(page.getByRole('heading', { name: 'Todos' })).toBeVisible();
  });

  test('rejects registration for a taken username', async ({ page }) => {
    await setupVirtualAuthenticator(page);
    const username = uniqueUsername('taken');
    await register(page, username);

    await page.getByTestId('logout-button').click();
    await page.waitForURL('/login');

    await page.getByRole('tab', { name: 'Register' }).click();
    await page.locator('#username').fill(username);
    await page.getByRole('button', { name: 'Create account with passkey' }).click();
    await expect(page.getByTestId('login-error')).toContainText('Username already taken');
  });

  test('logs out and logs back in with the same passkey', async ({ page }) => {
    await setupVirtualAuthenticator(page);
    const username = uniqueUsername('relogin');
    await register(page, username);

    await page.getByTestId('logout-button').click();
    await page.waitForURL('/login');

    await login(page, username);
    await expect(page.getByTestId('current-user')).toContainText(username);
  });

  test('shows an error when logging in with an unknown username', async ({ page }) => {
    await setupVirtualAuthenticator(page);
    await page.goto('/login');
    await page.getByRole('tab', { name: 'Login' }).click();
    await page.locator('#username').fill(uniqueUsername('ghost'));
    await page.getByRole('button', { name: 'Sign in with passkey' }).click();
    await expect(page.getByTestId('login-error')).toContainText('User not found');
  });

  test('redirects authenticated users away from /login', async ({ page }) => {
    await registerNewUser(page);
    await page.goto('/login');
    await page.waitForURL('/');
    await expect(page.getByRole('heading', { name: 'Todos' })).toBeVisible();
  });

  test('API routes return 401 without a session', async ({ browser }) => {
    const context = await browser.newContext();
    const response = await context.request.get('/api/todos');
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toBe('Not authenticated');
    await context.close();
  });
});
