/**
 * Session management: JWT stored in an HTTP-only cookie with 7-day expiry,
 * plus short-lived signed cookies carrying WebAuthn challenges between the
 * *-options and *-verify endpoints.
 */
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import type { Session } from '@/lib/db';

export const SESSION_COOKIE = 'session';
const CHALLENGE_COOKIE = 'webauthn_challenge';
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const CHALLENGE_MAX_AGE_SECONDS = 5 * 60;

export type ChallengePurpose = 'registration' | 'authentication';

export interface ChallengePayload {
  purpose: ChallengePurpose;
  challenge: string;
  username: string;
}

function getSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET not configured');
  }
  return new TextEncoder().encode(secret);
}

export async function createSession(userId: number, username: string): Promise<void> {
  const token = await new SignJWT({ userId, username })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSecretKey());

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (typeof payload.userId !== 'number' || typeof payload.username !== 'string') {
      return null;
    }
    return { userId: payload.userId, username: payload.username };
  } catch {
    return null;
  }
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

/**
 * Persists a WebAuthn challenge as a signed, short-lived HTTP-only cookie so
 * the verify endpoint can validate the response against it.
 */
export async function setWebAuthnChallenge(payload: ChallengePayload): Promise<void> {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${CHALLENGE_MAX_AGE_SECONDS}s`)
    .sign(getSecretKey());

  const cookieStore = await cookies();
  cookieStore.set(CHALLENGE_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: CHALLENGE_MAX_AGE_SECONDS,
  });
}

export async function getWebAuthnChallenge(): Promise<ChallengePayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(CHALLENGE_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (
      (payload.purpose !== 'registration' && payload.purpose !== 'authentication') ||
      typeof payload.challenge !== 'string' ||
      typeof payload.username !== 'string'
    ) {
      return null;
    }
    return {
      purpose: payload.purpose,
      challenge: payload.challenge,
      username: payload.username,
    };
  } catch {
    return null;
  }
}

export async function clearWebAuthnChallenge(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(CHALLENGE_COOKIE);
}

/** WebAuthn relying-party configuration (non-secret, env-overridable). */
export function getWebAuthnConfig(): { rpName: string; rpID: string; origin: string } {
  return {
    rpName: 'Todo App',
    rpID: process.env.WEBAUTHN_RP_ID || 'localhost',
    origin: process.env.WEBAUTHN_ORIGIN || 'http://localhost:3000',
  };
}
