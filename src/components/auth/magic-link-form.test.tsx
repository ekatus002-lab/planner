import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MagicLinkForm } from './magic-link-form';

it('submits a normalized email', async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(<MagicLinkForm onSubmit={onSubmit} />);

  await user.type(screen.getByLabelText('Email'), '  ME@example.com ');
  await user.click(screen.getByRole('button', { name: 'Получить ссылку' }));

  expect(onSubmit).toHaveBeenCalledWith('me@example.com');
});
