import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { subtaskDB, todoDB } from '@/lib/db';
import { getSession } from '@/lib/auth';

const createSchema = z.object({
  title: z.string().trim().min(1, 'Subtask title is required').max(500, 'Subtask title is too long'),
});

type RouteContext = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) return NextResponse.json({ error: 'Invalid todo id' }, { status: 400 });

  const todo = todoDB.getById(id, session.userId);
  if (!todo) return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  return NextResponse.json(subtaskDB.getForTodo(id));
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) return NextResponse.json({ error: 'Invalid todo id' }, { status: 400 });

  try {
    const todo = todoDB.getById(id, session.userId);
    if (!todo) return NextResponse.json({ error: 'Todo not found' }, { status: 404 });

    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid request' },
        { status: 400 },
      );
    }
    const input = parsed.data;

    const subtask = subtaskDB.create(id, input.title);
    return NextResponse.json(subtask, { status: 201 });
  } catch (error) {
    console.error('POST /api/todos/[id]/subtasks failed:', error);
    return NextResponse.json({ error: 'Failed to create subtask' }, { status: 500 });
  }
}
