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

export default function AuthPage() {
  const [sent, setSent] = useState(false);

  async function requestMagicLink(email: string) {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      },
    });
    setSent(true);
  }

  return (
    <main className="min-h-screen bg-background p-6">
      <h1 className="text-2xl font-semibold">Вход в планер</h1>
      <Suspense fallback={null}>
        <AuthError />
      </Suspense>
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
