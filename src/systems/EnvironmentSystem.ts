import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CANYON, OCEAN, type QualityLevel, type QualityPreset } from '../core/config';
import { createRandom, range } from '../utils/random';
import { ReefSurfaceSystem } from './ReefSurfaceSystem';
import { BenthicLifeSystem } from './BenthicLifeSystem';

interface AnimatedShader {
  uniforms: Record<string, { value: number }>;
}

export class EnvironmentSystem {
  readonly group = new THREE.Group();

  private floorShader: AnimatedShader | null = null;
  private grassShader: AnimatedShader | null = null;
  private readonly coralShaders: AnimatedShader[] = [];
  private readonly shaftMaterials: THREE.ShaderMaterial[] = [];
  private readonly rockAnchors: Array<{ position: THREE.Vector3; scale: THREE.Vector3 }> = [];
  private readonly motionScale: number;
  private readonly livingReef: ReefSurfaceSystem;
  private readonly benthicLife: BenthicLifeSystem;

  constructor(scene: THREE.Scene, preset: QualityPreset, quality: QualityLevel, reducedMotion: boolean) {
    this.motionScale = reducedMotion ? 0.2 : 1;
    this.group.name = 'coral-canyon';
    scene.add(this.group);

    this.addReflectionEnvironment(scene);
    this.addLighting(scene, preset);
    this.addSeaFloor();
    this.addRockCanyon(preset);
    this.livingReef = new ReefSurfaceSystem(this.group, preset, quality, this.motionScale);
    this.addPebbles(preset);
    this.addReefDetails(preset);
    this.addGrass(preset);
    this.addFeatherAlgae(preset);
    this.addCoralPlaceholders(preset);
    this.addSeaFans(preset);
    this.addPlateCorals(preset);
    this.addBrainCorals(preset);
    this.addPolypColonies(preset);
    this.addSpongeClusters(preset);
    this.benthicLife = new BenthicLifeSystem(this.group, preset, this.motionScale);
    this.addLightShafts(preset);
  }

  private addReflectionEnvironment(scene: THREE.Scene): void {
    const width = 512;
    const height = 256;
    const data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      const v = y / (height - 1);
      const overhead = Math.pow(1 - v, 2.2);
      for (let x = 0; x < width; x += 1) {
        const u = x / (width - 1);
        const sunDistanceX = Math.min(Math.abs(u - 0.34), 1 - Math.abs(u - 0.34));
        const sun = Math.exp(-(sunDistanceX * sunDistanceX * 210 + (v - 0.16) * (v - 0.16) * 95));
        const ripple = Math.sin(u * 83 + Math.sin(v * 31) * 2.4) * Math.sin(v * 47) * overhead;
        const index = (y * width + x) * 4;
        data[index] = Math.round(THREE.MathUtils.clamp(12 + overhead * 70 + sun * 128 + ripple * 8, 0, 255));
        data[index + 1] = Math.round(THREE.MathUtils.clamp(48 + overhead * 86 + sun * 104 + ripple * 13, 0, 255));
        data[index + 2] = Math.round(THREE.MathUtils.clamp(58 + overhead * 91 + sun * 72 + ripple * 15, 0, 255));
        data[index + 3] = 255;
      }
    }
    const environment = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
    environment.mapping = THREE.EquirectangularReflectionMapping;
    environment.colorSpace = THREE.SRGBColorSpace;
    environment.minFilter = THREE.LinearMipmapLinearFilter;
    environment.magFilter = THREE.LinearFilter;
    environment.needsUpdate = true;
    scene.environment = environment;
    scene.environmentIntensity = 1.05;
  }

  private addLighting(scene: THREE.Scene, preset: QualityPreset): void {
    const hemisphere = new THREE.HemisphereLight(0xa5e0db, 0x08252b, 1.48);
    scene.add(hemisphere);

    const sun = new THREE.DirectionalLight(0xe2edcf, 4.65);
    sun.position.set(-12, 24, 8);
    sun.target.position.set(5, -4, -45);
    scene.add(sun, sun.target);

    if (preset.shadowMapSize > 0) {
      sun.castShadow = true;
      sun.shadow.mapSize.setScalar(preset.shadowMapSize);
      sun.shadow.camera.left = -22;
      sun.shadow.camera.right = 22;
      sun.shadow.camera.top = 24;
      sun.shadow.camera.bottom = -8;
      sun.shadow.camera.near = 1;
      sun.shadow.camera.far = 85;
      sun.shadow.bias = -0.0004;
    }

    const floorBounce = new THREE.PointLight(0x65b6aa, 5.4, 42, 2);
    floorBounce.position.set(5, -1.8, -22);
    scene.add(floorBounce);

    const canyonFill = new THREE.DirectionalLight(0x2d6968, 0.72);
    canyonFill.position.set(8, -3, 4);
    canyonFill.target.position.set(-7, 1, -18);
    scene.add(canyonFill, canyonFill.target);
  }

  private addSeaFloor(): void {
    const geometry = new THREE.PlaneGeometry(64, 135, 72, 150);
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i += 1) {
      const x = positions.getX(i);
      const depth = positions.getY(i);
      const channel = -2.9 + Math.min(2.8, Math.abs(x) * 0.12);
      const strata = Math.sin(x * 0.42 + depth * 0.08) * 0.28 + Math.sin(depth * 0.23) * 0.13;
      const currentRipple = Math.sin(depth * 1.34 + Math.sin(x * 0.22) * 1.65) * 0.052;
      const crossRipple = Math.sin(depth * 2.78 - x * 0.31) * 0.018;
      positions.setZ(i, channel + strata + currentRipple + crossRipple);
    }
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, 0, -45);
    geometry.computeVertexNormals();

    const sandTexture = this.createMineralTexture(119, 256, 14, 28);
    const material = new THREE.MeshStandardMaterial({
      color: OCEAN.floorColor,
      roughness: 0.96,
      metalness: 0,
      map: sandTexture,
      bumpMap: sandTexture,
      bumpScale: 0.055,
    });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vCausticWorld;')
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvCausticWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform float uTime;
          varying vec3 vCausticWorld;
          float tidalCaustic(vec2 p) {
            vec2 q = p;
            float lightWeb = 0.0;
            for (int i = 0; i < 3; i++) {
              float fi = float(i);
              q += vec2(sin(q.y * 1.17 + uTime * (0.37 + fi * 0.09)), cos(q.x * 1.31 - uTime * 0.29)) * 0.38;
              q = mat2(0.82, -0.57, 0.57, 0.82) * q * 1.37;
              float ridge = abs(sin(q.x + fi * 1.7)) + abs(sin(q.y - fi * 0.9));
              lightWeb += 0.025 / (ridge * ridge + 0.035);
            }
            return smoothstep(0.055, 0.34, lightWeb);
          }`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float caustic = tidalCaustic(vCausticWorld.xz * 0.48);
          float distanceFade = 1.0 - smoothstep(14.0, 82.0, distance(vCausticWorld.xz, cameraPosition.xz));
          float sandMottle = sin(vCausticWorld.x * 2.7) * sin(vCausticWorld.z * 1.9) * 0.025;
          diffuseColor.rgb *= 0.96 + sandMottle;
          diffuseColor.rgb += vec3(0.34, 0.56, 0.50) * caustic * 0.18 * distanceFade;`,
        );
      this.floorShader = shader as AnimatedShader;
    };
    material.customProgramCacheKey = () => 'tidal-floor-caustics-v3';

    const floor = new THREE.Mesh(geometry, material);
    floor.receiveShadow = true;
    floor.name = 'caustic-seafloor';
    this.group.add(floor);
  }

  private addRockCanyon(preset: QualityPreset): void {
    const random = createRandom(2019);
    const rockCount = Math.max(28, Math.round(preset.rockCount * 0.38));
    const geometry = new THREE.SphereGeometry(1, 22, 14);
    const rockPositions = geometry.attributes.position;
    for (let i = 0; i < rockPositions.count; i += 1) {
      const x = rockPositions.getX(i);
      const y = rockPositions.getY(i);
      const z = rockPositions.getZ(i);
      const erosion = 0.91 + Math.sin(x * 7.1 + y * 3.7) * 0.045 + Math.sin(z * 11.3 - x * 2.4) * 0.025;
      rockPositions.setXYZ(i, x * erosion, y * erosion, z * erosion);
    }
    geometry.computeVertexNormals();
    const rockTexture = this.createMineralTexture(827, 256, 2.4, 3.1);
    const material = new THREE.MeshStandardMaterial({
      color: OCEAN.rockColor,
      roughness: 0.94,
      metalness: 0,
      map: rockTexture,
      bumpMap: rockTexture,
      bumpScale: 0.13,
    });
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vReefWorld;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vec4 reefPosition = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            reefPosition = instanceMatrix * reefPosition;
          #endif
          vReefWorld = (modelMatrix * reefPosition).xyz;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vReefWorld;')
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float mineral = sin(vReefWorld.x * 2.8 + sin(vReefWorld.y * 4.1)) * sin(vReefWorld.z * 3.6);
          float algae = smoothstep(0.18, 0.82, sin(vReefWorld.x * 1.4 - vReefWorld.z * 1.1) * 0.5 + 0.5);
          diffuseColor.rgb *= 0.88 + mineral * 0.055;
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.72, 1.04, 0.88), algae * 0.16);`,
        );
    };
    material.customProgramCacheKey = () => 'tidal-eroded-rock-v1';
    const rocks = new THREE.InstancedMesh(geometry, material, rockCount);
    rocks.name = 'canyon-rocks';
    rocks.castShadow = preset.shadowMapSize > 0;
    rocks.receiveShadow = true;

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const euler = new THREE.Euler();
    const color = new THREE.Color();

    for (let i = 0; i < rockCount; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      const z = range(random, CANYON.farZ, -18);
      const depthFactor = THREE.MathUtils.inverseLerp(CANYON.nearZ, CANYON.farZ, z);
      const edge = CANYON.halfWidth + range(random, -0.4, 4.8) - Math.sin(z * 0.055) * 1.25;
      position.set(side * edge, range(random, -2.2, 2.3), z);
      scale.set(
        range(random, 1.0, 2.8),
        range(random, 1.4, 4.5),
        range(random, 1.3, 3.8),
      );
      euler.set(range(random, -0.5, 0.5), range(random, 0, Math.PI), range(random, -0.25, 0.25));
      rotation.setFromEuler(euler);
      matrix.compose(position, rotation, scale);
      rocks.setMatrixAt(i, matrix);
      this.rockAnchors.push({ position: position.clone(), scale: scale.clone() });
      color.setHSL(0.46 + range(random, -0.025, 0.018), 0.14, 0.28 + depthFactor * 0.025 + random() * 0.1);
      rocks.setColorAt(i, color);
    }
    rocks.instanceMatrix.needsUpdate = true;
    rocks.instanceColor!.needsUpdate = true;
    this.group.add(rocks);
  }

  private addPebbles(preset: QualityPreset): void {
    const random = createRandom(6612);
    const geometry = new THREE.DodecahedronGeometry(0.22, 0);
    const material = new THREE.MeshStandardMaterial({ color: 0x526760, roughness: 0.98 });
    const pebbles = new THREE.InstancedMesh(geometry, material, preset.pebbleCount);
    pebbles.name = 'seafloor-pebbles';
    pebbles.receiveShadow = true;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const color = new THREE.Color();
    const euler = new THREE.Euler();
    for (let i = 0; i < preset.pebbleCount; i += 1) {
      const x = range(random, -8.4, 8.4);
      const z = range(random, -96, 13);
      const y = -2.95 + Math.min(2.4, Math.abs(x) * 0.12);
      position.set(x, y + range(random, -0.08, 0.08), z);
      euler.set(range(random, 0, Math.PI), range(random, 0, Math.PI), range(random, 0, Math.PI));
      quaternion.setFromEuler(euler);
      const size = range(random, 0.25, 1.7) * (z > 0 ? 1.35 : 1);
      scale.set(size, size * range(random, 0.35, 0.7), size * range(random, 0.75, 1.4));
      matrix.compose(position, quaternion, scale);
      pebbles.setMatrixAt(i, matrix);
      color.setHSL(range(random, 0.42, 0.49), range(random, 0.06, 0.18), range(random, 0.25, 0.38));
      pebbles.setColorAt(i, color);
    }
    pebbles.instanceMatrix.needsUpdate = true;
    pebbles.instanceColor!.needsUpdate = true;
    this.group.add(pebbles);
  }

  private addReefDetails(preset: QualityPreset): void {
    const random = createRandom(3381);
    const detailCount = Math.max(240, Math.round(preset.reefDetailCount * 0.2));
    const geometry = new THREE.DodecahedronGeometry(0.14, 0);
    const material = new THREE.MeshStandardMaterial({ color: 0xaebbb2, roughness: 0.92 });
    const details = new THREE.InstancedMesh(geometry, material, detailCount);
    details.name = 'reef-microgrowth';
    details.frustumCulled = false;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const color = new THREE.Color();
    const euler = new THREE.Euler();
    const surfaceNormal = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < detailCount; i += 1) {
      const anchor = this.rockAnchors[Math.floor(random() * this.rockAnchors.length)];
      surfaceNormal.set(range(random, -1, 1), range(random, -0.2, 1), range(random, -1, 1)).normalize();
      position.set(
        anchor.position.x + surfaceNormal.x * anchor.scale.x * 0.9,
        anchor.position.y + surfaceNormal.y * anchor.scale.y * 0.9,
        anchor.position.z + surfaceNormal.z * anchor.scale.z * 0.9,
      );
      quaternion.setFromUnitVectors(up, surfaceNormal);
      euler.set(0, range(random, 0, Math.PI * 2), 0);
      quaternion.multiply(new THREE.Quaternion().setFromEuler(euler));
      const size = range(random, 0.46, 1.38);
      scale.set(size * range(random, 0.75, 1.6), size * range(random, 0.28, 0.72), size * range(random, 0.75, 1.45));
      matrix.compose(position, quaternion, scale);
      details.setMatrixAt(i, matrix);
      color.setHSL(range(random, 0.34, 0.48), range(random, 0.14, 0.38), range(random, 0.3, 0.46));
      details.setColorAt(i, color);
    }
    details.instanceMatrix.needsUpdate = true;
    details.instanceColor!.needsUpdate = true;
    this.group.add(details);
  }

  private addGrass(preset: QualityPreset): void {
    const random = createRandom(7731);
    const grassCount = Math.max(68, Math.round(preset.grassCount * 0.31));
    const geometry = this.createSeagrassTuftGeometry();
    const material = new THREE.MeshStandardMaterial({
      color: 0x9eb9a7,
      roughness: 0.76,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      shader.uniforms.uSway = { value: OCEAN.grassSway * this.motionScale };
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform float uTime;\nuniform float uSway;\nvarying vec2 vGrassUv;\nvarying vec3 vGrassLocal;',
        )
        .replace(
          '#include <begin_vertex>',
          `vec3 transformed = vec3(position);
          float tidalPhase = instanceMatrix[3].x * 0.73 + instanceMatrix[3].z * 0.31;
          float tidalBend = sin(uTime * 0.82 + tidalPhase + position.y * 0.48) * uSway;
          transformed.x += tidalBend * pow(uv.y, 1.7);
          transformed.z += tidalBend * 0.35 * pow(uv.y, 2.0);
          transformed.z += sin(uTime * 0.46 + tidalPhase * 1.37 + position.y * 1.1) * 0.045 * pow(uv.y, 2.2);
          vGrassUv = uv;
          vGrassLocal = transformed;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vGrassUv;\nvarying vec3 vGrassLocal;')
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float midrib = 1.0 - smoothstep(0.025, 0.11, abs(vGrassUv.x - 0.5));
          float fineVeins = pow(abs(sin(vGrassUv.y * 48.0 + vGrassUv.x * 5.0)), 12.0);
          float tipFade = smoothstep(0.5, 1.0, vGrassUv.y);
          float baseShade = 1.0 - smoothstep(0.0, 0.24, vGrassUv.y);
          diffuseColor.rgb *= 0.76 + vGrassUv.y * 0.22;
          diffuseColor.rgb += vec3(0.055, 0.12, 0.07) * midrib * (0.32 + tipFade * 0.22);
          diffuseColor.rgb += vec3(0.028, 0.065, 0.038) * fineVeins * 0.16;
          diffuseColor.rgb *= 1.0 - baseShade * 0.24;`,
        );
      this.grassShader = shader as AnimatedShader;
    };
    material.customProgramCacheKey = () => 'tidal-grass-sway-v3-veined-tufts';

    const grass = new THREE.InstancedMesh(geometry, material, grassCount);
    grass.name = 'swaying-seagrass';
    grass.frustumCulled = false;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const euler = new THREE.Euler();
    const color = new THREE.Color();
    for (let i = 0; i < grassCount; i += 1) {
      const side = random() < 0.5 ? -1 : 1;
      const x = side * range(random, 6.8, 11.2);
      const z = range(random, -96, -15);
      const y = -3.1 + Math.min(2.1, Math.abs(x) * 0.11);
      position.set(x, y, z);
      euler.set(0, range(random, 0, Math.PI), range(random, -0.08, 0.08));
      rotation.setFromEuler(euler);
      const bladeScale = range(random, 0.48, 1.12);
      scale.set(range(random, 0.7, 1.25), bladeScale, 1);
      matrix.compose(position, rotation, scale);
      grass.setMatrixAt(i, matrix);
      color.setHSL(range(random, 0.40, 0.48), range(random, 0.18, 0.38), range(random, 0.24, 0.39));
      grass.setColorAt(i, color);
    }
    grass.instanceMatrix.needsUpdate = true;
    grass.instanceColor!.needsUpdate = true;
    this.group.add(grass);
  }

  private createSeagrassTuftGeometry(): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = [];
    const rotations = [-0.62, 0, 0.71];
    const offsets = [-0.075, 0.02, 0.08];
    for (let blade = 0; blade < rotations.length; blade += 1) {
      const geometry = new THREE.PlaneGeometry(0.22, 2.25, 1, 9);
      const positions = geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i += 1) {
        const height = (positions.getY(i) + 1.125) / 2.25;
        const taper = 1 - Math.pow(height, 1.72) * 0.9;
        const waviness = Math.sin(height * Math.PI * 2.4 + blade * 1.7) * 0.018 * height;
        positions.setX(i, positions.getX(i) * taper + waviness);
        positions.setZ(i, Math.sin(height * Math.PI) * (blade - 1) * 0.018);
      }
      geometry.translate(offsets[blade], 1.125, 0);
      geometry.rotateY(rotations[blade]);
      parts.push(geometry);
    }
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error('Unable to create seagrass tuft geometry.');
    merged.computeVertexNormals();
    return merged;
  }

  private addFeatherAlgae(preset: QualityPreset): void {
    const random = createRandom(5147);
    const count = Math.max(18, Math.round(preset.grassCount * 0.045));
    const parts: THREE.BufferGeometry[] = [];
    const stem = new THREE.CylinderGeometry(0.026, 0.052, 1.82, 6, 7);
    stem.translate(0, 0.91, 0);
    parts.push(stem);
    for (let level = 0; level < 9; level += 1) {
      const y = 0.34 + level * 0.165;
      const length = 0.46 * (0.74 + Math.sin((level / 8) * Math.PI) * 0.38) * (1 - level * 0.025);
      for (const side of [-1, 1]) {
        const leaf = new THREE.BufferGeometry();
        const z = Math.sin(level * 1.7) * 0.035;
        leaf.setAttribute('position', new THREE.Float32BufferAttribute([
          0, y - 0.035, z,
          side * length, y + 0.105 + level * 0.012, z + side * 0.045,
          0, y + 0.075, z,
        ], 3));
        leaf.setAttribute('uv', new THREE.Float32BufferAttribute([0.5, 0, side > 0 ? 1 : 0, 1, 0.5, 0.2], 2));
        leaf.setIndex([0, 1, 2]);
        leaf.computeVertexNormals();
        parts.push(leaf);
      }
    }
    const geometry = mergeGeometries(parts);
    if (!geometry) throw new Error('Unable to create feather algae geometry.');
    geometry.computeVertexNormals();

    const material = new THREE.MeshPhysicalMaterial({
      color: 0x638c6d,
      roughness: 0.58,
      metalness: 0,
      clearcoat: 0.12,
      clearcoatRoughness: 0.48,
      side: THREE.DoubleSide,
    });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying float vAlgaeHeight;')
        .replace(
          '#include <begin_vertex>',
          `vec3 transformed = vec3(position);
          float height = clamp(position.y / 1.85, 0.0, 1.0);
          float phase = instanceMatrix[3].x * 0.51 + instanceMatrix[3].z * 0.37;
          transformed.x += sin(uTime * 0.56 + phase + position.y * 1.4) * 0.17 * height * height;
          transformed.z += cos(uTime * 0.43 + phase * 1.3 + position.y) * 0.08 * height;
          vAlgaeHeight = height;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vAlgaeHeight;')
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          diffuseColor.rgb = mix(diffuseColor.rgb * vec3(0.58, 0.72, 0.61), diffuseColor.rgb * vec3(1.05, 1.14, 0.82), vAlgaeHeight * 0.74);`,
        );
      this.coralShaders.push(shader as AnimatedShader);
    };
    material.customProgramCacheKey = () => 'tidal-feather-algae-v1';

    const algae = new THREE.InstancedMesh(geometry, material, count);
    algae.name = 'feather-macroalgae';
    algae.frustumCulled = false;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const scale = new THREE.Vector3();
    const color = new THREE.Color();
    for (let i = 0; i < count; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      const x = side * range(random, 6.1, 9.7);
      const z = i < 8 ? range(random, -12, 9) : range(random, -84, 6);
      position.set(x, -2.86 + Math.min(2.05, Math.abs(x) * 0.11), z);
      euler.set(range(random, -0.08, 0.08), range(random, 0, Math.PI * 2), side * range(random, -0.12, 0.12));
      quaternion.setFromEuler(euler);
      const height = range(random, 0.42, 1.06);
      scale.set(height * range(random, 0.8, 1.18), height, height * range(random, 0.82, 1.12));
      matrix.compose(position, quaternion, scale);
      algae.setMatrixAt(i, matrix);
      if (random() > 0.58) color.setHSL(range(random, 0.39, 0.45), range(random, 0.34, 0.52), range(random, 0.28, 0.42));
      else color.setHSL(range(random, 0.18, 0.27), range(random, 0.32, 0.52), range(random, 0.29, 0.43));
      algae.setColorAt(i, color);
    }
    algae.instanceMatrix.needsUpdate = true;
    algae.instanceColor!.needsUpdate = true;
    this.group.add(algae);
  }

  private addCoralPlaceholders(preset: QualityPreset): void {
    const random = createRandom(4310);
    const geometry = this.createBranchedCoralGeometry();
    const material = new THREE.MeshPhysicalMaterial({
      color: 0xb7aa98,
      roughness: 0.68,
      metalness: 0,
      clearcoat: 0.18,
      clearcoatRoughness: 0.54,
      envMapIntensity: 0.76,
      flatShading: false,
    });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      shader.uniforms.uSway = { value: 0.1 * this.motionScale };
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform float uTime;\nuniform float uSway;\nvarying vec3 vCoralLocal;',
        )
        .replace(
          '#include <begin_vertex>',
          `vec3 transformed = vec3(position);
          float coralPhase = instanceMatrix[3].x * 0.41 + instanceMatrix[3].z * 0.57;
          float coralHeight = clamp(position.y / 2.35, 0.0, 1.0);
          transformed.x += sin(uTime * 0.54 + coralPhase + position.y * 0.34) * uSway * pow(coralHeight, 1.9);
          vCoralLocal = transformed;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vCoralLocal;
          float coralHash(vec3 p) {
            return fract(sin(dot(p, vec3(17.17, 91.73, 43.29))) * 43758.5453);
          }`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          vec3 coralCell = floor(vCoralLocal * vec3(20.0, 15.0, 20.0));
          float poreSignal = coralHash(coralCell);
          float pore = smoothstep(0.88, 0.97, poreSignal);
          float tip = smoothstep(1.45, 2.12, vCoralLocal.y);
          float mineral = coralHash(floor(vCoralLocal * 7.0 + 4.0));
          diffuseColor.rgb *= 0.91 + mineral * 0.13;
          diffuseColor.rgb *= 1.0 - pore * 0.24;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.68, 0.58), tip * 0.2);
          diffuseColor.rgb += vec3(0.06, 0.04, 0.025) * tip * 0.12;`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          '#include <roughnessmap_fragment>\nroughnessFactor *= 0.9 + coralHash(floor(vCoralLocal * 11.0)) * 0.1;',
        );
      this.coralShaders.push(shader as AnimatedShader);
    };
    material.customProgramCacheKey = () => 'tidal-staghorn-coral-v3-growth-tips';

    const corals = new THREE.InstancedMesh(geometry, material, preset.coralCount);
    corals.name = 'detailed-branching-staghorn-corals';
    corals.castShadow = preset.shadowMapSize > 0;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const euler = new THREE.Euler();
    const color = new THREE.Color();
    for (let i = 0; i < preset.coralCount; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      const x = side * range(random, 6.5, 11.4);
      const z = range(random, -92, 10);
      position.set(x, -2.75 + Math.min(1.9, Math.abs(x) * 0.105), z);
      euler.set(range(random, -0.06, 0.06), range(random, 0, Math.PI), side * range(random, 0.03, 0.18));
      rotation.setFromEuler(euler);
      const coralScale = range(random, 0.42, 1.04);
      scale.set(coralScale * range(random, 0.82, 1.18), coralScale, coralScale * range(random, 0.78, 1.12));
      matrix.compose(position, rotation, scale);
      corals.setMatrixAt(i, matrix);
      const colorGroup = random();
      if (colorGroup > 0.72) color.setHSL(range(random, 0.91, 0.99), range(random, 0.48, 0.72), range(random, 0.46, 0.62));
      else if (colorGroup > 0.48) color.setHSL(range(random, 0.035, 0.095), range(random, 0.48, 0.7), range(random, 0.45, 0.59));
      else if (colorGroup > 0.22) color.setHSL(range(random, 0.085, 0.13), range(random, 0.26, 0.46), range(random, 0.58, 0.72));
      else color.setHSL(range(random, 0.43, 0.51), range(random, 0.34, 0.58), range(random, 0.4, 0.56));
      corals.setColorAt(i, color);
    }
    corals.instanceMatrix.needsUpdate = true;
    corals.instanceColor!.needsUpdate = true;
    this.group.add(corals);
  }

  private createBranchedCoralGeometry(): THREE.BufferGeometry {
    const segment = (start: THREE.Vector3, end: THREE.Vector3, bottom: number, top: number): THREE.BufferGeometry => {
      const direction = end.clone().sub(start);
      const geometry = new THREE.CylinderGeometry(top, bottom, direction.length(), 7, 3);
      geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
      geometry.translate(
        (start.x + end.x) * 0.5,
        (start.y + end.y) * 0.5,
        (start.z + end.z) * 0.5,
      );
      return geometry;
    };
    const points = [
      [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.02, 1.08, 0), 0.18, 0.105],
      [new THREE.Vector3(0.02, 1.0, 0), new THREE.Vector3(-0.31, 1.55, 0.05), 0.105, 0.068],
      [new THREE.Vector3(0.02, 1.0, 0), new THREE.Vector3(0.36, 1.48, -0.04), 0.1, 0.065],
      [new THREE.Vector3(-0.29, 1.5, 0.05), new THREE.Vector3(-0.5, 1.93, 0.08), 0.065, 0.038],
      [new THREE.Vector3(-0.29, 1.5, 0.05), new THREE.Vector3(-0.13, 2.01, -0.02), 0.06, 0.035],
      [new THREE.Vector3(0.34, 1.44, -0.04), new THREE.Vector3(0.58, 1.86, -0.08), 0.062, 0.037],
      [new THREE.Vector3(0.34, 1.44, -0.04), new THREE.Vector3(0.18, 2.05, 0.03), 0.06, 0.034],
      [new THREE.Vector3(0, 0.72, 0), new THREE.Vector3(-0.34, 1.12, -0.12), 0.085, 0.046],
      [new THREE.Vector3(0, 0.66, 0), new THREE.Vector3(0.3, 1.03, 0.14), 0.08, 0.045],
      [new THREE.Vector3(-0.47, 1.86, 0.08), new THREE.Vector3(-0.72, 2.22, 0.13), 0.04, 0.024],
      [new THREE.Vector3(-0.14, 1.92, -0.01), new THREE.Vector3(-0.26, 2.33, -0.08), 0.037, 0.022],
      [new THREE.Vector3(0.18, 1.95, 0.03), new THREE.Vector3(0.34, 2.38, 0.08), 0.036, 0.021],
      [new THREE.Vector3(0.54, 1.78, -0.07), new THREE.Vector3(0.8, 2.14, -0.12), 0.038, 0.023],
      [new THREE.Vector3(-0.31, 1.15, 0.01), new THREE.Vector3(-0.63, 1.52, -0.17), 0.052, 0.03],
      [new THREE.Vector3(0.28, 1.04, 0.08), new THREE.Vector3(0.62, 1.42, 0.2), 0.05, 0.029],
    ] as const;
    const parts = points.map(([start, end, bottom, top]) => segment(start, end, bottom, top));
    for (const [start, end, , top] of points.slice(3)) {
      const bud = new THREE.SphereGeometry(top * 1.22, 7, 5);
      bud.translate(end.x, end.y, end.z);
      parts.push(bud);
      const cup = new THREE.TorusGeometry(top * 0.76, Math.max(0.004, top * 0.16), 5, 9);
      const direction = end.clone().sub(start).normalize();
      cup.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction));
      cup.translate(end.x, end.y, end.z);
      parts.push(cup);
    }
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error('Unable to create branched coral geometry.');
    merged.computeVertexNormals();
    return merged;
  }

  private addSeaFans(preset: QualityPreset): void {
    const random = createRandom(9431);
    const count = Math.max(12, Math.round(preset.coralCount * 0.24));
    const geometry = this.createSeaFanGeometry();
    const material = new THREE.MeshPhysicalMaterial({
      color: 0x9b776c,
      roughness: 0.62,
      metalness: 0,
      clearcoat: 0.16,
      clearcoatRoughness: 0.5,
      side: THREE.DoubleSide,
    });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      shader.uniforms.uSway = { value: 0.075 * this.motionScale };
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform float uTime;\nuniform float uSway;\nvarying vec3 vFanLocal;',
        )
        .replace(
          '#include <begin_vertex>',
          `vec3 transformed = vec3(position);
          float fanPhase = instanceMatrix[3].x * 0.34 + instanceMatrix[3].z * 0.19;
          float fanHeight = clamp(position.y / 2.2, 0.0, 1.0);
          transformed.z += sin(uTime * 0.43 + fanPhase + position.x * 1.8) * uSway * fanHeight * fanHeight;
          vFanLocal = transformed;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vFanLocal;')
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float fanGrain = sin(vFanLocal.y * 29.0 + vFanLocal.x * 17.0) * 0.5 + 0.5;
          diffuseColor.rgb *= 0.86 + fanGrain * 0.19;`,
        );
      this.coralShaders.push(shader as AnimatedShader);
    };
    material.customProgramCacheKey = () => 'tidal-sea-fan-v1';

    const fans = new THREE.InstancedMesh(geometry, material, count);
    fans.name = 'branching-sea-fans';
    fans.castShadow = preset.shadowMapSize > 0;
    fans.receiveShadow = true;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const euler = new THREE.Euler();
    const color = new THREE.Color();
    for (let i = 0; i < count; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      const x = side * range(random, 7.2, 10.7);
      const z = range(random, -78, 5);
      position.set(x, -2.7 + Math.min(2.0, Math.abs(x) * 0.11), z);
      euler.set(range(random, -0.1, 0.1), range(random, -0.8, 0.8), side * range(random, -0.12, 0.12));
      rotation.setFromEuler(euler);
      const size = range(random, 0.46, 1.02);
      scale.set(size * range(random, 0.82, 1.2), size, size * range(random, 0.72, 1.05));
      matrix.compose(position, rotation, scale);
      fans.setMatrixAt(i, matrix);
      if (random() > 0.54) color.setHSL(range(random, 0.94, 1.0), range(random, 0.35, 0.55), range(random, 0.4, 0.56));
      else color.setHSL(range(random, 0.075, 0.12), range(random, 0.25, 0.42), range(random, 0.48, 0.64));
      fans.setColorAt(i, color);
    }
    fans.instanceMatrix.needsUpdate = true;
    fans.instanceColor!.needsUpdate = true;
    this.group.add(fans);
  }

  private createSeaFanGeometry(): THREE.BufferGeometry {
    const segment = (start: THREE.Vector3, end: THREE.Vector3, radius: number): THREE.BufferGeometry => {
      const direction = end.clone().sub(start);
      const geometry = new THREE.CylinderGeometry(radius * 0.72, radius, direction.length(), 5, 2);
      geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
      geometry.translate((start.x + end.x) * 0.5, (start.y + end.y) * 0.5, (start.z + end.z) * 0.5);
      return geometry;
    };
    const center = new THREE.Vector3(0, 0.2, 0);
    const junction = new THREE.Vector3(0, 1.02, 0);
    const branches = [
      segment(center, junction, 0.07),
      segment(junction, new THREE.Vector3(-0.78, 1.72, 0.04), 0.045),
      segment(junction, new THREE.Vector3(-0.38, 2.16, -0.02), 0.043),
      segment(junction, new THREE.Vector3(0.2, 2.27, 0.03), 0.045),
      segment(junction, new THREE.Vector3(0.72, 1.88, -0.04), 0.044),
      segment(new THREE.Vector3(-0.36, 1.35, 0.02), new THREE.Vector3(-0.67, 2.02, 0.02), 0.027),
      segment(new THREE.Vector3(0.34, 1.34, -0.01), new THREE.Vector3(0.58, 2.18, 0.01), 0.027),
      segment(new THREE.Vector3(-0.18, 1.56, 0), new THREE.Vector3(-0.05, 2.32, -0.01), 0.023),
      segment(new THREE.Vector3(-0.62, 1.56, 0.03), new THREE.Vector3(0.47, 1.62, -0.01), 0.014),
      segment(new THREE.Vector3(-0.62, 1.8, 0.02), new THREE.Vector3(0.58, 1.86, 0), 0.012),
      segment(new THREE.Vector3(-0.47, 2.02, 0), new THREE.Vector3(0.48, 2.07, 0.01), 0.011),
      segment(new THREE.Vector3(-0.35, 1.32, 0.01), new THREE.Vector3(0.34, 1.38, -0.01), 0.013),
    ];
    const merged = mergeGeometries(branches);
    if (!merged) throw new Error('Unable to create sea fan geometry.');
    merged.computeVertexNormals();
    return merged;
  }

  private addPlateCorals(preset: QualityPreset): void {
    const random = createRandom(2267);
    const count = Math.max(16, Math.round(preset.coralCount * 0.34));
    const geometry = this.createPlateCoralGeometry();
    const material = new THREE.MeshPhysicalMaterial({
      color: 0x8f826b,
      roughness: 0.66,
      metalness: 0,
      clearcoat: 0.14,
      clearcoatRoughness: 0.58,
      envMapIntensity: 0.68,
    });
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vPlateLocal;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPlateLocal = transformed;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vPlateLocal;')
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float plateRadius = length(vPlateLocal.xz);
          float growthBand = sin(plateRadius * 31.0 + atan(vPlateLocal.z, vPlateLocal.x) * 2.0) * 0.5 + 0.5;
          float rim = smoothstep(0.38, 0.68, plateRadius);
          diffuseColor.rgb *= 0.84 + growthBand * 0.16 + rim * 0.07;`,
        );
    };
    material.customProgramCacheKey = () => 'tidal-layered-plate-coral-v1';
    const plates = new THREE.InstancedMesh(geometry, material, count);
    plates.name = 'undulating-plate-corals';
    plates.castShadow = preset.shadowMapSize > 0;
    plates.receiveShadow = true;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const euler = new THREE.Euler();
    const color = new THREE.Color();
    for (let i = 0; i < count; i += 1) {
      const side = random() < 0.5 ? -1 : 1;
      const x = side * range(random, 6.9, 10.8);
      position.set(x, -2.62 + Math.min(1.9, Math.abs(x) * 0.105), range(random, -88, 8));
      euler.set(range(random, -0.2, 0.2), range(random, 0, Math.PI), side * range(random, -0.16, 0.16));
      rotation.setFromEuler(euler);
      const width = range(random, 0.45, 1.25);
      scale.set(width, range(random, 0.7, 1.35), width * range(random, 0.72, 1.08));
      matrix.compose(position, rotation, scale);
      plates.setMatrixAt(i, matrix);
      if (random() > 0.45) color.setHSL(range(random, 0.9, 0.99), range(random, 0.34, 0.56), range(random, 0.44, 0.6));
      else color.setHSL(range(random, 0.055, 0.12), range(random, 0.28, 0.48), range(random, 0.5, 0.65));
      plates.setColorAt(i, color);
    }
    plates.instanceMatrix.needsUpdate = true;
    plates.instanceColor!.needsUpdate = true;
    this.group.add(plates);
  }

  private createPlateCoralGeometry(): THREE.BufferGeometry {
    const createLayer = (
      radius: number,
      height: number,
      y: number,
      x: number,
      z: number,
      rotationY: number,
    ): THREE.BufferGeometry => {
      const layer = new THREE.CylinderGeometry(radius, radius * 0.58, height, 18, 2);
      const positions = layer.getAttribute('position');
      for (let i = 0; i < positions.count; i += 1) {
        const px = positions.getX(i);
        const pz = positions.getZ(i);
        const angle = Math.atan2(pz, px);
        const edge = Math.hypot(px, pz) / radius;
        const ripple = 1 + Math.sin(angle * 5 + radius * 3.0) * 0.08 + Math.sin(angle * 9) * 0.035;
        positions.setX(i, px * ripple);
        positions.setZ(i, pz * ripple);
        positions.setY(i, positions.getY(i) + Math.sin(angle * 4 + radius) * edge * 0.035);
      }
      layer.rotateY(rotationY);
      layer.translate(x, y, z);
      layer.computeVertexNormals();
      return layer;
    };
    const merged = mergeGeometries([
      createLayer(0.62, 0.1, 0.18, 0, 0, 0),
      createLayer(0.48, 0.085, 0.34, 0.18, -0.03, 0.72),
      createLayer(0.34, 0.07, 0.48, -0.12, 0.08, -0.54),
    ]);
    if (!merged) throw new Error('Unable to create layered plate coral geometry.');
    merged.computeVertexNormals();
    return merged;
  }

  private addBrainCorals(preset: QualityPreset): void {
    const random = createRandom(7347);
    const count = Math.max(18, Math.round(preset.coralCount * 0.26));
    const geometry = new THREE.SphereGeometry(0.72, 28, 18);
    const positions = geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i += 1) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);
      const dimple = 1 + Math.sin(Math.atan2(z, x) * 11 + y * 8.5) * 0.035
        + Math.sin(y * 16 - x * 4.2) * 0.018;
      positions.setXYZ(i, x * dimple, y * dimple, z * dimple);
    }
    geometry.computeVertexNormals();
    const material = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.72,
      metalness: 0,
      clearcoat: 0.12,
      clearcoatRoughness: 0.62,
      envMapIntensity: 0.62,
    });
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vBrainLocal;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBrainLocal = transformed;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vBrainLocal;')
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float brainAngle = atan(vBrainLocal.z, vBrainLocal.x);
          float meanderA = sin(brainAngle * 12.0 + vBrainLocal.y * 16.0 + sin(vBrainLocal.x * 8.0) * 1.8);
          float meanderB = sin(brainAngle * 7.0 - vBrainLocal.y * 21.0 + cos(vBrainLocal.z * 9.0) * 1.4);
          float groove = 1.0 - smoothstep(0.03, 0.38, abs(meanderA + meanderB * 0.42));
          float pore = smoothstep(0.91, 0.98, sin(vBrainLocal.x * 54.0) * sin(vBrainLocal.z * 49.0) * 0.5 + 0.5);
          diffuseColor.rgb *= 1.08 - groove * 0.34 - pore * 0.08;
          diffuseColor.rgb += vec3(0.12, 0.065, 0.09) * (1.0 - groove) * 0.1;`,
        );
    };
    material.customProgramCacheKey = () => 'tidal-brain-coral-v1';
    const brains = new THREE.InstancedMesh(geometry, material, count);
    brains.name = 'meandering-brain-corals';
    brains.castShadow = preset.shadowMapSize > 0;
    brains.receiveShadow = true;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const color = new THREE.Color();
    const euler = new THREE.Euler();
    for (let i = 0; i < count; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      const x = side * range(random, 6.2, 10.4);
      const z = i < 8 ? range(random, -10, 9) : range(random, -78, 6);
      const baseY = -2.72 + Math.min(2.15, Math.abs(x) * 0.112);
      position.set(x, baseY + range(random, 0.15, 0.42), z);
      euler.set(range(random, -0.12, 0.12), range(random, 0, Math.PI * 2), range(random, -0.1, 0.1));
      quaternion.setFromEuler(euler);
      const size = range(random, 0.42, i < 8 ? 1.28 : 0.94);
      scale.set(size * range(random, 0.85, 1.18), size * range(random, 0.66, 0.92), size);
      matrix.compose(position, quaternion, scale);
      brains.setMatrixAt(i, matrix);
      const tone = random();
      if (tone > 0.62) color.setHSL(range(random, 0.91, 0.97), range(random, 0.34, 0.56), range(random, 0.42, 0.57));
      else if (tone > 0.28) color.setHSL(range(random, 0.035, 0.085), range(random, 0.33, 0.52), range(random, 0.44, 0.59));
      else color.setHSL(range(random, 0.47, 0.52), range(random, 0.34, 0.52), range(random, 0.42, 0.56));
      brains.setColorAt(i, color);
    }
    brains.instanceMatrix.needsUpdate = true;
    brains.instanceColor!.needsUpdate = true;
    this.group.add(brains);
  }

  private addPolypColonies(preset: QualityPreset): void {
    const random = createRandom(9763);
    const colonyCount = Math.max(8, Math.round(preset.coralCount * 0.08));
    const polypsPerColony = preset.coralCount >= 150 ? 34 : preset.coralCount >= 100 ? 26 : 18;
    const centers: THREE.Vector3[] = [];
    const colonyScales: number[] = [];
    const colonyColors: THREE.Color[] = [];
    for (let i = 0; i < colonyCount; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      const x = side * range(random, 5.9, 9.2);
      const z = i < 7 ? range(random, -13, 8) : range(random, -78, 5);
      centers.push(new THREE.Vector3(x, -2.74 + Math.min(2.08, Math.abs(x) * 0.112), z));
      colonyScales.push(range(random, 0.55, i < 7 ? 1.12 : 0.9));
      const tone = random();
      const color = new THREE.Color();
      if (tone > 0.68) color.setHSL(range(random, 0.91, 0.98), range(random, 0.34, 0.53), range(random, 0.4, 0.52));
      else if (tone > 0.34) color.setHSL(range(random, 0.06, 0.11), range(random, 0.3, 0.48), range(random, 0.42, 0.55));
      else color.setHSL(range(random, 0.43, 0.5), range(random, 0.3, 0.48), range(random, 0.37, 0.49));
      colonyColors.push(color);
    }

    const baseGeometry = new THREE.SphereGeometry(0.5, 22, 14);
    const basePositions = baseGeometry.getAttribute('position');
    for (let i = 0; i < basePositions.count; i += 1) {
      const x = basePositions.getX(i);
      const y = basePositions.getY(i);
      const z = basePositions.getZ(i);
      const cellular = 1 + Math.sin(x * 17 + z * 13) * Math.sin(y * 21 - x * 9) * 0.035;
      basePositions.setXYZ(i, x * cellular, y * cellular, z * cellular);
    }
    baseGeometry.computeVertexNormals();
    const baseMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.78,
      metalness: 0,
      clearcoat: 0.08,
      clearcoatRoughness: 0.65,
    });
    baseMaterial.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vColonyLocal;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvColonyLocal = transformed;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vColonyLocal;
          float colonyHash(vec3 p) {
            return fract(sin(dot(p, vec3(31.17, 87.43, 19.73))) * 43758.5453);
          }`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float cellular = colonyHash(floor((vColonyLocal + 0.4) * 18.0));
          float pore = smoothstep(0.84, 0.96, cellular);
          float tissue = sin(vColonyLocal.x * 23.0 + sin(vColonyLocal.z * 18.0))
            * sin(vColonyLocal.y * 26.0 - vColonyLocal.z * 9.0) * 0.5 + 0.5;
          diffuseColor.rgb *= 0.78 + tissue * 0.19;
          diffuseColor.rgb *= 1.0 - pore * 0.31;`,
        );
    };
    baseMaterial.customProgramCacheKey = () => 'tidal-cauliflower-coral-tissue-v1';
    const bases = new THREE.InstancedMesh(baseGeometry, baseMaterial, colonyCount);
    bases.name = 'cauliflower-coral-bases';
    bases.receiveShadow = true;

    const stem = new THREE.CylinderGeometry(0.036, 0.052, 0.17, 7, 2);
    stem.translate(0, 0.085, 0);
    const bud = new THREE.SphereGeometry(0.066, 9, 7);
    bud.scale(1, 0.72, 1);
    bud.translate(0, 0.185, 0);
    const polypGeometry = mergeGeometries([stem, bud]);
    if (!polypGeometry) throw new Error('Unable to create coral polyp geometry.');
    polypGeometry.computeVertexNormals();
    const polypMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.67,
      metalness: 0,
      clearcoat: 0.13,
      clearcoatRoughness: 0.55,
    });
    polypMaterial.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vPolypLocal;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPolypLocal = transformed;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vPolypLocal;')
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float crown = smoothstep(0.12, 0.205, vPolypLocal.y);
          float mouth = crown * exp(-dot(vPolypLocal.xz, vPolypLocal.xz) * 420.0);
          diffuseColor.rgb = mix(diffuseColor.rgb * 0.84, diffuseColor.rgb * 1.07, crown);
          diffuseColor.rgb *= 1.0 - mouth * 0.42;`,
        );
    };
    polypMaterial.customProgramCacheKey = () => 'tidal-visible-coral-polyps-v1';
    const polyps = new THREE.InstancedMesh(polypGeometry, polypMaterial, colonyCount * polypsPerColony);
    polyps.name = 'visible-coral-polyp-crowns';
    polyps.castShadow = preset.shadowMapSize > 0;
    polyps.receiveShadow = true;

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const direction = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    let instance = 0;
    for (let colony = 0; colony < colonyCount; colony += 1) {
      const center = centers[colony];
      const colonyScale = colonyScales[colony];
      scale.set(colonyScale * range(random, 0.9, 1.14), colonyScale * range(random, 0.55, 0.76), colonyScale);
      matrix.compose(center, quaternion.identity(), scale);
      bases.setMatrixAt(colony, matrix);
      bases.setColorAt(colony, colonyColors[colony]);

      for (let j = 0; j < polypsPerColony; j += 1) {
        const angle = random() * Math.PI * 2;
        const height = range(random, 0.08, 1);
        const radial = Math.sqrt(Math.max(0, 1 - height * height));
        direction.set(Math.cos(angle) * radial, height, Math.sin(angle) * radial).normalize();
        position.copy(center).add(new THREE.Vector3(
          direction.x * colonyScale * 0.48,
          direction.y * colonyScale * 0.35,
          direction.z * colonyScale * 0.48,
        ));
        quaternion.setFromUnitVectors(up, direction);
        const size = colonyScale * range(random, 0.58, 1.08);
        scale.set(size, size * range(random, 0.78, 1.24), size);
        matrix.compose(position, quaternion, scale);
        polyps.setMatrixAt(instance, matrix);
        const polypColor = colonyColors[colony].clone().offsetHSL(
          range(random, -0.015, 0.015),
          range(random, -0.05, 0.06),
          range(random, -0.06, 0.08),
        );
        polyps.setColorAt(instance, polypColor);
        instance += 1;
      }
    }
    bases.instanceMatrix.needsUpdate = true;
    bases.instanceColor!.needsUpdate = true;
    polyps.instanceMatrix.needsUpdate = true;
    polyps.instanceColor!.needsUpdate = true;
    this.group.add(bases, polyps);
  }

  private addSpongeClusters(preset: QualityPreset): void {
    const random = createRandom(5881);
    const count = preset.coralCount * 3;
    const geometry = new THREE.CapsuleGeometry(0.16, 0.68, 4, 8);
    geometry.translate(0, 0.5, 0);
    const material = new THREE.MeshPhysicalMaterial({
      color: 0xc3b89b,
      roughness: 0.62,
      metalness: 0,
      clearcoat: 0.14,
      clearcoatRoughness: 0.56,
    });
    const sponges = new THREE.InstancedMesh(geometry, material, count);
    sponges.name = 'reef-sponge-clusters';
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const color = new THREE.Color();
    const euler = new THREE.Euler();
    for (let i = 0; i < count; i += 1) {
      const side = random() < 0.5 ? -1 : 1;
      const cluster = Math.floor(i / 3);
      const clusterZ = -94 + ((cluster * 17.17) % 103);
      const x = side * range(random, 6.4, 10.8);
      const y = -2.75 + Math.min(2.2, Math.abs(x) * 0.115);
      position.set(x + range(random, -0.42, 0.42), y, clusterZ + range(random, -0.5, 0.5));
      euler.set(range(random, -0.16, 0.16), range(random, 0, Math.PI), side * range(random, -0.15, 0.15));
      quaternion.setFromEuler(euler);
      const height = range(random, 0.35, 1.25);
      scale.set(range(random, 0.65, 1.35), height, range(random, 0.65, 1.35));
      matrix.compose(position, quaternion, scale);
      sponges.setMatrixAt(i, matrix);
      const spongeTone = random();
      if (spongeTone > 0.68) color.setHSL(range(random, 0.035, 0.09), range(random, 0.5, 0.7), range(random, 0.44, 0.58));
      else if (spongeTone > 0.34) color.setHSL(range(random, 0.92, 0.99), range(random, 0.32, 0.52), range(random, 0.4, 0.54));
      else color.setHSL(range(random, 0.42, 0.5), range(random, 0.34, 0.52), range(random, 0.38, 0.52));
      sponges.setColorAt(i, color);
    }
    sponges.instanceMatrix.needsUpdate = true;
    sponges.instanceColor!.needsUpdate = true;
    this.group.add(sponges);
  }

  private createMineralTexture(seed: number, size: number, repeatX: number, repeatY: number): THREE.DataTexture {
    const random = createRandom(seed);
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const broad = Math.sin(x * 0.071 + Math.sin(y * 0.039) * 2.1) * 0.13;
        const medium = Math.sin(y * 0.19 - x * 0.11) * 0.07;
        const fine = (random() - 0.5) * 0.12;
        const value = THREE.MathUtils.clamp(0.79 + broad + medium + fine, 0.48, 1);
        const byte = Math.round(value * 255);
        const index = (y * size + x) * 4;
        data[index] = byte;
        data[index + 1] = byte;
        data[index + 2] = byte;
        data[index + 3] = 255;
      }
    }
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return texture;
  }

  private addLightShafts(preset: QualityPreset): void {
    const random = createRandom(812);
    for (let i = 0; i < preset.lightShafts; i += 1) {
      const geometry = new THREE.PlaneGeometry(range(random, 6, 11), 31, 1, 1);
      const material = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
          uTime: { value: 0 },
          uOpacity: { value: range(random, 0.045, 0.09) },
        }]),
        vertexShader: `
          varying vec2 vUv;
          #include <fog_pars_vertex>
          void main() {
            vUv = uv;
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mvPosition;
            #include <fog_vertex>
          }
        `,
        fragmentShader: `
          uniform float uTime;
          uniform float uOpacity;
          varying vec2 vUv;
          #include <fog_pars_fragment>
          void main() {
            float centered = (vUv.x - 0.5) / 0.3;
            float horizontal = exp(-centered * centered);
            float vertical = smoothstep(0.0, 0.2, vUv.y) * (1.0 - smoothstep(0.72, 1.0, vUv.y));
            float current = 0.74 + sin(uTime * 0.27 + vUv.y * 8.0 + vUv.x * 3.0) * 0.18;
            float rippledEdge = 0.76 + sin(vUv.y * 24.0 - uTime * 0.42 + vUv.x * 7.0) * 0.24;
            gl_FragColor = vec4(vec3(0.45, 0.86, 0.84), horizontal * vertical * current * rippledEdge * uOpacity);
            #include <fog_fragment>
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        fog: true,
      });
      const shaft = new THREE.Mesh(geometry, material);
      shaft.position.set(range(random, -6, 7), range(random, 8.5, 11.5), -10 - i * range(random, 12, 19));
      shaft.rotation.z = range(random, -0.24, -0.1);
      shaft.rotation.y = range(random, -0.18, 0.18);
      shaft.name = `sun-shaft-${i + 1}`;
      this.shaftMaterials.push(material);
      this.group.add(shaft);
    }
  }

  update(time: number): void {
    const scaledTime = time * this.motionScale;
    if (this.floorShader) this.floorShader.uniforms.uTime.value = scaledTime * OCEAN.causticSpeed * 5;
    if (this.grassShader) this.grassShader.uniforms.uTime.value = scaledTime;
    for (const shader of this.coralShaders) shader.uniforms.uTime.value = scaledTime;
    this.livingReef.update(time);
    this.benthicLife.update(time);
    for (const material of this.shaftMaterials) material.uniforms.uTime.value = scaledTime;
  }
}
