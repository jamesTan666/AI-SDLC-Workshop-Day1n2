import { NextResponse } from 'next/server';
import { runInTransaction, todoDB } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { addMinutesToDateTime, getSingaporeNowString } from '@/lib/timezone';

/**
 * Returns reminders that are due right now: incomplete todos whose reminder
 * window [due_date - reminder_minutes, due_date] contains the current
 * Singapore time and whose last_notification_sent does not already cover this
 * window. Returned todos are marked as notified in the same transaction so
 * the 30-second polling loop never double-notifies.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const now = getSingaporeNowString();
  const candidates = todoDB.getReminderCandidates(session.userId);

  const due = candidates.filter((todo) => {
    if (!todo.due_date || todo.reminder_minutes == null) return false;
    const windowStart = addMinutesToDateTime(todo.due_date, -todo.reminder_minutes);
    if (now < windowStart || now > todo.due_date) return false;
    if (todo.last_notification_sent && todo.last_notification_sent >= windowStart) {
      return false;
    }
    return true;
  });

  if (due.length > 0) {
    runInTransaction(() => {
      for (const todo of due) {
        todoDB.markNotificationSent(todo.id, session.userId, now);
      }
    });
  }

  return NextResponse.json({
    notifications: due.map((todo) => ({
      id: todo.id,
      title: todo.title,
      due_date: todo.due_date,
      reminder_minutes: todo.reminder_minutes,
    })),
  });
}
