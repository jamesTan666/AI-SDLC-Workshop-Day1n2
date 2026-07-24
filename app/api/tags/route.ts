import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { tagDB } from '@/lib/db';
import { getSession } from '@/lib/auth';

const createSchema = z.object({
  name: z.string().trim().min(1, 'Tag name is required').max(50, 'Tag name is too long'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid color').optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  return NextResponse.json(tagDB.getAll(session.userId));
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid request' },
        { status: 400 },
      );
    }
    const input = parsed.data;

    const existing = tagDB.findByName(session.userId, input.name);
    if (existing) {
      return NextResponse.json({ error: 'Tag already exists' }, { status: 409 });
    }

    const tag = tagDB.create(session.userId, input.name, input.color);
    return NextResponse.json(tag, { status: 201 });
  } catch (error) {
    console.error('POST /api/tags failed:', error);
    return NextResponse.json({ error: 'Failed to create tag' }, { status: 500 });
  }
}
