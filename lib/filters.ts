import type { Priority, Todo } from '@/lib/db';

export interface FilterState {
  search: string;
  priority: Priority | 'all';
  tagId: number | 'all';
  completion: 'all' | 'active' | 'completed';
  dueDateFrom: string;
  dueDateTo: string;
}

export const DEFAULT_FILTERS: FilterState = {
  search: '',
  priority: 'all',
  tagId: 'all',
  completion: 'all',
  dueDateFrom: '',
  dueDateTo: '',
};

export function applyFilters(todos: Todo[], filters: FilterState): Todo[] {
  let result = todos;

  // 1. Search filter (case-insensitive partial match on title or subtask titles)
  if (filters.search.trim()) {
    const searchLower = filters.search.trim().toLowerCase();
    result = result.filter((todo) => {
      const titleMatch = todo.title.toLowerCase().includes(searchLower);
      const subtaskMatch = (todo.subtasks ?? []).some((sub) =>
        sub.title.toLowerCase().includes(searchLower)
      );
      return titleMatch || subtaskMatch;
    });
  }

  // 2. Priority filter
  if (filters.priority !== 'all') {
    result = result.filter((todo) => todo.priority === filters.priority);
  }

  // 3. Tag filter
  if (filters.tagId !== 'all') {
    result = result.filter((todo) =>
      (todo.tags ?? []).some((tag) => tag.id === filters.tagId)
    );
  }

  // 4. Completion filter
  if (filters.completion === 'active') {
    result = result.filter((todo) => !todo.completed);
  } else if (filters.completion === 'completed') {
    result = result.filter((todo) => todo.completed);
  }

  // 5. Date range filter
  const hasDateFilter = filters.dueDateFrom || filters.dueDateTo;
  if (hasDateFilter) {
    result = result.filter((todo) => {
      if (!todo.due_date) return false;
      const dueDatePart = todo.due_date.slice(0, 10);
      if (filters.dueDateFrom && dueDatePart < filters.dueDateFrom) return false;
      if (filters.dueDateTo && dueDatePart > filters.dueDateTo) return false;
      return true;
    });
  }

  return result;
}

export interface FilterPreset {
  id: string;
  name: string;
  filters: FilterState;
  createdAt: string;
}

export const FILTER_PRESETS_STORAGE_KEY = 'todo-app:filter-presets';

export function loadFilterPresets(): FilterPreset[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const stored = window.localStorage.getItem(FILTER_PRESETS_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveFilterPresets(presets: FilterPreset[]): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(FILTER_PRESETS_STORAGE_KEY, JSON.stringify(presets));
}
