import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { setLang, setTheme } from './lib/preferences.js';

describe('App smoke test', () => {
  beforeEach(() => {
    setLang('pt');
    setTheme('dark');
  });

  it('renders login page on /login with Battleship brand and theme/language toggles', async () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(screen.getAllByText(/Battleship/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /entrar/i })).toBeDefined();

    // Switch language to English
    const langBtn = screen.getByRole('button', { name: /alternar idioma/i });
    fireEvent.click(langBtn);
    expect(screen.getByRole('button', { name: /sign in/i })).toBeDefined();

    // Switch theme to Light
    const themeBtn = screen.getByRole('button', { name: /switch between.*dark and light/i });
    fireEvent.click(themeBtn);
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('renders redirect or splash on /', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/']}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(container.innerHTML).not.toBe('');
  });
});
