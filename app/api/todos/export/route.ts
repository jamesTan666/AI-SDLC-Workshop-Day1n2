import { NextRequest, NextResponse } from 'next/server';
import { todoDB } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { getSingaporeNowString, getSingaporeToday } from '@/lib/timezone';

/** Quotes a CSV field when it contains commas, quotes, or newlines. */
function csvField(value: string | number | boolean | null): string {
  if (value === null) return '';
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const format = request.nextUrl.searchParams.get('format') ?? 'json';
  if (format !== 'json' && format !== 'csv') {
    return NextResponse.json({ error: 'Invalid format — use json or csv' }, { status: 400 });
  }

  const todos = todoDB.getAll(session.userId);
  const today = getSingaporeToday();

  if (format === 'csv') {
    // CSV is a one-way export (not re-importable by design).
    const header = 'ID,Title,Completed,Due Date,Priority,Recurring,Pattern,Reminder';
    const lines = todos.map((todo) =>
      [
        csvField(todo.id),
        csvField(todo.title),
        csvField(todo.completed ? 'Yes' : 'No'),
        csvField(todo.due_date),
        csvField(todo.priority),
        csvField(todo.is_recurring ? 'Yes' : 'No'),
        csvField(todo.recurrence_pattern),
        csvField(todo.reminder_minutes),
      ].join(','),
    );
    const csv = [header, ...lines].join('\n');
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="todos-${today}.csv"`,
      },
    });
  }

  // JSON envelope: subtasks and tags ARE included; original IDs are dropped
  // (import assigns new IDs throughout).
  const payload = {
    version: 1,
    exported_at: getSingaporeNowString(),
    todos: todos.map((todo) => ({
      title: todo.title,
      completed: todo.completed,
      due_date: todo.due_date,
      priority: todo.priority,
      is_recurring: todo.is_recurring,
      recurrence_pattern: todo.recurrence_pattern,
      reminder_minutes: todo.reminder_minutes,
      created_at: todo.created_at,
      subtasks: (todo.subtasks ?? []).map((subtask) => ({
        title: subtask.title,
        completed: subtask.completed,
        position: subtask.position,
      })),
      tags: (todo.tags ?? []).map((tag) => ({ name: tag.name, color: tag.color })),
    })),
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="todos-${today}.json"`,
    },
  });
}
