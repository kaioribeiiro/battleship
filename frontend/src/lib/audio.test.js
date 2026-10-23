import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_BGM_VOLUME,
  setMuted,
  getBgmState,
  setBgmMuted,
  setBgmVolume,
  toggleBgm,
  initBgm,
  sounds,
  playShot,
} from './audio.js';

describe('audio lib', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('SFX mute', () => {
    it('permite alternar mudo dos efeitos e persiste', () => {
      setMuted(true);
      expect(localStorage.getItem('bn.muted')).toBe('1');
      setMuted(false);
      expect(localStorage.getItem('bn.muted')).toBe('0');
    });
  });

  describe('BGM soundtrack controls', () => {
    it('retorna estado padrão do BGM com volume inicial de 10% (0.1)', () => {
      expect(DEFAULT_BGM_VOLUME).toBe(0.1);
      const state = getBgmState();
      expect(state).toHaveProperty('muted');
      expect(state).toHaveProperty('volume', 0.1);
    });

    it('permite mutar e desmutar o BGM e persiste no localStorage', () => {
      setBgmMuted(true);
      expect(getBgmState().muted).toBe(true);
      expect(localStorage.getItem('bn.bgm.muted')).toBe('1');

      setBgmMuted(false);
      expect(getBgmState().muted).toBe(false);
      expect(localStorage.getItem('bn.bgm.muted')).toBe('0');
    });

    it('toggleBgm inverte o estado de mudo', () => {
      setBgmMuted(false);
      toggleBgm();
      expect(getBgmState().muted).toBe(true);
      toggleBgm();
      expect(getBgmState().muted).toBe(false);
    });

    it('ajusta e limita o volume entre 0 e 1', () => {
      setBgmVolume(0.5);
      expect(getBgmState().volume).toBe(0.5);
      expect(localStorage.getItem('bn.bgm.volume')).toBe('0.5');

      setBgmVolume(1.8);
      expect(getBgmState().volume).toBe(1);

      setBgmVolume(-0.5);
      expect(getBgmState().volume).toBe(0);

      setBgmVolume(0.1);
    });

    it('initBgm executa sem erros mesmo em ambiente de teste', () => {
      expect(() => initBgm()).not.toThrow();
    });
  });

  describe('disparos e efeitos', () => {
    it('playShot chama sem erros para MISS, HIT e SUNK', () => {
      expect(() => playShot('MISS')).not.toThrow();
      expect(() => playShot('HIT')).not.toThrow();
      expect(() => playShot('SUNK')).not.toThrow();
    });

    it('funções em sounds executam com segurança sem WebAudio real', () => {
      expect(() => sounds.ping()).not.toThrow();
      expect(() => sounds.splash()).not.toThrow();
      expect(() => sounds.hit()).not.toThrow();
      expect(() => sounds.sunk()).not.toThrow();
      expect(() => sounds.alert()).not.toThrow();
      expect(() => sounds.win()).not.toThrow();
      expect(() => sounds.lose()).not.toThrow();
    });
  });
});
