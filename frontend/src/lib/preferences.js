import { useSyncExternalStore } from 'react';

const THEME_KEY = 'battleship.theme';
const LANG_KEY = 'battleship.lang';

const listeners = new Set();

let currentTheme = 'dark';
let currentLang = 'pt';

try {
  const savedTheme = localStorage.getItem(THEME_KEY);
  if (savedTheme === 'light' || savedTheme === 'dark') {
    currentTheme = savedTheme;
  }
  const savedLang = localStorage.getItem(LANG_KEY);
  if (savedLang === 'en' || savedLang === 'pt') {
    currentLang = savedLang;
  }
} catch {
  currentTheme = 'dark';
  currentLang = 'pt';
}

function applyDomAttributes() {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = currentTheme;
  document.documentElement.lang = currentLang === 'en' ? 'en' : 'pt-BR';
  document.title = currentLang === 'en' ? 'Battleship — Naval Warfare' : 'Battleship — Combate Naval';
}

applyDomAttributes();

let snapshot = { theme: currentTheme, lang: currentLang };

function notify() {
  if (snapshot.theme !== currentTheme || snapshot.lang !== currentLang) {
    snapshot = { theme: currentTheme, lang: currentLang };
  }
  applyDomAttributes();
  listeners.forEach((cb) => cb());
}

function subscribe(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getPreferences() {
  return snapshot;
}

export function getTheme() {
  return currentTheme;
}

export function getLang() {
  return currentLang;
}

export function setTheme(next) {
  const normalized = next === 'light' ? 'light' : 'dark';
  if (currentTheme === normalized) return;
  currentTheme = normalized;
  try {
    localStorage.setItem(THEME_KEY, currentTheme);
  } catch {
    /* ignore */
  }
  notify();
}

export function toggleTheme() {
  setTheme(currentTheme === 'dark' ? 'light' : 'dark');
}

export function setLang(next) {
  const normalized = next === 'en' ? 'en' : 'pt';
  if (currentLang === normalized) return;
  currentLang = normalized;
  try {
    localStorage.setItem(LANG_KEY, currentLang);
  } catch {
    /* ignore */
  }
  notify();
}

export function toggleLang() {
  setLang(currentLang === 'pt' ? 'en' : 'pt');
}

const SERVER_SNAPSHOT = { theme: 'dark', lang: 'pt' };

export function usePreferences() {
  return useSyncExternalStore(subscribe, getPreferences, () => SERVER_SNAPSHOT);
}

export function useTheme() {
  const { theme } = usePreferences();
  return [theme, setTheme, toggleTheme];
}

export function useLang() {
  const { lang } = usePreferences();
  return [lang, setLang, toggleLang];
}

export const SHIP_NAMES = {
  pt: {
    CARRIER: 'PORTA-AVIÕES',
    BATTLESHIP: 'ENCOURAÇADO',
    CRUISER: 'CRUZADOR',
    SUBMARINE: 'SUBMARINO',
    DESTROYER: 'CONTRATORPEDEIRO',
  },
  en: {
    CARRIER: 'CARRIER',
    BATTLESHIP: 'BATTLESHIP',
    CRUISER: 'CRUISER',
    SUBMARINE: 'SUBMARINE',
    DESTROYER: 'DESTROYER',
  },
};

export function shipNameFor(type, lang = currentLang) {
  return SHIP_NAMES[lang]?.[type] ?? SHIP_NAMES.pt[type] ?? type;
}

export const DICTIONARY = {
  pt: {
    // App & Brand
    brandTitle: 'Battleship',
    brandSubtitle: 'Combate Naval',
    validatingCredentials: 'Validando credenciais…',
    sheetMeta: 'Combate Naval · Tempo Real',
    revLabel: 'v2.0',
    sheetFooter: 'Pronto',

    // TopBar & Controls
    navLobby: 'Lobby',
    navApiDocs: 'API Docs',
    statusConnectedTitle: 'Conectado ao servidor em tempo real',
    statusDisconnectedTitle: 'Sem conexão com o servidor',
    statusOnline: 'Online',
    statusReconnecting: 'Reconectando',
    winsShort: 'V',
    lossesShort: 'D',
    drawsShort: 'E',
    bgmTitle: 'Ligar/desligar trilha sonora de fundo',
    bgmLabel: 'Trilha',
    bgmVolumeTitle: 'Volume da trilha',
    sfxTitle: 'Ligar/desligar efeitos sonoros',
    sfxLabel: 'SFX',
    themeToggleTitle: 'Alternar entre tema Escuro e Claro',
    themeDark: 'Dark',
    themeLight: 'Light',
    langToggleTitle: 'Alternar idioma (Português / Inglês)',
    logout: 'Sair',

    // AuthPage
    authDescription:
      'Simulador estratégico de batalha naval multijogador em tempo real. Posicione sua frota, rastreie o adversário no radar e destrua todos os cascos inimigos.',
    specGridLabel: 'Grade',
    specGridValue: '10 × 10 · A-J / 1-10',
    specFleetLabel: 'Frota',
    specFleetValue: '5 embarcações · 17 setores',
    specChannelLabel: 'Motor',
    specChannelValue: 'Socket.IO · IA Probabilística · JWT',
    tabLogin: 'Entrar',
    tabRegister: 'Registrar',
    fieldUsername: 'Nome de operador',
    fieldUsernamePlaceholder: 'comandante',
    fieldPassword: 'Senha',
    fieldConfirmPassword: 'Confirmar senha',
    errUsernameLength: 'Entre 3 e 20 caracteres.',
    errPasswordLength: 'Mínimo de 6 caracteres.',
    errPasswordMismatch: 'As senhas não conferem.',
    btnProcessing: 'Processando…',
    btnRegisterSubmit: 'Criar conta e entrar',
    btnLoginSubmit: 'Entrar',
    btnQuickDemo: 'Acesso Rápido · Modo Visitante (Demo)',
    demoDivider: 'ou teste com 1 clique',

    // LobbyPage
    panelOperator: 'Operador',
    metaWinRate: (rate) => `${rate}% vitórias`,
    metaProfile: 'Ficha',
    statWins: 'Vitórias',
    statLosses: 'Derrotas',
    statDraws: 'Empates',
    difficultyLabel: 'Dificuldade da CPU',
    diffEasy: 'Cadete (Fácil)',
    diffMedium: 'Comandante (Médio)',
    diffHard: 'Almirante (Difícil)',
    btnPreparing: 'Preparando…',
    btnPlayBot: 'Jogar contra a CPU',
    botHint: 'No nível Almirante, a CPU usa mapa de densidade probabilística e rastreamento colinear.',
    panelActiveGames: 'Operações em curso',
    statusSetup: 'posicionamento',
    statusTurn: (t) => `turno ${t}`,
    btnResume: 'Retomar',
    panelMatchHistory: 'Histórico recente',
    metaLastGames: (n) => `Últimas ${n}`,
    badgeDraw: 'Empate',
    badgeWin: 'Vitória',
    badgeLoss: 'Derrota',
    btnReport: 'Relatório',
    panelOnlinePeers: 'Operadores online',
    metaAvailablePeers: (n) => `${n} disponível(is)`,
    metaDisconnected: 'sem conexão',
    emptyOnlinePeers: 'Nenhum outro operador online. Abra outra aba ou desafie a CPU ao lado.',
    connectingServer: 'Conectando ao servidor…',
    btnWaitingInvite: 'Aguardando…',
    btnInvite: 'Convidar',
    panelScoreboard: 'Placar Geral',
    metaTop10: 'Top 10',
    emptyScoreboard: 'Nenhuma partida concluída',
    thOperator: 'Operador',

    // Global & Match Chat
    panelGlobalChat: 'Chat Global',
    metaGlobalChat: 'Canal Aberto',
    emptyGlobalChat: 'Nenhuma mensagem no lobby ainda. Mande um alô para chamar quem está online!',
    chatPlaceholderLobby: 'Digite uma mensagem para chamar jogadores…',
    panelMatchChat: 'Chat da Partida',
    metaMatchChat: 'Canal Tático Direto',
    emptyMatchChat: 'Canal de rádio aberto com o oponente. Envie uma mensagem ou sinal rápido abaixo.',
    chatPlaceholderGame: 'Digite uma mensagem para o adversário…',
    btnSendChat: 'Enviar',
    chatYou: 'Você',

    // Invitations
    inviteReceivedAria: 'Convite recebido',
    inviteReceivedTitle: 'Transmissão recebida',
    inviteReceivedBody: (name) => `${name} convida você para uma batalha.`,
    btnAccept: 'Aceitar',
    btnDecline: 'Recusar',
    inviteSentTitle: 'Convite enviado',
    inviteSentBody: (name) => `Aguardando resposta de ${name}…`,
    noticeDeclined: (name) => `${name} RECUSOU O CONVITE`,
    noticeExpired: (name) => `CONVITE PARA ${name} EXPIROU`,
    noticeWaitCurrent: 'AGUARDE A RESPOSTA DO CONVITE ATUAL',

    // GamePage
    phaseLoading: 'Sincronizando com o comando…',
    phasePlacement: 'Posicione sua frota e confirme',
    phaseWaitingReady: 'Frota transmitida · iniciando operação…',
    phaseWaitingOpponent: 'Frota transmitida · aguardando adversário',
    phasePlayerTurn: 'Seu turno · selecione uma coordenada no radar',
    phaseEnemyTurn: 'Turno inimigo · aguarde o disparo',
    phaseGameOver: 'Operação encerrada',
    outcomeWinTitle: 'Vitória',
    outcomeWinSub: 'Frota inimiga completamente destruída.',
    outcomeWinAbandon: 'O adversário abandonou a operação.',
    outcomeLossTitle: 'Derrota',
    outcomeLossSub: 'Sua frota foi destruída.',
    outcomeLossAbandon: 'Você abandonou a operação.',
    outcomeDrawTitle: 'Empate',
    outcomeDrawSub: 'Limite de turnos atingido sem vencedor.',
    gameOverAria: 'Fim de partida',
    gameOverTag: 'Fim de operação',
    statTurns: 'Turnos',
    statHits: 'Acertos',
    statDamage: 'Danos',
    statAccuracy: 'Precisão',
    btnViewBoards: 'Ver tabuleiros',
    btnRematchBot: 'Jogar novamente vs CPU',
    btnBackLobby: 'Voltar ao lobby',
    panelUnavailable: 'Partida indisponível',
    btnRetry: 'Tentar novamente',
    operationLabel: 'Operação',
    opponentFallback: 'ADVERSÁRIO',
    tagOpponentDisconnected: 'Adversário desconectou',
    confirmAbandonPrompt: 'Confirmar abandono?',
    btnConfirmAbandon: 'Sim, abandonar',
    btnCancel: 'Cancelar',
    btnAbandon: 'Abandonar',
    btnViewResult: 'Ver resultado',
    panelOwnFleet: 'Frota própria',
    metaPlacement: 'Posicionamento',
    metaDefense: 'Defesa',
    gridOwnLabel: 'Tabuleiro da sua frota',
    panelEnemyRadar: 'Radar inimigo',
    metaArmed: 'Armado',
    metaRevealed: 'Revelado',
    metaStandby: 'Em espera',
    gridRadarLabel: 'Radar do tabuleiro inimigo',
    invalidPositionFor: (ship) => `POSIÇÃO INVÁLIDA PARA ${ship}`,
    radioLabel: 'Rádio:',
    sigNiceShot: 'Bom tiro!',
    sigLocked: 'Na mira!',
    sigClose: 'Quase!',
    sigGg: 'GG!',
    radioLogEntry: (sender, msg) => `[RÁDIO] ${sender}: "${msg}"`,

    // ShipyardDock
    panelShipyard: 'Estaleiro',
    metaPlacedCount: (placed, total) => `${placed}/${total} posicionados`,
    tagSelected: 'Selecionado',
    tagPlaced: 'Em posição',
    tagPending: 'Pendente',
    dockHint: 'Clique em uma coordenada para fixar o casco. Clique em um casco posicionado para movê-lo ou pressione [R] para girar.',
    btnRotate: (vert) => `Girar [R] · ${vert ? 'Vertical' : 'Horizontal'}`,
    btnRandom: 'Aleatória',
    btnClear: 'Limpar',
    btnSubmitting: 'Transmitindo…',
    btnConfirmFleet: 'Confirmar frota',
    btnRemainingShips: (n) => `Faltam ${n} navio(s)`,
    panelFleetStatus: 'Frota',
    metaHullIntegrity: 'Integridade dos cascos',
    subtitleOwnFleet: 'Própria',
    statusSunk: 'Afundado',
    statusDamaged: 'Avariado',
    statusOperational: 'Operante',
    subtitleEnemyFleet: 'Inimiga',
    metaEnemySunk: (sunk, total) => `· ${sunk}/${total} afundados`,
    statusUnknown: 'Desconhecido',
    restoredSunkHint: (n) => `${n} afundamento(s) anterior(es) sem identificação do casco (sessão restaurada).`,

    // TelemetryPanel
    panelTelemetry: 'Telemetria',
    metaTurn: (t) => `Turno ${String(t).padStart(3, '0')}`,
    meterOwnIntegrity: 'Integridade própria',
    meterEnemyIntegrity: 'Integridade inimiga',
    logAria: 'Diário de missão',
    emptyLog: 'Sem registros',
    shotOwnPrefix: 'DISPARO',
    shotEnemyPrefix: 'ALVO ATINGIDO',
    resMiss: 'ÁGUA · RESPINGO',
    resHit: 'ACERTO · SETOR AVARIADO',
    resSunk: 'AFUNDADO',

    // TacticalCell
    cellEmpty: 'sem informação',
    cellShip: 'embarcação',
    cellMiss: 'água',
    cellHit: 'acerto',
    cellSunk: 'afundado',

    // Patentes, Histórico & Relatório Tático
    rankProgress: (rem, nextTitle) => `Faltam ${rem} vitória(s) para ${nextTitle}`,
    rankMaxReached: 'Patente máxima da frota alcançada',
    thRank: 'Patente',
    emptyMatchHistory: 'Nenhuma batalha concluída ainda. Desafie a CPU ou um operador online!',
    badgeAbandoned: 'Abandono',
    turnsShort: (t) => `${t} turnos`,
    statBestStreak: 'Sequência máx.',
    statEnemySunk: 'Abates',
    statAlliedIntact: 'Frota intacta',
    btnRematchPlayer: (name) => `Pedir revanche a ${name}`,
    btnRematchSent: 'Convite de revanche enviado…',
    statusSurvived: 'Revelado',
    sunkBannerText: (ship) => `☠ ${ship} DESTRUÍDO!`,
  },

  en: {
    // App & Brand
    brandTitle: 'Battleship',
    brandSubtitle: 'Naval Warfare',
    validatingCredentials: 'Validating credentials…',
    sheetMeta: 'Naval Warfare · Real-Time',
    revLabel: 'v2.0',
    sheetFooter: 'Ready',

    // TopBar & Controls
    navLobby: 'Lobby',
    navApiDocs: 'API Docs',
    statusConnectedTitle: 'Connected to real-time server',
    statusDisconnectedTitle: 'Disconnected from server',
    statusOnline: 'Online',
    statusReconnecting: 'Reconnecting',
    winsShort: 'W',
    lossesShort: 'L',
    drawsShort: 'D',
    bgmTitle: 'Toggle background soundtrack',
    bgmLabel: 'BGM',
    bgmVolumeTitle: 'BGM Volume',
    sfxTitle: 'Toggle sound effects',
    sfxLabel: 'SFX',
    themeToggleTitle: 'Switch between Dark and Light theme',
    themeDark: 'Dark',
    themeLight: 'Light',
    langToggleTitle: 'Switch language (Portuguese / English)',
    logout: 'Sign out',

    // AuthPage
    authDescription:
      'Real-time multiplayer naval warfare tactical simulator. Deploy your fleet, lock onto enemy coordinates on the radar, and sink all hostile hulls.',
    specGridLabel: 'Grid',
    specGridValue: '10 × 10 · A-J / 1-10',
    specFleetLabel: 'Fleet',
    specFleetValue: '5 vessels · 17 sectors',
    specChannelLabel: 'Engine',
    specChannelValue: 'Socket.IO · Probability AI · JWT',
    tabLogin: 'Sign In',
    tabRegister: 'Register',
    fieldUsername: 'Operator Callsign',
    fieldUsernamePlaceholder: 'commander',
    fieldPassword: 'Password',
    fieldConfirmPassword: 'Confirm Password',
    errUsernameLength: 'Between 3 and 20 characters.',
    errPasswordLength: 'At least 6 characters.',
    errPasswordMismatch: 'Passwords do not match.',
    btnProcessing: 'Processing…',
    btnRegisterSubmit: 'Create account & enter',
    btnLoginSubmit: 'Sign In',
    btnQuickDemo: 'Quick Access · Guest Demo (1-Click)',
    demoDivider: 'or try instantly with 1 click',

    // LobbyPage
    panelOperator: 'Operator',
    metaWinRate: (rate) => `${rate}% win rate`,
    metaProfile: 'Dossier',
    statWins: 'Wins',
    statLosses: 'Losses',
    statDraws: 'Draws',
    difficultyLabel: 'CPU Difficulty',
    diffEasy: 'Cadet (Easy)',
    diffMedium: 'Commander (Medium)',
    diffHard: 'Admiral (Hard)',
    btnPreparing: 'Preparing…',
    btnPlayBot: 'Play vs CPU',
    botHint: 'On Admiral difficulty, the CPU uses a probability density heatmap and collinear tracking.',
    panelActiveGames: 'Active Operations',
    statusSetup: 'deployment',
    statusTurn: (t) => `turn ${t}`,
    btnResume: 'Resume',
    panelMatchHistory: 'Match History',
    metaLastGames: (n) => `Last ${n}`,
    badgeDraw: 'Draw',
    badgeWin: 'Victory',
    badgeLoss: 'Defeat',
    btnReport: 'Report',
    panelOnlinePeers: 'Online Operators',
    metaAvailablePeers: (n) => `${n} available`,
    metaDisconnected: 'offline',
    emptyOnlinePeers: 'No other operators online. Open another tab or challenge the CPU.',
    connectingServer: 'Connecting to server…',
    btnWaitingInvite: 'Waiting…',
    btnInvite: 'Challenge',
    panelScoreboard: 'Leaderboard',
    metaTop10: 'Top 10',
    emptyScoreboard: 'No completed matches yet',
    thOperator: 'Operator',

    // Global & Match Chat
    panelGlobalChat: 'Global Chat',
    metaGlobalChat: 'Open Channel',
    emptyGlobalChat: 'No messages in the lobby yet. Say hello to challenge online players!',
    chatPlaceholderLobby: 'Type a message to call online players…',
    panelMatchChat: 'Match Chat',
    metaMatchChat: 'Direct Tactical Comms',
    emptyMatchChat: 'Radio channel open with your opponent. Type a message or use quick signals below.',
    chatPlaceholderGame: 'Type a message to your opponent…',
    btnSendChat: 'Send',
    chatYou: 'You',

    // Invitations
    inviteReceivedAria: 'Incoming challenge',
    inviteReceivedTitle: 'Incoming transmission',
    inviteReceivedBody: (name) => `${name} challenges you to a naval battle.`,
    btnAccept: 'Accept',
    btnDecline: 'Decline',
    inviteSentTitle: 'Challenge sent',
    inviteSentBody: (name) => `Waiting for ${name} to respond…`,
    noticeDeclined: (name) => `${name} DECLINED THE CHALLENGE`,
    noticeExpired: (name) => `CHALLENGE TO ${name} EXPIRED`,
    noticeWaitCurrent: 'WAIT FOR CURRENT CHALLENGE RESPONSE',

    // GamePage
    phaseLoading: 'Synchronizing with command…',
    phasePlacement: 'Deploy your fleet and confirm',
    phaseWaitingReady: 'Fleet transmitted · starting operation…',
    phaseWaitingOpponent: 'Fleet transmitted · waiting for opponent',
    phasePlayerTurn: 'Your turn · select a target coordinate on radar',
    phaseEnemyTurn: 'Enemy turn · incoming fire',
    phaseGameOver: 'Operation concluded',
    outcomeWinTitle: 'Victory',
    outcomeWinSub: 'Enemy fleet completely destroyed.',
    outcomeWinAbandon: 'The opponent abandoned the operation.',
    outcomeLossTitle: 'Defeat',
    outcomeLossSub: 'Your fleet was destroyed.',
    outcomeLossAbandon: 'You abandoned the operation.',
    outcomeDrawTitle: 'Draw',
    outcomeDrawSub: 'Turn limit reached with no winner.',
    gameOverAria: 'Match over',
    gameOverTag: 'End of operation',
    statTurns: 'Turns',
    statHits: 'Hits',
    statDamage: 'Damage',
    statAccuracy: 'Accuracy',
    btnViewBoards: 'Inspect boards',
    btnRematchBot: 'Play again vs CPU',
    btnBackLobby: 'Back to lobby',
    panelUnavailable: 'Match unavailable',
    btnRetry: 'Try again',
    operationLabel: 'Operation',
    opponentFallback: 'OPPONENT',
    tagOpponentDisconnected: 'Opponent disconnected',
    confirmAbandonPrompt: 'Confirm forfeit?',
    btnConfirmAbandon: 'Yes, forfeit',
    btnCancel: 'Cancel',
    btnAbandon: 'Forfeit',
    btnViewResult: 'View result',
    panelOwnFleet: 'Allied Fleet',
    metaPlacement: 'Deployment',
    metaDefense: 'Defense',
    gridOwnLabel: 'Your fleet board',
    panelEnemyRadar: 'Enemy Radar',
    metaArmed: 'Armed',
    metaRevealed: 'Revealed',
    metaStandby: 'Standby',
    gridRadarLabel: 'Enemy radar board',
    invalidPositionFor: (ship) => `INVALID POSITION FOR ${ship}`,
    radioLabel: 'Comms:',
    sigNiceShot: 'Nice shot!',
    sigLocked: 'Target locked!',
    sigClose: 'Close one!',
    sigGg: 'GG!',
    radioLogEntry: (sender, msg) => `[COMMS] ${sender}: "${msg}"`,

    // ShipyardDock
    panelShipyard: 'Shipyard',
    metaPlacedCount: (placed, total) => `${placed}/${total} deployed`,
    tagSelected: 'Selected',
    tagPlaced: 'Deployed',
    tagPending: 'Pending',
    dockHint: 'Click a coordinate to place the hull. Click a deployed hull to relocate it or press [R] to rotate.',
    btnRotate: (vert) => `Rotate [R] · ${vert ? 'Vertical' : 'Horizontal'}`,
    btnRandom: 'Randomize',
    btnClear: 'Clear',
    btnSubmitting: 'Transmitting…',
    btnConfirmFleet: 'Confirm fleet',
    btnRemainingShips: (n) => `${n} ship(s) remaining`,
    panelFleetStatus: 'Fleet Status',
    metaHullIntegrity: 'Hull integrity',
    subtitleOwnFleet: 'Allied',
    statusSunk: 'Sunk',
    statusDamaged: 'Damaged',
    statusOperational: 'Active',
    subtitleEnemyFleet: 'Hostile',
    metaEnemySunk: (sunk, total) => `· ${sunk}/${total} sunk`,
    statusUnknown: 'Unknown',
    restoredSunkHint: (n) => `${n} previous sinking(s) with unidentified hull (restored session).`,

    // TelemetryPanel
    panelTelemetry: 'Telemetry',
    metaTurn: (t) => `Turn ${String(t).padStart(3, '0')}`,
    meterOwnIntegrity: 'Allied integrity',
    meterEnemyIntegrity: 'Hostile integrity',
    logAria: 'Mission log',
    emptyLog: 'No entries yet',
    shotOwnPrefix: 'FIRE',
    shotEnemyPrefix: 'INCOMING',
    resMiss: 'MISS · WATER SPLASH',
    resHit: 'HIT · SECTOR DAMAGED',
    resSunk: 'SUNK',

    // TacticalCell
    cellEmpty: 'uncharted',
    cellShip: 'vessel',
    cellMiss: 'miss',
    cellHit: 'hit',
    cellSunk: 'sunk',

    // Ranks, History & Tactical Report
    rankProgress: (rem, nextTitle) => `${rem} win(s) to ${nextTitle}`,
    rankMaxReached: 'Highest fleet rank achieved',
    thRank: 'Rank',
    emptyMatchHistory: 'No completed battles yet. Challenge the CPU or an online operator!',
    badgeAbandoned: 'Forfeit',
    turnsShort: (t) => `${t} turns`,
    statBestStreak: 'Best streak',
    statEnemySunk: 'Enemy sunk',
    statAlliedIntact: 'Allied intact',
    btnRematchPlayer: (name) => `Request rematch vs ${name}`,
    btnRematchSent: 'Rematch challenge sent…',
    statusSurvived: 'Revealed',
    sunkBannerText: (ship) => `☠ ${ship} DESTROYED!`,
  },
};

export const NAVAL_RANKS = {
  pt: [
    { minWins: 25, code: 'ADM', insignia: '★★★★', title: 'Almirante de Esquadra', tone: 'gold' },
    { minWins: 15, code: 'RADM', insignia: '★★★', title: 'Contra-Almirante', tone: 'cyan' },
    { minWins: 8, code: 'CAPT', insignia: '★★', title: 'Capitão de Mar e Guerra', tone: 'cyan' },
    { minWins: 4, code: 'CDR', insignia: '★', title: 'Capitão de Fragata', tone: 'emerald' },
    { minWins: 1, code: 'LT', insignia: '◆', title: 'Tenente', tone: 'emerald' },
    { minWins: 0, code: 'ENS', insignia: '◇', title: 'Guarda-Marinha', tone: 'neutral' },
  ],
  en: [
    { minWins: 25, code: 'ADM', insignia: '★★★★', title: 'Fleet Admiral', tone: 'gold' },
    { minWins: 15, code: 'RADM', insignia: '★★★', title: 'Rear Admiral', tone: 'cyan' },
    { minWins: 8, code: 'CAPT', insignia: '★★', title: 'Captain', tone: 'cyan' },
    { minWins: 4, code: 'CDR', insignia: '★', title: 'Commander', tone: 'emerald' },
    { minWins: 1, code: 'LT', insignia: '◆', title: 'Lieutenant', tone: 'emerald' },
    { minWins: 0, code: 'ENS', insignia: '◇', title: 'Ensign', tone: 'neutral' },
  ],
};

export function getNavalRank(wins = 0, lang = currentLang) {
  const safeWins = Math.max(0, Number(wins) || 0);
  const table = NAVAL_RANKS[lang] || NAVAL_RANKS.pt;
  const idx = table.findIndex((r) => safeWins >= r.minWins);
  const current = idx >= 0 ? table[idx] : table[table.length - 1];
  const next = idx > 0 ? table[idx - 1] : null;
  return {
    ...current,
    wins: safeWins,
    nextWins: next ? next.minWins : null,
    nextTitle: next ? next.title : null,
    remainingWins: next ? Math.max(0, next.minWins - safeWins) : 0,
  };
}

export function t(key, ...args) {
  const dict = DICTIONARY[currentLang] || DICTIONARY.pt;
  const val = dict[key] ?? DICTIONARY.pt[key] ?? key;
  return typeof val === 'function' ? val(...args) : val;
}

export function useI18n() {
  const { lang, theme } = usePreferences();
  const dict = DICTIONARY[lang] || DICTIONARY.pt;
  const translate = (key, ...args) => {
    const val = dict[key] ?? DICTIONARY.pt[key] ?? key;
    return typeof val === 'function' ? val(...args) : val;
  };
  return {
    lang,
    theme,
    setLang,
    toggleLang,
    setTheme,
    toggleTheme,
    t: translate,
    shipName: (type) => shipNameFor(type, lang),
    rank: (wins) => getNavalRank(wins, lang),
  };
}
