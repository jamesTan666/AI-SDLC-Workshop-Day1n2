import { expect, test } from '@playwright/test';
import { registerNewUser, singaporeDateTime, TodoAppHelpers } from './helpers';

test.describe('Reminders & Notifications', () => {
  test.use({ permissions: ['notifications'] });

  let app: TodoAppHelpers;

  test.beforeEach(async ({ page }) => {
    await registerNewUser(page, 'remind');
    app = new TodoAppHelpers(page);
  });

  test('creating a todo with dueDate and reminder shows badge with label', async () => {
    const dueDate = singaporeDateTime(20);
    await app.createTodo({ title: 'Meeting prep', dueDate, reminder: 60 });
    await expect(app.todoItem('Meeting prep').getByTestId('badge-reminder')).toHaveText('🔔 1h');
  });

  test('reminder offset 1440 (1d) maps to badge label 🔔 1d', async () => {
    const dueDate = singaporeDateTime(1500);
    await app.createTodo({ title: 'Project deadline', dueDate, reminder: 1440 });
    await expect(app.todoItem('Project deadline').getByTestId('badge-reminder')).toHaveText('🔔 1d');
  });

  test('API POST with reminder_minutes but no due_date returns 400', async ({ page }) => {
    const response = await page.request.post('/api/todos', {
      data: { title: 'Reminder without date', reminder_minutes: 60 },
    });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  test('API POST with invalid reminder offset (45) returns 400 with specific error', async ({ page }) => {
    const dueDate = singaporeDateTime(120);
    const response = await page.request.post('/api/todos', {
      data: { title: 'Invalid reminder', due_date: dueDate, reminder_minutes: 45 },
    });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('Invalid reminder offset');
  });

  test('due-notification: todo within reminder window appears in /api/notifications/check', async ({ page }) => {
    const dueDate = singaporeDateTime(20);
    const response = await page.request.post('/api/todos', {
      data: { title: 'Ping me', due_date: dueDate, reminder_minutes: 60 },
    });
    expect(response.status()).toBe(201);

    const notifyResponse = await page.request.get('/api/notifications/check');
    expect(notifyResponse.status()).toBe(200);
    const body = await notifyResponse.json();
    expect(body.notifications).toContainEqual(expect.objectContaining({ title: 'Ping me' }));
  });

  test('calling /api/notifications/check twice prevents duplicate notifications', async ({ page }) => {
    const dueDate = singaporeDateTime(20);
    await page.request.post('/api/todos', {
      data: { title: 'Duplicate test', due_date: dueDate, reminder_minutes: 60 },
    });

    const firstCheck = await page.request.get('/api/notifications/check');
    const firstBody = await firstCheck.json();
    const firstNotif = firstBody.notifications.find((n: { title: string }) => n.title === 'Duplicate test');
    expect(firstNotif).toBeTruthy();

    const secondCheck = await page.request.get('/api/notifications/check');
    const secondBody = await secondCheck.json();
    const secondNotif = secondBody.notifications.find((n: { title: string }) => n.title === 'Duplicate test');
    expect(secondNotif).toBeFalsy();
  });

  test('todo whose reminder window has not started is not in notifications', async ({ page }) => {
    const dueDate = singaporeDateTime(600);
    await page.request.post('/api/todos', {
      data: { title: 'Future reminder', due_date: dueDate, reminder_minutes: 15 },
    });

    const response = await page.request.get('/api/notifications/check');
    const body = await response.json();
    const notif = body.notifications.find((n: { title: string }) => n.title === 'Future reminder');
    expect(notif).toBeFalsy();
  });
});
