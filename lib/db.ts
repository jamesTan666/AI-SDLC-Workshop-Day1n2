/**
 * Single source of truth for the database: schema, TypeScript interfaces, and
 * CRUD objects (userDB, authenticatorDB, todoDB, subtaskDB, tagDB, templateDB,
 * holidayDB). better-sqlite3 is synchronous — no async/await for DB calls.
 *
 * Server-side only. Client components may import the exported types with
 * `import type`, but must never import this module for value usage.
 */
import Database from 'better-sqlite3';
import path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Priority = 'high' | 'medium' | 'low';
export type RecurrencePattern = 'daily' | 'weekly' | 'monthly' | 'yearly';
export type ReminderMinutes = 15 | 30 | 60 | 120 | 1440 | 2880 | 10080; // 15m,30m,1h,2h,1d,2d,1w

export const PRIORITIES: Priority[] = ['high', 'medium', 'low'];
export const RECURRENCE_PATTERNS: RecurrencePattern[] = ['daily', 'weekly', 'monthly', 'yearly'];
export const REMINDER_OPTIONS: ReminderMinutes[] = [15, 30, 60, 120, 1440, 2880, 10080];

export interface User {
  id: number;
  username: string;
  created_at: string;
}

export interface Authenticator {
  id: number;
  user_id: number;
  credential_id: string;
  credential_public_key: Buffer;
  counter: number;
  transports: string | null;
  created_at: string;
}

export interface Session {
  userId: number;
  username: string;
}

export interface Todo {
  id: number;
  user_id: number;
  title: string;
  completed: boolean;
  due_date: string | null;
  priority: Priority;
  is_recurring: boolean;
  recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null;
  last_notification_sent: string | null;
  created_at: string;
  updated_at: string | null;
  subtasks?: Subtask[];
  tags?: Tag[];
}

export interface Subtask {
  id: number;
  todo_id: number;
  title: string;
  completed: boolean;
  position: number;
  created_at: string;
}

export interface Tag {
  id: number;
  user_id: number;
  name: string;
  color: string;
  created_at: string;
}

export interface Template {
  id: number;
  user_id: number;
  name: string;
  description: string | null;
  category: string | null;
  title_template: string;
  priority: Priority;
  is_recurring: boolean;
  recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null;
  due_date_offset_minutes: number | null;
  subtasks_json: string | null;
  created_at: string;
}

export interface TemplateSubtask {
  title: string;
  position: number;
}

export interface Holiday {
  id: number;
  date: string;
  name: string;
}

export interface CreateTodoInput {
  title: string;
  due_date?: string | null;
  priority?: Priority;
  is_recurring?: boolean;
  recurrence_pattern?: RecurrencePattern | null;
  reminder_minutes?: number | null;
}

export interface UpdateTodoInput {
  title?: string;
  completed?: boolean;
  due_date?: string | null;
  priority?: Priority;
  is_recurring?: boolean;
  recurrence_pattern?: RecurrencePattern | null;
  reminder_minutes?: number | null;
  last_notification_sent?: string | null;
}

export interface CreateTemplateInput {
  name: string;
  description?: string | null;
  category?: string | null;
  title_template: string;
  priority?: Priority;
  is_recurring?: boolean;
  recurrence_pattern?: RecurrencePattern | null;
  reminder_minutes?: number | null;
  due_date_offset_minutes?: number | null;
  subtasks_json?: string | null;
}

// ---------------------------------------------------------------------------
// Connection + schema
// ---------------------------------------------------------------------------

const DB_PATH = path.join(process.cwd(), 'todos.db');

function createConnection(): Database.Database {
  const connection = new Database(DB_PATH);
  connection.pragma('journal_mode = WAL');
  // Required for ON DELETE CASCADE to actually fire in better-sqlite3.
  connection.pragma('foreign_keys = ON');

  connection.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS authenticators (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      credential_id TEXT UNIQUE NOT NULL,
      credential_public_key BLOB NOT NULL,
      counter INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_authenticators_user_id ON authenticators(user_id);

    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      due_date TEXT,
      priority TEXT NOT NULL DEFAULT 'medium',
      is_recurring INTEGER NOT NULL DEFAULT 0,
      recurrence_pattern TEXT,
      reminder_minutes INTEGER,
      last_notification_sent TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_todos_user_id ON todos(user_id);
    CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos(due_date);

    CREATE TABLE IF NOT EXISTS subtasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      todo_id INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_subtasks_todo_id ON subtasks(todo_id);

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#3B82F6',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, name)
    );

    CREATE TABLE IF NOT EXISTS todo_tags (
      todo_id INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (todo_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT,
      title_template TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'medium',
      is_recurring INTEGER NOT NULL DEFAULT 0,
      recurrence_pattern TEXT,
      reminder_minutes INTEGER,
      due_date_offset_minutes INTEGER,
      subtasks_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS holidays (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_holidays_date ON holidays(date);
  `);

  // Migrations: additive columns wrapped in try-catch so re-runs are no-ops.
  try {
    connection.exec('ALTER TABLE authenticators ADD COLUMN transports TEXT');
  } catch {
    // Column already exists.
  }

  return connection;
}

// Reuse one connection across Next.js dev-server module reloads.
const globalForDb = globalThis as unknown as { __todoAppDb?: Database.Database };
const db: Database.Database = globalForDb.__todoAppDb ?? createConnection();
globalForDb.__todoAppDb = db;

/** Runs `fn` inside a single SQLite transaction and returns its result. */
export function runInTransaction<T>(fn: () => T): T {
  return db.transaction(fn)();
}

// ---------------------------------------------------------------------------
// Row converters (SQLite stores booleans as 0/1)
// ---------------------------------------------------------------------------

interface TodoRow {
  id: number;
  user_id: number;
  title: string;
  completed: number;
  due_date: string | null;
  priority: Priority;
  is_recurring: number;
  recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null;
  last_notification_sent: string | null;
  created_at: string;
  updated_at: string | null;
}

interface SubtaskRow {
  id: number;
  todo_id: number;
  title: string;
  completed: number;
  position: number;
  created_at: string;
}

function rowToTodo(row: TodoRow): Todo {
  return {
    ...row,
    completed: !!row.completed,
    is_recurring: !!row.is_recurring,
    reminder_minutes: row.reminder_minutes ?? null,
    last_notification_sent: row.last_notification_sent ?? null,
  };
}

function rowToSubtask(row: SubtaskRow): Subtask {
  return { ...row, completed: !!row.completed };
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export const userDB = {
  create(username: string): User {
    const result = db
      .prepare('INSERT INTO users (username) VALUES (?)')
      .run(username);
    return userDB.getById(Number(result.lastInsertRowid))!;
  },

  getById(id: number): User | null {
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
    return row ?? null;
  },

  getByUsername(username: string): User | null {
    const row = db
      .prepare('SELECT * FROM users WHERE username = ?')
      .get(username) as User | undefined;
    return row ?? null;
  },
};

// ---------------------------------------------------------------------------
// Authenticators
// ---------------------------------------------------------------------------

export const authenticatorDB = {
  create(
    userId: number,
    credentialId: string,
    credentialPublicKey: Uint8Array,
    counter: number,
    transports?: string[] | null,
  ): Authenticator {
    const result = db
      .prepare(
        `INSERT INTO authenticators
           (user_id, credential_id, credential_public_key, counter, transports)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        userId,
        credentialId,
        Buffer.from(credentialPublicKey),
        counter ?? 0,
        transports && transports.length > 0 ? JSON.stringify(transports) : null,
      );
    return authenticatorDB.getById(Number(result.lastInsertRowid))!;
  },

  getById(id: number): Authenticator | null {
    const row = db
      .prepare('SELECT * FROM authenticators WHERE id = ?')
      .get(id) as Authenticator | undefined;
    return row ?? null;
  },

  getByCredentialId(credentialId: string): Authenticator | null {
    const row = db
      .prepare('SELECT * FROM authenticators WHERE credential_id = ?')
      .get(credentialId) as Authenticator | undefined;
    return row ?? null;
  },

  getByUserId(userId: number): Authenticator[] {
    return db
      .prepare('SELECT * FROM authenticators WHERE user_id = ? ORDER BY id')
      .all(userId) as Authenticator[];
  },

  updateCounter(id: number, counter: number): void {
    db.prepare('UPDATE authenticators SET counter = ? WHERE id = ?').run(counter ?? 0, id);
  },
};

// ---------------------------------------------------------------------------
// Todos
// ---------------------------------------------------------------------------

export const todoDB = {
  getAll(userId: number): Todo[] {
    const rows = db
      .prepare('SELECT * FROM todos WHERE user_id = ? ORDER BY created_at DESC, id DESC')
      .all(userId) as TodoRow[];
    const todos = rows.map(rowToTodo);
    if (todos.length === 0) return todos;

    const subtaskRows = db
      .prepare(
        `SELECT s.* FROM subtasks s
         JOIN todos t ON t.id = s.todo_id
         WHERE t.user_id = ?
         ORDER BY s.position ASC, s.id ASC`,
      )
      .all(userId) as SubtaskRow[];

    const tagRows = db
      .prepare(
        `SELECT tt.todo_id AS todo_id, tg.id, tg.user_id, tg.name, tg.color, tg.created_at
         FROM todo_tags tt
         JOIN tags tg ON tg.id = tt.tag_id
         JOIN todos t ON t.id = tt.todo_id
         WHERE t.user_id = ?
         ORDER BY tg.name COLLATE NOCASE ASC`,
      )
      .all(userId) as Array<Tag & { todo_id: number }>;

    const subtasksByTodo = new Map<number, Subtask[]>();
    for (const row of subtaskRows) {
      const list = subtasksByTodo.get(row.todo_id) ?? [];
      subtasksByTodo.set(row.todo_id, [...list, rowToSubtask(row)]);
    }

    const tagsByTodo = new Map<number, Tag[]>();
    for (const row of tagRows) {
      const { todo_id, ...tag } = row;
      const list = tagsByTodo.get(todo_id) ?? [];
      tagsByTodo.set(todo_id, [...list, tag]);
    }

    return todos.map((todo) => ({
      ...todo,
      subtasks: subtasksByTodo.get(todo.id) ?? [],
      tags: tagsByTodo.get(todo.id) ?? [],
    }));
  },

  getById(id: number, userId: number): Todo | null {
    const row = db
      .prepare('SELECT * FROM todos WHERE id = ? AND user_id = ?')
      .get(id, userId) as TodoRow | undefined;
    if (!row) return null;
    const todo = rowToTodo(row);
    return {
      ...todo,
      subtasks: subtaskDB.getForTodo(id),
      tags: tagDB.getForTodo(id),
    };
  },

  create(userId: number, input: CreateTodoInput): Todo {
    const result = db
      .prepare(
        `INSERT INTO todos
           (user_id, title, due_date, priority, is_recurring, recurrence_pattern, reminder_minutes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        userId,
        input.title,
        input.due_date ?? null,
        input.priority ?? 'medium',
        input.is_recurring ? 1 : 0,
        input.recurrence_pattern ?? null,
        input.reminder_minutes ?? null,
      );
    return todoDB.getById(Number(result.lastInsertRowid), userId)!;
  },

  update(id: number, userId: number, updates: UpdateTodoInput): Todo | null {
    const assignments: string[] = [];
    const values: unknown[] = [];

    if (updates.title !== undefined) {
      assignments.push('title = ?');
      values.push(updates.title);
    }
    if (updates.completed !== undefined) {
      assignments.push('completed = ?');
      values.push(updates.completed ? 1 : 0);
    }
    if (updates.due_date !== undefined) {
      assignments.push('due_date = ?');
      values.push(updates.due_date ?? null);
    }
    if (updates.priority !== undefined) {
      assignments.push('priority = ?');
      values.push(updates.priority);
    }
    if (updates.is_recurring !== undefined) {
      assignments.push('is_recurring = ?');
      values.push(updates.is_recurring ? 1 : 0);
    }
    if (updates.recurrence_pattern !== undefined) {
      assignments.push('recurrence_pattern = ?');
      values.push(updates.recurrence_pattern ?? null);
    }
    if (updates.reminder_minutes !== undefined) {
      assignments.push('reminder_minutes = ?');
      values.push(updates.reminder_minutes ?? null);
    }
    if (updates.last_notification_sent !== undefined) {
      assignments.push('last_notification_sent = ?');
      values.push(updates.last_notification_sent ?? null);
    }

    if (assignments.length === 0) {
      return todoDB.getById(id, userId);
    }

    assignments.push("updated_at = datetime('now')");
    const result = db
      .prepare(`UPDATE todos SET ${assignments.join(', ')} WHERE id = ? AND user_id = ?`)
      .run(...values, id, userId);
    if (result.changes === 0) return null;
    return todoDB.getById(id, userId);
  },

  delete(id: number, userId: number): boolean {
    const result = db
      .prepare('DELETE FROM todos WHERE id = ? AND user_id = ?')
      .run(id, userId);
    return result.changes > 0;
  },

  /**
   * Candidate rows for reminder notifications: incomplete, with both a due
   * date and a reminder offset. Window filtering happens in the route using
   * Singapore-timezone helpers.
   */
  getReminderCandidates(userId: number): Todo[] {
    const rows = db
      .prepare(
        `SELECT * FROM todos
         WHERE user_id = ? AND completed = 0
           AND due_date IS NOT NULL AND reminder_minutes IS NOT NULL`,
      )
      .all(userId) as TodoRow[];
    return rows.map(rowToTodo);
  },

  markNotificationSent(id: number, userId: number, sentAt: string): void {
    db.prepare(
      'UPDATE todos SET last_notification_sent = ? WHERE id = ? AND user_id = ?',
    ).run(sentAt, id, userId);
  },
};

// ---------------------------------------------------------------------------
// Subtasks
// ---------------------------------------------------------------------------

export const subtaskDB = {
  getForTodo(todoId: number): Subtask[] {
    const rows = db
      .prepare('SELECT * FROM subtasks WHERE todo_id = ? ORDER BY position ASC, id ASC')
      .all(todoId) as SubtaskRow[];
    return rows.map(rowToSubtask);
  },

  /** Fetches a subtask only when its parent todo belongs to `userId`. */
  getByIdForUser(id: number, userId: number): Subtask | null {
    const row = db
      .prepare(
        `SELECT s.* FROM subtasks s
         JOIN todos t ON t.id = s.todo_id
         WHERE s.id = ? AND t.user_id = ?`,
      )
      .get(id, userId) as SubtaskRow | undefined;
    return row ? rowToSubtask(row) : null;
  },

  /** Appends at max(position) + 1 within the todo. */
  create(todoId: number, title: string): Subtask {
    const { next } = db
      .prepare(
        'SELECT COALESCE(MAX(position), -1) + 1 AS next FROM subtasks WHERE todo_id = ?',
      )
      .get(todoId) as { next: number };
    const result = db
      .prepare('INSERT INTO subtasks (todo_id, title, position) VALUES (?, ?, ?)')
      .run(todoId, title, next);
    const row = db
      .prepare('SELECT * FROM subtasks WHERE id = ?')
      .get(Number(result.lastInsertRowid)) as SubtaskRow;
    return rowToSubtask(row);
  },

  update(
    id: number,
    updates: { title?: string; completed?: boolean; position?: number },
  ): Subtask | null {
    const assignments: string[] = [];
    const values: unknown[] = [];
    if (updates.title !== undefined) {
      assignments.push('title = ?');
      values.push(updates.title);
    }
    if (updates.completed !== undefined) {
      assignments.push('completed = ?');
      values.push(updates.completed ? 1 : 0);
    }
    if (updates.position !== undefined) {
      assignments.push('position = ?');
      values.push(updates.position);
    }
    if (assignments.length === 0) {
      const row = db.prepare('SELECT * FROM subtasks WHERE id = ?').get(id) as
        | SubtaskRow
        | undefined;
      return row ? rowToSubtask(row) : null;
    }
    const result = db
      .prepare(`UPDATE subtasks SET ${assignments.join(', ')} WHERE id = ?`)
      .run(...values, id);
    if (result.changes === 0) return null;
    const row = db.prepare('SELECT * FROM subtasks WHERE id = ?').get(id) as SubtaskRow;
    return rowToSubtask(row);
  },

  /** Deletes without renumbering the remaining subtasks (by design). */
  delete(id: number): boolean {
    return db.prepare('DELETE FROM subtasks WHERE id = ?').run(id).changes > 0;
  },
};

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export const tagDB = {
  getAll(userId: number): Tag[] {
    return db
      .prepare('SELECT * FROM tags WHERE user_id = ? ORDER BY name COLLATE NOCASE ASC')
      .all(userId) as Tag[];
  },

  getById(id: number, userId: number): Tag | null {
    const row = db
      .prepare('SELECT * FROM tags WHERE id = ? AND user_id = ?')
      .get(id, userId) as Tag | undefined;
    return row ?? null;
  },

  /** Case-insensitive lookup by name, used for import conflict resolution. */
  findByName(userId: number, name: string): Tag | null {
    const row = db
      .prepare('SELECT * FROM tags WHERE user_id = ? AND name = ? COLLATE NOCASE')
      .get(userId, name) as Tag | undefined;
    return row ?? null;
  },

  create(userId: number, name: string, color?: string): Tag {
    const result = db
      .prepare('INSERT INTO tags (user_id, name, color) VALUES (?, ?, ?)')
      .run(userId, name, color ?? '#3B82F6');
    return tagDB.getById(Number(result.lastInsertRowid), userId)!;
  },

  update(
    id: number,
    userId: number,
    updates: { name?: string; color?: string },
  ): Tag | null {
    const assignments: string[] = [];
    const values: unknown[] = [];
    if (updates.name !== undefined) {
      assignments.push('name = ?');
      values.push(updates.name);
    }
    if (updates.color !== undefined) {
      assignments.push('color = ?');
      values.push(updates.color);
    }
    if (assignments.length === 0) return tagDB.getById(id, userId);
    const result = db
      .prepare(`UPDATE tags SET ${assignments.join(', ')} WHERE id = ? AND user_id = ?`)
      .run(...values, id, userId);
    if (result.changes === 0) return null;
    return tagDB.getById(id, userId);
  },

  delete(id: number, userId: number): boolean {
    return (
      db.prepare('DELETE FROM tags WHERE id = ? AND user_id = ?').run(id, userId).changes > 0
    );
  },

  getForTodo(todoId: number): Tag[] {
    return db
      .prepare(
        `SELECT tg.* FROM tags tg
         JOIN todo_tags tt ON tt.tag_id = tg.id
         WHERE tt.todo_id = ?
         ORDER BY tg.name COLLATE NOCASE ASC`,
      )
      .all(todoId) as Tag[];
  },

  /** Idempotent attach — a no-op when the tag is already on the todo. */
  attach(todoId: number, tagId: number): void {
    db.prepare(
      'INSERT OR IGNORE INTO todo_tags (todo_id, tag_id) VALUES (?, ?)',
    ).run(todoId, tagId);
  },

  /** Idempotent detach — a no-op when the tag is not on the todo. */
  detach(todoId: number, tagId: number): void {
    db.prepare('DELETE FROM todo_tags WHERE todo_id = ? AND tag_id = ?').run(todoId, tagId);
  },
};

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export const templateDB = {
  getAll(userId: number): Template[] {
    const rows = db
      .prepare('SELECT * FROM templates WHERE user_id = ? ORDER BY name COLLATE NOCASE ASC')
      .all(userId) as Array<Omit<Template, 'is_recurring'> & { is_recurring: number }>;
    return rows.map((row) => ({ ...row, is_recurring: !!row.is_recurring }));
  },

  getById(id: number, userId: number): Template | null {
    const row = db
      .prepare('SELECT * FROM templates WHERE id = ? AND user_id = ?')
      .get(id, userId) as (Omit<Template, 'is_recurring'> & { is_recurring: number }) | undefined;
    return row ? { ...row, is_recurring: !!row.is_recurring } : null;
  },

  create(userId: number, input: CreateTemplateInput): Template {
    const result = db
      .prepare(
        `INSERT INTO templates
           (user_id, name, description, category, title_template, priority,
            is_recurring, recurrence_pattern, reminder_minutes,
            due_date_offset_minutes, subtasks_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        userId,
        input.name,
        input.description ?? null,
        input.category ?? null,
        input.title_template,
        input.priority ?? 'medium',
        input.is_recurring ? 1 : 0,
        input.recurrence_pattern ?? null,
        input.reminder_minutes ?? null,
        input.due_date_offset_minutes ?? null,
        input.subtasks_json ?? null,
      );
    return templateDB.getById(Number(result.lastInsertRowid), userId)!;
  },

  update(id: number, userId: number, input: Partial<CreateTemplateInput>): Template | null {
    const columns: Array<[keyof CreateTemplateInput, string]> = [
      ['name', 'name'],
      ['description', 'description'],
      ['category', 'category'],
      ['title_template', 'title_template'],
      ['priority', 'priority'],
      ['is_recurring', 'is_recurring'],
      ['recurrence_pattern', 'recurrence_pattern'],
      ['reminder_minutes', 'reminder_minutes'],
      ['due_date_offset_minutes', 'due_date_offset_minutes'],
      ['subtasks_json', 'subtasks_json'],
    ];
    const assignments: string[] = [];
    const values: unknown[] = [];
    for (const [key, column] of columns) {
      if (input[key] !== undefined) {
        assignments.push(`${column} = ?`);
        const value = input[key];
        values.push(typeof value === 'boolean' ? (value ? 1 : 0) : value ?? null);
      }
    }
    if (assignments.length === 0) return templateDB.getById(id, userId);
    const result = db
      .prepare(`UPDATE templates SET ${assignments.join(', ')} WHERE id = ? AND user_id = ?`)
      .run(...values, id, userId);
    if (result.changes === 0) return null;
    return templateDB.getById(id, userId);
  },

  delete(id: number, userId: number): boolean {
    return (
      db.prepare('DELETE FROM templates WHERE id = ? AND user_id = ?').run(id, userId)
        .changes > 0
    );
  },
};

// ---------------------------------------------------------------------------
// Holidays (global, not user-scoped)
// ---------------------------------------------------------------------------

export const holidayDB = {
  getAll(): Holiday[] {
    return db
      .prepare('SELECT id, date, name FROM holidays ORDER BY date ASC')
      .all() as Holiday[];
  },

  getByYear(year: number): Holiday[] {
    return db
      .prepare("SELECT id, date, name FROM holidays WHERE date LIKE ? ORDER BY date ASC")
      .all(`${year}-%`) as Holiday[];
  },

  upsert(date: string, name: string): void {
    db.prepare(
      `INSERT INTO holidays (date, name) VALUES (?, ?)
       ON CONFLICT(date) DO UPDATE SET name = excluded.name`,
    ).run(date, name);
  },
};
