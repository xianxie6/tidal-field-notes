import * as THREE from 'three';
import type { QualityPreset } from '../core/config';
import { createRandom, range } from '../utils/random';

interface AnimatedShader {
  uniforms: Record<string, { value: number }>;
}

export class BenthicLifeSystem {
  readonly group = new THREE.Group();

  private readonly motionScale: number;
  private readonly animatedShaders: AnimatedShader[] = [];

  constructor(parent: THREE.Group, preset: QualityPreset, motionScale: number) {
    this.motionScale = motionScale;
    this.group.name = 'benthic-life';
    parent.add(this.group);
    this.addAnemones(preset);
    this.addUrchins(preset);
    this.addStarfish(preset);
    this.addSeaCucumbers(preset);
  }

  update(time: number): void {
    for (const shader of this.animatedShaders) {
      shader.uniforms.uTime.value = time * this.motionScale;
    }
  }

  private addAnemones(preset: QualityPreset): void {
    const random = createRandom(7741);
    const centers: THREE.Vector3[] = [];
    for (let i = 0; i < preset.anemoneCount; i += 1) {
      const side = random() < 0.5 ? -1 : 1;
      const x = side * range(random, 5.6, 8.7);
      const z = range(random, -58, 8);
      centers.push(new THREE.Vector3(x, this.floorHeight(x, z) + 0.08, z));
    }

    const baseGeometry = new THREE.SphereGeometry(0.43, 14, 9);
    const baseMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x506659,
      roughness: 0.62,
      metalness: 0,
      clearcoat: 0.18,
      clearcoatRoughness: 0.52,
    });
    const bases = new THREE.InstancedMesh(baseGeometry, baseMaterial, centers.length);
    bases.name = 'anemone-bases';
    bases.receiveShadow = true;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const color = new THREE.Color();
    for (let i = 0; i < centers.length; i += 1) {
      scale.set(range(random, 0.72, 1.18), range(random, 0.2, 0.34), range(random, 0.72, 1.16));
      matrix.compose(centers[i], quaternion, scale);
      bases.setMatrixAt(i, matrix);
      if (random() > 0.5) color.setHSL(range(random, 0.9, 0.98), range(random, 0.3, 0.52), range(random, 0.34, 0.48));
      else color.setHSL(range(random, 0.38, 0.47), range(random, 0.28, 0.46), range(random, 0.3, 0.44));
      bases.setColorAt(i, color);
    }
    bases.instanceMatrix.needsUpdate = true;
    bases.instanceColor!.needsUpdate = true;
    this.group.add(bases);

    const tentaclesPerColony = preset.anemoneCount >= 18 ? 22 : preset.anemoneCount >= 10 ? 18 : 14;
    const tentacleGeometry = new THREE.CapsuleGeometry(0.045, 0.5, 5, 7);
    tentacleGeometry.translate(0, 0.3, 0);
    const tentacleMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x8a9c87,
      roughness: 0.42,
      metalness: 0,
      emissive: 0x172b25,
      emissiveIntensity: 0.22,
      clearcoat: 0.24,
      clearcoatRoughness: 0.4,
    });
    tentacleMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform float uTime;\nvarying float vTentacleTip;',
        )
        .replace(
          '#include <begin_vertex>',
          `vec3 transformed = vec3(position);
          float heightMask = smoothstep(0.02, 0.78, position.y);
          float phase = instanceMatrix[3].x * 1.31 + instanceMatrix[3].z * 0.77;
          transformed.x += sin(uTime * 0.72 + phase + position.y * 1.8) * 0.105 * heightMask * heightMask;
          transformed.z += cos(uTime * 0.57 + phase * 1.7 + position.y) * 0.055 * heightMask;
          vTentacleTip = heightMask;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vTentacleTip;')
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          diffuseColor.rgb = mix(diffuseColor.rgb * 0.82, diffuseColor.rgb * vec3(1.18, 1.13, 1.04), vTentacleTip * 0.34);`,
        );
      this.animatedShaders.push(shader as AnimatedShader);
    };
    tentacleMaterial.customProgramCacheKey = () => 'tidal-anemone-tentacles-v1';

    const tentacles = new THREE.InstancedMesh(
      tentacleGeometry,
      tentacleMaterial,
      centers.length * tentaclesPerColony,
    );
    tentacles.name = 'swaying-anemone-tentacles';
    tentacles.castShadow = preset.shadowMapSize > 0;
    tentacles.receiveShadow = true;
    const euler = new THREE.Euler();
    let instance = 0;
    for (const center of centers) {
      const colonyScale = range(random, 0.62, 1.08);
      for (let j = 0; j < tentaclesPerColony; j += 1) {
        const angle = (j / tentaclesPerColony) * Math.PI * 2 + range(random, -0.2, 0.2);
        const radius = Math.sqrt(random()) * 0.34 * colonyScale;
        const position = new THREE.Vector3(
          center.x + Math.cos(angle) * radius,
          center.y + range(random, 0.02, 0.1),
          center.z + Math.sin(angle) * radius,
        );
        const outward = radius * 0.34;
        euler.set(Math.sin(angle) * outward, range(random, 0, Math.PI), -Math.cos(angle) * outward);
        quaternion.setFromEuler(euler);
        const height = range(random, 0.44, 1.08) * colonyScale;
        scale.set(range(random, 0.76, 1.18), height, range(random, 0.76, 1.18));
        matrix.compose(position, quaternion, scale);
        tentacles.setMatrixAt(instance, matrix);
        const anemoneTone = random();
        if (anemoneTone > 0.68) color.setHSL(range(random, 0.91, 0.99), range(random, 0.48, 0.7), range(random, 0.43, 0.56));
        else if (anemoneTone > 0.38) color.setHSL(range(random, 0.055, 0.11), range(random, 0.48, 0.68), range(random, 0.42, 0.54));
        else color.setHSL(range(random, 0.42, 0.5), range(random, 0.36, 0.56), range(random, 0.38, 0.5));
        tentacles.setColorAt(instance, color);
        instance += 1;
      }
    }
    tentacles.instanceMatrix.needsUpdate = true;
    tentacles.instanceColor!.needsUpdate = true;
    this.group.add(tentacles);
  }

  private addUrchins(preset: QualityPreset): void {
    const random = createRandom(6519);
    const centers: THREE.Vector3[] = [];
    for (let i = 0; i < preset.urchinCount; i += 1) {
      const side = random() < 0.5 ? -1 : 1;
      const x = side * range(random, 5.2, 9.1);
      const z = range(random, -52, 7);
      centers.push(new THREE.Vector3(x, this.floorHeight(x, z) + 0.2, z));
    }

    const bodyGeometry = new THREE.IcosahedronGeometry(0.23, 2);
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x302f2a, roughness: 0.72, metalness: 0 });
    const bodies = new THREE.InstancedMesh(bodyGeometry, bodyMaterial, centers.length);
    bodies.name = 'sea-urchin-bodies';
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const color = new THREE.Color();
    for (let i = 0; i < centers.length; i += 1) {
      scale.setScalar(range(random, 0.72, 1.2));
      matrix.compose(centers[i], quaternion, scale);
      bodies.setMatrixAt(i, matrix);
      color.setHSL(range(random, 0.07, 0.18), range(random, 0.08, 0.2), range(random, 0.09, 0.18));
      bodies.setColorAt(i, color);
    }
    bodies.instanceMatrix.needsUpdate = true;
    bodies.instanceColor!.needsUpdate = true;
    this.group.add(bodies);

    const spinesPerUrchin = preset.urchinCount >= 18 ? 30 : preset.urchinCount >= 10 ? 24 : 18;
    const spineGeometry = new THREE.ConeGeometry(0.018, 0.55, 5, 1);
    spineGeometry.translate(0, 0.275, 0);
    const spineMaterial = new THREE.MeshStandardMaterial({ color: 0x242c27, roughness: 0.74, metalness: 0 });
    const spines = new THREE.InstancedMesh(spineGeometry, spineMaterial, centers.length * spinesPerUrchin);
    spines.name = 'sea-urchin-spines';
    spines.castShadow = preset.shadowMapSize > 0;
    const up = new THREE.Vector3(0, 1, 0);
    const direction = new THREE.Vector3();
    let instance = 0;
    for (const center of centers) {
      for (let j = 0; j < spinesPerUrchin; j += 1) {
        const angle = random() * Math.PI * 2;
        const y = range(random, 0.08, 1);
        const radial = Math.sqrt(Math.max(0, 1 - y * y));
        direction.set(Math.cos(angle) * radial, y, Math.sin(angle) * radial).normalize();
        quaternion.setFromUnitVectors(up, direction);
        const length = range(random, 0.58, 1.25);
        scale.set(range(random, 0.72, 1.2), length, range(random, 0.72, 1.2));
        const position = center.clone().addScaledVector(direction, 0.13);
        matrix.compose(position, quaternion, scale);
        spines.setMatrixAt(instance, matrix);
        instance += 1;
      }
    }
    spines.instanceMatrix.needsUpdate = true;
    this.group.add(spines);
  }

  private addStarfish(preset: QualityPreset): void {
    const random = createRandom(3387);
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i += 1) {
      const angle = (i / 10) * Math.PI * 2 + Math.PI * 0.5;
      const radius = i % 2 === 0 ? 0.5 : 0.2;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.075,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: 0.055,
      bevelThickness: 0.035,
      curveSegments: 2,
    });
    geometry.center();
    geometry.rotateX(-Math.PI / 2);
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({ color: 0xb26c3f, roughness: 0.72, metalness: 0 });
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vStarLocal;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvStarLocal = transformed;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vStarLocal;')
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float starPores = sin(vStarLocal.x * 43.0) * sin(vStarLocal.z * 39.0) * 0.5 + 0.5;
          diffuseColor.rgb *= 0.82 + starPores * 0.2;`,
        );
    };
    material.customProgramCacheKey = () => 'tidal-starfish-v1';
    const starfish = new THREE.InstancedMesh(geometry, material, preset.starfishCount);
    starfish.name = 'seafloor-starfish';
    starfish.receiveShadow = true;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const color = new THREE.Color();
    const euler = new THREE.Euler();
    for (let i = 0; i < preset.starfishCount; i += 1) {
      const side = random() < 0.5 ? -1 : 1;
      const x = side * range(random, 3.6, 8.2);
      const z = range(random, -44, 9);
      const position = new THREE.Vector3(x, this.floorHeight(x, z) + 0.07, z);
      euler.set(range(random, -0.1, 0.1), range(random, 0, Math.PI * 2), range(random, -0.08, 0.08));
      quaternion.setFromEuler(euler);
      const radius = range(random, 0.34, 0.7);
      scale.set(radius * range(random, 0.88, 1.14), radius, radius * range(random, 0.88, 1.14));
      matrix.compose(position, quaternion, scale);
      starfish.setMatrixAt(i, matrix);
      color.setHSL(range(random, 0.015, 0.075), range(random, 0.42, 0.68), range(random, 0.4, 0.56));
      starfish.setColorAt(i, color);
    }
    starfish.instanceMatrix.needsUpdate = true;
    starfish.instanceColor!.needsUpdate = true;
    this.group.add(starfish);
  }

  private addSeaCucumbers(preset: QualityPreset): void {
    const random = createRandom(8851);
    const count = Math.max(8, Math.round(preset.starfishCount * 0.85));
    const geometry = new THREE.CapsuleGeometry(0.18, 0.72, 6, 14);
    geometry.rotateZ(Math.PI / 2);
    const material = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.66,
      metalness: 0,
      clearcoat: 0.12,
      clearcoatRoughness: 0.6,
    });
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vCucumberLocal;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCucumberLocal = transformed;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vCucumberLocal;')
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float rows = sin(vCucumberLocal.x * 34.0 + sin(vCucumberLocal.z * 18.0));
          float nodules = smoothstep(0.7, 0.97, rows * sin(vCucumberLocal.y * 41.0) * 0.5 + 0.5);
          float underside = 1.0 - smoothstep(-0.13, 0.04, vCucumberLocal.y);
          diffuseColor.rgb *= 0.78 + nodules * 0.28;
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.72, 0.82, 0.62), underside * 0.36);`,
        );
    };
    material.customProgramCacheKey = () => 'tidal-sea-cucumber-v1';
    const cucumbers = new THREE.InstancedMesh(geometry, material, count);
    cucumbers.name = 'detailed-sea-cucumbers';
    cucumbers.receiveShadow = true;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const euler = new THREE.Euler();
    const color = new THREE.Color();
    for (let i = 0; i < count; i += 1) {
      const side = random() < 0.5 ? -1 : 1;
      const x = side * range(random, 3.8, 8.6);
      const z = range(random, -42, 9);
      const position = new THREE.Vector3(x, this.floorHeight(x, z) + 0.16, z);
      euler.set(range(random, -0.08, 0.08), range(random, 0, Math.PI), range(random, -0.08, 0.08));
      quaternion.setFromEuler(euler);
      const size = range(random, 0.52, 1.15);
      scale.set(size, size * range(random, 0.72, 1.05), size * range(random, 0.72, 1.05));
      matrix.compose(position, quaternion, scale);
      cucumbers.setMatrixAt(i, matrix);
      const tone = random();
      if (tone > 0.64) color.setHSL(range(random, 0.02, 0.07), range(random, 0.4, 0.58), range(random, 0.3, 0.43));
      else if (tone > 0.3) color.setHSL(range(random, 0.1, 0.16), range(random, 0.28, 0.44), range(random, 0.27, 0.4));
      else color.setHSL(range(random, 0.82, 0.91), range(random, 0.22, 0.4), range(random, 0.3, 0.43));
      cucumbers.setColorAt(i, color);
    }
    cucumbers.instanceMatrix.needsUpdate = true;
    cucumbers.instanceColor!.needsUpdate = true;
    this.group.add(cucumbers);
  }

  private floorHeight(x: number, z: number): number {
    const depth = -z - 45;
    const channel = -2.9 + Math.min(2.8, Math.abs(x) * 0.12);
    const strata = Math.sin(x * 0.42 + depth * 0.08) * 0.28 + Math.sin(depth * 0.23) * 0.13;
    const currentRipple = Math.sin(depth * 1.34 + Math.sin(x * 0.22) * 1.65) * 0.052;
    const crossRipple = Math.sin(depth * 2.78 - x * 0.31) * 0.018;
    return channel + strata + currentRipple + crossRipple;
  }
}
