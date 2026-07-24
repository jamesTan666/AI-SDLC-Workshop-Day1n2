import { expect, test } from '@playwright/test';
import { registerNewUser, TodoAppHelpers } from './helpers';

test.describe('Template System', () => {
  let app: TodoAppHelpers;

  test.beforeEach(async ({ page }) => {
    await registerNewUser(page, 'tmpl');
    app = new TodoAppHelpers(page);
  });

  test('creates a template with subtasks', async ({ page }) => {
    await app.createTemplate({
      name: 'Weekly review',
      title: 'Do weekly review',
      priority: 'high',
      offsetValue: 1,
      offsetUnit: 'days',
      subtasks: ['Check inbox', 'Plan week'],
    });
    await expect(page.getByTestId('template-item').filter({ hasText: 'Weekly review' })).toBeVisible();
  });

  test('uses a template to create a todo with the correct properties', async ({ page }) => {
    await app.createTemplate({
      name: 'Weekly review',
      title: 'Do weekly review',
      priority: 'high',
      offsetValue: 1,
      offsetUnit: 'days',
      subtasks: ['Check inbox', 'Plan week'],
    });

    // Open templates modal and use the template
    await page.getByTestId('templates-button').click();
    await expect(page.getByTestId('template-modal')).toBeVisible();
    const templateItem = page.getByTestId('template-item').filter({ hasText: 'Weekly review' });
    await templateItem.getByTestId('template-use').click();
    await app.closeModal('template-modal');

    // Verify the todo was created with correct properties
    const todoItem = app.todoItem('Do weekly review').first();
    await expect(todoItem).toBeVisible();
    await expect(todoItem.getByTestId('badge-priority')).toHaveText('High');
    await expect(todoItem.getByTestId('badge-due')).toBeVisible();

    // Expand and verify subtasks
    await app.expandTodo('Do weekly review');
    await expect(todoItem.getByTestId('subtask-item').filter({ hasText: 'Check inbox' })).toBeVisible();
    await expect(todoItem.getByTestId('subtask-item').filter({ hasText: 'Plan week' })).toBeVisible();
    await expect(todoItem.getByTestId('subtask-progress')).toContainText('0/2 subtasks');
  });

  test('template without offset creates a todo with no due date', async ({ page }) => {
    await app.createTemplate({
      name: 'No date',
      title: 'Undated todo',
    });

    // Use the template
    await page.getByTestId('templates-button').click();
    await expect(page.getByTestId('template-modal')).toBeVisible();
    const templateItem = page.getByTestId('template-item').filter({ hasText: 'No date' });
    await templateItem.getByTestId('template-use').click();
    await app.closeModal('template-modal');

    // Verify the todo has no due date badge
    const todoItem = app.todoItem('Undated todo').first();
    await expect(todoItem).toBeVisible();
    await expect(todoItem.getByTestId('badge-due')).not.toBeVisible();
  });

  test('deleting a template does not affect todos created from it', async ({ page }) => {
    await app.createTemplate({
      name: 'Deletable',
      title: 'Template-based todo',
    });

    // Use the template to create a todo
    await page.getByTestId('templates-button').click();
    await expect(page.getByTestId('template-modal')).toBeVisible();
    const templateItem = page.getByTestId('template-item').filter({ hasText: 'Deletable' });
    await templateItem.getByTestId('template-use').click();
    await app.closeModal('template-modal');

    // Verify the todo exists
    await expect(app.todoItem('Template-based todo')).toBeVisible();

    // Delete the template
    await page.getByTestId('templates-button').click();
    await expect(page.getByTestId('template-modal')).toBeVisible();
    const templateItemAfter = page.getByTestId('template-item').filter({ hasText: 'Deletable' });
    await templateItemAfter.getByTestId('template-delete').click();
    await expect(page.getByTestId('template-item').filter({ hasText: 'Deletable' })).not.toBeVisible();
    await app.closeModal('template-modal');

    // Verify the todo still exists
    await expect(app.todoItem('Template-based todo')).toBeVisible();
  });

  test('saves a todo as a template, then uses the template', async ({ page }) => {
    // Create a todo with subtasks
    await app.createTodo({ title: 'Packing list' });
    await app.addSubtask('Packing list', 'Pack clothes');
    await app.addSubtask('Packing list', 'Pack toiletries');

    // Save as template
    await app.todoItem('Packing list').first().getByTestId('todo-save-template').click();
    await expect(page.getByTestId('notice-banner')).toContainText('Saved');

    // Open templates modal and verify template exists
    await page.getByTestId('templates-button').click();
    await expect(page.getByTestId('template-modal')).toBeVisible();
    await expect(page.getByTestId('template-item').filter({ hasText: 'Packing list' })).toBeVisible();

    // Use the template to create a new todo
    const templateItem = page.getByTestId('template-item').filter({ hasText: 'Packing list' });
    await templateItem.getByTestId('template-use').click();
    await app.closeModal('template-modal');

    // Verify the new todo appears with the subtasks
    const todos = app.todoItem('Packing list');
    await expect(todos).toHaveCount(2);
    const newTodo = todos.last();
    await app.expandTodo('Packing list');
    await expect(newTodo.getByTestId('subtask-item').filter({ hasText: 'Pack clothes' })).toBeVisible();
    await expect(newTodo.getByTestId('subtask-item').filter({ hasText: 'Pack toiletries' })).toBeVisible();
    await expect(newTodo.getByTestId('subtask-progress')).toContainText('0/2 subtasks');
  });

  test('rejects a recurring template without recurrence pattern via API', async ({ page }) => {
    const response = await page.request.post('/api/templates', {
      data: {
        name: 'Bad',
        title_template: 'X',
        is_recurring: true,
        recurrence_pattern: null,
        due_date_offset_minutes: null,
      },
    });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });
});
