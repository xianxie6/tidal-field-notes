import * as THREE from 'three';
import type { QualityPreset } from '../core/config';
import { createRandom, range } from '../utils/random';

interface ParticleLayer {
  points: THREE.Points;
  material: THREE.ShaderMaterial;
}

export class ParticleSystem {
  readonly group = new THREE.Group();
  private readonly layers: ParticleLayer[] = [];
  private readonly speedScale: number;

  constructor(scene: THREE.Scene, preset: QualityPreset, reducedMotion: boolean) {
    this.speedScale = reducedMotion ? 0.2 : 1;
    this.group.name = 'plankton-layers';
    scene.add(this.group);
    this.layers.push(this.createLayer(preset.fineParticles, 0.7, 0.09, 0.23, 1401));
    this.layers.push(this.createLayer(preset.coarseParticles, 1.9, 0.18, 0.42, 9201));
    this.layers.push(this.createBubbleLayer(Math.max(14, Math.round(preset.coarseParticles * 0.1))));
  }

  private createBubbleLayer(count: number): ParticleLayer {
    const random = createRandom(4409);
    const positions = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    const sizes = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = range(random, -12, 12);
      positions[i * 3 + 1] = range(random, -4, 17);
      positions[i * 3 + 2] = range(random, -72, 10);
      phases[i] = random() * Math.PI * 2;
      sizes[i] = range(random, 5.5, 13.5);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    const material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      }]),
      vertexShader: `
        uniform float uTime;
        uniform float uPixelRatio;
        attribute float aPhase;
        attribute float aSize;
        varying float vShimmer;
        #include <fog_pars_vertex>
        void main() {
          vec3 moved = position;
          moved.y = -4.0 + mod(position.y + 4.0 + uTime * (0.22 + fract(aPhase) * 0.16), 21.0);
          moved.x += sin(uTime * 0.42 + aPhase + moved.y * 0.28) * 0.28;
          moved.z += cos(uTime * 0.29 + aPhase * 1.7) * 0.12;
          vec4 mvPosition = modelViewMatrix * vec4(moved, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = clamp(aSize * uPixelRatio * (18.0 / max(2.0, -mvPosition.z)), 1.2, 22.0);
          vShimmer = 0.78 + sin(uTime * 0.8 + aPhase) * 0.22;
          #include <fog_vertex>
        }
      `,
      fragmentShader: `
        varying float vShimmer;
        #include <fog_pars_fragment>
        void main() {
          vec2 p = gl_PointCoord - 0.5;
          float distanceToCenter = length(p);
          float ring = smoothstep(0.5, 0.42, distanceToCenter) * (1.0 - smoothstep(0.31, 0.39, distanceToCenter));
          float highlight = smoothstep(0.17, 0.03, length(p - vec2(-0.16, 0.15)));
          float body = smoothstep(0.48, 0.16, distanceToCenter) * 0.055;
          float alpha = (ring * 0.48 + highlight * 0.78 + body) * vShimmer;
          gl_FragColor = vec4(0.69, 0.96, 0.98, alpha);
          #include <fog_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: true,
    });
    const points = new THREE.Points(geometry, material);
    points.name = 'rising-micro-bubbles';
    points.frustumCulled = false;
    this.group.add(points);
    return { points, material };
  }

  private createLayer(count: number, size: number, speed: number, opacity: number, seed: number): ParticleLayer {
    const random = createRandom(seed);
    const positions = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = range(random, -22, 22);
      positions[i * 3 + 1] = range(random, -5, 18);
      positions[i * 3 + 2] = range(random, -105, 18);
      phases[i] = random() * Math.PI * 2;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    const material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uTime: { value: 0 },
        uSize: { value: size },
        uSpeed: { value: speed },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uOpacity: { value: opacity },
      }]),
      vertexShader: `
        uniform float uTime;
        uniform float uSize;
        uniform float uSpeed;
        uniform float uPixelRatio;
        attribute float aPhase;
        varying float vPulse;
        #include <fog_pars_vertex>
        void main() {
          vec3 moved = position;
          moved.y += sin(uTime * uSpeed + aPhase) * 0.8;
          moved.x += sin(uTime * uSpeed * 0.61 + aPhase * 1.7) * 0.35;
          vec4 mvPosition = modelViewMatrix * vec4(moved, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = clamp(uSize * uPixelRatio * (42.0 / max(2.0, -mvPosition.z)), 0.7, 12.0);
          vPulse = 0.72 + sin(uTime * 0.45 + aPhase) * 0.28;
          #include <fog_vertex>
        }
      `,
      fragmentShader: `
        uniform float uOpacity;
        varying float vPulse;
        #include <fog_pars_fragment>
        void main() {
          vec2 center = gl_PointCoord - 0.5;
          float d = length(center);
          float alpha = smoothstep(0.5, 0.08, d) * uOpacity * vPulse;
          gl_FragColor = vec4(0.72, 0.88, 0.82, alpha);
          #include <fog_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      fog: true,
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    this.group.add(points);
    return { points, material };
  }

  update(time: number): void {
    for (const layer of this.layers) layer.material.uniforms.uTime.value = time * this.speedScale;
  }

  resize(pixelRatio: number): void {
    for (const layer of this.layers) layer.material.uniforms.uPixelRatio.value = pixelRatio;
  }
}
