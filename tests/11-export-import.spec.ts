import { expect, test } from '@playwright/test';
import fs from 'fs';
import { registerNewUser, TodoAppHelpers } from './helpers';

test.describe('Export & Import', () => {
  let app: TodoAppHelpers;

  test.beforeEach(async ({ page }) => {
    await registerNewUser(page, 'exp');
    app = new TodoAppHelpers(page);
  });

  test('JSON export includes todos with tags and subtasks but no IDs', async ({ page }) => {
    await app.createTag('Work', '#ff0000');
    await app.createTodo({
      title: 'Export me',
      tagNames: ['Work'],
    });
    await app.addSubtask('Export me', 'Sub 1');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-json').click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/^todos-\d{4}-\d{2}-\d{2}\.json$/);

    const content = fs.readFileSync(await download.path(), 'utf-8');
    const envelope = JSON.parse(content);

    expect(envelope.version).toBe(1);
    expect(typeof envelope.exported_at).toBe('string');
    expect(envelope.todos).toHaveLength(1);

    const todo = envelope.todos[0];
    expect(todo.title).toBe('Export me');
    expect('id' in todo).toBe(false);
    expect(todo.subtasks).toHaveLength(1);
    expect(todo.subtasks[0].title).toBe('Sub 1');
    expect(todo.tags).toHaveLength(1);
    expect(todo.tags[0].name).toBe('Work');
    expect(typeof todo.tags[0].color).toBe('string');
  });

  test('CSV export has correct header and includes todos', async ({ page }) => {
    await app.createTodo({ title: 'Export me' });

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-csv').click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/^todos-\d{4}-\d{2}-\d{2}\.csv$/);

    const content = fs.readFileSync(await download.path(), 'utf-8');
    const lines = content.split('\n');

    expect(lines[0]).toBe('ID,Title,Completed,Due Date,Priority,Recurring,Pattern,Reminder');
    expect(content).toContain('Export me');
  });

  test('CSV export escapes quoted and comma-separated titles', async ({ page }) => {
    await page.request.post('/api/todos', {
      data: { title: 'Tricky, "quoted" title' },
    });

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-csv').click(),
    ]);

    const content = fs.readFileSync(await download.path(), 'utf-8');
    expect(content).toContain('"Tricky, ""quoted"" title"');
  });

  test('import creates todos from JSON file with subtasks and tags', async ({ page }) => {
    const envelope = {
      version: 1,
      todos: [
        {
          title: 'Imported A',
          priority: 'high',
          subtasks: [{ title: 'IA-1', position: 0 }],
          tags: [{ name: 'ImpTag', color: '#00ff00' }],
        },
        { title: 'Imported B' },
      ],
    };

    await page.getByTestId('import-input').setInputFiles({
      name: 'import.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(envelope)),
    });

    await expect(page.getByTestId('notice-banner')).toContainText('Imported 2 todos');
    await expect(app.todoItem('Imported A')).toBeVisible();
    await expect(app.todoItem('Imported B')).toBeVisible();

    await app.expandTodo('Imported A');
    await expect(
      app.todoItem('Imported A').getByTestId('subtask-item').filter({ hasText: 'IA-1' }),
    ).toBeVisible();
    await expect(app.todoItem('Imported A')).toContainText('ImpTag');
  });

  test('import reuses existing tags case-insensitively', async ({ page }) => {
    await app.createTag('work');

    const envelope = {
      version: 1,
      todos: [{ title: 'Task with tag', tags: [{ name: 'WORK', color: '#ff0000' }] }],
    };

    await page.getByTestId('import-input').setInputFiles({
      name: 'import.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(envelope)),
    });

    await expect(page.getByTestId('notice-banner')).toContainText('Imported 1 todo');

    const tagsResponse = await page.request.get('/api/tags');
    const tags = await tagsResponse.json();
    const workTags = tags.filter((tag: { name: string }) => tag.name.toLowerCase() === 'work');
    expect(workTags).toHaveLength(1);
  });

  test('import rejects invalid JSON file', async ({ page }) => {
    await page.getByTestId('import-input').setInputFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from('not json at all'),
    });

    await expect(page.getByTestId('error-banner')).toBeVisible();
  });

  test('import rejects unsupported version', async ({ page }) => {
    const envelope = { version: 2, todos: [] };

    await page.getByTestId('import-input').setInputFiles({
      name: 'bad-version.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(envelope)),
    });

    await expect(page.getByTestId('error-banner')).toBeVisible();
  });

  test('re-importing the same file duplicates todos by design', async ({ page }) => {
    const envelope = {
      version: 1,
      todos: [{ title: 'Imported B' }],
    };

    const file = {
      name: 'import.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(envelope)),
    };

    await page.getByTestId('import-input').setInputFiles(file);
    await expect(page.getByTestId('notice-banner')).toContainText('Imported 1 todo');
    await expect(app.todoItem('Imported B')).toBeVisible();

    await page.getByTestId('import-input').setInputFiles(file);
    await expect(page.getByTestId('notice-banner')).toContainText('Imported 1 todo');

    const count = await app.todoItem('Imported B').count();
    expect(count).toBe(2);
  });
});
