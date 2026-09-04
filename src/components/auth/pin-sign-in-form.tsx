'use client';

import { FormEvent, useState } from 'react';

type Props = { onSubmit: (pin: string) => Promise<void> };

export function PinSignInForm({ onSubmit }: Props) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await onSubmit(pin);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block">
        <span>PIN-код</span>
        <input
          aria-label="PIN-код"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          required
          value={pin}
          onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
          className="mt-1 w-full rounded-md border px-3 py-2 text-center text-2xl tracking-[0.5em]"
        />
      </label>
      <button disabled={busy} type="submit" className="rounded-md border px-4 py-2">
        {busy ? 'Проверяем…' : 'Войти'}
      </button>
    </form>
  );
}
