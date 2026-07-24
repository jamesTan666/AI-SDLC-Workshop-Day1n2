import { expect, test } from '@playwright/test';
import { registerNewUser, TodoAppHelpers } from './helpers';

test.describe('Subtasks & Progress', () => {
  let app: TodoAppHelpers;

  test.beforeEach(async ({ page }) => {
    await registerNewUser(page, 'subt');
    app = new TodoAppHelpers(page);
  });

  test('adding two subtasks displays both and shows progress as 0/2', async () => {
    await app.createTodo({ title: 'Trip prep' });
    await app.addSubtask('Trip prep', 'Book flights');
    await app.addSubtask('Trip prep', 'Pack bags');

    const item = app.todoItem('Trip prep').first();
    await expect(item.getByTestId('subtask-item')).toHaveCount(2);
    await expect(item.getByTestId('subtask-progress')).toHaveText('0/2 subtasks');
  });

  test('completing the first subtask updates progress to 1/2 and progress bar to 50%', async () => {
    await app.createTodo({ title: 'Checklist' });
    await app.addSubtask('Checklist', 'Item A');
    await app.addSubtask('Checklist', 'Item B');

    const item = app.todoItem('Checklist').first();
    const firstSubtask = item.getByTestId('subtask-item').first();
    await firstSubtask.getByTestId('subtask-toggle').check();

    await expect(item.getByTestId('subtask-progress')).toHaveText('1/2 subtasks');
    const progressBar = item.getByTestId('progress-bar');
    await expect(progressBar).toHaveClass(/bg-blue-500/);
    await expect(progressBar).toHaveAttribute('data-progress', '50');
  });

  test('completing all subtasks changes progress bar to green and 100%', async () => {
    await app.createTodo({ title: 'Final push' });
    await app.addSubtask('Final push', 'Task 1');
    await app.addSubtask('Final push', 'Task 2');

    const item = app.todoItem('Final push').first();
    const subtasks = item.getByTestId('subtask-item');
    for (let i = 0; i < (await subtasks.count()); i++) {
      await subtasks.nth(i).getByTestId('subtask-toggle').check();
    }

    await expect(item.getByTestId('subtask-progress')).toHaveText('2/2 subtasks');
    const progressBar = item.getByTestId('progress-bar');
    await expect(progressBar).toHaveClass(/bg-green-500/);
    await expect(progressBar).toHaveAttribute('data-progress', '100');
  });

  test('progress UI is hidden when todo has no subtasks', async () => {
    await app.createTodo({ title: 'Simple task' });
    const item = app.todoItem('Simple task').first();

    await expect(item.getByTestId('subtask-progress')).toHaveCount(0);
    await expect(item.getByTestId('progress-bar')).toHaveCount(0);
  });

  test('deleting a subtask removes it and updates the count', async () => {
    await app.createTodo({ title: 'Tasks to manage' });
    await app.addSubtask('Tasks to manage', 'Keep this');
    await app.addSubtask('Tasks to manage', 'Delete this');

    const item = app.todoItem('Tasks to manage').first();
    const subtasks = item.getByTestId('subtask-item');
    await expect(subtasks).toHaveCount(2);

    const secondSubtask = subtasks.nth(1);
    await secondSubtask.getByTestId('subtask-delete').click();

    await expect(item.getByTestId('subtask-item')).toHaveCount(1);
    await expect(item.getByTestId('subtask-progress')).toHaveText('0/1 subtasks');
  });

  test('unchecking a completed subtask drops progress from green back to blue', async () => {
    await app.createTodo({ title: 'Toggle test' });
    await app.addSubtask('Toggle test', 'Single task');

    const item = app.todoItem('Toggle test').first();
    const toggle = item.getByTestId('subtask-toggle').first();

    await toggle.check();
    await expect(item.getByTestId('progress-bar')).toHaveClass(/bg-green-500/);

    await toggle.uncheck();
    await expect(item.getByTestId('progress-bar')).toHaveClass(/bg-blue-500/);
  });

  test('subtasks are scoped to their parent todo (multiple todos)', async () => {
    await app.createTodo({ title: 'Todo A' });
    await app.createTodo({ title: 'Todo B' });

    await app.addSubtask('Todo A', 'A-subtask-1');
    await app.addSubtask('Todo A', 'A-subtask-2');
    await app.addSubtask('Todo B', 'B-subtask-1');

    const itemA = app.todoItem('Todo A').first();
    const itemB = app.todoItem('Todo B').first();

    await expect(itemA.getByTestId('subtask-progress')).toHaveText('0/2 subtasks');
    await expect(itemB.getByTestId('subtask-progress')).toHaveText('0/1 subtasks');
  });
});
