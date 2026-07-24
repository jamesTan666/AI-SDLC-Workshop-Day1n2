import { expect, test } from '@playwright/test';
import { registerNewUser, singaporeDateTime, TodoAppHelpers } from './helpers';

test.describe('Due Dates', () => {
  let app: TodoAppHelpers;

  test.beforeEach(async ({ page }) => {
    await registerNewUser(page, 'due');
    app = new TodoAppHelpers(page);
  });

  test('creating with future due date shows badge-due', async () => {
    const dueDate = singaporeDateTime(120);
    await app.createTodo({ title: 'Due date todo', dueDate });
    const item = app.todoItem('Due date todo').first();
    await expect(item.getByTestId('badge-due')).toBeVisible();
  });

  test('reminder select is disabled until a due date is set', async ({ page }) => {
    await expect(page.getByTestId('new-todo-reminder')).toBeDisabled();
    await page.getByTestId('new-todo-due-date').fill(singaporeDateTime(120));
    await expect(page.getByTestId('new-todo-reminder')).toBeEnabled();
  });

  test('API rejects creating a todo with past due date', async ({ page }) => {
    const response = await page.request.post('/api/todos', {
      data: { title: 'Past todo', due_date: singaporeDateTime(-30) },
    });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('future');
  });

  test('API rejects changing a due date to the past', async ({ page }) => {
    const createResponse = await page.request.post('/api/todos', {
      data: { title: 'Change date todo', due_date: singaporeDateTime(60) },
    });
    expect(createResponse.status()).toBe(201);
    const created = await createResponse.json();
    const todoId = created.id;

    const updateResponse = await page.request.put(`/api/todos/${todoId}`, {
      data: { due_date: singaporeDateTime(-60) },
    });
    expect(updateResponse.status()).toBe(400);
    const body = await updateResponse.json();
    expect(body.error).toContain('future');
  });

  test('clearing a due date via edit mode hides the badge', async ({ page }) => {
    await app.createTodo({ title: 'Clear date todo', dueDate: singaporeDateTime(120) });
    let item = app.todoItem('Clear date todo').first();
    await expect(item.getByTestId('badge-due')).toBeVisible();

    await item.getByTestId('todo-edit').click();
    await page.getByTestId('edit-due-date').fill('');
    await page.getByTestId('edit-save').click();

    item = app.todoItem('Clear date todo').first();
    await expect(item.getByTestId('badge-due')).not.toBeVisible();
  });

  test('todo with due date sorts before same-priority todo without one', async ({ page }) => {
    await app.createTodo({ title: 'No due date', priority: 'high' });
    await app.createTodo({ title: 'With due date', priority: 'high', dueDate: singaporeDateTime(120) });

    const titles = page.getByTestId('list-pending').getByTestId('todo-title');
    await expect(titles).toHaveText(['With due date', 'No due date']);
  });
});
