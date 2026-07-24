import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { runInTransaction, subtaskDB, tagDB, todoDB, REMINDER_OPTIONS } from '@/lib/db';
import { getSession } from '@/lib/auth';

const importSubtaskSchema = z.object({
  title: z.string().trim().min(1).max(500),
  completed: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
});

const importTagSchema = z.object({
  name: z.string().trim().min(1).max(50),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

const importTodoSchema = z.object({
  title: z.string().trim().min(1).max(500),
  completed: z.boolean().optional(),
  due_date: z.string().nullable().optional(),
  priority: z.enum(['high', 'medium', 'low']).optional(),
  is_recurring: z.boolean().optional(),
  recurrence_pattern: z.enum(['daily', 'weekly', 'monthly', 'yearly']).nullable().optional(),
  reminder_minutes: z
    .number()
    .int()
    .nullable()
    .optional()
    .refine((value) => value == null || REMINDER_OPTIONS.includes(value as never), {
      message: 'Invalid reminder offset',
    }),
  subtasks: z.array(importSubtaskSchema).optional(),
  tags: z.array(importTagSchema).optional(),
});

const envelopeSchema = z.object({
  version: z.literal(1),
  exported_at: z.string().optional(),
  todos: z.array(importTodoSchema),
});

/**
 * Restores an export file. The whole structure is validated before anything
 * is written; all rows are inserted in one transaction with brand-new IDs.
 * Tag conflicts resolve by case-insensitive name match (reuse existing tag).
 * Re-importing the same file duplicates todos by design.
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const parsed = envelopeSchema.safeParse(await request.json());
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const where = issue?.path?.length ? ` at ${issue.path.join('.')}` : '';
      return NextResponse.json(
        { error: `Invalid import file: ${issue?.message ?? 'malformed data'}${where}` },
        { status: 400 },
      );
    }

    const { todos } = parsed.data;
    const imported = runInTransaction(() => {
      let count = 0;
      for (const entry of todos) {
        const created = todoDB.create(session.userId, {
          title: entry.title,
          due_date: entry.due_date ?? null,
          priority: entry.priority ?? 'medium',
          is_recurring: entry.is_recurring ?? false,
          recurrence_pattern: entry.recurrence_pattern ?? null,
          reminder_minutes: entry.reminder_minutes ?? null,
        });
        if (entry.completed) {
          todoDB.update(created.id, session.userId, { completed: true });
        }

        const orderedSubtasks = [...(entry.subtasks ?? [])].sort(
          (a, b) => (a.position ?? 0) - (b.position ?? 0),
        );
        for (const subtask of orderedSubtasks) {
          const createdSubtask = subtaskDB.create(created.id, subtask.title);
          if (subtask.completed) {
            subtaskDB.update(createdSubtask.id, { completed: true });
          }
        }

        for (const tag of entry.tags ?? []) {
          const existing = tagDB.findByName(session.userId, tag.name);
          const resolved = existing ?? tagDB.create(session.userId, tag.name, tag.color);
          tagDB.attach(created.id, resolved.id);
        }
        count += 1;
      }
      return count;
    });

    return NextResponse.json({ success: true, imported });
  } catch (error) {
    console.error('POST /api/todos/import failed:', error);
    return NextResponse.json({ error: 'Failed to import todos' }, { status: 500 });
  }
}
