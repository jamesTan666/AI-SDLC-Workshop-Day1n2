import { expect, test } from '@playwright/test';
import { registerNewUser, TodoAppHelpers } from './helpers';

test.describe('Priority System', () => {
  let app: TodoAppHelpers;

  test.beforeEach(async ({ page }) => {
    await registerNewUser(page, 'prio');
    app = new TodoAppHelpers(page);
  });

  test('defaults to Medium priority when not chosen', async () => {
    await app.createTodo({ title: 'Default priority todo' });
    const item = app.todoItem('Default priority todo').first();
    await expect(item.getByTestId('badge-priority')).toHaveText('Medium');
    await expect(item.getByTestId('badge-priority')).toHaveClass(/bg-amber-100/);
  });

  test('creates high priority todo with correct badge text and color', async () => {
    await app.createTodo({ title: 'High priority task', priority: 'high' });
    const item = app.todoItem('High priority task').first();
    await expect(item.getByTestId('badge-priority')).toHaveText('High');
    await expect(item.getByTestId('badge-priority')).toHaveClass(/bg-red-100/);
  });

  test('creates medium priority todo with correct badge text and color', async () => {
    await app.createTodo({ title: 'Medium priority task', priority: 'medium' });
    const item = app.todoItem('Medium priority task').first();
    await expect(item.getByTestId('badge-priority')).toHaveText('Medium');
    await expect(item.getByTestId('badge-priority')).toHaveClass(/bg-amber-100/);
  });

  test('creates low priority todo with correct badge text and color', async () => {
    await app.createTodo({ title: 'Low priority task', priority: 'low' });
    const item = app.todoItem('Low priority task').first();
    await expect(item.getByTestId('badge-priority')).toHaveText('Low');
    await expect(item.getByTestId('badge-priority')).toHaveClass(/bg-blue-100/);
  });

  test('pending list sorts by priority: high, medium, low', async ({ page }) => {
    await app.createTodo({ title: 'Low task', priority: 'low' });
    await app.createTodo({ title: 'High task', priority: 'high' });
    await app.createTodo({ title: 'Medium task', priority: 'medium' });

    const titles = page.getByTestId('list-pending').getByTestId('todo-title');
    await expect(titles).toHaveText(['High task', 'Medium task', 'Low task']);
  });

  test('changing priority via edit mode updates the badge', async ({ page }) => {
    await app.createTodo({ title: 'Edit priority todo', priority: 'low' });
    let item = app.todoItem('Edit priority todo').first();
    await expect(item.getByTestId('badge-priority')).toHaveText('Low');

    await item.getByTestId('todo-edit').click();
    await page.getByTestId('edit-priority').selectOption('high');
    await page.getByTestId('edit-save').click();

    item = app.todoItem('Edit priority todo').first();
    await expect(item.getByTestId('badge-priority')).toHaveText('High');
    await expect(item.getByTestId('badge-priority')).toHaveClass(/bg-red-100/);
  });

  test('filter by priority shows only matching todos', async ({ page }) => {
    await app.createTodo({ title: 'High one', priority: 'high' });
    await app.createTodo({ title: 'Low one', priority: 'low' });
    await app.createTodo({ title: 'Medium one', priority: 'medium' });

    await expect(page.getByTestId('todo-item')).toHaveCount(3);

    await page.getByTestId('toggle-filters').click();
    await page.getByTestId('filter-priority').selectOption('high');

    await expect(page.getByTestId('todo-item')).toHaveCount(1);
    await expect(page.getByTestId('todo-item').getByTestId('todo-title')).toHaveText('High one');
  });
});
