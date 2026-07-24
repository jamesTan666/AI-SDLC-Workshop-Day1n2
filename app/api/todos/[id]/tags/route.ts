import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { tagDB, todoDB } from '@/lib/db';
import { getSession } from '@/lib/auth';

const attachSchema = z.object({
  tag_id: z.number().int().positive('Tag id must be a positive integer'),
});

const detachSchema = z.object({
  tag_id: z.number().int().positive('Tag id must be a positive integer'),
});

type RouteContext = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
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
    const parsed = attachSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid request' },
        { status: 400 },
      );
    }
    const { tag_id } = parsed.data;

    const todo = todoDB.getById(id, session.userId);
    if (!todo) return NextResponse.json({ error: 'Todo not found' }, { status: 404 });

    const tag = tagDB.getById(tag_id, session.userId);
    if (!tag) return NextResponse.json({ error: 'Tag not found' }, { status: 404 });

    tagDB.attach(id, tag_id);
    const tags = tagDB.getForTodo(id);
    return NextResponse.json(tags);
  } catch (error) {
    console.error('POST /api/todos/[id]/tags failed:', error);
    return NextResponse.json({ error: 'Failed to attach tag' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) return NextResponse.json({ error: 'Invalid todo id' }, { status: 400 });

  try {
    const parsed = detachSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid request' },
        { status: 400 },
      );
    }
    const { tag_id } = parsed.data;

    const todo = todoDB.getById(id, session.userId);
    if (!todo) return NextResponse.json({ error: 'Todo not found' }, { status: 404 });

    const tag = tagDB.getById(tag_id, session.userId);
    if (!tag) return NextResponse.json({ error: 'Tag not found' }, { status: 404 });

    tagDB.detach(id, tag_id);
    const tags = tagDB.getForTodo(id);
    return NextResponse.json(tags);
  } catch (error) {
    console.error('DELETE /api/todos/[id]/tags failed:', error);
    return NextResponse.json({ error: 'Failed to detach tag' }, { status: 500 });
  }
}
