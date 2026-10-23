import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useSocket } from '../context/SocketContext.jsx';
import { gamesApi, usersApi } from '../lib/api.js';
import { useI18n } from '../lib/preferences.js';
import Panel from '../components/Panel.jsx';

function formatTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function formatDateTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString([], { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function OperatorPanel() {
  const { user } = useAuth();
  const { startBotGame } = useSocket();
  const { t, rank } = useI18n();
  const [busy, setBusy] = useState(false);
  const [difficulty, setDifficulty] = useState('hard');

  const wins = user?.wins ?? 0;
  const losses = user?.losses ?? 0;
  const draws = user?.draws ?? 0;
  const total = wins + losses + draws;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
  const myRank = rank(wins);

  async function onBot() {
    setBusy(true);
    await startBotGame(difficulty);
    setBusy(false);
  }

  return (
    <Panel title={t('panelOperator')} meta={total > 0 ? t('metaWinRate', winRate) : t('metaProfile')}>
      <div className="lobby__identity">
        <p className="lobby__callsign">{user?.username}</p>
        <div className="rank-card">
          <span className="rank-badge" data-tone={myRank.tone}>
            <span className="rank-badge__insignia">{myRank.insignia}</span>
            <span>{myRank.title}</span>
          </span>
          <small className="rank-card__hint">
            {myRank.nextTitle ? t('rankProgress', myRank.remainingWins, myRank.nextTitle) : t('rankMaxReached')}
          </small>
        </div>
      </div>

      <dl className="stats">
        <div>
          <dt>{t('statWins')}</dt>
          <dd className="num">{wins}</dd>
        </div>
        <div>
          <dt>{t('statLosses')}</dt>
          <dd className="num">{losses}</dd>
        </div>
        <div>
          <dt>{t('statDraws')}</dt>
          <dd className="num">{draws}</dd>
        </div>
      </dl>

      <div className="diff-selector">
        <span className="field__label">{t('difficultyLabel')}</span>
        <div className="diff-group" role="group" aria-label={t('difficultyLabel')}>
          {[
            { id: 'easy', label: t('diffEasy') },
            { id: 'medium', label: t('diffMedium') },
            { id: 'hard', label: t('diffHard') },
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`btn btn--small ${difficulty === opt.id ? 'btn--solid' : 'btn--ghost'}`}
              onClick={() => setDifficulty(opt.id)}
              aria-pressed={difficulty === opt.id}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <button type="button" className="btn btn--solid btn--block" onClick={onBot} disabled={busy}>
        {busy ? t('btnPreparing') : t('btnPlayBot')}
      </button>
      <p className="field__hint" style={{ marginTop: 8 }}>
        {t('botHint')}
      </p>
    </Panel>
  );
}

function ActiveGames({ games }) {
  const { t } = useI18n();
  if (!games || games.length === 0) return null;

  return (
    <Panel title={t('panelActiveGames')} meta={`${games.length}`}>
      <ul className="rows">
        {games.map((g) => (
          <li key={g.id} className="rows__item">
            <span>
              vs <strong>{g.opponent?.username ?? '—'}</strong>
              <small className="faint">
                {' '}
                · {g.status === 'SETUP' ? t('statusSetup') : t('statusTurn', g.totalTurns)}
              </small>
            </span>
            <Link className="btn btn--small" to={`/game/${g.id}`}>
              {t('btnResume')}
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function MatchHistory({ games, userId }) {
  const { t, rank } = useI18n();
  const list = games || [];

  return (
    <Panel title={t('panelMatchHistory')} meta={list.length > 0 ? t('metaLastGames', list.length) : '0'}>
      {list.length === 0 ? (
        <p className="empty">{t('emptyMatchHistory')}</p>
      ) : (
        <ul className="rows">
          {list.map((g) => {
            const isDraw = g.result === 'DRAW';
            const isWin = !isDraw && g.winnerId === userId;
            const badgeClass = isDraw ? '' : isWin ? 'tag--emerald' : 'tag--crimson';
            const badgeLabel = isDraw ? t('badgeDraw') : isWin ? t('badgeWin') : t('badgeLoss');
            const opp = g.opponent;
            const isBot = Boolean(opp?.isBot || String(opp?.username || '').startsWith('CPU-'));
            const oppRank = opp && !isBot ? rank(opp.wins ?? 0) : null;
            const when = formatDateTime(g.endedAt || g.startedAt);

            return (
              <li key={g.id} className="rows__item history-item">
                <div className="history-item__main">
                  <div className="history-item__top">
                    <span className={`tag ${badgeClass}`}>{badgeLabel}</span>
                    {g.status === 'ABANDONED' && <span className="tag">{t('badgeAbandoned')}</span>}
                    <span>
                      vs <strong>{opp?.username ?? '—'}</strong>
                    </span>
                    {oppRank && (
                      <span className="rank-badge rank-badge--mini" data-tone={oppRank.tone} title={oppRank.title}>
                        {oppRank.insignia}
                      </span>
                    )}
                  </div>
                  <div className="history-item__meta faint num">
                    <span>{t('turnsShort', g.totalTurns ?? 0)}</span>
                    {when && <span> · {when}</span>}
                  </div>
                </div>
                <Link className="btn btn--ghost btn--small" to={`/game/${g.id}`}>
                  {t('btnReport')}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function OnlinePanel() {
  const { peers, connected, sendInvite, outgoing } = useSocket();
  const { t } = useI18n();

  return (
    <Panel
      title={t('panelOnlinePeers')}
      meta={connected ? t('metaAvailablePeers', peers.length) : t('metaDisconnected')}
    >
      {peers.length === 0 ? (
        <p className="empty">{connected ? t('emptyOnlinePeers') : t('connectingServer')}</p>
      ) : (
        <ul className="rows">
          {peers.map((peer) => (
            <li key={peer.id} className="rows__item">
              <span>
                <span className="led led--on" /> <strong>{peer.username}</strong>
              </span>
              <button
                type="button"
                className="btn btn--small"
                onClick={() => sendInvite(peer)}
                disabled={Boolean(outgoing)}
              >
                {outgoing?.inviteeId === peer.id ? t('btnWaitingInvite') : t('btnInvite')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function GlobalChatPanel() {
  const { user } = useAuth();
  const { lobbyMessages, sendLobbyMessage, peers, sendInvite, outgoing, connected } = useSocket();
  const { t } = useI18n();
  const [text, setText] = useState('');
  const feedRef = useRef(null);

  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lobbyMessages.length]);

  async function onSubmit(e) {
    e.preventDefault();
    const clean = text.trim();
    if (!clean) return;
    setText('');
    await sendLobbyMessage(clean);
  }

  const peerMap = new Map(peers.map((p) => [p.id, p]));

  return (
    <Panel title={t('panelGlobalChat')} meta={t('metaGlobalChat')}>
      <div className="chat-feed" ref={feedRef} aria-live="polite">
        {lobbyMessages.length === 0 ? (
          <p className="empty">{t('emptyGlobalChat')}</p>
        ) : (
          lobbyMessages.map((m) => {
            const isMe = m.userId === user?.id;
            const onlinePeer = !isMe ? peerMap.get(m.userId) : null;
            return (
              <div key={m.id} className="chat-msg" data-me={isMe ? 'true' : undefined}>
                <div className="chat-msg__head">
                  <strong className="chat-msg__author">{isMe ? `${m.username} (${t('chatYou')})` : m.username}</strong>
                  <span className="chat-msg__time num">{formatTime(m.sentAt)}</span>
                  {onlinePeer && (
                    <button
                      type="button"
                      className="btn btn--ghost btn--small chat-msg__invite"
                      onClick={() => sendInvite(onlinePeer)}
                      disabled={Boolean(outgoing)}
                    >
                      {t('btnInvite')}
                    </button>
                  )}
                </div>
                <p className="chat-msg__body">{m.text}</p>
              </div>
            );
          })
        )}
      </div>

      <form className="chat-form" onSubmit={onSubmit}>
        <input
          className="field__input chat-form__input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={240}
          placeholder={t('chatPlaceholderLobby')}
          disabled={!connected}
        />
        <button type="submit" className="btn btn--solid btn--small" disabled={!connected || !text.trim()}>
          {t('btnSendChat')}
        </button>
      </form>
    </Panel>
  );
}

function Scoreboard() {
  const { user } = useAuth();
  const { t, rank } = useI18n();
  const [rows, setRows] = useState(null);

  const load = useCallback(() => {
    usersApi
      .scoreboard(10)
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  useEffect(load, [load, user?.wins, user?.losses, user?.draws]);

  return (
    <Panel title={t('panelScoreboard')} meta={t('metaTop10')}>
      {!rows || rows.length === 0 ? (
        <p className="empty">{t('emptyScoreboard')}</p>
      ) : (
        <table className="board-table">
          <thead>
            <tr>
              <th>#</th>
              <th>{t('thOperator')}</th>
              <th>{t('winsShort')}</th>
              <th>{t('drawsShort')}</th>
              <th>{t('lossesShort')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const rRank = rank(r.wins ?? 0);
              return (
                <tr key={r.userId} data-me={r.userId === user?.id ? 'true' : undefined}>
                  <td className="num">{String(r.rank).padStart(2, '0')}</td>
                  <td>
                    <div className="board-table__operator">
                      <span>{r.username}</span>
                      <span
                        className="rank-badge rank-badge--mini"
                        data-tone={rRank.tone}
                        title={rRank.title}
                      >
                        {rRank.insignia} {rRank.code}
                      </span>
                    </div>
                  </td>
                  <td className="num">{r.wins}</td>
                  <td className="num">{r.draws}</td>
                  <td className="num">{r.losses}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

export default function LobbyPage() {
  const { user } = useAuth();
  const { connected } = useSocket();
  const [allGames, setAllGames] = useState([]);

  useEffect(() => {
    let cancelled = false;
    gamesApi
      .list('?limit=20')
      .then((list) => {
        if (!cancelled) setAllGames(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!cancelled) setAllGames([]);
      });
    return () => {
      cancelled = true;
    };
  }, [connected, user?.wins, user?.losses, user?.draws]);

  const activeGames = allGames.filter((g) => g.status === 'SETUP' || g.status === 'IN_PROGRESS');
  const finishedGames = allGames
    .filter((g) => g.status === 'FINISHED' || g.status === 'ABANDONED')
    .slice(0, 8);

  return (
    <div className="lobby">
      <div className="lobby__col">
        <OperatorPanel />
        <ActiveGames games={activeGames} />
      </div>
      <div className="lobby__col">
        <OnlinePanel />
        <GlobalChatPanel />
      </div>
      <div className="lobby__col">
        <Scoreboard />
        <MatchHistory games={finishedGames} userId={user?.id} />
      </div>
    </div>
  );
}
