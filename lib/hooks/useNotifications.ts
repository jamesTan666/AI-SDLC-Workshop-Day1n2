'use client';

import { useCallback, useEffect, useState } from 'react';

const POLL_INTERVAL_MS = 30_000;

interface DueReminder {
  id: number;
  title: string;
  due_date: string | null;
  reminder_minutes: number | null;
}

function describeOffset(minutes: number | null): string {
  switch (minutes) {
    case 15: return '15 minutes';
    case 30: return '30 minutes';
    case 60: return '1 hour';
    case 120: return '2 hours';
    case 1440: return '1 day';
    case 2880: return '2 days';
    case 10080: return '1 week';
    default: return 'soon';
  }
}

export type NotificationPermissionState = NotificationPermission | 'unsupported';

/**
 * Polls /api/notifications/check every 30 seconds and raises browser
 * notifications for due reminders. The server marks reminders as sent
 * (last_notification_sent), so duplicates are prevented across polls.
 */
export function useNotifications(enabled: boolean) {
  const [permission, setPermission] = useState<NotificationPermissionState>('default');

  useEffect(() => {
    const timer = setTimeout(() => {
      if (typeof window === 'undefined' || !('Notification' in window)) {
        setPermission('unsupported');
      } else {
        setPermission(Notification.permission);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPermission('unsupported');
      return 'unsupported' as const;
    }
    const result = await Notification.requestPermission();
    setPermission(result);
    return result;
  }, []);

  useEffect(() => {
    if (!enabled || permission !== 'granted') return;

    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch('/api/notifications/check');
        if (!response.ok || cancelled) return;
        const data = (await response.json()) as { notifications?: DueReminder[] };
        for (const reminder of data.notifications ?? []) {
          new Notification(`Reminder: ${reminder.title}`, {
            body: `Due in ${describeOffset(reminder.reminder_minutes)} — ${reminder.due_date ?? ''}`,
            tag: `todo-reminder-${reminder.id}`,
          });
        }
      } catch {
        // Network hiccups are fine — the next poll retries.
      }
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [enabled, permission]);

  return { permission, requestPermission };
}
