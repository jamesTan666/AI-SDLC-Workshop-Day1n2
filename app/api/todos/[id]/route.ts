import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { runInTransaction, tagDB, todoDB, REMINDER_OPTIONS } from '@/lib/db';
import { getSession } from '@/lib/auth';
import {
  addMinutesToDateTime,
  calculateNextDueDate,
  getSingaporeNowString,
  isValidDateTimeLocal,
} from '@/lib/timezone';

const updateSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(500, 'Title is too long').optional(),
  completed: z.boolean().optional(),
  due_date: z.string().nullable().optional(),
  priority: z.enum(['high', 'medium', 'low']).optional(),
  is_recurring: z.boolean().optional(),
  recurrence_pattern: z.enum(['daily', 'weekly', 'monthly', 'yearly']).nullable().optional(),
  reminder_minutes: z.number().int().nullable().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) return NextResponse.json({ error: 'Invalid todo id' }, { status: 400 });

  const todo = todoDB.getById(id, session.userId);
  if (!todo) return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  return NextResponse.json(todo);
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) return NextResponse.json({ error: 'Invalid todo id' }, { status: 400 });

  try {
    const existing = todoDB.getById(id, session.userId);
    if (!existing) return NextResponse.json({ error: 'Todo not found' }, { status: 404 });

    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid request' },
        { status: 400 },
      );
    }
    const updates = parsed.data;

    if (updates.due_date != null) {
      if (!isValidDateTimeLocal(updates.due_date)) {
        return NextResponse.json({ error: 'Invalid due date' }, { status: 400 });
      }
      const minimum = addMinutesToDateTime(getSingaporeNowString(), 1);
      if (updates.due_date !== existing.due_date && updates.due_date < minimum) {
        return NextResponse.json(
          { error: 'Due date must be at least 1 minute in the future' },
          { status: 400 },
        );
      }
    }

    const willRecur = updates.is_recurring ?? existing.is_recurring;
    const effectiveDueDate =
      updates.due_date !== undefined ? updates.due_date : existing.due_date;
    const effectivePattern =
      updates.recurrence_pattern !== undefined
        ? updates.recurrence_pattern
        : existing.recurrence_pattern;
    if (willRecur && (!effectiveDueDate || !effectivePattern)) {
      return NextResponse.json(
        { error: 'Recurring todos require a due date and recurrence pattern' },
        { status: 400 },
      );
    }

    if (updates.reminder_minutes != null) {
      if (!REMINDER_OPTIONS.includes(updates.reminder_minutes as never)) {
        return NextResponse.json({ error: 'Invalid reminder offset' }, { status: 400 });
      }
      if (!effectiveDueDate) {
        return NextResponse.json(
          { error: 'Reminders require a due date' },
          { status: 400 },
        );
      }
    }

    // Completing a recurring todo creates the next instance, inheriting
    // title, priority, tags, reminder offset, and recurrence pattern.
    const completingRecurring =
      updates.completed === true &&
      !existing.completed &&
      existing.is_recurring &&
      existing.recurrence_pattern !== null &&
      existing.due_date !== null;

    const updated = runInTransaction(() => {
      const result = todoDB.update(id, session.userId, updates);
      if (result && completingRecurring) {
        const next = todoDB.create(session.userId, {
          title: existing.title,
          due_date: calculateNextDueDate(existing.due_date!, existing.recurrence_pattern!),
          priority: existing.priority,
          is_recurring: true,
          recurrence_pattern: existing.recurrence_pattern,
          reminder_minutes: existing.reminder_minutes,
        });
        for (const tag of existing.tags ?? []) {
          tagDB.attach(next.id, tag.id);
        }
      }
      return result;
    });

    if (!updated) return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
    return NextResponse.json(updated);
  } catch (error) {
    console.error('PUT /api/todos/[id] failed:', error);
    return NextResponse.json({ error: 'Failed to update todo' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) return NextResponse.json({ error: 'Invalid todo id' }, { status: 400 });

  const deleted = todoDB.delete(id, session.userId);
  if (!deleted) return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
