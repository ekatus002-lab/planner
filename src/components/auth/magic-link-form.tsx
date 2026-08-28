'use client';

import { FormEvent, useState } from 'react';

type Props = { onSubmit: (email: string) => Promise<void> };

export function MagicLinkForm({ onSubmit }: Props) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await onSubmit(email.trim().toLowerCase());
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
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
        {busy ? 'Отправляем…' : 'Получить ссылку'}
      </button>
    </form>
  );
}
