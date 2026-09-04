import * as THREE from 'three';
import type { QualityPreset } from '../core/config';
import { createRandom, range } from '../utils/random';

type JellyKind = 'rose' | 'moon';

interface Jellyfish {
  root: THREE.Group;
  bell: THREE.Group;
  appendages: THREE.Group;
  origin: THREE.Vector3;
  phase: number;
  drift: number;
  kind: JellyKind;
}

interface AnimatedMaterial extends THREE.Material {
  userData: {
    shader?: { uniforms: Record<string, { value: number }> };
  };
}

/** Two restrained, translucent species inspired by sea nettles and moon jellies. */
export class JellyfishSystem {
  readonly group = new THREE.Group();

  private readonly jellyfish: Jellyfish[] = [];
  private readonly animatedMaterials: AnimatedMaterial[] = [];
  private readonly motionScale: number;

  constructor(scene: THREE.Scene, preset: QualityPreset, reducedMotion: boolean) {
    this.motionScale = reducedMotion ? 0.24 : 1;
    this.group.name = 'translucent-jellyfish-drift';
    scene.add(this.group);

    const count = preset.reefFishCount >= 50 ? 6 : preset.reefFishCount >= 30 ? 4 : 2;
    const placements = [
      { kind: 'rose' as const, position: new THREE.Vector3(-5.8, 7.1, -8.5), scale: 1.08 },
      { kind: 'moon' as const, position: new THREE.Vector3(5.2, 8.5, -14), scale: 0.96 },
      { kind: 'rose' as const, position: new THREE.Vector3(6.9, 5.5, -29), scale: 0.72 },
      { kind: 'moon' as const, position: new THREE.Vector3(-6.6, 9.4, -39), scale: 0.82 },
      { kind: 'rose' as const, position: new THREE.Vector3(3.2, 10.8, -57), scale: 0.68 },
      { kind: 'moon' as const, position: new THREE.Vector3(-3.7, 6.7, -69), scale: 0.76 },
    ];
    const random = createRandom(2409);
    for (let index = 0; index < count; index += 1) {
      const placement = placements[index];
      this.addJellyfish(
        placement.kind,
        placement.position,
        placement.scale * range(random, 0.92, 1.08),
        random() * Math.PI * 2,
      );
    }
  }

  update(time: number): void {
    const scaledTime = time * this.motionScale;
    for (const material of this.animatedMaterials) {
      const shader = material.userData.shader;
      if (shader) shader.uniforms.uJellyTime.value = scaledTime;
    }

    for (const jelly of this.jellyfish) {
      const localTime = scaledTime * jelly.drift + jelly.phase;
      const pulseWave = 0.5 + 0.5 * Math.sin(localTime * 1.45);
      const contraction = Math.pow(pulseWave, 2.6);
      jelly.root.position.set(
        jelly.origin.x + Math.sin(localTime * 0.43) * 0.55,
        jelly.origin.y + Math.sin(localTime * 0.31 + 0.8) * 0.48 + scaledTime * 0.035,
        jelly.origin.z + Math.cos(localTime * 0.37) * 0.34,
      );
      if (jelly.root.position.y > 13.5) {
        jelly.origin.y -= 8;
        jelly.root.position.y -= 8;
      }
      jelly.root.rotation.y = Math.sin(localTime * 0.19) * 0.42 + jelly.phase;
      jelly.root.rotation.z = Math.sin(localTime * 0.27 + 1.3) * 0.08;
      jelly.bell.scale.set(1 + contraction * 0.1, 1 - contraction * 0.16, 1 + contraction * 0.1);
      jelly.appendages.scale.y = 1 - contraction * 0.13;
      jelly.appendages.rotation.y = Math.sin(localTime * 0.24) * 0.1;
    }
  }

  private addJellyfish(kind: JellyKind, position: THREE.Vector3, scale: number, phase: number): void {
    const root = new THREE.Group();
    const bell = new THREE.Group();
    const appendages = new THREE.Group();
    root.name = `${kind}-jellyfish`;
    root.position.copy(position);
    root.scale.setScalar(scale);
    root.add(bell, appendages);

    const capGeometry = new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.52);
    capGeometry.scale(1.16, kind === 'rose' ? 0.72 : 0.62, 1.16);
    const capMaterial = this.createBellMaterial(kind, false);
    const cap = new THREE.Mesh(capGeometry, capMaterial);
    cap.renderOrder = kind === 'rose' ? 13 : 12;
    bell.add(cap);

    const innerGeometry = new THREE.SphereGeometry(0.84, 30, 14, 0, Math.PI * 2, 0, Math.PI * 0.5);
    innerGeometry.scale(1.08, kind === 'rose' ? 0.55 : 0.45, 1.08);
    innerGeometry.translate(0, -0.015, 0);
    const inner = new THREE.Mesh(innerGeometry, this.createBellMaterial(kind, true));
    inner.renderOrder = 11;
    bell.add(inner);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(1.075, kind === 'rose' ? 0.025 : 0.016, 7, 52),
      new THREE.MeshBasicMaterial({
        color: kind === 'rose' ? 0xe69398 : 0x6ca8ff,
        transparent: true,
        opacity: kind === 'rose' ? 0.34 : 0.48,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = -0.04;
    rim.renderOrder = 14;
    bell.add(rim);

    const gonad = this.createGonad(kind);
    gonad.position.y = 0.04;
    gonad.renderOrder = 10;
    bell.add(gonad);

    const ribbons = new THREE.Mesh(this.createRibbonGeometry(kind), this.createRibbonMaterial(kind));
    ribbons.position.y = -0.06;
    ribbons.renderOrder = 15;
    appendages.add(ribbons);

    const tentacles = new THREE.LineSegments(
      this.createTentacleGeometry(kind),
      this.createTentacleMaterial(kind),
    );
    tentacles.position.y = -0.05;
    tentacles.renderOrder = 16;
    appendages.add(tentacles);

    this.group.add(root);
    this.jellyfish.push({
      root,
      bell,
      appendages,
      origin: position.clone(),
      phase,
      drift: kind === 'rose' ? 0.82 : 0.66,
      kind,
    });
  }

  private createBellMaterial(kind: JellyKind, inner: boolean): THREE.ShaderMaterial {
    const rose = kind === 'rose';
    const material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uJellyTime: { value: 0 },
        uBaseColor: { value: new THREE.Color(rose ? (inner ? 0xe8a0a1 : 0xbacbd1) : (inner ? 0x578ee8 : 0x8fbfff)) },
        uGlowColor: { value: new THREE.Color(rose ? 0xffb1a5 : 0x5e9dff) },
        uInner: { value: inner ? 1 : 0 },
      }]),
      vertexShader: `
        uniform float uJellyTime;
        varying vec3 vLocal;
        varying vec3 vViewNormal;
        varying vec3 vViewDirection;
        #include <fog_pars_vertex>
        void main() {
          vLocal = position;
          vec3 transformed = position;
          float edge = smoothstep(0.18, -0.08, position.y);
          transformed.y += sin(atan(position.z, position.x) * 9.0 + uJellyTime * 0.45) * edge * 0.018;
          vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
          vViewNormal = normalize(normalMatrix * normal);
          vViewDirection = normalize(-mvPosition.xyz);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: `
        uniform float uJellyTime;
        uniform vec3 uBaseColor;
        uniform vec3 uGlowColor;
        uniform float uInner;
        varying vec3 vLocal;
        varying vec3 vViewNormal;
        varying vec3 vViewDirection;
        #include <fog_pars_fragment>
        void main() {
          float fresnel = pow(1.0 - abs(dot(normalize(vViewNormal), normalize(vViewDirection))), 2.25);
          float angle = atan(vLocal.z, vLocal.x);
          float ribs = pow(max(0.0, cos(angle * 14.0 + sin(vLocal.y * 8.0) * 0.7)), 18.0);
          float crown = smoothstep(0.18, 0.72, vLocal.y);
          float movingVein = 0.5 + 0.5 * sin(angle * 8.0 - uJellyTime * 0.18 + vLocal.y * 6.0);
          vec3 color = mix(uBaseColor, uGlowColor, fresnel * 0.52 + ribs * 0.18 + crown * uInner * 0.16);
          float alpha = mix(0.105, 0.22, uInner) + fresnel * 0.28 + ribs * 0.065 + movingVein * uInner * 0.035;
          gl_FragColor = vec4(color, alpha);
          #include <fog_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
      fog: true,
    });
    this.animatedMaterials.push(material as AnimatedMaterial);
    return material;
  }

  private createGonad(kind: JellyKind): THREE.Mesh {
    const rose = kind === 'rose';
    const material = new THREE.MeshBasicMaterial({
      color: rose ? 0xf1a39c : 0x92c6ff,
      transparent: true,
      opacity: rose ? 0.27 : 0.34,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const geometry = rose
      ? new THREE.CylinderGeometry(0.42, 0.24, 0.24, 24, 2, true)
      : new THREE.TorusKnotGeometry(0.23, 0.045, 40, 7, 2, 5);
    return new THREE.Mesh(geometry, material);
  }

  private createRibbonGeometry(kind: JellyKind): THREE.BufferGeometry {
    const ribbonCount = kind === 'rose' ? 5 : 4;
    const segments = 18;
    const length = kind === 'rose' ? 2.8 : 2.35;
    const vertices: number[] = [];
    const uvs: number[] = [];
    const seeds: number[] = [];
    const indices: number[] = [];
    for (let ribbon = 0; ribbon < ribbonCount; ribbon += 1) {
      const angle = (ribbon / ribbonCount) * Math.PI * 2 + 0.36;
      const radius = kind === 'rose' ? 0.27 : 0.2;
      const width = kind === 'rose' ? 0.2 : 0.12;
      const start = vertices.length / 3;
      for (let segment = 0; segment <= segments; segment += 1) {
        const t = segment / segments;
        const taper = 1 - t * 0.56;
        const cx = Math.cos(angle) * radius;
        const cz = Math.sin(angle) * radius;
        const sideX = -Math.sin(angle) * width * taper;
        const sideZ = Math.cos(angle) * width * taper;
        vertices.push(
          cx - sideX,
          -t * length,
          cz - sideZ,
          cx + sideX,
          -t * length,
          cz + sideZ,
        );
        uvs.push(0, t, 1, t);
        seeds.push(ribbon * 1.71, ribbon * 1.71);
        if (segment < segments) {
          const a = start + segment * 2;
          indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  private createRibbonMaterial(kind: JellyKind): THREE.ShaderMaterial {
    const rose = kind === 'rose';
    const material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uJellyTime: { value: 0 },
        uColor: { value: new THREE.Color(rose ? 0xf2c4bd : 0x79aaff) },
      }]),
      vertexShader: `
        uniform float uJellyTime;
        attribute float aSeed;
        varying vec2 vUv;
        #include <fog_pars_vertex>
        void main() {
          vUv = uv;
          vec3 transformed = position;
          float reach = smoothstep(0.0, 1.0, -position.y / 2.8);
          transformed.x += sin(uJellyTime * 0.72 + aSeed + position.y * 3.2) * reach * 0.18;
          transformed.z += cos(uJellyTime * 0.58 + aSeed * 1.37 + position.y * 2.5) * reach * 0.13;
          vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        varying vec2 vUv;
        #include <fog_pars_fragment>
        void main() {
          float ruffle = 0.66 + sin(vUv.y * 76.0) * 0.18;
          float edge = smoothstep(0.0, 0.16, vUv.x) * smoothstep(0.0, 0.16, 1.0 - vUv.x);
          float taper = 1.0 - smoothstep(0.78, 1.0, vUv.y);
          gl_FragColor = vec4(uColor, (0.14 + edge * 0.2) * ruffle * taper);
          #include <fog_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: rose ? THREE.NormalBlending : THREE.AdditiveBlending,
      fog: true,
    });
    this.animatedMaterials.push(material as AnimatedMaterial);
    return material;
  }

  private createTentacleGeometry(kind: JellyKind): THREE.BufferGeometry {
    const count = kind === 'rose' ? 16 : 18;
    const segments = 22;
    const random = createRandom(kind === 'rose' ? 904 : 1507);
    const vertices: number[] = [];
    const seeds: number[] = [];
    for (let tentacle = 0; tentacle < count; tentacle += 1) {
      const angle = (tentacle / count) * Math.PI * 2 + range(random, -0.09, 0.09);
      const radius = range(random, 0.56, 0.97);
      const length = range(random, kind === 'rose' ? 2.5 : 2.0, kind === 'rose' ? 4.35 : 3.6);
      const seed = random() * 20;
      for (let segment = 0; segment < segments; segment += 1) {
        const t0 = segment / segments;
        const t1 = (segment + 1) / segments;
        for (const t of [t0, t1]) {
          const curl = Math.sin(t * 5.4 + seed) * t * 0.11;
          vertices.push(
            Math.cos(angle) * radius * (1 - t * 0.34) + Math.cos(angle + Math.PI / 2) * curl,
            -t * length,
            Math.sin(angle) * radius * (1 - t * 0.34) + Math.sin(angle + Math.PI / 2) * curl,
          );
          seeds.push(seed);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1));
    return geometry;
  }

  private createTentacleMaterial(kind: JellyKind): THREE.ShaderMaterial {
    const rose = kind === 'rose';
    const material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uJellyTime: { value: 0 },
        uColor: { value: new THREE.Color(rose ? 0xda8b91 : 0x6d9dff) },
        uOpacity: { value: rose ? 0.34 : 0.3 },
      }]),
      vertexShader: `
        uniform float uJellyTime;
        attribute float aSeed;
        #include <fog_pars_vertex>
        void main() {
          vec3 transformed = position;
          float reach = smoothstep(0.0, 1.0, -position.y / 4.2);
          transformed.x += sin(uJellyTime * 0.64 + aSeed + position.y * 1.8) * reach * 0.22;
          transformed.z += cos(uJellyTime * 0.48 + aSeed * 1.31 + position.y * 1.45) * reach * 0.18;
          vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uOpacity;
        #include <fog_pars_fragment>
        void main() {
          gl_FragColor = vec4(uColor, uOpacity);
          #include <fog_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: rose ? THREE.NormalBlending : THREE.AdditiveBlending,
      fog: true,
    });
    this.animatedMaterials.push(material as AnimatedMaterial);
    return material;
  }
}
