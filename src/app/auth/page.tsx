'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PinSignInForm } from '@/components/auth/pin-sign-in-form';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

const PIN_ERROR_MESSAGE = 'Неверный PIN-код. Попробуйте ещё раз.';

export default function AuthPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function signIn(pin: string) {
    const supabase = createBrowserSupabaseClient();
    // This is a private, single-user app: the sign-in screen never asks for
    // an email. The PIN is submitted as the password for one fixed,
    // pre-provisioned account (see the design spec) - a real Supabase
    // password grant, so RLS and PowerSync's auth.user_id() keep working
    // exactly as designed.
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: process.env.NEXT_PUBLIC_OWNER_EMAIL!,
      password: pin,
    });

    if (signInError) {
      setError(PIN_ERROR_MESSAGE);
      return;
    }

    setError(null);
    router.push('/planner');
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
      <h1 className="text-2xl font-semibold">Мой планер</h1>
      {error && (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {error}
        </p>
      )}
      <div className="mt-4">
        <PinSignInForm onSubmit={signIn} />
      </div>
    </main>
  );
}
