import { expect, test } from '@playwright/test';
import { registerNewUser, singaporeDate, singaporeDateTime, TodoAppHelpers } from './helpers';

test.describe('Search & Filtering', () => {
  let app: TodoAppHelpers;

  test.beforeEach(async ({ page }) => {
    await registerNewUser(page, 'search');
    app = new TodoAppHelpers(page);
  });

  test('text search filters todos by title', async ({ page }) => {
    await app.createTodo({ title: 'Buy milk' });
    await app.createTodo({ title: 'Walk dog' });

    // Search for 'milk'
    await page.getByTestId('search-input').fill('milk');
    await expect(page.getByTestId('todo-item')).toHaveCount(1);
    await expect(app.todoItem('Buy milk')).toBeVisible();
    await expect(app.todoItem('Walk dog')).not.toBeVisible();

    // Clear search
    await page.getByTestId('search-input').clear();
    await expect(page.getByTestId('todo-item')).toHaveCount(2);
    await expect(app.todoItem('Buy milk')).toBeVisible();
    await expect(app.todoItem('Walk dog')).toBeVisible();
  });

  test('search is case-insensitive partial match', async ({ page }) => {
    await app.createTodo({ title: 'Walk dog' });

    // Search with different case
    await page.getByTestId('search-input').fill('WALK');
    await expect(app.todoItem('Walk dog')).toBeVisible();
    await expect(page.getByTestId('todo-item')).toHaveCount(1);
  });

  test('search matches subtask titles', async ({ page }) => {
    await app.createTodo({ title: 'Errands' });
    await app.addSubtask('Errands', 'Post office run');
    await app.createTodo({ title: 'Other task' });

    // Search for subtask content
    await page.getByTestId('search-input').fill('post office');
    await expect(app.todoItem('Errands')).toBeVisible();
    await expect(app.todoItem('Other task')).not.toBeVisible();
    await expect(page.getByTestId('todo-item')).toHaveCount(1);
  });

  test('priority filter with AND semantics shows only matching todos', async ({ page }) => {
    await app.createTodo({ title: 'High priority', priority: 'high' });
    await app.createTodo({ title: 'Low priority task', priority: 'low' });

    // Filter by high priority
    await page.getByTestId('toggle-filters').click();
    await page.getByTestId('filter-priority').selectOption('high');
    await expect(app.todoItem('High priority')).toBeVisible();
    await expect(page.getByTestId('todo-item')).toHaveCount(1);

    // Add search that matches the low priority todo
    await page.getByTestId('search-input').fill('Low priority');
    await expect(page.getByTestId('todo-item')).toHaveCount(0);
    await expect(page.locator('li').filter({ hasText: 'No todos match your filters' })).toBeVisible();
  });

  test('completion filter shows active or completed todos', async ({ page }) => {
    await app.createTodo({ title: 'Active task' });
    await app.createTodo({ title: 'Complete this' });

    // Complete one todo
    await app.todoItem('Complete this').getByTestId('todo-toggle').check();
    await expect(page.getByTestId('list-completed').getByTestId('todo-item')).toHaveCount(1);

    // Filter to show only completed
    await page.getByTestId('toggle-filters').click();
    await page.getByTestId('filter-completion').selectOption('completed');
    await expect(app.todoItem('Complete this')).toBeVisible();
    await expect(page.getByTestId('todo-item')).toHaveCount(1);

    // Filter to show only active
    await page.getByTestId('filter-completion').selectOption('active');
    await expect(app.todoItem('Active task')).toBeVisible();
    await expect(page.getByTestId('todo-item')).toHaveCount(1);
  });

  test('date range filter excludes todos without due dates', async ({ page }) => {
    const today = singaporeDate(0);

    await app.createTodo({ title: 'Due today', dueDate: singaporeDateTime(60) });
    await app.createTodo({ title: 'Due later', dueDate: singaporeDateTime(60 * 24 * 10) });
    await app.createTodo({ title: 'No due date' });

    // Set date range to today only
    await page.getByTestId('toggle-filters').click();
    await page.getByTestId('filter-date-from').fill(today);
    await page.getByTestId('filter-date-to').fill(today);

    // Only the today todo should show
    await expect(app.todoItem('Due today')).toBeVisible();
    await expect(page.getByTestId('todo-item')).toHaveCount(1);
  });

  test('filter-clear resets all filters and search', async ({ page }) => {
    await app.createTodo({ title: 'Task one' });
    await app.createTodo({ title: 'Task two' });
    const today = singaporeDate(0);

    // Apply multiple filters
    await page.getByTestId('search-input').fill('one');
    await page.getByTestId('toggle-filters').click();
    await page.getByTestId('filter-priority').selectOption('high');
    await page.getByTestId('filter-date-from').fill(today);

    // Verify filters are applied
    await expect(page.getByTestId('todo-item')).toHaveCount(0);

    // Clear filters
    await page.getByTestId('filter-clear').click();

    // Everything should be visible again
    await expect(page.getByTestId('todo-item')).toHaveCount(2);
    await expect(page.getByTestId('search-input')).toHaveValue('');
  });

  test('saves, applies, and deletes filter presets', async ({ page }) => {
    await app.createTodo({ title: 'Buy milk' });
    await app.createTodo({ title: 'Walk dog' });

    // Set up filters
    await page.getByTestId('search-input').fill('milk');
    await page.getByTestId('toggle-filters').click();
    await page.getByTestId('filter-priority').selectOption('high');

    // Save preset
    await page.getByTestId('preset-name').fill('My preset');
    await page.getByTestId('preset-save').click();
    await expect(page.getByTestId('preset-item').filter({ hasText: 'My preset' })).toBeVisible();

    // Clear filters
    await page.getByTestId('filter-clear').click();
    await expect(page.getByTestId('search-input')).toHaveValue('');
    await expect(page.getByTestId('todo-item')).toHaveCount(2);

    // Apply preset
    const presetItem = page.getByTestId('preset-item').filter({ hasText: 'My preset' });
    await presetItem.getByTestId('preset-apply').click();
    await expect(page.getByTestId('search-input')).toHaveValue('milk');
    await expect(app.todoItem('Buy milk')).toBeVisible();
    await expect(page.getByTestId('todo-item')).toHaveCount(1);

    // Reload and verify preset persists
    await page.reload();
    await expect(page.getByTestId('preset-item').filter({ hasText: 'My preset' })).toBeVisible();

    // Delete preset
    const presetItemAfterReload = page.getByTestId('preset-item').filter({ hasText: 'My preset' });
    await presetItemAfterReload.getByTestId('preset-delete').click();
    await expect(page.getByTestId('preset-item').filter({ hasText: 'My preset' })).not.toBeVisible();
  });
});
