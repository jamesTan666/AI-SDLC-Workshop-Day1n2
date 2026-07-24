'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Holiday, Priority, Todo } from '@/lib/db';
import {
  addMonths,
  generateCalendarGrid,
  monthLabel,
  parseMonthParam,
  toMonthParam,
  WEEKDAY_LABELS,
} from '@/lib/calendar';
import { formatSingaporeDate } from '@/lib/timezone';

const PRIORITY_DOT: Record<Priority, string> = {
  high: 'bg-red-500 dark:bg-red-400',
  medium: 'bg-amber-500 dark:bg-amber-400',
  low: 'bg-blue-500 dark:bg-blue-400',
};

const PRIORITY_PILL: Record<Priority, string> = {
  high: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  low: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
};

const MAX_VISIBLE_PER_DAY = 3;

function CalendarView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { year, month } = parseMonthParam(searchParams.get('month'));

  const [todos, setTodos] = useState<Todo[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [todosResponse, holidaysResponse] = await Promise.all([
          fetch('/api/todos'),
          fetch('/api/holidays'),
        ]);
        if (cancelled) return;
        if (todosResponse.ok) setTodos(await todosResponse.json());
        if (holidaysResponse.ok) setHolidays(await holidaysResponse.json());
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const grid = useMemo(() => generateCalendarGrid(year, month), [year, month]);

  const todosByDate = useMemo(() => {
    const map = new Map<string, Todo[]>();
    for (const todo of todos) {
      if (!todo.due_date) continue;
      const key = todo.due_date.slice(0, 10);
      map.set(key, [...(map.get(key) ?? []), todo]);
    }
    return map;
  }, [todos]);

  const holidaysByDate = useMemo(() => {
    const map = new Map<string, string>();
    for (const holiday of holidays) {
      map.set(holiday.date, holiday.name);
    }
    return map;
  }, [holidays]);

  const navigate = (delta: number) => {
    const next = addMonths(year, month, delta);
    router.push(`/calendar?month=${toMonthParam(next.year, next.month)}`);
  };

  const selectedTodos = selectedDay ? todosByDate.get(selectedDay) ?? [] : [];

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold" data-testid="calendar-title">
            {monthLabel(year, month)}
          </h1>
          {loading && <span className="text-sm text-gray-400">Loading…</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Previous month"
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            ← Prev
          </button>
          <button
            type="button"
            onClick={() => router.push('/calendar')}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => navigate(1)}
            aria-label="Next month"
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            Next →
          </button>
          <Link
            href="/"
            className="ml-2 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            ← Todos
          </Link>
        </div>
      </header>

      <div className="mt-6 overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-7 gap-px rounded-t-xl bg-gray-200 dark:bg-gray-800">
            {WEEKDAY_LABELS.map((label) => (
              <div
                key={label}
                className="bg-gray-50 px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-gray-500 dark:bg-gray-900 dark:text-gray-400"
              >
                {label}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px rounded-b-xl bg-gray-200 dark:bg-gray-800">
            {grid.flat().map((cell) => {
              const dayTodos = todosByDate.get(cell.date) ?? [];
              const holidayName = holidaysByDate.get(cell.date);
              const overflow = dayTodos.length - MAX_VISIBLE_PER_DAY;
              return (
                <button
                  key={cell.date}
                  type="button"
                  data-testid={`calendar-day-${cell.date}`}
                  onClick={() => dayTodos.length > 0 && setSelectedDay(cell.date)}
                  className={`min-h-24 bg-white p-1.5 text-left align-top transition hover:bg-blue-50 dark:bg-gray-900 dark:hover:bg-gray-800 ${
                    cell.inCurrentMonth ? '' : 'opacity-40'
                  } ${cell.isWeekend && cell.inCurrentMonth ? 'bg-gray-50 dark:bg-gray-950' : ''}`}
                >
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                      cell.isToday
                        ? 'bg-blue-600 text-white'
                        : cell.isPast
                          ? 'text-gray-400 dark:text-gray-500'
                          : ''
                    }`}
                  >
                    {cell.day}
                  </span>
                  {holidayName && (
                    <p className="mt-0.5 truncate rounded bg-green-100 px-1 py-0.5 text-[10px] font-medium text-green-800 dark:bg-green-950 dark:text-green-300">
                      {holidayName}
                    </p>
                  )}
                  <ul className="mt-0.5 space-y-0.5">
                    {dayTodos.slice(0, MAX_VISIBLE_PER_DAY).map((todo) => (
                      <li
                        key={todo.id}
                        className={`flex items-center gap-1 truncate rounded px-1 py-0.5 text-[11px] ${PRIORITY_PILL[todo.priority]} ${
                          todo.completed ? 'line-through opacity-60' : ''
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${PRIORITY_DOT[todo.priority]}`}
                        />
                        <span className="truncate">{todo.title}</span>
                      </li>
                    ))}
                  </ul>
                  {overflow > 0 && (
                    <span className="mt-0.5 inline-block rounded bg-gray-200 px-1 text-[10px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                      +{overflow} more
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {selectedDay && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setSelectedDay(null)}
        >
          <div
            className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-gray-900"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {formatSingaporeDate(selectedDay)}
              </h2>
              <button
                type="button"
                onClick={() => setSelectedDay(null)}
                aria-label="Close"
                className="rounded-lg px-2 py-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                ✕
              </button>
            </div>
            {holidaysByDate.get(selectedDay) && (
              <p className="mt-1 rounded-lg bg-green-100 px-2 py-1 text-sm text-green-800 dark:bg-green-950 dark:text-green-300">
                🎉 {holidaysByDate.get(selectedDay)}
              </p>
            )}
            <ul className="mt-4 space-y-2">
              {selectedTodos.map((todo) => (
                <li
                  key={todo.id}
                  className="rounded-lg border border-gray-200 p-3 dark:border-gray-800"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[todo.priority]}`}
                    />
                    <span className={todo.completed ? 'line-through opacity-60' : ''}>
                      {todo.title}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {todo.due_date ? formatSingaporeDate(todo.due_date) : ''}
                    {todo.completed ? ' · Completed' : ''}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </main>
  );
}

export default function CalendarPage() {
  return (
    <Suspense fallback={<main className="p-6 text-sm text-gray-500">Loading calendar…</main>}>
      <CalendarView />
    </Suspense>
  );
}
