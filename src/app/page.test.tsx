import { render, screen } from '@testing-library/react';
import Home from './page';

describe('Home', () => {
  it('renders the planner product name', () => {
    render(<Home />);
    expect(screen.getByRole('heading', { name: 'Мой планер' })).toBeInTheDocument();
  });
});
