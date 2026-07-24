import { expect, test } from '@playwright/test';
import { registerNewUser, singaporeDateTime, TodoAppHelpers } from './helpers';

interface ApiTodo {
  title: string;
  completed: boolean;
  due_date: string | null;
  priority: string;
  reminder_minutes: number | null;
}

test.describe('Recurring Todos', () => {
  let app: TodoAppHelpers;

  test.beforeEach(async ({ page }) => {
    await registerNewUser(page, 'recur');
    app = new TodoAppHelpers(page);
  });

  test('UI creates daily recurring todo with correct badge text', async () => {
    await app.createTodo({
      title: 'Daily recurring',
      dueDate: singaporeDateTime(120),
      recurring: 'daily',
    });
    const item = app.todoItem('Daily recurring').first();
    await expect(item.getByTestId('badge-recurring')).toHaveText('🔄 daily');
  });

  test('API rejects creating recurring todo without due date', async ({ page }) => {
    const response = await page.request.post('/api/todos', {
      data: {
        title: 'Recurring no due',
        is_recurring: true,
        recurrence_pattern: 'daily',
      },
    });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('due date');
  });

  test('completing a recurring todo creates the next instance', async ({ page }) => {
    await app.createTodo({
      title: 'Daily standup',
      dueDate: singaporeDateTime(120),
      recurring: 'daily',
    });

    await app.todoItem('Daily standup').getByTestId('todo-toggle').check();

    await expect(
      page.getByTestId('list-completed').getByTestId('todo-item').filter({ hasText: 'Daily standup' }),
    ).toBeVisible();

    await expect(
      page.getByTestId('list-pending').getByTestId('todo-item').filter({ hasText: 'Daily standup' }),
    ).toBeVisible();

    const allItems = page.getByTestId('todo-item').filter({ hasText: 'Daily standup' });
    await expect(allItems).toHaveCount(2);

    const pendingItem = page.getByTestId('list-pending').getByTestId('todo-item').filter({ hasText: 'Daily standup' }).first();
    await expect(pendingItem.getByTestId('badge-recurring')).toHaveText('🔄 daily');
  });

  test('monthly recurring respects month-end clamping', async ({ page }) => {
    const createResponse = await page.request.post('/api/todos', {
      data: {
        title: 'Monthly clamp',
        due_date: '2027-01-31T10:00',
        is_recurring: true,
        recurrence_pattern: 'monthly',
      },
    });
    expect(createResponse.status()).toBe(201);
    const created = await createResponse.json();
    const todoId = created.id;

    const updateResponse = await page.request.put(`/api/todos/${todoId}`, {
      data: { completed: true },
    });
    expect(updateResponse.status()).toBe(200);

    const listResponse = await page.request.get('/api/todos');
    const todos = await listResponse.json();
    const nextInstance = todos.find(
      (t: ApiTodo) => t.title === 'Monthly clamp' && t.completed === false,
    );

    expect(nextInstance).toBeDefined();
    expect(nextInstance.due_date).toBe('2027-02-28T10:00');
  });

  test('yearly recurring respects leap-day clamping', async ({ page }) => {
    const createResponse = await page.request.post('/api/todos', {
      data: {
        title: 'Leap day todo',
        due_date: '2028-02-29T09:00',
        is_recurring: true,
        recurrence_pattern: 'yearly',
      },
    });
    expect(createResponse.status()).toBe(201);
    const created = await createResponse.json();
    const todoId = created.id;

    const updateResponse = await page.request.put(`/api/todos/${todoId}`, {
      data: { completed: true },
    });
    expect(updateResponse.status()).toBe(200);

    const listResponse = await page.request.get('/api/todos');
    const todos = await listResponse.json();
    const nextInstance = todos.find(
      (t: ApiTodo) => t.title === 'Leap day todo' && t.completed === false,
    );

    expect(nextInstance).toBeDefined();
    expect(nextInstance.due_date).toBe('2029-02-28T09:00');
  });

  test('next recurring instance inherits priority and reminder', async ({ page }) => {
    const createResponse = await page.request.post('/api/todos', {
      data: {
        title: 'Inherit props',
        due_date: singaporeDateTime(120),
        is_recurring: true,
        recurrence_pattern: 'weekly',
        priority: 'high',
        reminder_minutes: 60,
      },
    });
    expect(createResponse.status()).toBe(201);
    const created = await createResponse.json();
    const todoId = created.id;

    expect(created.priority).toBe('high');
    expect(created.reminder_minutes).toBe(60);

    const updateResponse = await page.request.put(`/api/todos/${todoId}`, {
      data: { completed: true },
    });
    expect(updateResponse.status()).toBe(200);

    const listResponse = await page.request.get('/api/todos');
    const todos = await listResponse.json();
    const nextInstance = todos.find(
      (t: ApiTodo) => t.title === 'Inherit props' && t.completed === false,
    );

    expect(nextInstance).toBeDefined();
    expect(nextInstance.priority).toBe('high');
    expect(nextInstance.reminder_minutes).toBe(60);
  });
});
