import { QUALITY_PRESETS, type QualityLevel, type QualityPreset } from './config';

interface NavigatorWithMemory extends Navigator {
  deviceMemory?: number;
}

const ORDER: QualityLevel[] = ['high', 'medium', 'low'];

export class QualityManager {
  readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  readonly level: QualityLevel;
  readonly preset: QualityPreset;

  private samples: number[] = [];
  private lastSample = performance.now();

  constructor() {
    this.level = this.resolveLevel();
    this.preset = QUALITY_PRESETS[this.level];
  }

  private resolveLevel(): QualityLevel {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get('quality');
    if (requested === 'high' || requested === 'medium' || requested === 'low') {
      return requested;
    }

    const stored = window.localStorage.getItem('tidal-quality');
    if (stored === 'high' || stored === 'medium' || stored === 'low') {
      return stored;
    }

    const memory = (navigator as NavigatorWithMemory).deviceMemory ?? 4;
    const cores = navigator.hardwareConcurrency ?? 4;
    const narrow = window.innerWidth < 760;
    const touchFirst = window.matchMedia('(pointer: coarse)').matches;

    if (this.reducedMotion || narrow || touchFirst || memory <= 4 || cores <= 4) return 'low';
    if (memory >= 8 && cores >= 8) return 'high';
    return 'medium';
  }

  cycle(): QualityLevel {
    const index = ORDER.indexOf(this.level);
    const next = ORDER[(index + 1) % ORDER.length];
    window.localStorage.setItem('tidal-quality', next);
    return next;
  }

  sample(frameDelta: number): void {
    const now = performance.now();
    if (now - this.lastSample < 250) return;
    this.lastSample = now;
    this.samples.push(1 / Math.max(frameDelta, 0.001));
    if (this.samples.length > 48) this.samples.shift();
  }

  getAverageFps(): number | null {
    if (this.samples.length < 8) return null;
    return this.samples.reduce((sum, value) => sum + value, 0) / this.samples.length;
  }
}
