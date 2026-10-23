import { useState } from 'react';
import { Navigate, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { toggleBgm, useBgm } from '../lib/audio.js';
import { t as translateStatic, useI18n } from '../lib/preferences.js';
import { BattleshipLogo } from '../components/AppLayout.jsx';
import BlueprintWorkspace from '../components/BlueprintWorkspace.jsx';
import Panel from '../components/Panel.jsx';
import PreferenceControls from '../components/PreferenceControls.jsx';

export function validateCredentials({ username, password, confirm }, mode, t = translateStatic) {
  const errors = {};
  const cleanUsername = (username || '').trim();
  if (cleanUsername.length < 3 || cleanUsername.length > 20) {
    errors.username = t('errUsernameLength');
  }
  if (!password || password.length < 6) {
    errors.password = t('errPasswordLength');
  }
  if (mode === 'register' && confirm !== password) {
    errors.confirm = t('errPasswordMismatch');
  }
  return errors;
}

export default function AuthPage({ mode }) {
  const { status, login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const bgm = useBgm();
  const { t } = useI18n();
  const isRegister = mode === 'register';

  const [form, setForm] = useState({ username: '', password: '', confirm: '' });
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState('');

  if (status === 'authed') {
    return <Navigate to={location.state?.from?.pathname || '/'} replace />;
  }

  const errors = validateCredentials(form, mode, t);
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    setTouched(true);
    setServerError('');
    if (Object.keys(errors).length > 0) return;
    setBusy(true);
    try {
      if (isRegister) await register(form.username.trim(), form.password);
      else await login(form.username.trim(), form.password);
      navigate(location.state?.from?.pathname || '/', { replace: true });
    } catch (err) {
      setServerError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onQuickDemo() {
    setServerError('');
    setBusy(true);
    try {
      const suffix = Math.floor(1000 + Math.random() * 9000);
      const guestUser = `cmdr_${suffix}`;
      const guestPass = `demo_${suffix}_${Date.now()}`;
      await register(guestUser, guestPass);
      navigate(location.state?.from?.pathname || '/', { replace: true });
    } catch (err) {
      setServerError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <BlueprintWorkspace>
      <main className="auth">
        <div className="auth__sheet">
          <header className="auth__hero">
            <div className="auth__hero-meta">
              <span className="tag tag--cyan">{t('sheetMeta')}</span>
              <div className="auth__hero-controls">
                <PreferenceControls />
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  onClick={toggleBgm}
                  aria-pressed={!bgm.muted}
                  title={t('bgmTitle')}
                >
                  {t('bgmLabel')}: {bgm.muted ? 'Off' : 'On'}
                </button>
                <a href="/api/docs" target="_blank" rel="noreferrer" className="btn btn--ghost btn--small">
                  {t('navApiDocs')}
                </a>
              </div>
            </div>
            <div className="auth__brand-hero">
              <BattleshipLogo size={46} />
              <h1>{t('brandTitle')}</h1>
            </div>
            <p className="muted">{t('authDescription')}</p>
            <dl className="spec">
              <div>
                <dt>{t('specGridLabel')}</dt>
                <dd>{t('specGridValue')}</dd>
              </div>
              <div>
                <dt>{t('specFleetLabel')}</dt>
                <dd>{t('specFleetValue')}</dd>
              </div>
              <div>
                <dt>{t('specChannelLabel')}</dt>
                <dd>{t('specChannelValue')}</dd>
              </div>
            </dl>
          </header>

          <Panel className="auth__panel">
            <nav className="auth__tabs" aria-label="Authentication">
              <NavLink to="/login">{t('tabLogin')}</NavLink>
              <NavLink to="/register">{t('tabRegister')}</NavLink>
            </nav>

            <form onSubmit={onSubmit} noValidate className="auth__form">
              <label className="field">
                <span className="field__label">{t('fieldUsername')}</span>
                <input
                  className="field__input"
                  value={form.username}
                  onChange={set('username')}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck="false"
                  autoComplete="username"
                  autoFocus
                  maxLength={20}
                  placeholder={t('fieldUsernamePlaceholder')}
                />
                {touched && errors.username && <span className="field__hint field__error">{errors.username}</span>}
              </label>

              <label className="field">
                <span className="field__label">{t('fieldPassword')}</span>
                <input
                  className="field__input"
                  type="password"
                  value={form.password}
                  onChange={set('password')}
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  placeholder="••••••"
                />
                {touched && errors.password && <span className="field__hint field__error">{errors.password}</span>}
              </label>

              {isRegister && (
                <label className="field">
                  <span className="field__label">{t('fieldConfirmPassword')}</span>
                  <input
                    className="field__input"
                    type="password"
                    value={form.confirm}
                    onChange={set('confirm')}
                    autoComplete="new-password"
                    placeholder="••••••"
                  />
                  {touched && errors.confirm && <span className="field__hint field__error">{errors.confirm}</span>}
                </label>
              )}

              {serverError && (
                <div className="alert" role="alert">
                  {serverError}
                </div>
              )}

              <button type="submit" className="btn btn--solid btn--block" disabled={busy}>
                {busy ? t('btnProcessing') : isRegister ? t('btnRegisterSubmit') : t('btnLoginSubmit')}
              </button>

              <div className="demo-divider">
                <span>{t('demoDivider')}</span>
              </div>

              <button type="button" className="btn btn--block" onClick={onQuickDemo} disabled={busy}>
                {t('btnQuickDemo')}
              </button>
            </form>
          </Panel>
        </div>
      </main>
    </BlueprintWorkspace>
  );
}
