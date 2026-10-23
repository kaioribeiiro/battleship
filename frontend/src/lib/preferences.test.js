import { describe, it, expect, beforeEach } from 'vitest';
import {
  getLang,
  getNavalRank,
  getTheme,
  setLang,
  setTheme,
  shipNameFor,
  t,
  toggleLang,
  toggleTheme,
} from './preferences.js';

describe('preferences (theme, i18n & naval ranks)', () => {
  beforeEach(() => {
    localStorage.clear();
    setTheme('dark');
    setLang('pt');
  });

  it('defaults to dark theme and toggles between dark and light', () => {
    expect(getTheme()).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');

    toggleTheme();
    expect(getTheme()).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('battleship.theme')).toBe('light');

    toggleTheme();
    expect(getTheme()).toBe('dark');
  });

  it('defaults to pt and toggles between pt and en with full translations', () => {
    expect(getLang()).toBe('pt');
    expect(t('brandTitle')).toBe('Battleship');
    expect(t('tabLogin')).toBe('Entrar');
    expect(shipNameFor('CARRIER')).toBe('PORTA-AVIÕES');

    toggleLang();
    expect(getLang()).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(t('tabLogin')).toBe('Sign In');
    expect(shipNameFor('CARRIER')).toBe('CARRIER');
  });

  it('calculates naval ranks and progression accurately in both PT and EN', () => {
    const r0 = getNavalRank(0, 'pt');
    expect(r0.code).toBe('ENS');
    expect(r0.title).toBe('Guarda-Marinha');
    expect(r0.remainingWins).toBe(1);

    const r5 = getNavalRank(5, 'pt');
    expect(r5.code).toBe('CDR');
    expect(r5.title).toBe('Capitão de Fragata');
    expect(r5.remainingWins).toBe(3);

    const r30En = getNavalRank(30, 'en');
    expect(r30En.code).toBe('ADM');
    expect(r30En.title).toBe('Fleet Admiral');
    expect(r30En.nextTitle).toBeNull();
  });
});
