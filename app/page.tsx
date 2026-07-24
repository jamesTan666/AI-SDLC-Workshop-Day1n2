'use client';

/**
 * Main todo page. Intentionally a single large client component — the
 * project's monolithic UI convention: todos, subtasks, tags, templates,
 * search/filtering, export/import, and notifications all live here. State is
 * plain React hooks; every server interaction is a fetch to an API route.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import Link from 'next/link';
import type {
  Priority,
  RecurrencePattern,
  Subtask,
  Tag,
  Template,
  Todo,
} from '@/lib/db';
import {
  applyFilters,
  DEFAULT_FILTERS,
  loadFilterPresets,
  saveFilterPresets,
  type FilterPreset,
  type FilterState,
} from '@/lib/filters';
import { formatSingaporeDate, getSingaporeNowString, addMinutesToDateTime } from '@/lib/timezone';
import { useNotifications } from '@/lib/hooks/useNotifications';

// ---------------------------------------------------------------------------
// Constants & small helpers
// ---------------------------------------------------------------------------

const PRIORITY_ORDER: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

const PRIORITY_BADGE: Record<Priority, string> = {
  high: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  low: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
};

const PRIORITY_LABEL: Record<Priority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

const REMINDER_LABELS: Array<{ value: number; label: string }> = [
  { value: 15, label: '15m before' },
  { value: 30, label: '30m before' },
  { value: 60, label: '1h before' },
  { value: 120, label: '2h before' },
  { value: 1440, label: '1d before' },
  { value: 2880, label: '2d before' },
  { value: 10080, label: '1w before' },
];

const RECURRENCE_OPTIONS: RecurrencePattern[] = ['daily', 'weekly', 'monthly', 'yearly'];

function reminderLabel(minutes: number | null): string {
  const found = REMINDER_LABELS.find((option) => option.value === minutes);
  return found ? found.label.replace(' before', '') : '';
}

function compareTodos(a: Todo, b: Todo): number {
  const byPriority = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  if (byPriority !== 0) return byPriority;
  if (a.due_date && b.due_date && a.due_date !== b.due_date) {
    return a.due_date < b.due_date ? -1 : 1;
  }
  if (a.due_date && !b.due_date) return -1;
  if (!a.due_date && b.due_date) return 1;
  if (a.created_at !== b.created_at) return a.created_at > b.created_at ? -1 : 1;
  return b.id - a.id;
}

async function readError(response: Response): Promise<string> {
  try {
    const data = await response.json();
    return typeof data.error === 'string' ? data.error : 'Something went wrong';
  } catch {
    return 'Something went wrong';
  }
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

interface TemplateSubtaskDraft {
  title: string;
  position: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TodoPage() {
  // Core data
  const [todos, setTodos] = useState<Todo[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [username, setUsername] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // New-todo form
  const [newTitle, setNewTitle] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [newPriority, setNewPriority] = useState<Priority>('medium');
  const [newRecurring, setNewRecurring] = useState(false);
  const [newPattern, setNewPattern] = useState<RecurrencePattern>('daily');
  const [newReminder, setNewReminder] = useState('');
  const [newTagIds, setNewTagIds] = useState<number[]>([]);

  // Inline editing
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editPriority, setEditPriority] = useState<Priority>('medium');
  const [editRecurring, setEditRecurring] = useState(false);
  const [editPattern, setEditPattern] = useState<RecurrencePattern>('daily');
  const [editReminder, setEditReminder] = useState('');
  const [editTagIds, setEditTagIds] = useState<number[]>([]);

  // Subtasks
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [subtaskDrafts, setSubtaskDrafts] = useState<Record<number, string>>({});

  // Search & filters
  const [searchText, setSearchText] = useState('');
  const debouncedSearch = useDebounce(searchText, 300);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [presetName, setPresetName] = useState('');

  // Tag management modal
  const [showTagModal, setShowTagModal] = useState(false);
  const [tagName, setTagName] = useState('');
  const [tagColor, setTagColor] = useState('#3B82F6');
  const [editingTagId, setEditingTagId] = useState<number | null>(null);
  const [editingTagName, setEditingTagName] = useState('');
  const [editingTagColor, setEditingTagColor] = useState('#3B82F6');

  // Templates modal
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [templateCategory, setTemplateCategory] = useState('');
  const [templateTitle, setTemplateTitle] = useState('');
  const [templatePriority, setTemplatePriority] = useState<Priority>('medium');
  const [templateRecurring, setTemplateRecurring] = useState(false);
  const [templatePattern, setTemplatePattern] = useState<RecurrencePattern>('daily');
  const [templateReminder, setTemplateReminder] = useState('');
  const [templateOffsetValue, setTemplateOffsetValue] = useState('');
  const [templateOffsetUnit, setTemplateOffsetUnit] = useState<'minutes' | 'hours' | 'days'>('days');
  const [templateSubtasks, setTemplateSubtasks] = useState<TemplateSubtaskDraft[]>([]);
  const [templateSubtaskDraft, setTemplateSubtaskDraft] = useState('');

  // Import
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const { permission, requestPermission } = useNotifications(Boolean(username));

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  const refreshTodos = useCallback(async () => {
    const response = await fetch('/api/todos');
    if (response.status === 401) {
      window.location.href = '/login';
      return;
    }
    if (response.ok) setTodos(await response.json());
  }, []);

  const refreshTags = useCallback(async () => {
    const response = await fetch('/api/tags');
    if (response.ok) setTags(await response.json());
  }, []);

  const refreshTemplates = useCallback(async () => {
    const response = await fetch('/api/templates');
    if (response.ok) setTemplates(await response.json());
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const meResponse = await fetch('/api/auth/me');
        if (meResponse.status === 401) {
          window.location.href = '/login';
          return;
        }
        if (meResponse.ok) {
          const me = await meResponse.json();
          setUsername(me.user?.username ?? '');
        }
        setPresets(loadFilterPresets());
        await Promise.all([refreshTodos(), refreshTags(), refreshTemplates()]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [refreshTodos, refreshTags, refreshTemplates]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  // -------------------------------------------------------------------------
  // Derived state: filtering + sections
  // -------------------------------------------------------------------------

  const activeFilters = useMemo(
    () => ({ ...filters, search: debouncedSearch }),
    [filters, debouncedSearch],
  );

  const filteredTodos = useMemo(
    () => applyFilters(todos, activeFilters),
    [todos, activeFilters],
  );

  const nowString = getSingaporeNowString();
  const sections = useMemo(() => {
    const overdue = filteredTodos
      .filter((todo) => !todo.completed && todo.due_date !== null && todo.due_date < nowString)
      .sort(compareTodos);
    const pending = filteredTodos
      .filter((todo) => !todo.completed && (todo.due_date === null || todo.due_date >= nowString))
      .sort(compareTodos);
    const completed = filteredTodos.filter((todo) => todo.completed).sort(compareTodos);
    return { overdue, pending, completed };
  }, [filteredTodos, nowString]);

  const filtersActive =
    activeFilters.search.trim() !== '' ||
    activeFilters.priority !== 'all' ||
    activeFilters.tagId !== 'all' ||
    activeFilters.completion !== 'all' ||
    activeFilters.dueDateFrom !== '' ||
    activeFilters.dueDateTo !== '';

  // -------------------------------------------------------------------------
  // Todo actions
  // -------------------------------------------------------------------------

  const handleCreateTodo = async (event: FormEvent) => {
    event.preventDefault();
    setBanner(null);
    const title = newTitle.trim();
    if (!title) {
      setBanner('Title is required');
      return;
    }
    try {
      const response = await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          due_date: newDueDate || null,
          priority: newPriority,
          is_recurring: newRecurring,
          recurrence_pattern: newRecurring ? newPattern : null,
          reminder_minutes: newReminder ? Number(newReminder) : null,
        }),
      });
      if (!response.ok) {
        setBanner(await readError(response));
        return;
      }
      const created: Todo = await response.json();
      for (const tagId of newTagIds) {
        await fetch(`/api/todos/${created.id}/tags`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tag_id: tagId }),
        });
      }
      setNewTitle('');
      setNewDueDate('');
      setNewPriority('medium');
      setNewRecurring(false);
      setNewPattern('daily');
      setNewReminder('');
      setNewTagIds([]);
      await refreshTodos();
    } catch {
      setBanner('Failed to create todo');
    }
  };

  const handleToggleComplete = async (todo: Todo) => {
    const nextValue = !todo.completed;
    // Optimistic update; the refetch below reconciles (and picks up the next
    // instance of a recurring todo).
    setTodos((previous) =>
      previous.map((item) =>
        item.id === todo.id ? { ...item, completed: nextValue } : item,
      ),
    );
    const response = await fetch(`/api/todos/${todo.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: nextValue }),
    });
    if (!response.ok) setBanner(await readError(response));
    await refreshTodos();
  };

  const handleDeleteTodo = async (todo: Todo) => {
    // Immediate delete, no confirmation (by design); cascades subtasks/tags.
    setTodos((previous) => previous.filter((item) => item.id !== todo.id));
    const response = await fetch(`/api/todos/${todo.id}`, { method: 'DELETE' });
    if (!response.ok) {
      setBanner(await readError(response));
      await refreshTodos();
    }
  };

  const startEditing = (todo: Todo) => {
    setEditingId(todo.id);
    setEditTitle(todo.title);
    setEditDueDate(todo.due_date ?? '');
    setEditPriority(todo.priority);
    setEditRecurring(todo.is_recurring);
    setEditPattern(todo.recurrence_pattern ?? 'daily');
    setEditReminder(todo.reminder_minutes ? String(todo.reminder_minutes) : '');
    setEditTagIds((todo.tags ?? []).map((tag) => tag.id));
  };

  const handleSaveEdit = async (todo: Todo) => {
    setBanner(null);
    try {
      const response = await fetch(`/api/todos/${todo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle.trim(),
          due_date: editDueDate || null,
          priority: editPriority,
          is_recurring: editRecurring,
          recurrence_pattern: editRecurring ? editPattern : null,
          reminder_minutes: editDueDate && editReminder ? Number(editReminder) : null,
        }),
      });
      if (!response.ok) {
        setBanner(await readError(response));
        return;
      }
      const previousTagIds = (todo.tags ?? []).map((tag) => tag.id);
      const toAttach = editTagIds.filter((id) => !previousTagIds.includes(id));
      const toDetach = previousTagIds.filter((id) => !editTagIds.includes(id));
      for (const tagId of toAttach) {
        await fetch(`/api/todos/${todo.id}/tags`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tag_id: tagId }),
        });
      }
      for (const tagId of toDetach) {
        await fetch(`/api/todos/${todo.id}/tags`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tag_id: tagId }),
        });
      }
      setEditingId(null);
      await refreshTodos();
    } catch {
      setBanner('Failed to update todo');
    }
  };

  // -------------------------------------------------------------------------
  // Subtask actions
  // -------------------------------------------------------------------------

  const toggleExpanded = (todoId: number) => {
    setExpandedIds((previous) => {
      const next = new Set(previous);
      if (next.has(todoId)) {
        next.delete(todoId);
      } else {
        next.add(todoId);
      }
      return next;
    });
  };

  const handleAddSubtask = async (todo: Todo) => {
    const draft = (subtaskDrafts[todo.id] ?? '').trim();
    if (!draft) return;
    const response = await fetch(`/api/todos/${todo.id}/subtasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: draft }),
    });
    if (!response.ok) {
      setBanner(await readError(response));
      return;
    }
    setSubtaskDrafts((previous) => ({ ...previous, [todo.id]: '' }));
    await refreshTodos();
  };

  const handleToggleSubtask = async (subtask: Subtask) => {
    const response = await fetch(`/api/subtasks/${subtask.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: !subtask.completed }),
    });
    if (!response.ok) setBanner(await readError(response));
    await refreshTodos();
  };

  const handleDeleteSubtask = async (subtask: Subtask) => {
    const response = await fetch(`/api/subtasks/${subtask.id}`, { method: 'DELETE' });
    if (!response.ok) setBanner(await readError(response));
    await refreshTodos();
  };

  // -------------------------------------------------------------------------
  // Tag actions
  // -------------------------------------------------------------------------

  const handleCreateTag = async (event: FormEvent) => {
    event.preventDefault();
    const name = tagName.trim();
    if (!name) return;
    const response = await fetch('/api/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color: tagColor }),
    });
    if (!response.ok) {
      setBanner(await readError(response));
      return;
    }
    setTagName('');
    setTagColor('#3B82F6');
    await refreshTags();
  };

  const handleSaveTag = async (tag: Tag) => {
    const response = await fetch(`/api/tags/${tag.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editingTagName.trim(), color: editingTagColor }),
    });
    if (!response.ok) {
      setBanner(await readError(response));
      return;
    }
    setEditingTagId(null);
    // Tag edits propagate everywhere (tags are referenced, not copied).
    await Promise.all([refreshTags(), refreshTodos()]);
  };

  const handleDeleteTag = async (tag: Tag) => {
    const response = await fetch(`/api/tags/${tag.id}`, { method: 'DELETE' });
    if (!response.ok) {
      setBanner(await readError(response));
      return;
    }
    setFilters((previous) =>
      previous.tagId === tag.id ? { ...previous, tagId: 'all' } : previous,
    );
    await Promise.all([refreshTags(), refreshTodos()]);
  };

  // -------------------------------------------------------------------------
  // Template actions
  // -------------------------------------------------------------------------

  const templateOffsetMinutes = (): number | null => {
    if (templateOffsetValue === '') return null;
    const value = Number(templateOffsetValue);
    if (!Number.isFinite(value) || value < 0) return null;
    const multiplier =
      templateOffsetUnit === 'days' ? 1440 : templateOffsetUnit === 'hours' ? 60 : 1;
    return Math.round(value * multiplier);
  };

  const handleCreateTemplate = async (event: FormEvent) => {
    event.preventDefault();
    setBanner(null);
    const response = await fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: templateName.trim(),
        description: templateDescription.trim() || null,
        category: templateCategory.trim() || null,
        title_template: templateTitle.trim(),
        priority: templatePriority,
        is_recurring: templateRecurring,
        recurrence_pattern: templateRecurring ? templatePattern : null,
        reminder_minutes: templateReminder ? Number(templateReminder) : null,
        due_date_offset_minutes: templateOffsetMinutes(),
        subtasks: templateSubtasks,
      }),
    });
    if (!response.ok) {
      setBanner(await readError(response));
      return;
    }
    setTemplateName('');
    setTemplateDescription('');
    setTemplateCategory('');
    setTemplateTitle('');
    setTemplatePriority('medium');
    setTemplateRecurring(false);
    setTemplatePattern('daily');
    setTemplateReminder('');
    setTemplateOffsetValue('');
    setTemplateOffsetUnit('days');
    setTemplateSubtasks([]);
    setNotice('Template created');
    await refreshTemplates();
  };

  const handleUseTemplate = async (template: Template) => {
    const response = await fetch(`/api/templates/${template.id}/use`, { method: 'POST' });
    if (!response.ok) {
      setBanner(await readError(response));
      return;
    }
    setNotice(`Todo created from "${template.name}"`);
    await refreshTodos();
  };

  const handleDeleteTemplate = async (template: Template) => {
    const response = await fetch(`/api/templates/${template.id}`, { method: 'DELETE' });
    if (!response.ok) {
      setBanner(await readError(response));
      return;
    }
    await refreshTemplates();
  };

  const handleSaveAsTemplate = async (todo: Todo) => {
    const response = await fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: todo.title,
        title_template: todo.title,
        priority: todo.priority,
        is_recurring: false,
        recurrence_pattern: null,
        reminder_minutes: todo.reminder_minutes,
        due_date_offset_minutes: null,
        // Subtasks ARE captured by templates (titles + positions only).
        subtasks: (todo.subtasks ?? []).map((subtask) => ({
          title: subtask.title,
          position: subtask.position,
        })),
      }),
    });
    if (!response.ok) {
      setBanner(await readError(response));
      return;
    }
    setNotice(`Saved "${todo.title}" as a template`);
    await refreshTemplates();
  };

  // -------------------------------------------------------------------------
  // Filter presets
  // -------------------------------------------------------------------------

  const handleSavePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    const preset: FilterPreset = {
      id: crypto.randomUUID(),
      name,
      filters: { ...activeFilters },
      createdAt: getSingaporeNowString(),
    };
    const next = [...presets, preset];
    setPresets(next);
    saveFilterPresets(next);
    setPresetName('');
  };

  const handleApplyPreset = (preset: FilterPreset) => {
    setFilters(preset.filters);
    setSearchText(preset.filters.search);
  };

  const handleDeletePreset = (preset: FilterPreset) => {
    const next = presets.filter((item) => item.id !== preset.id);
    setPresets(next);
    saveFilterPresets(next);
  };

  const clearFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setSearchText('');
  };

  // -------------------------------------------------------------------------
  // Import / export / auth
  // -------------------------------------------------------------------------

  const handleImportFile = async (file: File) => {
    setBanner(null);
    try {
      const payload = JSON.parse(await file.text());
      const response = await fetch('/api/todos/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        setBanner(await readError(response));
        return;
      }
      const result = await response.json();
      setNotice(`Imported ${result.imported} todo${result.imported === 1 ? '' : 's'}`);
      await Promise.all([refreshTodos(), refreshTags()]);
    } catch {
      setBanner('Invalid import file — expected a JSON export from this app');
    } finally {
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  };

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  const tagToggle = (selected: number[], tagId: number): number[] =>
    selected.includes(tagId)
      ? selected.filter((id) => id !== tagId)
      : [...selected, tagId];

  const renderTodoItem = (todo: Todo, isOverdue: boolean) => {
    const subtasks = todo.subtasks ?? [];
    const completedSubtasks = subtasks.filter((subtask) => subtask.completed).length;
    const progress =
      subtasks.length > 0 ? Math.round((completedSubtasks / subtasks.length) * 100) : 0;
    const expanded = expandedIds.has(todo.id);
    const isEditing = editingId === todo.id;

    return (
      <li
        key={todo.id}
        data-testid="todo-item"
        className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"
      >
        {isEditing ? (
          <div className="space-y-3">
            <input
              data-testid="edit-title"
              value={editTitle}
              onChange={(event) => setEditTitle(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
            />
            <div className="flex flex-wrap gap-2">
              <input
                data-testid="edit-due-date"
                type="datetime-local"
                value={editDueDate}
                onChange={(event) => setEditDueDate(event.target.value)}
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-950"
              />
              <select
                data-testid="edit-priority"
                value={editPriority}
                onChange={(event) => setEditPriority(event.target.value as Priority)}
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-950"
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  data-testid="edit-recurring"
                  type="checkbox"
                  checked={editRecurring}
                  onChange={(event) => setEditRecurring(event.target.checked)}
                />
                Recurring
              </label>
              {editRecurring && (
                <select
                  data-testid="edit-pattern"
                  value={editPattern}
                  onChange={(event) => setEditPattern(event.target.value as RecurrencePattern)}
                  className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-950"
                >
                  {RECURRENCE_OPTIONS.map((pattern) => (
                    <option key={pattern} value={pattern}>
                      {pattern}
                    </option>
                  ))}
                </select>
              )}
              <select
                data-testid="edit-reminder"
                value={editReminder}
                onChange={(event) => setEditReminder(event.target.value)}
                disabled={!editDueDate}
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm disabled:opacity-50 dark:border-gray-700 dark:bg-gray-950"
              >
                <option value="">No reminder</option>
                {REMINDER_LABELS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    data-testid={`edit-tag-${tag.name}`}
                    onClick={() => setEditTagIds((previous) => tagToggle(previous, tag.id))}
                    className={`rounded-full border px-2 py-0.5 text-xs ${
                      editTagIds.includes(tag.id)
                        ? 'border-transparent text-white'
                        : 'border-gray-300 text-gray-600 dark:border-gray-700 dark:text-gray-300'
                    }`}
                    style={
                      editTagIds.includes(tag.id) ? { backgroundColor: tag.color } : undefined
                    }
                  >
                    {tag.name}
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                data-testid="edit-save"
                onClick={() => handleSaveEdit(todo)}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                Save
              </button>
              <button
                type="button"
                data-testid="edit-cancel"
                onClick={() => setEditingId(null)}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-3">
              <input
                data-testid="todo-toggle"
                type="checkbox"
                checked={todo.completed}
                onChange={() => handleToggleComplete(todo)}
                aria-label={`Toggle ${todo.title}`}
                className="mt-1 h-4 w-4"
              />
              <div className="min-w-0 flex-1">
                <p
                  data-testid="todo-title"
                  className={`font-medium ${todo.completed ? 'text-gray-400 line-through' : ''}`}
                >
                  {todo.title}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span
                    data-testid="badge-priority"
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_BADGE[todo.priority]}`}
                  >
                    {PRIORITY_LABEL[todo.priority]}
                  </span>
                  {todo.due_date && (
                    <span
                      data-testid="badge-due"
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        isOverdue
                          ? 'bg-red-100 font-semibold text-red-700 dark:bg-red-950 dark:text-red-300'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                      }`}
                    >
                      {isOverdue ? '⚠ Overdue: ' : '📅 '}
                      {formatSingaporeDate(todo.due_date)}
                    </span>
                  )}
                  {todo.is_recurring && todo.recurrence_pattern && (
                    <span
                      data-testid="badge-recurring"
                      className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-950 dark:text-purple-300"
                    >
                      🔄 {todo.recurrence_pattern}
                    </span>
                  )}
                  {todo.reminder_minutes != null && (
                    <span
                      data-testid="badge-reminder"
                      className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-700 dark:bg-teal-950 dark:text-teal-300"
                    >
                      🔔 {reminderLabel(todo.reminder_minutes)}
                    </span>
                  )}
                  {(todo.tags ?? []).map((tag) => (
                    <span
                      key={tag.id}
                      data-testid="badge-tag"
                      className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                      style={{ backgroundColor: tag.color }}
                    >
                      {tag.name}
                    </span>
                  ))}
                </div>
                {subtasks.length > 0 && (
                  <div className="mt-2">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
                      <div
                        data-testid="progress-bar"
                        data-progress={progress}
                        className={`h-full rounded-full transition-all ${
                          progress === 100 ? 'bg-green-500' : 'bg-blue-500'
                        }`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <p
                      data-testid="subtask-progress"
                      className="mt-1 text-xs text-gray-500 dark:text-gray-400"
                    >
                      {completedSubtasks}/{subtasks.length} subtasks
                    </p>
                  </div>
                )}
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  data-testid="todo-expand"
                  onClick={() => toggleExpanded(todo.id)}
                  aria-label="Subtasks"
                  title="Subtasks"
                  className="rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  {expanded ? '▾' : '▸'}
                </button>
                <button
                  type="button"
                  data-testid="todo-save-template"
                  onClick={() => handleSaveAsTemplate(todo)}
                  aria-label="Save as template"
                  title="Save as template"
                  className="rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  📋
                </button>
                <button
                  type="button"
                  data-testid="todo-edit"
                  onClick={() => startEditing(todo)}
                  aria-label="Edit"
                  title="Edit"
                  className="rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  ✏️
                </button>
                <button
                  type="button"
                  data-testid="todo-delete"
                  onClick={() => handleDeleteTodo(todo)}
                  aria-label="Delete"
                  title="Delete"
                  className="rounded-lg px-2 py-1 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
                >
                  🗑
                </button>
              </div>
            </div>

            {expanded && (
              <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-800">
                <ul className="space-y-1.5">
                  {subtasks.map((subtask) => (
                    <li
                      key={subtask.id}
                      data-testid="subtask-item"
                      className="flex items-center gap-2"
                    >
                      <input
                        data-testid="subtask-toggle"
                        type="checkbox"
                        checked={subtask.completed}
                        onChange={() => handleToggleSubtask(subtask)}
                        aria-label={`Toggle ${subtask.title}`}
                        className="h-3.5 w-3.5"
                      />
                      <span
                        className={`flex-1 text-sm ${
                          subtask.completed ? 'text-gray-400 line-through' : ''
                        }`}
                      >
                        {subtask.title}
                      </span>
                      <button
                        type="button"
                        data-testid="subtask-delete"
                        onClick={() => handleDeleteSubtask(subtask)}
                        aria-label={`Delete ${subtask.title}`}
                        className="rounded px-1.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex gap-2">
                  <input
                    data-testid="subtask-input"
                    value={subtaskDrafts[todo.id] ?? ''}
                    onChange={(event) =>
                      setSubtaskDrafts((previous) => ({
                        ...previous,
                        [todo.id]: event.target.value,
                      }))
                    }
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        handleAddSubtask(todo);
                      }
                    }}
                    placeholder="Add a subtask…"
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-950"
                  />
                  <button
                    type="button"
                    data-testid="subtask-add"
                    onClick={() => handleAddSubtask(todo)}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    Add
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </li>
    );
  };

  const renderSection = (
    key: 'overdue' | 'pending' | 'completed',
    title: string,
    items: Todo[],
    isOverdue: boolean,
  ) => {
    if (items.length === 0 && key !== 'pending') return null;
    return (
      <section className="mt-6">
        <h2
          data-testid={`section-${key}`}
          className={`text-sm font-semibold uppercase tracking-wide ${
            key === 'overdue'
              ? 'text-red-600 dark:text-red-400'
              : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          {title} ({items.length})
        </h2>
        <ul data-testid={`list-${key}`} className="mt-2 space-y-2">
          {items.map((todo) => renderTodoItem(todo, isOverdue))}
          {items.length === 0 && (
            <li className="rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-400 dark:border-gray-700">
              {filtersActive ? 'No todos match your filters' : 'Nothing here — add a todo above'}
            </li>
          )}
        </ul>
      </section>
    );
  };

  // -------------------------------------------------------------------------
  // Page
  // -------------------------------------------------------------------------

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Todos</h1>
          {username && (
            <p className="text-sm text-gray-500 dark:text-gray-400" data-testid="current-user">
              Signed in as <span className="font-medium">{username}</span>
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {permission === 'default' && (
            <button
              type="button"
              data-testid="enable-notifications"
              onClick={requestPermission}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              🔔 Enable notifications
            </button>
          )}
          <Link
            href="/calendar"
            data-testid="nav-calendar"
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            📅 Calendar
          </Link>
          <button
            type="button"
            data-testid="manage-tags-button"
            onClick={() => setShowTagModal(true)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            🏷 Tags
          </button>
          <button
            type="button"
            data-testid="templates-button"
            onClick={() => setShowTemplateModal(true)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            📋 Templates
          </button>
          <button
            type="button"
            data-testid="export-json"
            onClick={() => {
              window.location.href = '/api/todos/export?format=json';
            }}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            ⬇ JSON
          </button>
          <button
            type="button"
            data-testid="export-csv"
            onClick={() => {
              window.location.href = '/api/todos/export?format=csv';
            }}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            ⬇ CSV
          </button>
          <label className="cursor-pointer rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800">
            ⬆ Import
            <input
              ref={importInputRef}
              data-testid="import-input"
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) handleImportFile(file);
              }}
            />
          </label>
          <button
            type="button"
            data-testid="logout-button"
            onClick={handleLogout}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            Logout
          </button>
        </div>
      </header>

      {banner && (
        <p
          role="alert"
          data-testid="error-banner"
          className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          {banner}
        </p>
      )}
      {notice && (
        <p
          data-testid="notice-banner"
          className="mt-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300"
        >
          {notice}
        </p>
      )}

      {/* New todo form */}
      <form
        onSubmit={handleCreateTodo}
        className="mt-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"
      >
        <div className="flex gap-2">
          <input
            data-testid="new-todo-title"
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            placeholder="What needs to be done?"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
          />
          <button
            type="submit"
            data-testid="new-todo-submit"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Add
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            data-testid="new-todo-due-date"
            type="datetime-local"
            value={newDueDate}
            min={addMinutesToDateTime(getSingaporeNowString(), 1)}
            onChange={(event) => setNewDueDate(event.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-950"
          />
          <select
            data-testid="new-todo-priority"
            value={newPriority}
            onChange={(event) => setNewPriority(event.target.value as Priority)}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-950"
          >
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <label className="flex items-center gap-1.5 text-sm">
            <input
              data-testid="new-todo-recurring"
              type="checkbox"
              checked={newRecurring}
              onChange={(event) => setNewRecurring(event.target.checked)}
            />
            Recurring
          </label>
          {newRecurring && (
            <select
              data-testid="new-todo-pattern"
              value={newPattern}
              onChange={(event) => setNewPattern(event.target.value as RecurrencePattern)}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-950"
            >
              {RECURRENCE_OPTIONS.map((pattern) => (
                <option key={pattern} value={pattern}>
                  {pattern}
                </option>
              ))}
            </select>
          )}
          <select
            data-testid="new-todo-reminder"
            value={newReminder}
            onChange={(event) => setNewReminder(event.target.value)}
            disabled={!newDueDate}
            title={newDueDate ? 'Reminder' : 'Set a due date to enable reminders'}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm disabled:opacity-50 dark:border-gray-700 dark:bg-gray-950"
          >
            <option value="">No reminder</option>
            {REMINDER_LABELS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        {tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                data-testid={`new-todo-tag-${tag.name}`}
                onClick={() => setNewTagIds((previous) => tagToggle(previous, tag.id))}
                className={`rounded-full border px-2 py-0.5 text-xs ${
                  newTagIds.includes(tag.id)
                    ? 'border-transparent text-white'
                    : 'border-gray-300 text-gray-600 dark:border-gray-700 dark:text-gray-300'
                }`}
                style={newTagIds.includes(tag.id) ? { backgroundColor: tag.color } : undefined}
              >
                {tag.name}
              </button>
            ))}
          </div>
        )}
      </form>

      {/* Search & filters */}
      <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex gap-2">
          <input
            data-testid="search-input"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search todos and subtasks…"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
          />
          <button
            type="button"
            data-testid="toggle-filters"
            onClick={() => setShowFilters((previous) => !previous)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            Filters {filtersActive ? '●' : ''}
          </button>
        </div>
        {showFilters && (
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <select
                data-testid="filter-priority"
                value={filters.priority}
                onChange={(event) =>
                  setFilters((previous) => ({
                    ...previous,
                    priority: event.target.value as FilterState['priority'],
                  }))
                }
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-950"
              >
                <option value="all">All priorities</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <select
                data-testid="filter-tag"
                value={filters.tagId === 'all' ? 'all' : String(filters.tagId)}
                onChange={(event) =>
                  setFilters((previous) => ({
                    ...previous,
                    tagId: event.target.value === 'all' ? 'all' : Number(event.target.value),
                  }))
                }
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-950"
              >
                <option value="all">All tags</option>
                {tags.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.name}
                  </option>
                ))}
              </select>
              <select
                data-testid="filter-completion"
                value={filters.completion}
                onChange={(event) =>
                  setFilters((previous) => ({
                    ...previous,
                    completion: event.target.value as FilterState['completion'],
                  }))
                }
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-950"
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
              </select>
              <input
                data-testid="filter-date-from"
                type="date"
                value={filters.dueDateFrom}
                onChange={(event) =>
                  setFilters((previous) => ({ ...previous, dueDateFrom: event.target.value }))
                }
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-950"
              />
              <input
                data-testid="filter-date-to"
                type="date"
                value={filters.dueDateTo}
                onChange={(event) =>
                  setFilters((previous) => ({ ...previous, dueDateTo: event.target.value }))
                }
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-950"
              />
              <button
                type="button"
                data-testid="filter-clear"
                onClick={clearFilters}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
              >
                Clear
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
              <input
                data-testid="preset-name"
                value={presetName}
                onChange={(event) => setPresetName(event.target.value)}
                placeholder="Preset name…"
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-950"
              />
              <button
                type="button"
                data-testid="preset-save"
                onClick={handleSavePreset}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
              >
                Save preset
              </button>
              {presets.map((preset) => (
                <span
                  key={preset.id}
                  data-testid="preset-item"
                  className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-xs dark:bg-gray-800"
                >
                  <button
                    type="button"
                    data-testid="preset-apply"
                    onClick={() => handleApplyPreset(preset)}
                    className="font-medium hover:underline"
                  >
                    {preset.name}
                  </button>
                  <button
                    type="button"
                    data-testid="preset-delete"
                    onClick={() => handleDeletePreset(preset)}
                    aria-label={`Delete preset ${preset.name}`}
                    className="text-gray-400 hover:text-red-500"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Sections */}
      {loading ? (
        <p className="mt-8 text-center text-sm text-gray-400">Loading todos…</p>
      ) : (
        <>
          {renderSection('overdue', 'Overdue', sections.overdue, true)}
          {renderSection('pending', 'Pending', sections.pending, false)}
          {renderSection('completed', 'Completed', sections.completed, false)}
        </>
      )}

      {/* Manage Tags modal */}
      {showTagModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowTagModal(false)}
        >
          <div
            data-testid="tag-modal"
            className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-gray-900"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Manage Tags</h2>
              <button
                type="button"
                onClick={() => setShowTagModal(false)}
                aria-label="Close"
                className="rounded-lg px-2 py-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateTag} className="mt-4 flex gap-2">
              <input
                data-testid="tag-name-input"
                value={tagName}
                onChange={(event) => setTagName(event.target.value)}
                placeholder="Tag name…"
                maxLength={50}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
              />
              <input
                data-testid="tag-color-input"
                type="color"
                value={tagColor}
                onChange={(event) => setTagColor(event.target.value)}
                aria-label="Tag color"
                className="h-9 w-12 cursor-pointer rounded-lg border border-gray-300 dark:border-gray-700"
              />
              <button
                type="submit"
                data-testid="tag-create"
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Add
              </button>
            </form>
            <ul className="mt-4 space-y-2">
              {tags.map((tag) => (
                <li
                  key={tag.id}
                  data-testid="tag-row"
                  className="flex items-center gap-2 rounded-lg border border-gray-200 p-2 dark:border-gray-800"
                >
                  {editingTagId === tag.id ? (
                    <>
                      <input
                        data-testid="tag-edit-name"
                        value={editingTagName}
                        onChange={(event) => setEditingTagName(event.target.value)}
                        maxLength={50}
                        className="flex-1 rounded-lg border border-gray-300 px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-950"
                      />
                      <input
                        data-testid="tag-edit-color"
                        type="color"
                        value={editingTagColor}
                        onChange={(event) => setEditingTagColor(event.target.value)}
                        aria-label="Tag color"
                        className="h-8 w-10 cursor-pointer rounded border border-gray-300 dark:border-gray-700"
                      />
                      <button
                        type="button"
                        data-testid="tag-edit-save"
                        onClick={() => handleSaveTag(tag)}
                        className="rounded-lg bg-blue-600 px-2 py-1 text-xs font-medium text-white"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingTagId(null)}
                        className="rounded-lg border border-gray-300 px-2 py-1 text-xs dark:border-gray-700"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                        style={{ backgroundColor: tag.color }}
                      >
                        {tag.name}
                      </span>
                      <span className="flex-1" />
                      <button
                        type="button"
                        data-testid="tag-edit"
                        onClick={() => {
                          setEditingTagId(tag.id);
                          setEditingTagName(tag.name);
                          setEditingTagColor(tag.color);
                        }}
                        className="rounded-lg px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        data-testid="tag-delete"
                        onClick={() => handleDeleteTag(tag)}
                        className="rounded-lg px-2 py-1 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </li>
              ))}
              {tags.length === 0 && (
                <li className="text-sm text-gray-400">No tags yet — create one above.</li>
              )}
            </ul>
          </div>
        </div>
      )}

      {/* Templates modal */}
      {showTemplateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowTemplateModal(false)}
        >
          <div
            data-testid="template-modal"
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-gray-900"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Templates</h2>
              <button
                type="button"
                onClick={() => setShowTemplateModal(false)}
                aria-label="Close"
                className="rounded-lg px-2 py-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                ✕
              </button>
            </div>

            <ul className="mt-4 space-y-2">
              {templates.map((template) => (
                <li
                  key={template.id}
                  data-testid="template-item"
                  className="rounded-lg border border-gray-200 p-3 dark:border-gray-800"
                >
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{template.name}</p>
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                        {template.category ? `${template.category} · ` : ''}
                        {template.description ?? template.title_template}
                      </p>
                    </div>
                    <button
                      type="button"
                      data-testid="template-use"
                      onClick={() => handleUseTemplate(template)}
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                    >
                      Use
                    </button>
                    <button
                      type="button"
                      data-testid="template-delete"
                      onClick={() => handleDeleteTemplate(template)}
                      className="rounded-lg px-2 py-1.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
              {templates.length === 0 && (
                <li className="text-sm text-gray-400">No templates yet — create one below.</li>
              )}
            </ul>

            <form
              onSubmit={handleCreateTemplate}
              className="mt-5 space-y-3 border-t border-gray-100 pt-4 dark:border-gray-800"
            >
              <h3 className="text-sm font-semibold">New template</h3>
              <div className="grid grid-cols-2 gap-2">
                <input
                  data-testid="template-name"
                  value={templateName}
                  onChange={(event) => setTemplateName(event.target.value)}
                  placeholder="Template name *"
                  maxLength={100}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                />
                <input
                  data-testid="template-category"
                  value={templateCategory}
                  onChange={(event) => setTemplateCategory(event.target.value)}
                  placeholder="Category"
                  maxLength={50}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                />
              </div>
              <input
                data-testid="template-title"
                value={templateTitle}
                onChange={(event) => setTemplateTitle(event.target.value)}
                placeholder="Todo title *"
                maxLength={500}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
              />
              <input
                data-testid="template-description"
                value={templateDescription}
                onChange={(event) => setTemplateDescription(event.target.value)}
                placeholder="Description"
                maxLength={500}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
              />
              <div className="flex flex-wrap items-center gap-2">
                <select
                  data-testid="template-priority"
                  value={templatePriority}
                  onChange={(event) => setTemplatePriority(event.target.value as Priority)}
                  className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-950"
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
                <span className="text-sm text-gray-500">Due in</span>
                <input
                  data-testid="template-offset-value"
                  type="number"
                  min={0}
                  value={templateOffsetValue}
                  onChange={(event) => setTemplateOffsetValue(event.target.value)}
                  placeholder="—"
                  className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-950"
                />
                <select
                  data-testid="template-offset-unit"
                  value={templateOffsetUnit}
                  onChange={(event) =>
                    setTemplateOffsetUnit(event.target.value as 'minutes' | 'hours' | 'days')
                  }
                  className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-950"
                >
                  <option value="minutes">minutes</option>
                  <option value="hours">hours</option>
                  <option value="days">days</option>
                </select>
                <select
                  data-testid="template-reminder"
                  value={templateReminder}
                  onChange={(event) => setTemplateReminder(event.target.value)}
                  className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-950"
                >
                  <option value="">No reminder</option>
                  {REMINDER_LABELS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1.5 text-sm">
                  <input
                    data-testid="template-recurring"
                    type="checkbox"
                    checked={templateRecurring}
                    onChange={(event) => setTemplateRecurring(event.target.checked)}
                  />
                  Recurring
                </label>
                {templateRecurring && (
                  <select
                    data-testid="template-pattern"
                    value={templatePattern}
                    onChange={(event) =>
                      setTemplatePattern(event.target.value as RecurrencePattern)
                    }
                    className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-950"
                  >
                    {RECURRENCE_OPTIONS.map((pattern) => (
                      <option key={pattern} value={pattern}>
                        {pattern}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <div className="flex gap-2">
                  <input
                    data-testid="template-subtask-input"
                    value={templateSubtaskDraft}
                    onChange={(event) => setTemplateSubtaskDraft(event.target.value)}
                    placeholder="Subtask title…"
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-950"
                  />
                  <button
                    type="button"
                    data-testid="template-subtask-add"
                    onClick={() => {
                      const title = templateSubtaskDraft.trim();
                      if (!title) return;
                      setTemplateSubtasks((previous) => [
                        ...previous,
                        { title, position: previous.length },
                      ]);
                      setTemplateSubtaskDraft('');
                    }}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
                  >
                    Add subtask
                  </button>
                </div>
                {templateSubtasks.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {templateSubtasks.map((subtask, index) => (
                      <li
                        key={`${subtask.title}-${index}`}
                        className="flex items-center gap-2 text-sm"
                      >
                        <span className="flex-1">• {subtask.title}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setTemplateSubtasks((previous) =>
                              previous
                                .filter((_, itemIndex) => itemIndex !== index)
                                .map((item, itemIndex) => ({ ...item, position: itemIndex })),
                            )
                          }
                          aria-label={`Remove ${subtask.title}`}
                          className="text-xs text-red-500"
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button
                type="submit"
                data-testid="template-create"
                disabled={!templateName.trim() || !templateTitle.trim()}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Create template
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
