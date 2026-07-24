import { expect, type Locator, type Page } from '@playwright/test';

export type PriorityOption = 'high' | 'medium' | 'low';
export type RecurrenceOption = 'daily' | 'weekly' | 'monthly' | 'yearly';

let usernameCounter = 0;

/** Unique username per test run so tests never collide in the shared DB. */
export function uniqueUsername(prefix = 'user'): string {
  usernameCounter += 1;
  return `${prefix}-${Date.now()}-${usernameCounter}`;
}

/**
 * Returns a Singapore-local `YYYY-MM-DDTHH:mm` string `minutesFromNow` in the
 * future (or past when negative) — the format <input type="datetime-local">
 * accepts and the app stores.
 */
export function singaporeDateTime(minutesFromNow: number): string {
  const target = new Date(Date.now() + minutesFromNow * 60_000);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(target)) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }
  const hour = parts.hour === '24' ? '00' : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}`;
}

/** Date part (`YYYY-MM-DD`) of a Singapore-local datetime offset in minutes. */
export function singaporeDate(minutesFromNow = 0): string {
  return singaporeDateTime(minutesFromNow).slice(0, 10);
}

/**
 * Attaches a CTAP2 virtual authenticator (resident key + user verification,
 * automatic presence simulation) to the page via CDP. Call before any
 * register/login interaction on that page.
 */
export async function setupVirtualAuthenticator(page: Page): Promise<void> {
  const client = await page.context().newCDPSession(page);
  await client.send('WebAuthn.enable');
  await client.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
}

/** Registers a new account through the UI; lands on the todo page. */
export async function register(page: Page, username: string): Promise<void> {
  await page.goto('/login');
  await page.getByRole('tab', { name: 'Register' }).click();
  await page.locator('#username').fill(username);
  await page.getByRole('button', { name: 'Create account with passkey' }).click();
  await page.waitForURL('/');
  await expect(page.getByTestId('current-user')).toContainText(username);
}

/** Logs an existing user in through the UI; lands on the todo page. */
export async function login(page: Page, username: string): Promise<void> {
  await page.goto('/login');
  await page.getByRole('tab', { name: 'Login' }).click();
  await page.locator('#username').fill(username);
  await page.getByRole('button', { name: 'Sign in with passkey' }).click();
  await page.waitForURL('/');
}

/**
 * One-call test bootstrap: virtual authenticator + fresh registered user.
 * Returns the username.
 */
export async function registerNewUser(page: Page, prefix = 'user'): Promise<string> {
  await setupVirtualAuthenticator(page);
  const username = uniqueUsername(prefix);
  await register(page, username);
  return username;
}

export interface CreateTodoOptions {
  title: string;
  dueDate?: string;
  priority?: PriorityOption;
  recurring?: RecurrenceOption;
  reminder?: number;
  tagNames?: string[];
}

export interface CreateTemplateOptions {
  name: string;
  title: string;
  category?: string;
  description?: string;
  priority?: PriorityOption;
  offsetValue?: number;
  offsetUnit?: 'minutes' | 'hours' | 'days';
  reminder?: number;
  recurring?: RecurrenceOption;
  subtasks?: string[];
}

/** Reusable UI helpers for the main todo page. */
export class TodoAppHelpers {
  constructor(readonly page: Page) {}

  /** Locator for the todo card whose title text matches. */
  todoItem(title: string): Locator {
    return this.page
      .getByTestId('todo-item')
      .filter({ has: this.page.getByTestId('todo-title').filter({ hasText: title }) });
  }

  async createTodo(options: CreateTodoOptions): Promise<void> {
    await this.page.getByTestId('new-todo-title').fill(options.title);
    if (options.dueDate) {
      await this.page.getByTestId('new-todo-due-date').fill(options.dueDate);
    }
    if (options.priority) {
      await this.page.getByTestId('new-todo-priority').selectOption(options.priority);
    }
    if (options.recurring) {
      await this.page.getByTestId('new-todo-recurring').check();
      await this.page.getByTestId('new-todo-pattern').selectOption(options.recurring);
    }
    if (options.reminder) {
      await this.page.getByTestId('new-todo-reminder').selectOption(String(options.reminder));
    }
    for (const tagName of options.tagNames ?? []) {
      await this.page.getByTestId(`new-todo-tag-${tagName}`).click();
    }
    await this.page.getByTestId('new-todo-submit').click();
    await expect(this.todoItem(options.title).first()).toBeVisible();
  }

  /** Expands a todo's subtask panel when collapsed. */
  async expandTodo(todoTitle: string): Promise<void> {
    const item = this.todoItem(todoTitle).first();
    if (!(await item.getByTestId('subtask-input').isVisible())) {
      await item.getByTestId('todo-expand').click();
    }
    await expect(item.getByTestId('subtask-input')).toBeVisible();
  }

  async addSubtask(todoTitle: string, subtaskTitle: string): Promise<void> {
    await this.expandTodo(todoTitle);
    const item = this.todoItem(todoTitle).first();
    await item.getByTestId('subtask-input').fill(subtaskTitle);
    await item.getByTestId('subtask-add').click();
    await expect(
      item.getByTestId('subtask-item').filter({ hasText: subtaskTitle }),
    ).toBeVisible();
  }

  async createTag(name: string, color?: string): Promise<void> {
    await this.page.getByTestId('manage-tags-button').click();
    await expect(this.page.getByTestId('tag-modal')).toBeVisible();
    await this.page.getByTestId('tag-name-input').fill(name);
    if (color) {
      await this.page.getByTestId('tag-color-input').fill(color);
    }
    await this.page.getByTestId('tag-create').click();
    await expect(this.page.getByTestId('tag-row').filter({ hasText: name })).toBeVisible();
    await this.closeModal('tag-modal');
  }

  async createTemplate(options: CreateTemplateOptions): Promise<void> {
    await this.page.getByTestId('templates-button').click();
    await expect(this.page.getByTestId('template-modal')).toBeVisible();
    await this.page.getByTestId('template-name').fill(options.name);
    await this.page.getByTestId('template-title').fill(options.title);
    if (options.category) {
      await this.page.getByTestId('template-category').fill(options.category);
    }
    if (options.description) {
      await this.page.getByTestId('template-description').fill(options.description);
    }
    if (options.priority) {
      await this.page.getByTestId('template-priority').selectOption(options.priority);
    }
    if (options.offsetValue !== undefined) {
      await this.page.getByTestId('template-offset-value').fill(String(options.offsetValue));
      await this.page
        .getByTestId('template-offset-unit')
        .selectOption(options.offsetUnit ?? 'days');
    }
    if (options.reminder) {
      await this.page.getByTestId('template-reminder').selectOption(String(options.reminder));
    }
    if (options.recurring) {
      await this.page.getByTestId('template-recurring').check();
      await this.page.getByTestId('template-pattern').selectOption(options.recurring);
    }
    for (const subtask of options.subtasks ?? []) {
      await this.page.getByTestId('template-subtask-input').fill(subtask);
      await this.page.getByTestId('template-subtask-add').click();
    }
    await this.page.getByTestId('template-create').click();
    await expect(
      this.page.getByTestId('template-item').filter({ hasText: options.name }),
    ).toBeVisible();
    await this.closeModal('template-modal');
  }

  async closeModal(testId: string): Promise<void> {
    await this.page.getByTestId(testId).getByRole('button', { name: 'Close' }).click();
    await expect(this.page.getByTestId(testId)).toBeHidden();
  }
}
