import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { SocketProvider, useSocket } from '../context/SocketContext.jsx';
import { setBgmMuted, setBgmVolume, setMuted, toggleBgm, useBgm, useMuted } from '../lib/audio.js';
import { useI18n } from '../lib/preferences.js';
import BlueprintWorkspace from './BlueprintWorkspace.jsx';
import InvitationCenter from './InvitationCenter.jsx';
import PreferenceControls from './PreferenceControls.jsx';

export function BattleshipLogo({ size = 28 }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <circle
        cx="16"
        cy="16"
        r="13"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        strokeOpacity="0.35"
        strokeDasharray="3 2"
      />
      <path
        d="M4 20L7 24H25L28 20L24 18H8L4 20Z"
        fill="currentColor"
        fillOpacity="0.22"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M11 18V14H14V11H18V14H21V18"
        fill="currentColor"
        fillOpacity="0.15"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M7 16H11M21 16H25M16 7V11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="16" cy="16" r="1.8" fill="#f14c4c" />
    </svg>
  );
}

function Brand() {
  const { t } = useI18n();
  return (
    <Link to="/" className="brand" aria-label={`${t('brandTitle')} — ${t('navLobby')}`}>
      <BattleshipLogo size={28} />
      <span className="brand__text">
        <strong>{t('brandTitle')}</strong>
        <small>{t('brandSubtitle')}</small>
      </span>
    </Link>
  );
}

function TopBar() {
  const { user, logout } = useAuth();
  const { connected } = useSocket();
  const muted = useMuted();
  const bgm = useBgm();
  const { t } = useI18n();

  const currentVol = bgm.muted ? 0 : Math.round(bgm.volume * 100);

  return (
    <header className="topbar">
      <Brand />
      <nav className="topbar__nav" aria-label="Main">
        <NavLink to="/" end>
          {t('navLobby')}
        </NavLink>
        <a href="/api/docs" target="_blank" rel="noreferrer">
          {t('navApiDocs')}
        </a>
      </nav>
      <div className="topbar__right">
        <span className="topbar__status" title={connected ? t('statusConnectedTitle') : t('statusDisconnectedTitle')}>
          <span className={`led ${connected ? 'led--on' : 'led--alert led--blink'}`} />
          {connected ? t('statusOnline') : t('statusReconnecting')}
        </span>
        <span className="topbar__user">
          {user?.username}
          <small className="num">
            {user ? `${user.wins}${t('winsShort')} · ${user.losses}${t('lossesShort')} · ${user.draws}${t('drawsShort')}` : ''}
          </small>
        </span>
        <PreferenceControls />
        <div className="topbar__audio" role="group" aria-label="Audio controls">
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={toggleBgm}
            aria-pressed={!bgm.muted}
            title={t('bgmTitle')}
          >
            {t('bgmLabel')}: {bgm.muted ? 'Off' : 'On'}
          </button>
          <label className="audio-slider" title={`${t('bgmVolumeTitle')}: ${currentVol}%`}>
            <span className="audio-slider__label num">{currentVol}%</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={bgm.muted ? 0 : bgm.volume}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                if (bgm.muted && val > 0) setBgmMuted(false);
                setBgmVolume(val);
              }}
              aria-label={t('bgmVolumeTitle')}
            />
          </label>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={() => setMuted(!muted)}
            aria-pressed={muted}
            title={t('sfxTitle')}
          >
            {t('sfxLabel')}: {muted ? 'Off' : 'On'}
          </button>
        </div>
        <button type="button" className="btn btn--ghost btn--small" onClick={logout}>
          {t('logout')}
        </button>
      </div>
    </header>
  );
}

export default function AppLayout() {
  return (
    <SocketProvider>
      <BlueprintWorkspace>
        <TopBar />
        <main className="main">
          <Outlet />
        </main>
        <InvitationCenter />
      </BlueprintWorkspace>
    </SocketProvider>
  );
}
