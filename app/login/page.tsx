'use client';

import { useState, type FormEvent } from 'react';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';

type Mode = 'login' | 'register';

async function readError(response: Response): Promise<string> {
  try {
    const data = await response.json();
    return typeof data.error === 'string' ? data.error : 'Something went wrong';
  } catch {
    return 'Something went wrong';
  }
}

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [mode, setMode] = useState<Mode>('login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRegister = async (name: string) => {
    const optionsResponse = await fetch('/api/auth/register-options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: name }),
    });
    if (!optionsResponse.ok) throw new Error(await readError(optionsResponse));
    const optionsJSON = await optionsResponse.json();

    const attestation = await startRegistration({ optionsJSON });

    const verifyResponse = await fetch('/api/auth/register-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(attestation),
    });
    if (!verifyResponse.ok) throw new Error(await readError(verifyResponse));
  };

  const handleLogin = async (name: string) => {
    const optionsResponse = await fetch('/api/auth/login-options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: name }),
    });
    if (!optionsResponse.ok) throw new Error(await readError(optionsResponse));
    const optionsJSON = await optionsResponse.json();

    const assertion = await startAuthentication({ optionsJSON });

    const verifyResponse = await fetch('/api/auth/login-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(assertion),
    });
    if (!verifyResponse.ok) throw new Error(await readError(verifyResponse));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const name = username.trim();
    if (!name) {
      setError('Please enter a username');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (mode === 'register') {
        await handleRegister(name);
      } else {
        await handleLogin(name);
      }
      window.location.href = '/';
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Authentication failed');
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <h1 className="text-2xl font-bold">Todo App</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Sign in with a passkey — no passwords needed.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-2" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            onClick={() => { setMode('login'); setError(null); }}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              mode === 'login'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
            }`}
          >
            Login
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            onClick={() => { setMode('register'); setError(null); }}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              mode === 'register'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
            }`}
          >
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium">
              Username
            </label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username webauthn"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-950"
              placeholder="your-username"
              maxLength={64}
            />
          </div>

          {error && (
            <p
              role="alert"
              data-testid="login-error"
              className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy
              ? 'Waiting for passkey…'
              : mode === 'register'
                ? 'Create account with passkey'
                : 'Sign in with passkey'}
          </button>
        </form>
      </div>
    </main>
  );
}
