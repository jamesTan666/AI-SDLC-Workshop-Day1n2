import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { authenticatorDB, userDB } from '@/lib/db';
import {
  clearWebAuthnChallenge,
  createSession,
  getWebAuthnChallenge,
  getWebAuthnConfig,
} from '@/lib/auth';

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
    const body = (await request.json()) as AuthenticationResponseJSON;
    if (!body || typeof body.id !== 'string' || !isoBase64URL.isBase64URL(body.id)) {
      return NextResponse.json({ error: 'Invalid credential response' }, { status: 400 });
    }

    const challenge = await getWebAuthnChallenge();
    if (!challenge || challenge.purpose !== 'authentication') {
      return NextResponse.json(
        { error: 'Login challenge expired — please try again' },
        { status: 400 },
      );
    }

    const user = userDB.getByUsername(challenge.username);
    if (!user) {
      return NextResponse.json({ error: 'Verification failed' }, { status: 401 });
    }

    const authenticator = authenticatorDB.getByCredentialId(body.id);
    if (!authenticator || authenticator.user_id !== user.id) {
      return NextResponse.json({ error: 'Verification failed' }, { status: 401 });
    }

    const { rpID, origin } = getWebAuthnConfig();
    const verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge: challenge.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: authenticator.credential_id,
        publicKey: new Uint8Array(authenticator.credential_public_key),
        counter: authenticator.counter ?? 0,
        transports: parseTransports(authenticator.transports) as
          | AuthenticatorTransport[]
          | undefined,
      },
      requireUserVerification: false,
    });

    if (!verification.verified) {
      return NextResponse.json({ error: 'Verification failed' }, { status: 401 });
    }

    // Clone-attack defense: the signature counter must strictly increase,
    // except when the authenticator never implements one (both zero).
    const storedCounter = authenticator.counter ?? 0;
    const newCounter = verification.authenticationInfo.newCounter ?? 0;
    if (!(newCounter > storedCounter) && !(newCounter === 0 && storedCounter === 0)) {
      return NextResponse.json({ error: 'Verification failed' }, { status: 401 });
    }

    authenticatorDB.updateCounter(authenticator.id, newCounter);
    await createSession(user.id, user.username);
    await clearWebAuthnChallenge();

    return NextResponse.json({
      verified: true,
      user: { id: user.id, username: user.username },
    });
  } catch (error) {
    console.error('login-verify failed:', error);
    return NextResponse.json({ error: 'Verification failed' }, { status: 401 });
  }
}
