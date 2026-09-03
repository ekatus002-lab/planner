'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { MagicLinkForm } from '@/components/auth/magic-link-form';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

function AuthError() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  if (error !== 'invalid-link') {
    return null;
  }

  return (
    <p role="alert" className="mt-4 text-sm text-red-600">
      Ссылка недействительна или устарела. Запросите новую.
    </p>
  );
}

const REQUEST_ERROR_MESSAGE = 'Не удалось отправить ссылку для входа. Попробуйте ещё раз позже.';

export default function AuthPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestMagicLink(email: string) {
    const supabase = createBrowserSupabaseClient();
    const { error: requestError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
        // This is a private, single-user app (see the design spec): open
        // signup is disabled server-side (`supabase/config.toml`'s
        // `enable_signup = false`), and this makes that intent explicit at
        // the call site too - only an existing user may request a link.
        shouldCreateUser: false,
      },
    });

    if (requestError) {
      // A local Supabase/PowerSync write failure is blocking elsewhere in
      // this app (role="alert", form stays open); the same rule applies
      // here: a failed magic-link request must never look like success.
      setError(REQUEST_ERROR_MESSAGE);
      setSent(false);
      return;
    }

    setError(null);
    setSent(true);
  }

  return (
    <main className="min-h-screen bg-background p-6">
      <h1 className="text-2xl font-semibold">Вход в планер</h1>
      <Suspense fallback={null}>
        <AuthError />
      </Suspense>
      {error && (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {error}
        </p>
      )}
      {sent ? (
        <p className="mt-4 text-sm">
          Мы отправили ссылку для входа на вашу почту. Проверьте письмо.
        </p>
      ) : (
        <div className="mt-4">
          <MagicLinkForm onSubmit={requestMagicLink} />
        </div>
      )}
    </main>
  );
}
