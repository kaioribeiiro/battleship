import { useI18n } from '../lib/preferences.js';

export function GlobeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

export function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

export function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export default function PreferenceControls() {
  const { lang, theme, toggleLang, toggleTheme, t } = useI18n();
  const isDark = theme === 'dark';

  return (
    <div className="pref-controls" role="group" aria-label="Preferences">
      <button
        type="button"
        className="btn btn--ghost btn--small btn--icon"
        onClick={toggleLang}
        title={t('langToggleTitle')}
        aria-label={t('langToggleTitle')}
      >
        <GlobeIcon />
        <span>{lang === 'pt' ? 'PT' : 'EN'}</span>
      </button>

      <button
        type="button"
        className="btn btn--ghost btn--small btn--icon"
        onClick={toggleTheme}
        title={t('themeToggleTitle')}
        aria-label={t('themeToggleTitle')}
        aria-pressed={!isDark}
      >
        {isDark ? <MoonIcon /> : <SunIcon />}
        <span>{isDark ? t('themeDark') : t('themeLight')}</span>
      </button>
    </div>
  );
}

