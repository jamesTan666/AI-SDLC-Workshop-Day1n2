import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { templateDB, REMINDER_OPTIONS } from '@/lib/db';
import { getSession } from '@/lib/auth';

const updateSchema = z.object({
  name: z.string().trim().min(1, 'Template name is required').max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  category: z.string().max(50).nullable().optional(),
  title_template: z.string().trim().min(1, 'Title is required').max(500).optional(),
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

type RouteContext = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) return NextResponse.json({ error: 'Invalid template id' }, { status: 400 });

  try {
    const existing = templateDB.getById(id, session.userId);
    if (!existing) return NextResponse.json({ error: 'Template not found' }, { status: 404 });

    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid request' },
        { status: 400 },
      );
    }
    const updates = parsed.data;

    if (updates.reminder_minutes != null) {
      if (!REMINDER_OPTIONS.includes(updates.reminder_minutes as never)) {
        return NextResponse.json({ error: 'Invalid reminder offset' }, { status: 400 });
      }
    }

    const willRecur = updates.is_recurring ?? existing.is_recurring;
    const effectivePattern = updates.recurrence_pattern !== undefined ? updates.recurrence_pattern : existing.recurrence_pattern;
    const effectiveOffset = updates.due_date_offset_minutes !== undefined ? updates.due_date_offset_minutes : existing.due_date_offset_minutes;

    if (willRecur && (!effectivePattern || effectiveOffset == null)) {
      return NextResponse.json(
        { error: 'Recurring templates require a recurrence pattern and a due date offset' },
        { status: 400 },
      );
    }

    const { subtasks, ...rest } = updates;
    const updateInput = {
      ...rest,
      ...('subtasks' in updates
        ? { subtasks_json: subtasks && subtasks.length > 0 ? JSON.stringify(subtasks) : null }
        : {}),
    };

    const updated = templateDB.update(id, session.userId, updateInput);
    if (!updated) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    return NextResponse.json(updated);
  } catch (error) {
    console.error('PUT /api/templates/[id] failed:', error);
    return NextResponse.json({ error: 'Failed to update template' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) return NextResponse.json({ error: 'Invalid template id' }, { status: 400 });

  const deleted = templateDB.delete(id, session.userId);
  if (!deleted) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
