import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { templateDB, REMINDER_OPTIONS } from '@/lib/db';
import { getSession } from '@/lib/auth';

const createSchema = z.object({
  name: z.string().trim().min(1, 'Template name is required').max(100),
  description: z.string().max(500).nullable().optional(),
  category: z.string().max(50).nullable().optional(),
  title_template: z.string().trim().min(1, 'Title is required').max(500),
  priority: z.enum(['high', 'medium', 'low']).optional(),
  is_recurring: z.boolean().optional(),
  recurrence_pattern: z.enum(['daily', 'weekly', 'monthly', 'yearly']).nullable().optional(),
  reminder_minutes: z.number().int().nullable().optional(),
  due_date_offset_minutes: z.number().int().min(0).nullable().optional(),
  subtasks: z.array(z.object({
    title: z.string().trim().min(1).max(500),
    position: z.number().int().min(0),
  })).optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  return NextResponse.json(templateDB.getAll(session.userId));
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

    if (input.reminder_minutes != null) {
      if (!REMINDER_OPTIONS.includes(input.reminder_minutes as never)) {
        return NextResponse.json({ error: 'Invalid reminder offset' }, { status: 400 });
      }
    }

    const willRecur = input.is_recurring ?? false;
    if (willRecur && (!input.recurrence_pattern || input.due_date_offset_minutes == null)) {
      return NextResponse.json(
        { error: 'Recurring templates require a recurrence pattern and a due date offset' },
        { status: 400 },
      );
    }

    const template = templateDB.create(session.userId, {
      name: input.name,
      description: input.description ?? null,
      category: input.category ?? null,
      title_template: input.title_template,
      priority: input.priority ?? 'medium',
      is_recurring: input.is_recurring ?? false,
      recurrence_pattern: input.is_recurring ? input.recurrence_pattern ?? null : null,
      reminder_minutes: input.reminder_minutes ?? null,
      due_date_offset_minutes: input.due_date_offset_minutes ?? null,
      subtasks_json: input.subtasks && input.subtasks.length > 0 ? JSON.stringify(input.subtasks) : null,
    });
    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    console.error('POST /api/templates failed:', error);
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 });
  }
}
