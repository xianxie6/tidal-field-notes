import * as THREE from 'three';

export type QualityLevel = 'high' | 'medium' | 'low';

export interface QualityPreset {
  fishCount: number;
  reefFishCount: number;
  fineParticles: number;
  coarseParticles: number;
  grassCount: number;
  coralCount: number;
  anemoneCount: number;
  urchinCount: number;
  starfishCount: number;
  rockCount: number;
  reefDetailCount: number;
  pebbleCount: number;
  shadowMapSize: number;
  pixelRatio: number;
  lightShafts: number;
}

export const QUALITY_PRESETS: Record<QualityLevel, QualityPreset> = {
  high: {
    fishCount: 260,
    reefFishCount: 54,
    fineParticles: 1900,
    coarseParticles: 420,
    grassCount: 820,
    coralCount: 190,
    anemoneCount: 24,
    urchinCount: 22,
    starfishCount: 18,
    rockCount: 125,
    reefDetailCount: 18000,
    pebbleCount: 420,
    shadowMapSize: 1024,
    pixelRatio: 2,
    lightShafts: 5,
  },
  medium: {
    fishCount: 180,
    reefFishCount: 36,
    fineParticles: 1100,
    coarseParticles: 260,
    grassCount: 440,
    coralCount: 128,
    anemoneCount: 16,
    urchinCount: 14,
    starfishCount: 11,
    rockCount: 96,
    reefDetailCount: 7000,
    pebbleCount: 240,
    shadowMapSize: 512,
    pixelRatio: 1.5,
    lightShafts: 4,
  },
  low: {
    fishCount: 100,
    reefFishCount: 18,
    fineParticles: 520,
    coarseParticles: 120,
    grassCount: 190,
    coralCount: 72,
    anemoneCount: 9,
    urchinCount: 8,
    starfishCount: 6,
    rockCount: 72,
    reefDetailCount: 1800,
    pebbleCount: 110,
    shadowMapSize: 0,
    pixelRatio: 1,
    lightShafts: 2,
  },
};

export const OCEAN = {
  clearColor: new THREE.Color(0x064657),
  fogColor: new THREE.Color(0x0c6170),
  fogDensity: 0.0135,
  waterLight: new THREE.Color(0x86d5d0),
  sunWarmth: new THREE.Color(0xd7c995),
  floorColor: new THREE.Color(0x657b6b),
  rockColor: new THREE.Color(0xb0bdb4),
  causticSpeed: 0.17,
  currentSpeed: 0.22,
  cameraFloatAmplitude: 0.12,
  cameraFloatSpeed: 0.34,
  fishSpeed: 1.35,
  fishAvoidanceRadius: 5.8,
  grassSway: 0.18,
} as const;

export const CANYON = {
  nearZ: 18,
  farZ: -105,
  halfWidth: 9.5,
  floorY: -3.4,
  ceilingY: 22,
} as const;
