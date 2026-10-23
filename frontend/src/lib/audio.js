import { useSyncExternalStore } from 'react';

const MUTE_KEY = 'bn.muted';
const listeners = new Set();
let muted = false;
let ctx = null;

try {
  muted = localStorage.getItem(MUTE_KEY) === '1';
} catch {
  muted = false;
}

export function setMuted(next) {
  muted = next;
  try {
    localStorage.setItem(MUTE_KEY, next ? '1' : '0');
  } catch {
    /* ignora */
  }
  listeners.forEach((l) => l());
}

export const useMuted = () =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => muted,
    () => false,
  );

// BGM
const BGM_SRC = '/background-audio.mpeg';
const BGM_MUTE_KEY = 'bn.bgm.muted';
const BGM_VOLUME_KEY = 'bn.bgm.volume';
export const DEFAULT_BGM_VOLUME = 0.1;

const bgmListeners = new Set();
let bgmMuted = false;
let bgmVolume = DEFAULT_BGM_VOLUME;
let bgmAudio = null;
let unlockAttached = false;

try {
  bgmMuted = localStorage.getItem(BGM_MUTE_KEY) === '1';
  const savedVol = localStorage.getItem(BGM_VOLUME_KEY);
  if (savedVol !== null) {
    const parsed = parseFloat(savedVol);
    if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 1) {
      bgmVolume = parsed;
    }
  }
} catch {
  bgmMuted = false;
  bgmVolume = DEFAULT_BGM_VOLUME;
}

let bgmSnapshot = {
  muted: bgmMuted,
  volume: bgmVolume,
  playing: false,
};

function updateBgmSnapshot() {
  const isPlaying = bgmAudio ? !bgmAudio.paused : false;
  if (
    bgmSnapshot.muted !== bgmMuted ||
    bgmSnapshot.volume !== bgmVolume ||
    bgmSnapshot.playing !== isPlaying
  ) {
    bgmSnapshot = {
      muted: bgmMuted,
      volume: bgmVolume,
      playing: isPlaying,
    };
  }
  return bgmSnapshot;
}

function notifyBgm() {
  updateBgmSnapshot();
  bgmListeners.forEach((l) => l());
}

export function getBgmState() {
  return updateBgmSnapshot();
}

const SERVER_SNAPSHOT = { muted: false, volume: DEFAULT_BGM_VOLUME, playing: false };

export const useBgm = () =>
  useSyncExternalStore(
    (cb) => {
      bgmListeners.add(cb);
      return () => bgmListeners.delete(cb);
    },
    getBgmState,
    () => SERVER_SNAPSHOT,
  );

function getBgmAudio() {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
  if (!bgmAudio) {
    try {
      bgmAudio = new Audio(BGM_SRC);
      bgmAudio.loop = true;
      bgmAudio.preload = 'auto';
      bgmAudio.volume = bgmMuted ? 0 : bgmVolume;
      bgmAudio.addEventListener('play', notifyBgm);
      bgmAudio.addEventListener('pause', notifyBgm);
      bgmAudio.addEventListener('ended', notifyBgm);
    } catch {
      bgmAudio = null;
    }
  }
  return bgmAudio;
}

function safePlay(audioEl, onRejected) {
  if (!audioEl) return;
  try {
    const res = audioEl.play();
    if (res && typeof res.catch === 'function') {
      res.catch(() => {
        if (onRejected) onRejected();
      });
    }
  } catch {
    if (onRejected) onRejected();
  }
}

function attachGestureUnlock() {
  if (unlockAttached || typeof window === 'undefined') return;
  unlockAttached = true;

  const unlock = () => {
    if (!bgmMuted) {
      const a = getBgmAudio();
      if (a && a.paused) {
        a.volume = bgmVolume;
        safePlay(a);
      }
    }
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('touchstart', unlock);
    window.removeEventListener('keydown', unlock);
    window.removeEventListener('click', unlock);
    unlockAttached = false;
  };

  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('touchstart', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
  window.addEventListener('click', unlock, { once: true });
}

export function initBgm() {
  const a = getBgmAudio();
  if (!a) return;
  if (!bgmMuted && a.paused) {
    a.volume = bgmVolume;
    safePlay(a, () => attachGestureUnlock());
  }
}

export function setBgmMuted(next) {
  bgmMuted = Boolean(next);
  try {
    localStorage.setItem(BGM_MUTE_KEY, bgmMuted ? '1' : '0');
  } catch {
    /* ignora */
  }
  const a = getBgmAudio();
  if (a) {
    if (bgmMuted) {
      try {
        a.pause();
      } catch {
        /* ignora */
      }
    } else {
      a.volume = bgmVolume;
      safePlay(a, () => attachGestureUnlock());
    }
  }
  notifyBgm();
}

export function toggleBgm() {
  setBgmMuted(!bgmMuted);
}

export function setBgmVolume(nextVol) {
  const clamped = Math.max(0, Math.min(1, Number(nextVol) || 0));
  bgmVolume = clamped;
  try {
    localStorage.setItem(BGM_VOLUME_KEY, String(clamped));
  } catch {
    /* ignora */
  }
  const a = getBgmAudio();
  if (a && !bgmMuted) {
    a.volume = clamped;
  }
  notifyBgm();
}

function audio() {
  if (muted || typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx ||= new Ctor();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(c, { freq, to = freq, type = 'sine', dur = 0.15, gain = 0.15, delay = 0 }) {
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const amp = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t0 + dur);
  amp.gain.setValueAtTime(gain, t0);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(amp).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(c, { dur = 0.3, gain = 0.2, cutoff = 800, type = 'lowpass', delay = 0 }) {
  const t0 = c.currentTime + delay;
  const frames = Math.floor(c.sampleRate * dur);
  const buffer = c.createBuffer(1, frames, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  const filter = c.createBiquadFilter();
  const amp = c.createGain();
  src.buffer = buffer;
  filter.type = type;
  filter.frequency.value = cutoff;
  amp.gain.setValueAtTime(gain, t0);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(amp).connect(c.destination);
  src.start(t0);
}

export const sounds = {
  ping() {
    const c = audio();
    if (c) tone(c, { freq: 1180, to: 1100, dur: 0.35, gain: 0.08 });
  },
  splash() {
    const c = audio();
    if (c) noise(c, { dur: 0.28, gain: 0.16, cutoff: 1800, type: 'bandpass' });
  },
  hit() {
    const c = audio();
    if (!c) return;
    tone(c, { freq: 140, to: 40, type: 'triangle', dur: 0.3, gain: 0.35 });
    noise(c, { dur: 0.25, gain: 0.22, cutoff: 500 });
  },
  sunk() {
    const c = audio();
    if (!c) return;
    tone(c, { freq: 120, to: 30, type: 'triangle', dur: 0.5, gain: 0.4 });
    noise(c, { dur: 0.5, gain: 0.28, cutoff: 400 });
    tone(c, { freq: 420, to: 220, type: 'sawtooth', dur: 0.4, gain: 0.07, delay: 0.15 });
  },
  alert() {
    const c = audio();
    if (!c) return;
    tone(c, { freq: 880, dur: 0.12, gain: 0.1 });
    tone(c, { freq: 1175, dur: 0.18, gain: 0.1, delay: 0.14 });
  },
  win() {
    const c = audio();
    if (!c) return;
    [523, 659, 784, 1047].forEach((freq, i) =>
      tone(c, { freq, type: 'triangle', dur: 0.3, gain: 0.12, delay: i * 0.14 }),
    );
  },
  lose() {
    const c = audio();
    if (!c) return;
    [392, 330, 262, 196].forEach((freq, i) =>
      tone(c, { freq, type: 'triangle', dur: 0.35, gain: 0.12, delay: i * 0.18 }),
    );
  },
};

/** Toca o som correspondente ao resultado de um disparo. */
export function playShot(result) {
  if (result === 'SUNK') sounds.sunk();
  else if (result === 'HIT') sounds.hit();
  else sounds.splash();
}
