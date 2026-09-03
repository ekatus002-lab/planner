'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { OtpSignInForm } from '@/components/auth/otp-sign-in-form';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

const REQUEST_ERROR_MESSAGE = 'Не удалось отправить код для входа. Попробуйте ещё раз позже.';
const VERIFY_ERROR_MESSAGE = 'Неверный или устаревший код. Запросите новый.';

export default function AuthPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function requestCode(email: string): Promise<boolean> {
    const supabase = createBrowserSupabaseClient();
    const { error: requestError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // This is a private, single-user app (see the design spec): open
        // signup is disabled server-side (`supabase/config.toml`'s
        // `enable_signup = false`), and this makes that intent explicit at
        // the call site too - only an existing user may request a code.
        shouldCreateUser: false,
      },
    });

    if (requestError) {
      // A local Supabase/PowerSync write failure is blocking elsewhere in
      // this app (role="alert", form stays open); the same rule applies
      // here: a failed code request must never look like success.
      setError(REQUEST_ERROR_MESSAGE);
      return false;
    }

    setError(null);
    return true;
  }

  async function verifyCode(email: string, code: string) {
    const supabase = createBrowserSupabaseClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'email',
    });

    if (verifyError) {
      setError(VERIFY_ERROR_MESSAGE);
      return;
    }

    setError(null);
    router.push('/planner');
  }

  return (
    <main className="min-h-screen bg-background p-6">
      <h1 className="text-2xl font-semibold">Вход в планер</h1>
      {error && (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {error}
        </p>
      )}
      <div className="mt-4">
        <OtpSignInForm onRequestCode={requestCode} onVerifyCode={verifyCode} />
      </div>
    </main>
  );
}
