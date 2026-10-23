import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import { createSocket, emitAck } from '../lib/socket.js';
import { gamesApi } from '../lib/api.js';
import { sounds } from '../lib/audio.js';
import { t } from '../lib/preferences.js';

const SocketContext = createContext(null);

let noticeSeq = 0;

export function SocketProvider({ children }) {
  const { token, user, logout } = useAuth();
  const navigate = useNavigate();

  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [online, setOnline] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState(null);
  const [notices, setNotices] = useState([]);
  const [lobbyMessages, setLobbyMessages] = useState([]);

  const lastGameRef = useRef(null);
  const outgoingRef = useRef(null);
  outgoingRef.current = outgoing;

  const notify = useCallback((text, tone = 'info') => {
    const id = ++noticeSeq;
    setNotices((list) => [...list, { id, text, tone }]);
    setTimeout(() => setNotices((list) => list.filter((n) => n.id !== id)), 5000);
  }, []);

  const dismissNotice = useCallback((id) => setNotices((list) => list.filter((n) => n.id !== id)), []);

  const goToGame = useCallback(
    (gameId) => {
      if (!gameId) return;
      setIncoming((list) => list.filter((i) => i.game.id !== gameId));
      setOutgoing((cur) => (cur && cur.gameId === gameId ? null : cur));
      if (lastGameRef.current === gameId) return;
      lastGameRef.current = gameId;
      navigate(`/game/${gameId}`);
    },
    [navigate],
  );

  useEffect(() => {
    if (!token) return undefined;
    const s = createSocket(token);
    setSocket(s);

    const onConnect = () => {
      setConnected(true);
      emitAck(s, 'lobby:listOnline')
        .then((users) => setOnline(users))
        .catch(() => {});
      emitAck(s, 'lobby:chatHistory')
        .then((history) => {
          if (Array.isArray(history)) setLobbyMessages(history);
        })
        .catch(() => {});
    };
    const onDisconnect = () => setConnected(false);
    const onConnectError = (err) => {
      setConnected(false);
      if (err?.message === 'UNAUTHORIZED') logout();
    };
    const onPresence = ({ users }) => {
      setOnline(users);
      const others = (users || []).filter((u) => u.id !== user?.id);
      if (others.length === 0) {
        setLobbyMessages([]);
      }
    };
    const onLobbyChatCleared = () => {
      setLobbyMessages([]);
    };
    const onLobbyChatMessage = (msg) => {
      setLobbyMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev.slice(-39), msg]));
      if (msg.userId !== user?.id) sounds.ping();
    };
    const onInviteReceived = ({ invitation, game, inviter }) => {
      setIncoming((list) =>
        list.some((i) => i.invitation.id === invitation.id) ? list : [...list, { invitation, game, inviter }],
      );
      sounds.alert();
    };
    const onInviteAccepted = ({ game }) => goToGame(game.id);
    const onInviteRejected = ({ invitationId }) => {
      const cur = outgoingRef.current;
      if (cur && cur.invitationId === invitationId) {
        setOutgoing(null);
        notify(t('noticeDeclined', cur.inviteeName), 'warn');
      }
    };

    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    s.on('connect_error', onConnectError);
    s.on('presence:online', onPresence);
    s.on('lobby:chatCleared', onLobbyChatCleared);
    s.on('lobby:chatMessage', onLobbyChatMessage);
    s.on('invitation:received', onInviteReceived);
    s.on('invitation:accepted', onInviteAccepted);
    s.on('invitation:rejected', onInviteRejected);

    return () => {
      s.off();
      s.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [token, user?.id, logout, goToGame, notify]);

  // Expira convites localmente (o servidor valida de novo ao responder).
  useEffect(() => {
    if (incoming.length === 0 && !outgoing) return undefined;
    const timer = setInterval(() => {
      const now = Date.now();
      setIncoming((list) => {
        const alive = list.filter((i) => !i.invitation.expiresAt || new Date(i.invitation.expiresAt).getTime() > now);
        return alive.length === list.length ? list : alive;
      });
      const cur = outgoingRef.current;
      if (cur?.expiresAt && new Date(cur.expiresAt).getTime() <= now) {
        setOutgoing(null);
        notify(t('noticeExpired', cur.inviteeName), 'warn');
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [incoming.length, outgoing, notify]);

  const sendInvite = useCallback(
    async (target) => {
      if (outgoingRef.current) {
        notify(t('noticeWaitCurrent'), 'warn');
        return;
      }
      try {
        const { game, invitation } = await emitAck(socket, 'invitation:send', { inviteeId: target.id });
        setOutgoing({
          inviteeId: target.id,
          inviteeName: target.username,
          invitationId: invitation.id,
          gameId: game.id,
          expiresAt: invitation.expiresAt,
        });
      } catch (err) {
        notify(err.message.toUpperCase(), 'error');
      }
    },
    [socket, notify],
  );

  const respondInvite = useCallback(
    async (entry, accept) => {
      setIncoming((list) => list.filter((i) => i.invitation.id !== entry.invitation.id));
      try {
        const data = await emitAck(socket, 'invitation:respond', {
          invitationId: entry.invitation.id,
          accept,
        });
        if (accept) goToGame(data.gameId);
      } catch (err) {
        notify(err.message.toUpperCase(), 'error');
      }
    },
    [socket, goToGame, notify],
  );

  const startBotGame = useCallback(
    async (difficulty = 'hard') => {
      try {
        const { gameId } = await gamesApi.vsBot(difficulty);
        goToGame(gameId);
      } catch (err) {
        notify(err.message.toUpperCase(), 'error');
      }
    },
    [goToGame, notify],
  );

  const sendLobbyMessage = useCallback(
    async (text) => {
      const clean = String(text ?? '').trim();
      if (!clean || !socket) return;
      try {
        await emitAck(socket, 'lobby:chatSend', { text: clean });
      } catch (err) {
        notify(err.message.toUpperCase(), 'error');
      }
    },
    [socket, notify],
  );

  const peers = useMemo(() => online.filter((u) => u.id !== user?.id), [online, user?.id]);

  const value = useMemo(
    () => ({
      socket,
      connected,
      online,
      peers,
      incoming,
      outgoing,
      notices,
      lobbyMessages,
      notify,
      dismissNotice,
      sendInvite,
      respondInvite,
      startBotGame,
      sendLobbyMessage,
    }),
    [
      socket,
      connected,
      online,
      peers,
      incoming,
      outgoing,
      notices,
      lobbyMessages,
      notify,
      dismissNotice,
      sendInvite,
      respondInvite,
      startBotGame,
      sendLobbyMessage,
    ],
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket deve ser usado dentro de <SocketProvider>');
  return ctx;
}
