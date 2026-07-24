import { expect, test } from '@playwright/test';
import { registerNewUser, singaporeDate, singaporeDateTime, TodoAppHelpers } from './helpers';

/** Format: month label from a Singapore date YYYY-MM-DD. */
function monthLabel(dateStr: string): string {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const [year, month] = dateStr.split('-');
  return `${months[parseInt(month) - 1]} ${year}`;
}

test.describe('Calendar', () => {
  let app: TodoAppHelpers;

  test.beforeEach(async ({ page }) => {
    await registerNewUser(page, 'cal');
    app = new TodoAppHelpers(page);
  });

  test('displays todo on its due date in calendar', async ({ page }) => {
    const dueDate = singaporeDateTime(120);
    const dueDay = singaporeDate(120);

    await app.createTodo({ title: 'Calendar todo', dueDate });
    await page.getByTestId('nav-calendar').click();

    await expect(page).toHaveURL(/\/calendar/);
    await expect(page.getByTestId(`calendar-day-${dueDay}`)).toContainText('Calendar todo');
  });

  test("today's cell is highlighted with blue background", async ({ page }) => {
    const today = singaporeDate(0);

    await page.getByTestId('nav-calendar').click();

    const cell = page.getByTestId(`calendar-day-${today}`);
    await expect(cell).toBeVisible();
    await expect(cell.locator('.bg-blue-600')).toBeVisible();
  });

  test('month navigation updates calendar title and URL', async ({ page }) => {
    const today = singaporeDate(0);
    const currentLabel = monthLabel(today);

    await page.getByTestId('nav-calendar').click();
    await expect(page.getByTestId('calendar-title')).toContainText(currentLabel);

    await page.getByRole('button', { name: 'Next month' }).click();
    await expect(page).toHaveURL(/\?month=/);
    await expect(page.getByTestId('calendar-title')).not.toContainText(currentLabel);

    await page.getByRole('button', { name: 'Previous month' }).click();
    await page.getByRole('button', { name: 'Previous month' }).click();
    // After navigating back, should see a different month
    await expect(page.getByTestId('calendar-title')).toBeVisible();
  });

  test('Today button returns to current month', async ({ page }) => {
    const today = singaporeDate(0);
    const currentLabel = monthLabel(today);

    await page.getByTestId('nav-calendar').click();
    await page.getByRole('button', { name: 'Next month' }).click();
    await expect(page.getByTestId('calendar-title')).not.toContainText(currentLabel);

    await page.getByRole('button', { name: 'Today' }).click();
    await expect(page.getByTestId('calendar-title')).toContainText(currentLabel);
  });

  test('invalid month param falls back to current month', async ({ page }) => {
    const today = singaporeDate(0);
    const currentLabel = monthLabel(today);

    await page.goto('/calendar?month=banana');
    await expect(page.getByTestId('calendar-title')).toContainText(currentLabel);
  });

  test('displays holiday on calendar', async ({ page }) => {
    await page.goto('/calendar?month=2026-12');

    const cell = page.getByTestId('calendar-day-2026-12-25');
    await expect(cell).toContainText('Christmas Day');
  });

  test('day-click modal shows todos and closes', async ({ page }) => {
    const dueDate = singaporeDateTime(120);
    const dueDay = singaporeDate(120);

    await app.createTodo({ title: 'Calendar todo', dueDate });
    await page.getByTestId('nav-calendar').click();

    // Wait for the async todos fetch to populate the cell before clicking —
    // day cells only open the modal once they have todos.
    const cell = page.getByTestId(`calendar-day-${dueDay}`);
    await expect(cell).toContainText('Calendar todo');
    await cell.click();
    await expect(page.locator('role=dialog')).toBeVisible();
    await expect(page.locator('role=dialog')).toContainText('Calendar todo');

    await page.locator('role=dialog').getByRole('button', { name: 'Close' }).click();
    await expect(page.locator('role=dialog')).toBeHidden();
  });

  test('overflow badge shows when day has more than 3 todos', async ({ page }) => {
    const dueDate = singaporeDateTime(180);
    const dueDay = singaporeDate(180);

    for (let i = 1; i <= 5; i++) {
      await page.request.post('/api/todos', {
        data: { title: `Bulk ${i}`, due_date: dueDate },
      });
    }

    await page.getByTestId('nav-calendar').click();

    const cell = page.getByTestId(`calendar-day-${dueDay}`);
    await expect(cell).toContainText(/\+\d+ more/);
  });
});
