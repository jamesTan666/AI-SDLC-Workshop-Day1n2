import { NextRequest, NextResponse } from 'next/server';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import { authenticatorDB, runInTransaction, userDB } from '@/lib/db';
import {
  clearWebAuthnChallenge,
  createSession,
  getWebAuthnChallenge,
  getWebAuthnConfig,
} from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RegistrationResponseJSON;

    const challenge = await getWebAuthnChallenge();
    if (!challenge || challenge.purpose !== 'registration') {
      return NextResponse.json(
        { error: 'Registration challenge expired — please try again' },
        { status: 400 },
      );
    }

    if (userDB.getByUsername(challenge.username)) {
      return NextResponse.json({ error: 'Username already taken' }, { status: 409 });
    }

    const { rpID, origin } = getWebAuthnConfig();
    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge: challenge.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
    }

    const { credential } = verification.registrationInfo;
    const user = runInTransaction(() => {
      const created = userDB.create(challenge.username);
      authenticatorDB.create(
        created.id,
        credential.id,
        credential.publicKey,
        credential.counter ?? 0,
        credential.transports ?? null,
      );
      return created;
    });

    await createSession(user.id, user.username);
    await clearWebAuthnChallenge();

    return NextResponse.json({
      verified: true,
      user: { id: user.id, username: user.username },
    });
  } catch (error) {
    console.error('register-verify failed:', error);
    return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
  }
}
