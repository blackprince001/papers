import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import Login from '@/pages/Login';

vi.mock('@react-oauth/google', () => ({
  GoogleLogin: () => <button type="button">Continue with Google</button>,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ loginWithGoogle: vi.fn() }),
}));

vi.mock('@/lib/theme', () => ({
  useTheme: () => ({ theme: 'light' }),
}));

describe('login page', () => {
  it('exposes the app identity and Google sign-in action', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Lumen' })).toBeInTheDocument();
    expect(screen.getByText('Your research library')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
  });
});
