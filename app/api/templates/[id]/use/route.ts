import { NextRequest, NextResponse } from 'next/server';
import { runInTransaction, subtaskDB, templateDB, todoDB } from '@/lib/db';
import type { TemplateSubtask } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { addMinutesToDateTime, getSingaporeNowString } from '@/lib/timezone';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Creates a todo from a template. Due date = now + due_date_offset_minutes
 * (or none when the offset is null); subtasks are re-created from the
 * template's JSON snapshot with completed = false. Tags are never captured
 * by templates.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid template id' }, { status: 400 });
  }

  try {
    const template = templateDB.getById(id, session.userId);
    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const dueDate =
      template.due_date_offset_minutes == null
        ? null
        : addMinutesToDateTime(getSingaporeNowString(), template.due_date_offset_minutes);

    // A recurring todo is only valid with a due date; drop recurrence if the
    // template has no offset.
    const isRecurring = template.is_recurring && dueDate !== null;

    let subtasks: TemplateSubtask[] = [];
    if (template.subtasks_json) {
      try {
        const parsed = JSON.parse(template.subtasks_json);
        if (Array.isArray(parsed)) {
          subtasks = parsed
            .filter(
              (item): item is TemplateSubtask =>
                item && typeof item.title === 'string' && item.title.trim().length > 0,
            )
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
        }
      } catch {
        subtasks = [];
      }
    }

    const todo = runInTransaction(() => {
      const created = todoDB.create(session.userId, {
        title: template.title_template,
        due_date: dueDate,
        priority: template.priority,
        is_recurring: isRecurring,
        recurrence_pattern: isRecurring ? template.recurrence_pattern : null,
        reminder_minutes: dueDate ? template.reminder_minutes : null,
      });
      for (const subtask of subtasks) {
        subtaskDB.create(created.id, subtask.title);
      }
      return todoDB.getById(created.id, session.userId);
    });

    return NextResponse.json(todo, { status: 201 });
  } catch (error) {
    console.error('POST /api/templates/[id]/use failed:', error);
    return NextResponse.json({ error: 'Failed to create todo from template' }, { status: 500 });
  }
}
