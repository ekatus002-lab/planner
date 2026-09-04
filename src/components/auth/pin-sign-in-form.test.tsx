import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PinSignInForm } from './pin-sign-in-form';

describe('PinSignInForm', () => {
  it('submits the entered PIN', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<PinSignInForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('PIN-код'), '682337');
    await user.click(screen.getByRole('button', { name: 'Войти' }));

    expect(onSubmit).toHaveBeenCalledWith('682337');
  });

  it('only accepts digits in the PIN field', () => {
    render(<PinSignInForm onSubmit={vi.fn()} />);

    const input = screen.getByLabelText('PIN-код');
    expect(input).toHaveAttribute('inputMode', 'numeric');
    expect(input).toHaveAttribute('pattern', '[0-9]*');
  });

  it('disables the button while submitting', async () => {
    const user = userEvent.setup();
    let resolveSubmit: () => void = () => {};
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSubmit = resolve;
        }),
    );
    render(<PinSignInForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('PIN-код'), '682337');
    await user.click(screen.getByRole('button', { name: 'Войти' }));

    expect(screen.getByRole('button')).toBeDisabled();
    resolveSubmit();
  });
});
