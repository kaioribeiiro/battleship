import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useSocket } from '../context/SocketContext.jsx';
import { gamesApi, usersApi } from '../lib/api.js';
import { playShot, sounds } from '../lib/audio.js';
import {
  CELL,
  FLEET,
  cellIndex,
  cellKey,
  coordLabel,
  deriveOwnCells,
  deriveRadarCells,
  evaluatePlacement,
  fleetIntegrity,
  inBounds,
  placeShip,
  randomFleet,
  removeShip,
  shipAt,
  shipCells,
  toFleetPayload,
} from '../lib/board.js';
import {
  PHASE,
  bestHitStreak,
  canFire,
  enemyHitsTaken,
  enemySunk,
  enemySunkTypes,
  gameReducer,
  initialGameState,
  myHitsTaken,
  ownSunkCount,
} from '../lib/gameReducer.js';
import { shipNameFor, t as translateStatic, useI18n } from '../lib/preferences.js';
import { emitAck } from '../lib/socket.js';
import Panel from '../components/Panel.jsx';
import ShipyardDock from '../components/ShipyardDock.jsx';
import TacticalGrid from '../components/TacticalGrid.jsx';
import TelemetryPanel from '../components/TelemetryPanel.jsx';

const nextUnplaced = (ships, fallback = null) => {
  const placed = new Set(ships.map((s) => s.type));
  return FLEET.find((d) => !placed.has(d.type))?.type ?? fallback;
};

const lastKey = (shots) => {
  const last = shots[shots.length - 1];
  return last ? cellKey(last.x, last.y) : null;
};

const SIGNAL_KEYS = {
  NICE_SHOT: 'sigNiceShot',
  LOCKED: 'sigLocked',
  CLOSE: 'sigClose',
  GG: 'sigGg',
};

function inferBotDifficulty(username = '') {
  const upper = String(username).toUpperCase();
  if (upper.includes('CADETE')) return 'easy';
  if (upper.includes('COMANDANTE')) return 'medium';
  return 'hard';
}

function formatTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function phaseBanner(state, t) {
  switch (state.phase) {
    case PHASE.LOADING:
      return { tone: 'idle', text: t('phaseLoading') };
    case PHASE.PLACEMENT:
      return { tone: 'go', text: t('phasePlacement') };
    case PHASE.WAITING:
      return {
        tone: 'idle',
        text: state.opponentReady ? t('phaseWaitingReady') : t('phaseWaitingOpponent'),
      };
    case PHASE.PLAYER_TURN:
      return { tone: 'go', text: t('phasePlayerTurn') };
    case PHASE.ENEMY_TURN:
      return { tone: 'wait', text: t('phaseEnemyTurn') };
    default:
      return { tone: 'idle', text: t('phaseGameOver') };
  }
}

function MatchChatPanel({ messages, meId, disabled, onSendText, onSendSignal }) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const feedRef = useRef(null);

  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function onSubmit(e) {
    e.preventDefault();
    const clean = text.trim();
    if (!clean || disabled) return;
    setText('');
    await onSendText(clean);
  }

  return (
    <Panel title={t('panelMatchChat')} meta={t('metaMatchChat')}>
      <div className="chat-feed chat-feed--game" ref={feedRef} aria-live="polite">
        {messages.length === 0 ? (
          <p className="empty">{t('emptyMatchChat')}</p>
        ) : (
          messages.map((m) => {
            const isMe = m.senderId === meId;
            return (
              <div key={m.id} className="chat-msg" data-me={isMe ? 'true' : undefined}>
                <div className="chat-msg__head">
                  <strong className="chat-msg__author">
                    {isMe ? `${m.senderName} (${t('chatYou')})` : m.senderName}
                  </strong>
                  <span className="chat-msg__time num">{formatTime(m.sentAt)}</span>
                </div>
                <p className="chat-msg__body">{m.text}</p>
              </div>
            );
          })
        )}
      </div>

      <div className="chat-quick" role="group" aria-label={t('radioLabel')}>
        <span className="faint radio-bar__label">{t('radioLabel')}</span>
        {Object.entries(SIGNAL_KEYS).map(([code, labelKey]) => (
          <button
            key={code}
            type="button"
            className="btn btn--ghost btn--small"
            onClick={() => onSendSignal(code)}
            disabled={disabled}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>

      <form className="chat-form" onSubmit={onSubmit}>
        <input
          className="field__input chat-form__input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={240}
          placeholder={t('chatPlaceholderGame')}
          disabled={disabled}
        />
        <button type="submit" className="btn btn--solid btn--small" disabled={disabled || !text.trim()}>
          {t('btnSendChat')}
        </button>
      </form>
    </Panel>
  );
}

function GameOverOverlay({
  over,
  totalTurns,
  hitsDealt,
  hitsTaken,
  accuracy,
  bestStreak,
  enemySunkCount,
  alliedIntactCount,
  opponent,
  isBotOpponent,
  rematchSent,
  onClose,
  onRematchBot,
  onRematchPlayer,
}) {
  const { t } = useI18n();
  const outcomeMap = {
    WIN: {
      title: t('outcomeWinTitle'),
      sub: t('outcomeWinSub'),
      subAbandon: t('outcomeWinAbandon'),
    },
    LOSS: {
      title: t('outcomeLossTitle'),
      sub: t('outcomeLossSub'),
      subAbandon: t('outcomeLossAbandon'),
    },
    DRAW: {
      title: t('outcomeDrawTitle'),
      sub: t('outcomeDrawSub'),
      subAbandon: '',
    },
  };
  const copy = outcomeMap[over?.outcome] || outcomeMap.DRAW;

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={t('gameOverAria')}>
      <div className="overlay__card" data-outcome={over.outcome}>
        <i className="reg reg--tl" />
        <i className="reg reg--tr" />
        <i className="reg reg--bl" />
        <i className="reg reg--br" />
        <span className="tag">{t('gameOverTag')}</span>
        <h2 className="overlay__title">{copy.title}</h2>
        <p className="muted">{over.abandoned ? copy.subAbandon : copy.sub}</p>
        <dl className="stats stats--6">
          <div>
            <dt>{t('statTurns')}</dt>
            <dd className="num">{totalTurns}</dd>
          </div>
          <div>
            <dt>{t('statAccuracy')}</dt>
            <dd className="num">{accuracy}%</dd>
          </div>
          <div>
            <dt>{t('statBestStreak')}</dt>
            <dd className="num">{bestStreak}</dd>
          </div>
          <div>
            <dt>{t('statHits')}</dt>
            <dd className="num">{hitsDealt}</dd>
          </div>
          <div>
            <dt>{t('statEnemySunk')}</dt>
            <dd className="num">
              {enemySunkCount}/{FLEET.length}
            </dd>
          </div>
          <div>
            <dt>{t('statAlliedIntact')}</dt>
            <dd className="num">
              {alliedIntactCount}/{FLEET.length}
            </dd>
          </div>
        </dl>
        <div className="overlay__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {t('btnViewBoards')}
          </button>
          {!isBotOpponent && opponent?.id ? (
            <button
              type="button"
              className="btn btn--solid"
              onClick={onRematchPlayer}
              disabled={rematchSent}
            >
              {rematchSent ? t('btnRematchSent') : t('btnRematchPlayer', opponent.username)}
            </button>
          ) : (
            <button type="button" className="btn btn--solid" onClick={onRematchBot}>
              {t('btnRematchBot')}
            </button>
          )}
          <Link to="/" className="btn">
            {t('btnBackLobby')}
          </Link>
        </div>
      </div>
    </div>
  );
}

function GameScreen({ gameId }) {
  const { user, refreshUser } = useAuth();
  const { socket, connected, notify, startBotGame, sendInvite, outgoing } = useSocket();
  const { t, rank } = useI18n();
  const navigate = useNavigate();

  const [state, dispatch] = useReducer(gameReducer, undefined, () => initialGameState(gameId, user.id));
  const stateRef = useRef(state);
  stateRef.current = state;

  const [loadError, setLoadError] = useState(null);
  const [opponent, setOpponent] = useState(null);
  const [showOver, setShowOver] = useState(true);
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const [firing, setFiring] = useState(false);
  const [radarHover, setRadarHover] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [sunkImpact, setSunkImpact] = useState(null);
  const firingRef = useRef(false);
  const turnAdvancedRef = useRef(false);

  // Posicionamento
  const [draft, setDraft] = useState([]);
  const [selectedType, setSelectedType] = useState(FLEET[0].type);
  const [vertical, setVertical] = useState(false);
  const [hover, setHover] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const placementRef = useRef({});
  placementRef.current = { draft, selectedType, vertical };

  const me = user.id;
  const placing = state.phase === PHASE.PLACEMENT;

  const triggerSunkImpact = useCallback(
    (payload) => {
      if (!payload || payload.result !== 'SUNK') return;
      const target = payload.shooterId === me ? 'radar' : 'own';
      const label = payload.sunkShip
        ? translateStatic('sunkBannerText', shipNameFor(payload.sunkShip))
        : translateStatic('resSunk');
      setSunkImpact({
        id: `${Date.now()}-${Math.random()}`,
        target,
        x: payload.x,
        y: payload.y,
        text: label,
      });
    },
    [me],
  );

  useEffect(() => {
    if (!sunkImpact) return undefined;
    const timer = setTimeout(() => setSunkImpact(null), 1150);
    return () => clearTimeout(timer);
  }, [sunkImpact]);

  // ── Sincronização com o servidor (game:reconnect → game:state) ───────────
  const hydrate = useCallback(async () => {
    try {
      const view = await emitAck(socket, 'game:reconnect', { gameId });
      dispatch({ type: 'HYDRATE', view });
      setLoadError(null);
      emitAck(socket, 'game:chatHistory', { gameId })
        .then((history) => {
          if (Array.isArray(history)) setChatMessages(history);
        })
        .catch(() => {});
    } catch (err) {
      setLoadError(err.message);
    }
  }, [socket, gameId]);

  useEffect(() => {
    if (socket && connected) hydrate();
  }, [socket, connected, hydrate]);

  // ── Eventos em tempo real ─────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return undefined;
    const opp = () => stateRef.current.opponentId;

    const onStart = ({ game, turnUserId }) => {
      if (game?.id === gameId) dispatch({ type: 'START', turnUserId });
    };
    const onOpponentReady = ({ userId }) => {
      if (opp() && userId === opp()) dispatch({ type: 'OPPONENT_READY' });
    };
    const onShot = (payload) => {
      const o = opp();
      if (!o) return;
      const belongs =
        payload.shooterId === me
          ? payload.targetUserId === o
          : payload.shooterId === o && payload.targetUserId === me;
      if (!belongs) return;
      dispatch({ type: 'SHOT_RESULT', payload });
      playShot(payload.result);
      triggerSunkImpact(payload);
    };
    const onTurn = ({ turnUserId }) => {
      const o = opp();
      if (!o || (turnUserId !== me && turnUserId !== o)) return;
      turnAdvancedRef.current = true;
      dispatch({ type: 'TURN', turnUserId });
      if (turnUserId === me) sounds.ping();
    };
    const onOver = (payload) => {
      if (payload.game?.id !== gameId) return;
      turnAdvancedRef.current = true;
      dispatch({ type: 'OVER', payload });
      if (payload.result === 'DRAW') sounds.ping();
      else if (payload.winnerId === me) sounds.win();
      else sounds.lose();
    };
    const onOpponentLeft = ({ userId }) => {
      if (opp() && userId === opp()) dispatch({ type: 'OPPONENT_LEFT' });
    };
    const onSignal = (payload) => {
      if (payload.gameId !== gameId) return;
      const msgKey = SIGNAL_KEYS[payload.code] || 'sigNiceShot';
      const msg = translateStatic(msgKey);
      const entryText = translateStatic('radioLogEntry', payload.senderName, msg);
      dispatch({ type: 'LOG', kind: 'SYS', text: entryText });
      setChatMessages((prev) => [
        ...prev,
        {
          id: `sig-${payload.sentAt}-${Math.random()}`,
          gameId,
          senderId: payload.senderId,
          senderName: payload.senderName,
          text: msg,
          sentAt: payload.sentAt,
        },
      ]);
      if (payload.senderId !== me) {
        sounds.ping();
        notify(`${payload.senderName}: "${msg}"`, 'info');
      }
    };
    const onChatMessage = (msg) => {
      if (msg.gameId !== gameId) return;
      setChatMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      if (msg.senderId !== me) {
        sounds.ping();
      }
    };

    socket.on('game:start', onStart);
    socket.on('game:opponentReady', onOpponentReady);
    socket.on('game:shotResult', onShot);
    socket.on('game:turn', onTurn);
    socket.on('game:over', onOver);
    socket.on('game:opponentLeft', onOpponentLeft);
    socket.on('game:signal', onSignal);
    socket.on('game:chatMessage', onChatMessage);
    return () => {
      socket.off('game:start', onStart);
      socket.off('game:opponentReady', onOpponentReady);
      socket.off('game:shotResult', onShot);
      socket.off('game:turn', onTurn);
      socket.off('game:over', onOver);
      socket.off('game:opponentLeft', onOpponentLeft);
      socket.off('game:signal', onSignal);
      socket.off('game:chatMessage', onChatMessage);
    };
  }, [socket, gameId, me, notify, triggerSunkImpact]);

  // ── Dados auxiliares ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!state.opponentId) return;
    let cancelled = false;
    usersApi
      .byId(state.opponentId)
      .then((u) => !cancelled && setOpponent(u))
      .catch(() => !cancelled && setOpponent({ id: state.opponentId, username: translateStatic('opponentFallback') }));
    return () => {
      cancelled = true;
    };
  }, [state.opponentId]);

  const finishedRef = useRef(false);
  useEffect(() => {
    if (state.phase !== PHASE.GAME_OVER || finishedRef.current) return;
    finishedRef.current = true;
    refreshUser();
    gamesApi
      .state(gameId)
      .then((view) => dispatch({ type: 'REVEAL', ships: view.opponent.ships ?? [] }))
      .catch(() => {});
  }, [state.phase, gameId, refreshUser]);

  // ── Posicionamento da frota ───────────────────────────────────────────────
  useEffect(() => {
    if (!placing) return undefined;
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'r' || e.key === 'R' || e.key === ' ') {
        e.preventDefault();
        setVertical((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [placing]);

  const onPlacementClick = useCallback((x, y) => {
    const { draft: ships, selectedType: type, vertical: vert } = placementRef.current;
    const occupant = shipAt(ships, x, y);
    if (occupant) {
      setDraft(removeShip(ships, occupant.type));
      setSelectedType(occupant.type);
      setVertical(Boolean(occupant.vertical));
      return;
    }
    if (!type) return;
    const def = FLEET.find((d) => d.type === type);
    const next = placeShip(ships, def, x, y, vert);
    if (!next) {
      dispatch({ type: 'LOG', kind: 'SYS', text: translateStatic('invalidPositionFor', shipNameFor(def.type)) });
      return;
    }
    setDraft(next);
    setSelectedType(nextUnplaced(next, type));
  }, []);

  const onPlacementHover = useCallback((x, y) => setHover(x == null ? null : { x, y }), []);
  const onRadarHover = useCallback((x, y) => setRadarHover(x == null ? null : coordLabel(x, y)), []);

  const onSelectShip = useCallback((type) => {
    const ships = placementRef.current.draft;
    const placed = ships.find((s) => s.type === type);
    if (placed) {
      setDraft(removeShip(ships, type));
      setVertical(Boolean(placed.vertical));
    }
    setSelectedType(type);
  }, []);

  const onRandomFleet = useCallback(() => {
    const ships = randomFleet();
    setDraft(ships);
    setSelectedType(null);
  }, []);

  const onClearFleet = useCallback(() => {
    setDraft([]);
    setSelectedType(FLEET[0].type);
  }, []);

  const onRotate = useCallback(() => setVertical((v) => !v), []);

  const onConfirmFleet = useCallback(async () => {
    setSubmitting(true);
    try {
      const res = await emitAck(socket, 'game:placeFleet', {
        gameId,
        ships: toFleetPayload(placementRef.current.draft),
      });
      dispatch({ type: 'FLEET_SUBMITTED', ships: placementRef.current.draft });
      if (res.status === 'IN_PROGRESS') dispatch({ type: 'START', turnUserId: res.turnUserId });
    } catch (err) {
      notify(err.message.toUpperCase(), 'error');
      if (err.code === 'INVALID_MOVE') hydrate();
    } finally {
      setSubmitting(false);
    }
  }, [socket, gameId, notify, hydrate]);

  const preview = useMemo(() => {
    if (!placing || !hover || !selectedType) return null;
    if (shipAt(draft, hover.x, hover.y)) return null;
    const def = FLEET.find((d) => d.type === selectedType);
    const cells = shipCells(hover.x, hover.y, def.size, vertical);
    const { valid } = evaluatePlacement(draft, cells, selectedType);
    return { cells: cells.filter((c) => inBounds(c.x, c.y)), valid };
  }, [placing, hover, selectedType, vertical, draft]);

  // ── Disparo ───────────────────────────────────────────────────────────────
  const radarCells = useMemo(() => deriveRadarCells(state.myShots, state.enemyShips), [state.myShots, state.enemyShips]);
  const radarCellsRef = useRef(radarCells);
  radarCellsRef.current = radarCells;

  const onFire = useCallback(
    async (x, y) => {
      if (!canFire(stateRef.current) || firingRef.current) return;
      if (radarCellsRef.current[cellIndex(x, y)] !== CELL.EMPTY) return;
      firingRef.current = true;
      setFiring(true);
      turnAdvancedRef.current = false;
      try {
        const res = await emitAck(socket, 'game:fire', { gameId, x, y });
        dispatch({ type: 'SHOT_RESULT', payload: res });
        triggerSunkImpact(res);
        setTimeout(() => {
          if (!turnAdvancedRef.current && stateRef.current.phase === PHASE.PLAYER_TURN) hydrate();
        }, 2500);
      } catch (err) {
        notify(err.message.toUpperCase(), 'error');
        if (err.code === 'NOT_YOUR_TURN' || err.code === 'GAME_ALREADY_OVER') hydrate();
      } finally {
        firingRef.current = false;
        setFiring(false);
      }
    },
    [socket, gameId, notify, hydrate, triggerSunkImpact],
  );

  const onSendSignal = useCallback(
    async (code) => {
      try {
        await emitAck(socket, 'game:signal', { gameId, code });
      } catch {
        /* ignore */
      }
    },
    [socket, gameId],
  );

  const onSendChatText = useCallback(
    async (text) => {
      try {
        await emitAck(socket, 'game:chatSend', { gameId, text });
      } catch (err) {
        notify(err.message.toUpperCase(), 'error');
      }
    },
    [socket, gameId, notify],
  );

  const onAbandon = useCallback(async () => {
    setConfirmAbandon(false);
    try {
      await emitAck(socket, 'game:abandon', { gameId });
      setTimeout(() => {
        if (stateRef.current.phase !== PHASE.GAME_OVER) hydrate();
      }, 2500);
    } catch (err) {
      notify(err.message.toUpperCase(), 'error');
    }
  }, [socket, gameId, notify, hydrate]);

  // ── Derivados para renderização ───────────────────────────────────────────
  const ownShips = placing ? draft : state.myShips;
  const ownCells = useMemo(
    () => deriveOwnCells(ownShips, placing ? [] : state.shotsOnMe),
    [ownShips, placing, state.shotsOnMe],
  );
  const ownFresh = useMemo(() => lastKey(state.shotsOnMe), [state.shotsOnMe]);
  const radarFresh = useMemo(() => lastKey(state.myShots), [state.myShots]);

  const banner = phaseBanner(state, t);
  const over = state.over;
  const opponentName = opponent?.username ?? '···';
  const isBotOpponent = Boolean(opponent?.isBot || String(opponent?.username || '').startsWith('CPU-'));
  const opponentRank = opponent && !isBotOpponent ? rank(opponent.wins ?? 0) : null;
  const myTurn = state.phase === PHASE.PLAYER_TURN;
  const sunkList = enemySunk(state);
  const hitsDealt = enemyHitsTaken(state);
  const hitsTaken = myHitsTaken(state);
  const shotsCount = state.myShots.length;
  const accuracy = shotsCount > 0 ? Math.round((hitsDealt / shotsCount) * 100) : 0;
  const bestStreak = useMemo(() => bestHitStreak(state.myShots), [state.myShots]);
  const alliedSunk = useMemo(() => ownSunkCount(state), [state]);
  const alliedIntactCount = Math.max(0, FLEET.length - alliedSunk);

  const onRematchBot = useCallback(() => {
    const diff = isBotOpponent ? inferBotDifficulty(opponent?.username) : 'hard';
    startBotGame(diff);
  }, [isBotOpponent, opponent?.username, startBotGame]);

  const onRematchPlayer = useCallback(() => {
    if (opponent?.id) {
      sendInvite({ id: opponent.id, username: opponent.username });
    }
  }, [opponent, sendInvite]);

  const radarMeta = radarHover
    ? `${radarHover} · ${myTurn ? t('metaArmed') : over ? t('metaRevealed') : t('metaStandby')}`
    : myTurn
      ? t('metaArmed')
      : over
        ? t('metaRevealed')
        : t('metaStandby');

  if (loadError && state.phase === PHASE.LOADING) {
    return (
      <Panel title={t('panelUnavailable')}>
        <p className="alert" role="alert">
          {loadError}
        </p>
        <div className="overlay__actions" style={{ marginTop: 14 }}>
          <button type="button" className="btn btn--ghost" onClick={hydrate}>
            {t('btnRetry')}
          </button>
          <button type="button" className="btn" onClick={() => navigate('/')}>
            {t('btnBackLobby')}
          </button>
        </div>
      </Panel>
    );
  }

  return (
    <div className="game">
      <header className="game__bar">
        <div className="game__title">
          <span className="faint">{t('operationLabel')}</span> <span className="num">#{gameId.slice(0, 8).toUpperCase()}</span>
          <span className="faint"> · </span>
          <span className="faint">vs</span> <strong>{opponentName}</strong>
          {opponentRank && (
            <span className="rank-badge rank-badge--inline" data-tone={opponentRank.tone} title={opponentRank.title}>
              {opponentRank.insignia} {opponentRank.title}
            </span>
          )}
        </div>

        <div className="game__phase" data-tone={banner.tone} role="status">
          <span className={`led ${banner.tone === 'go' ? 'led--on led--blink' : banner.tone === 'wait' ? 'led--alert' : ''}`} />
          {banner.text}
        </div>

        <div className="game__actions">
          {state.opponentLeft && !over && <span className="tag tag--crimson">{t('tagOpponentDisconnected')}</span>}
          {!over &&
            (confirmAbandon ? (
              <>
                <span className="muted">{t('confirmAbandonPrompt')}</span>
                <button type="button" className="btn btn--danger btn--small" onClick={onAbandon}>
                  {t('btnConfirmAbandon')}
                </button>
                <button type="button" className="btn btn--ghost btn--small" onClick={() => setConfirmAbandon(false)}>
                  {t('btnCancel')}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn--danger btn--small"
                onClick={() => setConfirmAbandon(true)}
                disabled={state.phase === PHASE.LOADING}
              >
                {t('btnAbandon')}
              </button>
            ))}
          {over && !showOver && (
            <button type="button" className="btn btn--small" onClick={() => setShowOver(true)}>
              {t('btnViewResult')}
            </button>
          )}
        </div>
      </header>

      <div className="game__boards" data-placing={placing ? 'true' : 'false'}>
        <Panel
          title={t('panelOwnFleet')}
          meta={placing ? t('metaPlacement') : t('metaDefense')}
          onContextMenu={
            placing && !submitting
              ? (e) => {
                  e.preventDefault();
                  onRotate();
                }
              : undefined
          }
        >
          <TacticalGrid
            mode="own"
            label={t('gridOwnLabel')}
            cells={ownCells}
            ships={ownShips}
            preview={preview}
            interactive={placing && !submitting}
            canPickup={placing}
            freshKey={ownFresh}
            sunkImpact={sunkImpact?.target === 'own' ? sunkImpact : null}
            onCellClick={onPlacementClick}
            onCellHover={onPlacementHover}
          />
          {placing && (
            <div className="mobile-place-bar">
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={onRotate}
                disabled={!selectedType || submitting}
              >
                {t('btnRotate', vertical)}
              </button>
              <button type="button" className="btn btn--ghost btn--small" onClick={onRandomFleet} disabled={submitting}>
                {t('btnRandom')}
              </button>
              {draft.length === FLEET.length && (
                <button
                  type="button"
                  className="btn btn--solid btn--small"
                  onClick={onConfirmFleet}
                  disabled={submitting}
                >
                  {submitting ? t('btnSubmitting') : t('btnConfirmFleet')}
                </button>
              )}
            </div>
          )}
        </Panel>

        {placing ? (
          <ShipyardDock
            mode="placement"
            draft={draft}
            selectedType={selectedType}
            vertical={vertical}
            submitting={submitting}
            onSelect={onSelectShip}
            onRotate={onRotate}
            onRandom={onRandomFleet}
            onClear={onClearFleet}
            onConfirm={onConfirmFleet}
          />
        ) : (
          <Panel title={t('panelEnemyRadar')} meta={radarMeta}>
            <TacticalGrid
              mode="radar"
              label={t('gridRadarLabel')}
              cells={radarCells}
              revealed={state.enemyShips}
              interactive={myTurn && !firing}
              armed={myTurn}
              scan={state.phase !== PHASE.GAME_OVER}
              freshKey={radarFresh}
              sunkImpact={sunkImpact?.target === 'radar' ? sunkImpact : null}
              onCellClick={onFire}
              onCellHover={onRadarHover}
            />
          </Panel>
        )}
      </div>

      <div className="game__info game__info--3">
        {!placing && state.phase !== PHASE.LOADING && (
          <ShipyardDock
            mode="battle"
            ships={state.myShips}
            shotsOnMe={state.shotsOnMe}
            myShots={state.myShots}
            enemyShips={state.enemyShips}
            enemySunkCount={sunkList.length}
            enemySunkTypes={enemySunkTypes(state)}
          />
        )}
        <TelemetryPanel
          log={state.log}
          totalTurns={state.totalTurns}
          accuracy={shotsCount > 0 ? accuracy : undefined}
          myIntegrity={fleetIntegrity(hitsTaken)}
          enemyIntegrity={fleetIntegrity(hitsDealt)}
        />
        <MatchChatPanel
          messages={chatMessages}
          meId={me}
          disabled={!connected || state.phase === PHASE.LOADING}
          onSendText={onSendChatText}
          onSendSignal={onSendSignal}
        />
      </div>

      {over && showOver && (
        <GameOverOverlay
          over={over}
          totalTurns={state.totalTurns}
          hitsDealt={hitsDealt}
          hitsTaken={hitsTaken}
          accuracy={accuracy}
          bestStreak={bestStreak}
          enemySunkCount={sunkList.length}
          alliedIntactCount={alliedIntactCount}
          opponent={opponent}
          isBotOpponent={isBotOpponent}
          rematchSent={Boolean(outgoing && opponent && outgoing.inviteeId === opponent.id)}
          onClose={() => setShowOver(false)}
          onRematchBot={onRematchBot}
          onRematchPlayer={onRematchPlayer}
        />
      )}
    </div>
  );
}

export default function GamePage() {
  const { gameId } = useParams();
  return <GameScreen key={gameId} gameId={gameId} />;
}
