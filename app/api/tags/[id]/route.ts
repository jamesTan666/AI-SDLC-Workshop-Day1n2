import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { tagDB } from '@/lib/db';
import { getSession } from '@/lib/auth';

const updateSchema = z.object({
  name: z.string().trim().min(1, 'Tag name is required').max(50, 'Tag name is too long').optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid color').optional(),
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
  if (!id) return NextResponse.json({ error: 'Invalid tag id' }, { status: 400 });

  try {
    const existing = tagDB.getById(id, session.userId);
    if (!existing) return NextResponse.json({ error: 'Tag not found' }, { status: 404 });

    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid request' },
        { status: 400 },
      );
    }
    const updates = parsed.data;

    if (updates.name !== undefined) {
      const conflict = tagDB.findByName(session.userId, updates.name);
      if (conflict && conflict.id !== id) {
        return NextResponse.json({ error: 'Tag already exists' }, { status: 409 });
      }
    }

    const updated = tagDB.update(id, session.userId, updates);
    if (!updated) return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
    return NextResponse.json(updated);
  } catch (error) {
    console.error('PUT /api/tags/[id] failed:', error);
    return NextResponse.json({ error: 'Failed to update tag' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) return NextResponse.json({ error: 'Invalid tag id' }, { status: 400 });

  const deleted = tagDB.delete(id, session.userId);
  if (!deleted) return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
