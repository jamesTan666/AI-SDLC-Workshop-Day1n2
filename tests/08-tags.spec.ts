import { expect, test } from '@playwright/test';
import { registerNewUser, TodoAppHelpers } from './helpers';

test.describe('Tag System', () => {
  let app: TodoAppHelpers;

  test.beforeEach(async ({ page }) => {
    await registerNewUser(page, 'tags');
    app = new TodoAppHelpers(page);
  });

  test('creating a tag makes it visible in the tag modal', async () => {
    await app.createTag('Work', '#ff0000');
  });

  test('duplicate tag name is rejected with error', async ({ page }) => {
    await app.createTag('Work', '#ff0000');

    await page.getByTestId('manage-tags-button').click();
    await expect(page.getByTestId('tag-modal')).toBeVisible();

    await page.getByTestId('tag-name-input').fill('Work');
    await page.getByTestId('tag-color-input').fill('#00ff00');
    await page.getByTestId('tag-create').click();

    await expect(page.getByTestId('error-banner')).toContainText('Tag already exists');
  });

  test('creating a todo with a tag shows the tag badge', async () => {
    await app.createTag('Work', '#ff0000');
    await app.createTodo({ title: 'Tagged todo', tagNames: ['Work'] });

    await expect(app.todoItem('Tagged todo').getByTestId('badge-tag')).toHaveText('Work');
  });

  test('attaching a tag in edit mode adds it to the todo', async ({ page }) => {
    await app.createTag('Work', '#ff0000');
    await app.createTag('Home', '#00ff00');
    await app.createTodo({ title: 'Multi-tag', tagNames: ['Work'] });

    const item = app.todoItem('Multi-tag').first();
    await item.getByTestId('todo-edit').click();

    await page.getByTestId('edit-tag-Home').click();
    await page.getByTestId('edit-save').click();

    await expect(item.getByTestId('badge-tag')).toHaveCount(2);
    await expect(item.getByTestId('badge-tag').filter({ hasText: 'Home' })).toBeVisible();
  });

  test('detaching a tag in edit mode removes it from the todo', async ({ page }) => {
    await app.createTag('Work', '#ff0000');
    await app.createTag('Home', '#00ff00');
    await app.createTodo({ title: 'Remove tag', tagNames: ['Work', 'Home'] });

    const item = app.todoItem('Remove tag').first();
    await item.getByTestId('todo-edit').click();

    await page.getByTestId('edit-tag-Work').click();
    await page.getByTestId('edit-save').click();

    await expect(item.getByTestId('badge-tag')).toHaveCount(1);
    await expect(item.getByTestId('badge-tag').filter({ hasText: 'Home' })).toBeVisible();
    await expect(item.getByTestId('badge-tag').filter({ hasText: 'Work' })).not.toBeVisible();
  });

  test('renaming a tag updates it on all associated todos', async ({ page }) => {
    await app.createTag('Work', '#ff0000');
    await app.createTodo({ title: 'Rename test', tagNames: ['Work'] });

    await page.getByTestId('manage-tags-button').click();
    await expect(page.getByTestId('tag-modal')).toBeVisible();

    const workTag = page.getByTestId('tag-row').filter({ hasText: 'Work' });
    await workTag.getByTestId('tag-edit').click();
    await page.getByTestId('tag-edit-name').fill('Office');
    await page.getByTestId('tag-edit-save').click();

    await app.closeModal('tag-modal');

    await expect(app.todoItem('Rename test').getByTestId('badge-tag')).toHaveText('Office');
  });

  test('deleting a tag removes its badge from todos but not the todos', async ({ page }) => {
    await app.createTag('Work', '#ff0000');
    await app.createTodo({ title: 'Tagged todo', tagNames: ['Work'] });

    const todoCountBefore = await page.getByTestId('todo-item').count();

    await page.getByTestId('manage-tags-button').click();
    await expect(page.getByTestId('tag-modal')).toBeVisible();

    const workTag = page.getByTestId('tag-row').filter({ hasText: 'Work' });
    await workTag.getByTestId('tag-delete').click();

    await app.closeModal('tag-modal');

    await expect(page.getByTestId('todo-item')).toHaveCount(todoCountBefore);
    await expect(app.todoItem('Tagged todo').getByTestId('badge-tag')).toHaveCount(0);
  });

  test('filtering by tag shows only todos with that tag', async ({ page }) => {
    await app.createTag('Work', '#ff0000');
    await app.createTodo({ title: 'Work task', tagNames: ['Work'] });
    await app.createTodo({ title: 'Personal task' });

    await page.getByTestId('toggle-filters').click();
    await page.getByTestId('filter-tag').selectOption({ label: 'Work' });

    await expect(page.getByTestId('todo-item')).toHaveCount(1);
    await expect(page.getByTestId('todo-item').filter({ hasText: 'Work task' })).toBeVisible();
  });
});
