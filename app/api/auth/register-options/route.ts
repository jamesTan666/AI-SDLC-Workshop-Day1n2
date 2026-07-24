import { NextRequest, NextResponse } from 'next/server';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { z } from 'zod';
import { userDB } from '@/lib/db';
import { getWebAuthnConfig, setWebAuthnChallenge } from '@/lib/auth';

const bodySchema = z.object({
  username: z.string().trim().min(1, 'Username is required').max(64, 'Username is too long'),
});

export async function POST(request: NextRequest) {
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid request' },
        { status: 400 },
      );
    }
    const { username } = parsed.data;

    if (userDB.getByUsername(username)) {
      return NextResponse.json({ error: 'Username already taken' }, { status: 409 });
    }

    const { rpName, rpID } = getWebAuthnConfig();
    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userName: username,
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    await setWebAuthnChallenge({
      purpose: 'registration',
      challenge: options.challenge,
      username,
    });

    return NextResponse.json(options);
  } catch (error) {
    console.error('register-options failed:', error);
    return NextResponse.json(
      { error: 'Failed to generate registration options' },
      { status: 500 },
    );
  }
}
