import { NextRequest, NextResponse } from 'next/server';
import { holidayDB } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const yearParam = request.nextUrl.searchParams.get('year');

  if (yearParam) {
    const year = Number(yearParam);
    if (isNaN(year) || !Number.isInteger(year) || yearParam.length !== 4) {
      return NextResponse.json({ error: 'Invalid year' }, { status: 400 });
    }
    return NextResponse.json(holidayDB.getByYear(year));
  }

  return NextResponse.json(holidayDB.getAll());
}
