'use client';

import { FormEvent, useState } from 'react';

type Props = {
  onRequestCode: (email: string) => Promise<boolean>;
  onVerifyCode: (email: string, code: string) => Promise<void>;
};

export function OtpSignInForm({ onRequestCode, onVerifyCode }: Props) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);

  async function submitEmail(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const requested = await onRequestCode(email.trim().toLowerCase());
      if (requested) {
        setStep('code');
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await onVerifyCode(email.trim().toLowerCase(), code.trim());
    } finally {
      setBusy(false);
    }
  }

  if (step === 'code') {
    return (
      <form onSubmit={submitCode} className="space-y-4">
        <label className="block">
          <span>Код из письма</span>
          <input
            aria-label="Код из письма"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(event) => setCode(event.target.value)}
            className="mt-1 w-full rounded-md border px-3 py-2"
          />
        </label>
        <div className="flex items-center gap-4">
          <button disabled={busy} type="submit" className="rounded-md border px-4 py-2">
            {busy ? 'Проверяем…' : 'Войти'}
          </button>
          <button
            type="button"
            onClick={() => setStep('email')}
            className="text-sm underline"
          >
            Изменить email
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={submitEmail} className="space-y-4">
      <label className="block">
        <span>Email</span>
        <input
          aria-label="Email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-1 w-full rounded-md border px-3 py-2"
        />
      </label>
      <button disabled={busy} type="submit" className="rounded-md border px-4 py-2">
        {busy ? 'Отправляем…' : 'Получить код'}
      </button>
    </form>
  );
}
