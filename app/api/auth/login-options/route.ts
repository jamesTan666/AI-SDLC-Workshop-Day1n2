import { NextRequest, NextResponse } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { z } from 'zod';
import { authenticatorDB, userDB } from '@/lib/db';
import { getWebAuthnConfig, setWebAuthnChallenge } from '@/lib/auth';

const bodySchema = z.object({
  username: z.string().trim().min(1, 'Username is required').max(64, 'Username is too long'),
});

function parseTransports(transports: string | null): string[] | undefined {
  if (!transports) return undefined;
  try {
    const parsed = JSON.parse(transports);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

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

    const user = userDB.getByUsername(username);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const authenticators = authenticatorDB.getByUserId(user.id);
    if (authenticators.length === 0) {
      return NextResponse.json(
        { error: 'No passkeys registered for this user' },
        { status: 400 },
      );
    }

    const { rpID } = getWebAuthnConfig();
    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: 'preferred',
      allowCredentials: authenticators.map((authenticator) => ({
        id: authenticator.credential_id,
        transports: parseTransports(authenticator.transports) as
          | AuthenticatorTransport[]
          | undefined,
      })),
    });

    await setWebAuthnChallenge({
      purpose: 'authentication',
      challenge: options.challenge,
      username,
    });

    return NextResponse.json(options);
  } catch (error) {
    console.error('login-options failed:', error);
    return NextResponse.json(
      { error: 'Failed to generate login options' },
      { status: 500 },
    );
  }
}
