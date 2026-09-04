import * as THREE from 'three';
import type { QualityLevel, QualityPreset } from '../core/config';
import { createRandom, range } from '../utils/random';

interface AnimatedShader {
  uniforms: Record<string, { value: number }>;
}

interface ReefGrid {
  geometry: THREE.BufferGeometry;
  positions: Float32Array;
  normals: Float32Array;
  coverage: Float32Array;
  lengthSegments: number;
  crossSegments: number;
}

interface ReefProfile {
  side: -1 | 1;
  nearZ: number;
  farZ: number;
  center: number;
  radiusX: number;
  radiusY: number;
  phase: number;
  shelfAt: number;
  thetaEnd: number;
}

const TURF_COUNTS: Record<QualityLevel, number> = {
  high: 52000,
  medium: 24000,
  low: 7000,
};

const MID_TURF_COUNTS: Record<QualityLevel, number> = {
  high: 20000,
  medium: 9000,
  low: 2500,
};

/**
 * A single art-directed foreground reef shoulder. Its algae shell and turf
 * share one displaced surface, so the micro growth inherits the real surface
 * position and normal instead of hovering around an approximate rock volume.
 */
export class ReefSurfaceSystem {
  readonly group = new THREE.Group();

  private readonly turfShaders: AnimatedShader[] = [];
  private readonly motionScale: number;

  constructor(parent: THREE.Group, preset: QualityPreset, quality: QualityLevel, motionScale: number) {
    this.motionScale = motionScale;
    this.group.name = 'living-foreground-reef';
    parent.add(this.group);

    const lengthSegments = quality === 'low' ? 46 : 72;
    const crossSegments = quality === 'low' ? 14 : 22;
    const left = this.createReefGrid(lengthSegments, crossSegments, {
      side: -1,
      nearZ: 15.5,
      farZ: -35.5,
      center: 11.45,
      radiusX: 4.45,
      radiusY: 5.7,
      phase: 0,
      shelfAt: 0.2,
      thetaEnd: 1.52,
    });
    this.addReefShell(left, preset, 'foreground-left');
    this.addTurf(left, TURF_COUNTS[quality], 'foreground-left');
    this.addEncrustingColonies(
      left,
      quality === 'high' ? 1900 : quality === 'medium' ? 900 : 280,
      'foreground-left',
    );

    const right = this.createReefGrid(lengthSegments, crossSegments, {
      side: 1,
      nearZ: 22,
      farZ: -76,
      center: 15.25,
      radiusX: 4.72,
      radiusY: 5.35,
      phase: 2.37,
      shelfAt: 0.34,
      thetaEnd: 1.24,
    });
    this.addReefShell(right, preset, 'midground-right');
    this.addTurf(right, MID_TURF_COUNTS[quality], 'midground-right');
    this.addEncrustingColonies(
      right,
      quality === 'high' ? 1250 : quality === 'medium' ? 560 : 160,
      'midground-right',
    );
  }

  update(time: number): void {
    for (const shader of this.turfShaders) shader.uniforms.uTime.value = time * this.motionScale;
  }

  private createReefGrid(lengthSegments: number, crossSegments: number, profile: ReefProfile): ReefGrid {
    const vertexCount = (lengthSegments + 1) * (crossSegments + 1);
    const positions = new Float32Array(vertexCount * 3);
    const coverage = new Float32Array(vertexCount);
    const uv = new Float32Array(vertexCount * 2);
    const indices: number[] = [];

    for (let i = 0; i <= lengthSegments; i += 1) {
      const u = i / lengthSegments;
      const zBase = profile.nearZ + (profile.farZ - profile.nearZ) * u;
      const centerX = profile.side * (
        profile.center + Math.sin(u * Math.PI * 1.55 + profile.phase) * 0.72 + u * 0.42
      );
      const radiusX = profile.radiusX
        + Math.sin(u * 10.7 + 0.4 + profile.phase) * 0.52
        + Math.sin(u * 3.2 + profile.phase * 0.4) * 0.55;
      const radiusY = profile.radiusY + Math.sin(u * 7.1 + 1.2 + profile.phase) * 0.62;

      for (let j = 0; j <= crossSegments; j += 1) {
        const v = j / crossSegments;
        const theta = -0.24 + v * (profile.thetaEnd + 0.24);
        const broad = Math.sin(u * 18.3 + v * 6.7 + profile.phase) * 0.24
          + Math.sin(u * 7.7 - v * 13.1 - profile.phase * 0.7) * 0.19;
        const fine = Math.sin(u * 51.0 + v * 29.0 + profile.phase * 2.0) * 0.08;
        const shelf = Math.exp(-Math.pow((u - profile.shelfAt) * 7.2, 2)) * Math.sin(v * Math.PI) * 0.7;
        const radiusNoise = broad + fine + shelf;
        const index = i * (crossSegments + 1) + j;
        const p = index * 3;

        positions[p] = centerX - profile.side * Math.cos(theta) * (radiusX + radiusNoise);
        positions[p + 1] = -2.42 + Math.sin(theta) * (radiusY + radiusNoise * 0.72);
        positions[p + 2] = zBase + Math.sin(v * 8.4 + u * 12.0) * 0.22 + broad * 0.38;

        const upness = Math.sin(theta);
        const patch = Math.sin(u * 23.0 + Math.sin(v * 12.0) * 1.7 + profile.phase) * 0.28
          + Math.sin(u * 8.0 - v * 17.0 - profile.phase) * 0.2;
        const tongue = Math.sin(u * 4.8 + v * 9.0 + profile.phase * 0.6) * 0.18;
        const mossSignal = upness + patch + tongue - 0.12;
        coverage[index] = THREE.MathUtils.smoothstep(mossSignal, 0.02, 0.62);
        uv[index * 2] = u * 11;
        uv[index * 2 + 1] = v * 3.2;
      }
    }

    for (let i = 0; i < lengthSegments; i += 1) {
      for (let j = 0; j < crossSegments; j += 1) {
        const a = i * (crossSegments + 1) + j;
        const b = (i + 1) * (crossSegments + 1) + j;
        const c = b + 1;
        const d = a + 1;
        if (profile.side < 0) indices.push(a, b, d, b, c, d);
        else indices.push(a, d, b, b, d, c);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geometry.setAttribute('reefCoverage', new THREE.BufferAttribute(coverage, 1));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();

    return {
      geometry,
      positions,
      normals: geometry.getAttribute('normal').array as Float32Array,
      coverage,
      lengthSegments,
      crossSegments,
    };
  }

  private addReefShell(grid: ReefGrid, preset: QualityPreset, label: string): void {
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.9,
      metalness: 0,
      envMapIntensity: 0.42,
      side: THREE.DoubleSide,
    });
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute float reefCoverage;\nvarying float vReefCoverage;\nvarying vec3 vReefWorld;',
        )
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvReefCoverage = reefCoverage;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvReefWorld = worldPosition.xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying float vReefCoverage;
          varying vec3 vReefWorld;
          float reefHash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
          }
          float reefNoise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(reefHash(i), reefHash(i + vec2(1.0, 0.0)), f.x),
                       mix(reefHash(i + vec2(0.0, 1.0)), reefHash(i + vec2(1.0)), f.x), f.y);
          }`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          vec2 reefDomain = vec2(vReefWorld.z * 0.42, vReefWorld.y * 0.72 + vReefWorld.x * 0.16);
          float broad = reefNoise(reefDomain * 0.42);
          float grain = reefNoise(reefDomain * 2.9 + 11.0);
          float cracks = smoothstep(0.69, 0.86, abs(sin(reefDomain.x * 7.0 + reefNoise(reefDomain) * 3.5)));
          float cover = clamp(vReefCoverage + (broad - 0.5) * 0.28, 0.0, 1.0);
          vec3 bareDark = vec3(0.085, 0.14, 0.135);
          vec3 bareLight = vec3(0.27, 0.37, 0.33);
          vec3 bare = mix(bareDark, bareLight, grain * 0.72 + 0.18);
          bare *= 1.0 - cracks * 0.24;
          vec3 algaeDeep = vec3(0.055, 0.14, 0.09);
          vec3 algaeLit = vec3(0.2, 0.38, 0.21);
          vec3 algae = mix(algaeDeep, algaeLit, broad * 0.62 + grain * 0.22);
          float transition = smoothstep(0.08, 0.34, cover) * (1.0 - smoothstep(0.36, 0.74, cover));
          diffuseColor.rgb = mix(bare, algae, smoothstep(0.16, 0.68, cover));
          diffuseColor.rgb *= 1.0 - transition * 0.33;`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          '#include <roughnessmap_fragment>\nroughnessFactor *= mix(0.98, 0.76, smoothstep(0.2, 0.8, vReefCoverage));',
        );
    };
    material.customProgramCacheKey = () => 'living-reef-shell-v1';

    const shell = new THREE.Mesh(grid.geometry, material);
    shell.name = `art-directed-reef-shell-${label}`;
    shell.castShadow = preset.shadowMapSize > 0;
    shell.receiveShadow = true;
    this.group.add(shell);
  }

  private addTurf(grid: ReefGrid, count: number, label: string): void {
    const random = createRandom(9097);
    const isMidground = label === 'midground-right';
    const cellCount = grid.lengthSegments * grid.crossSegments;
    const cdf = new Float64Array(cellCount);
    let total = 0;
    const p0 = new THREE.Vector3();
    const p1 = new THREE.Vector3();
    const p2 = new THREE.Vector3();
    const edgeA = new THREE.Vector3();
    const edgeB = new THREE.Vector3();

    for (let i = 0; i < grid.lengthSegments; i += 1) {
      for (let j = 0; j < grid.crossSegments; j += 1) {
        const cell = i * grid.crossSegments + j;
        const a = i * (grid.crossSegments + 1) + j;
        const b = (i + 1) * (grid.crossSegments + 1) + j;
        const d = a + 1;
        p0.fromArray(grid.positions, a * 3);
        p1.fromArray(grid.positions, b * 3);
        p2.fromArray(grid.positions, d * 3);
        const area = edgeA.subVectors(p1, p0).cross(edgeB.subVectors(p2, p0)).length();
        const cover = (grid.coverage[a] + grid.coverage[b] + grid.coverage[d]) / 3;
        total += area * Math.pow(cover, 2.2);
        cdf[cell] = total;
      }
    }

    const offsets = new Float32Array(count * 3);
    const normals = new Float32Array(count * 3);
    const seeds = new Float32Array(count * 4);
    for (let instance = 0; instance < count; instance += 1) {
      const target = random() * total;
      let low = 0;
      let high = cellCount - 1;
      while (low < high) {
        const middle = (low + high) >> 1;
        if (cdf[middle] < target) low = middle + 1;
        else high = middle;
      }
      const i = Math.floor(low / grid.crossSegments);
      const j = low - i * grid.crossSegments;
      const a = i * (grid.crossSegments + 1) + j;
      const b = (i + 1) * (grid.crossSegments + 1) + j;
      const c = b + 1;
      const d = a + 1;
      const u = random();
      const v = random();
      const weights = [(1 - u) * (1 - v), u * (1 - v), u * v, (1 - u) * v];
      const vertices = [a, b, c, d];
      let px = 0;
      let py = 0;
      let pz = 0;
      let nx = 0;
      let ny = 0;
      let nz = 0;
      for (let k = 0; k < 4; k += 1) {
        const vertex = vertices[k];
        const weight = weights[k];
        px += grid.positions[vertex * 3] * weight;
        py += grid.positions[vertex * 3 + 1] * weight;
        pz += grid.positions[vertex * 3 + 2] * weight;
        nx += grid.normals[vertex * 3] * weight;
        ny += grid.normals[vertex * 3 + 1] * weight;
        nz += grid.normals[vertex * 3 + 2] * weight;
      }
      const inverseNormal = 1 / Math.max(Math.hypot(nx, ny, nz), 0.0001);
      const offsetIndex = instance * 3;
      offsets[offsetIndex] = px + nx * inverseNormal * 0.018;
      offsets[offsetIndex + 1] = py + ny * inverseNormal * 0.018;
      offsets[offsetIndex + 2] = pz + nz * inverseNormal * 0.018;
      normals[offsetIndex] = nx * inverseNormal;
      normals[offsetIndex + 1] = ny * inverseNormal;
      normals[offsetIndex + 2] = nz * inverseNormal;
      const seedIndex = instance * 4;
      seeds[seedIndex] = random() * Math.PI * 2;
      const stray = random() < 0.055 ? range(random, 1.5, 2.15) : 1;
      seeds[seedIndex + 1] = range(
        random,
        isMidground ? 0.1 : 0.16,
        isMidground ? 0.29 : 0.43,
      ) * stray;
      seeds[seedIndex + 2] = range(random, -0.85, 0.85);
      seeds[seedIndex + 3] = random();
    }

    const blade = this.createBladeGeometry();
    blade.setAttribute('offset', new THREE.InstancedBufferAttribute(offsets, 3));
    blade.setAttribute('surfaceNormal', new THREE.InstancedBufferAttribute(normals, 3));
    blade.setAttribute('seed', new THREE.InstancedBufferAttribute(seeds, 4));
    blade.instanceCount = count;

    const material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uTime: { value: 0 },
          uCurrent: { value: 0.7 },
        },
      ]),
      vertexShader: `
        attribute vec3 offset;
        attribute vec3 surfaceNormal;
        attribute vec4 seed;
        uniform float uTime;
        uniform float uCurrent;
        varying float vHeight;
        varying float vTone;
        varying vec3 vNormal;
        varying vec2 vBladeUv;
        #include <fog_pars_vertex>
        void main() {
          float t = uv.y;
          vec3 reference = abs(surfaceNormal.y) < 0.94 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
          vec3 tangent = normalize(cross(surfaceNormal, reference));
          vec3 bitangent = cross(surfaceNormal, tangent);
          float cs = cos(seed.x);
          float sn = sin(seed.x);
          vec3 widthDirection = tangent * cs + bitangent * sn;
          vec3 leanDirection = tangent * -sn + bitangent * cs;
          float bend = t * t;
          float phase = offset.x * 0.71 + offset.y * 0.39 + offset.z * 0.23 + seed.x;
          float flow = sin(uTime * 0.64 + phase) * 0.72 + sin(uTime * 1.23 + phase * 1.8) * 0.28;
          vec3 world = offset
            + surfaceNormal * (t * seed.y)
            + widthDirection * (position.x * seed.y * 0.32)
            + leanDirection * seed.z * seed.y * 0.3 * bend
            + vec3(flow, flow * 0.15, flow * 0.42) * seed.y * bend * 0.18 * uCurrent;
          vHeight = t;
          vTone = seed.w;
          vBladeUv = uv;
          vNormal = normalize(mix(surfaceNormal, surfaceNormal + leanDirection * seed.z, 0.28));
          vec4 mvPosition = modelViewMatrix * vec4(world, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: `
        varying float vHeight;
        varying float vTone;
        varying vec3 vNormal;
        varying vec2 vBladeUv;
        #include <fog_pars_fragment>
        void main() {
          vec3 normal = gl_FrontFacing ? normalize(vNormal) : -normalize(vNormal);
          vec3 key = normalize(vec3(-0.28, 0.9, 0.32));
          float topLight = max(dot(normal, key), 0.0);
          float sky = normal.y * 0.5 + 0.5;
          vec3 deep = vec3(0.025, 0.085, 0.052);
          vec3 mid = vec3(0.055, 0.165, 0.085);
          vec3 tip = vec3(0.12, 0.3, 0.125);
          vec3 color = mix(deep, mid, smoothstep(0.05, 0.68, vHeight));
          color = mix(color, tip, smoothstep(0.58, 1.0, vHeight) * (0.35 + vTone * 0.65));
          color *= 0.68 + vTone * 0.48;
          color *= 0.52 + topLight * 0.88 + sky * 0.2;
          float midrib = 1.0 - smoothstep(0.025, 0.095, abs(vBladeUv.x - 0.5));
          float fineVein = pow(abs(sin(vBladeUv.y * 34.0 + vTone * 8.0)), 15.0);
          float edgeShade = smoothstep(0.34, 0.5, abs(vBladeUv.x - 0.5));
          color += vec3(0.035, 0.085, 0.04) * midrib * (0.25 + vHeight * 0.35);
          color *= 1.0 - edgeShade * 0.13;
          color += vec3(0.018, 0.045, 0.02) * fineVein * 0.16;
          color += vec3(0.09, 0.15, 0.075) * topLight * smoothstep(0.72, 1.0, vHeight) * 0.28;
          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }
      `,
      side: THREE.DoubleSide,
      fog: true,
    });
    this.turfShaders.push(material as AnimatedShader);
    const turf = new THREE.Mesh(blade, material);
    turf.name = `surface-bound-short-algae-${label}`;
    turf.frustumCulled = false;
    this.group.add(turf);
  }

  private createBladeGeometry(): THREE.InstancedBufferGeometry {
    const positions: number[] = [];
    const uv: number[] = [];
    const indices: number[] = [];
    const segments = 5;
    for (let i = 0; i <= segments; i += 1) {
      const t = i / segments;
      const width = 0.5 * (1 - Math.pow(t, 1.52)) * (0.92 + Math.sin(t * Math.PI) * 0.08);
      const curve = Math.sin(t * Math.PI) * 0.045;
      positions.push(-width, t, curve, width, t, curve);
      uv.push(0, t, 1, t);
    }
    for (let i = 0; i < segments; i += 1) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    return geometry;
  }

  private addEncrustingColonies(grid: ReefGrid, count: number, label: string): void {
    const random = createRandom(1141);
    const geometry = new THREE.IcosahedronGeometry(0.11, 1);
    const material = new THREE.MeshStandardMaterial({
      color: 0xd0b888,
      roughness: 0.72,
      metalness: 0,
      envMapIntensity: 0.55,
    });
    const colonies = new THREE.InstancedMesh(geometry, material, count);
    colonies.name = `encrusting-sponge-colonies-${label}`;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const scale = new THREE.Vector3();
    const color = new THREE.Color();
    for (let i = 0; i < count; i += 1) {
      let vertex = 0;
      for (let attempt = 0; attempt < 12; attempt += 1) {
        vertex = Math.floor(random() * grid.coverage.length);
        if (grid.coverage[vertex] > 0.48 && random() < grid.coverage[vertex]) break;
      }
      position.fromArray(grid.positions, vertex * 3);
      normal.fromArray(grid.normals, vertex * 3).normalize();
      position.addScaledVector(normal, 0.045);
      quaternion.setFromUnitVectors(up, normal);
      quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(up, random() * Math.PI * 2));
      const size = range(random, 0.22, 0.82);
      scale.set(size * range(random, 0.65, 1.4), size * range(random, 0.18, 0.48), size * range(random, 0.65, 1.4));
      matrix.compose(position, quaternion, scale);
      colonies.setMatrixAt(i, matrix);
      if (random() > 0.82) color.setHSL(range(random, 0.055, 0.105), 0.34, range(random, 0.38, 0.52));
      else color.setHSL(range(random, 0.28, 0.39), range(random, 0.18, 0.34), range(random, 0.22, 0.38));
      colonies.setColorAt(i, color);
    }
    colonies.instanceMatrix.needsUpdate = true;
    colonies.instanceColor!.needsUpdate = true;
    colonies.castShadow = false;
    colonies.receiveShadow = true;
    colonies.frustumCulled = false;
    this.group.add(colonies);
  }
}
