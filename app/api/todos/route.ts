import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { todoDB, REMINDER_OPTIONS } from '@/lib/db';
import { getSession } from '@/lib/auth';
import {
  addMinutesToDateTime,
  getSingaporeNowString,
  isValidDateTimeLocal,
} from '@/lib/timezone';

const createSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(500, 'Title is too long'),
  due_date: z.string().nullable().optional(),
  priority: z.enum(['high', 'medium', 'low']).optional(),
  is_recurring: z.boolean().optional(),
  recurrence_pattern: z.enum(['daily', 'weekly', 'monthly', 'yearly']).nullable().optional(),
  reminder_minutes: z.number().int().nullable().optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  return NextResponse.json(todoDB.getAll(session.userId));
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid request' },
        { status: 400 },
      );
    }
    const input = parsed.data;

    if (input.due_date) {
      if (!isValidDateTimeLocal(input.due_date)) {
        return NextResponse.json({ error: 'Invalid due date' }, { status: 400 });
      }
      const minimum = addMinutesToDateTime(getSingaporeNowString(), 1);
      if (input.due_date < minimum) {
        return NextResponse.json(
          { error: 'Due date must be at least 1 minute in the future' },
          { status: 400 },
        );
      }
    }

    if (input.is_recurring) {
      if (!input.due_date) {
        return NextResponse.json(
          { error: 'Recurring todos require a due date' },
          { status: 400 },
        );
      }
      if (!input.recurrence_pattern) {
        return NextResponse.json(
          { error: 'Recurring todos require a recurrence pattern' },
          { status: 400 },
        );
      }
    }

    if (input.reminder_minutes != null) {
      if (!REMINDER_OPTIONS.includes(input.reminder_minutes as never)) {
        return NextResponse.json({ error: 'Invalid reminder offset' }, { status: 400 });
      }
      if (!input.due_date) {
        return NextResponse.json(
          { error: 'Reminders require a due date' },
          { status: 400 },
        );
      }
    }

    const todo = todoDB.create(session.userId, {
      title: input.title,
      due_date: input.due_date ?? null,
      priority: input.priority ?? 'medium',
      is_recurring: input.is_recurring ?? false,
      recurrence_pattern: input.is_recurring ? input.recurrence_pattern ?? null : null,
      reminder_minutes: input.reminder_minutes ?? null,
    });
    return NextResponse.json(todo, { status: 201 });
  } catch (error) {
    console.error('POST /api/todos failed:', error);
    return NextResponse.json({ error: 'Failed to create todo' }, { status: 500 });
  }
}
