import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { subtaskDB } from '@/lib/db';
import { getSession } from '@/lib/auth';

const updateSchema = z.object({
  title: z.string().trim().min(1, 'Subtask title is required').max(500, 'Subtask title is too long').optional(),
  completed: z.boolean().optional(),
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
  if (!id) return NextResponse.json({ error: 'Invalid subtask id' }, { status: 400 });

  try {
    const existing = subtaskDB.getByIdForUser(id, session.userId);
    if (!existing) return NextResponse.json({ error: 'Subtask not found' }, { status: 404 });

    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid request' },
        { status: 400 },
      );
    }
    const updates = parsed.data;

    const updated = subtaskDB.update(id, updates);
    if (!updated) return NextResponse.json({ error: 'Subtask not found' }, { status: 404 });
    return NextResponse.json(updated);
  } catch (error) {
    console.error('PUT /api/subtasks/[id] failed:', error);
    return NextResponse.json({ error: 'Failed to update subtask' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) return NextResponse.json({ error: 'Invalid subtask id' }, { status: 400 });

  try {
    const existing = subtaskDB.getByIdForUser(id, session.userId);
    if (!existing) return NextResponse.json({ error: 'Subtask not found' }, { status: 404 });

    subtaskDB.delete(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/subtasks/[id] failed:', error);
    return NextResponse.json({ error: 'Failed to delete subtask' }, { status: 500 });
  }
}
