import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

interface HeroFishShader {
  uniforms: Record<string, { value: number }>;
}

interface CompanionFish {
  anchor: THREE.Group;
  phase: number;
  lateral: number;
  vertical: number;
  trailing: number;
}

interface FocusableFish {
  anchor: THREE.Object3D;
  baseScale: THREE.Vector3;
  focus: number;
}

export class HeroFishSystem {
  readonly group = new THREE.Group();

  private readonly motionScale: number;
  private readonly avoidancePoint = new THREE.Vector3(1000, 1000, 1000);
  private readonly cameraPoint = new THREE.Vector3(1000, 1000, 1000);
  private readonly avoidanceOffset = new THREE.Vector3();
  private readonly avoidanceVelocity = new THREE.Vector3();
  private readonly attractionPoint = new THREE.Vector3();
  private readonly attractionOffset = new THREE.Vector3();
  private readonly basePosition = new THREE.Vector3();
  private readonly previousBasePosition = new THREE.Vector3();
  private readonly heading = new THREE.Vector3(0, 0, 1);
  private readonly desiredRotation = new THREE.Quaternion();
  private readonly forward = new THREE.Vector3(0, 0, 1);
  private readonly temporary = new THREE.Vector3();
  private readonly companions: CompanionFish[] = [];
  private readonly focusableFish: FocusableFish[] = [];
  private focusedAnchor: THREE.Object3D | null = null;
  private shader: HeroFishShader | null = null;
  private loaded = false;
  private hasAttraction = false;
  private attractionStrength = 0;

  constructor(scene: THREE.Scene, reducedMotion: boolean) {
    this.motionScale = reducedMotion ? 0.35 : 1;
    this.group.name = 'barramundi-observation-fish';
    this.group.visible = false;
    scene.add(this.group);
  }

  async load(): Promise<void> {
    try {
      const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}assets/models/barramundi-fish.glb`);
      const model = gltf.scene;
      const bounds = new THREE.Box3().setFromObject(model);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const targetLength = 2.85;
      const scale = targetLength / Math.max(size.x, size.y, size.z);

      model.position.copy(center).multiplyScalar(-1);
      model.scale.setScalar(scale);
      model.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        child.castShadow = true;
        child.receiveShadow = true;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        const tuned = materials.map((source) => {
          const material = source.clone();
          if (material instanceof THREE.MeshStandardMaterial) {
            material.roughness = THREE.MathUtils.clamp(material.roughness, 0.4, 0.52);
            material.metalness = Math.min(material.metalness, 0.012);
            material.envMapIntensity = 0.66;
            material.onBeforeCompile = (shader) => {
              shader.uniforms.uHeroFishTime = { value: 0 };
              shader.vertexShader = shader.vertexShader
                .replace(
                  '#include <common>',
                  '#include <common>\nuniform float uHeroFishTime;\nvarying vec3 vHeroFishWorld;',
                )
                .replace(
                  '#include <begin_vertex>',
                  `vec3 transformed = vec3(position);
                  float tailMask = 1.0 - smoothstep(-0.30, 0.04, transformed.z);
                  float bodyMask = (1.0 - smoothstep(-0.12, 0.31, transformed.z)) * 0.24;
                  float individualPhase = modelMatrix[3].x * 0.31 + modelMatrix[3].y * 0.43 + modelMatrix[3].z * 0.17;
                  float swim = sin(uHeroFishTime * 4.2 + transformed.z * 8.5 + individualPhase);
                  transformed.x += swim * (tailMask * tailMask * 0.046 + bodyMask * 0.012);
                  vHeroFishWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
                );
              shader.fragmentShader = shader.fragmentShader
                .replace(
                  '#include <common>',
                  '#include <common>\nuniform float uHeroFishTime;\nvarying vec3 vHeroFishWorld;',
                )
                .replace(
                  '#include <color_fragment>',
                  `#include <color_fragment>
                  vec2 causticP = vHeroFishWorld.xz * 1.15;
                  float causticA = sin(causticP.x * 2.1 + sin(causticP.y * 1.7 - uHeroFishTime * 0.8));
                  float causticB = sin(causticP.y * 2.6 - cos(causticP.x * 1.4 + uHeroFishTime * 0.55));
                  float caustic = pow(max(0.0, causticA * causticB), 4.0);
                  diffuseColor.rgb += vec3(0.13, 0.21, 0.17) * caustic * 0.18;
                  float scaleGleam = pow(max(0.0, sin(vHeroFishWorld.z * 37.0 + sin(vHeroFishWorld.y * 29.0))), 10.0);
                  float facing = 1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition)));
                  diffuseColor.rgb += vec3(0.16, 0.2, 0.14) * scaleGleam * facing * 0.07;
                  float waterDistance = distance(cameraPosition, vHeroFishWorld);
                  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.74, 1.0, 0.96), smoothstep(9.0, 30.0, waterDistance) * 0.28);`,
                )
                .replace(
                  '#include <opaque_fragment>',
                  `outgoingLight = pow(max(outgoingLight, vec3(0.0)), vec3(1.1)) * 0.43;
                  #include <opaque_fragment>`,
                );
              this.shader = shader as HeroFishShader;
            };
            material.customProgramCacheKey = () => 'tidal-barramundi-v3-glisten';
          }
          return material;
        });
        child.material = Array.isArray(child.material) ? tuned : tuned[0];
      });

      const adult = new THREE.Group();
      adult.name = 'adult-barramundi';
      adult.add(model);
      this.group.add(adult);
      this.focusableFish.push({ anchor: adult, baseScale: adult.scale.clone(), focus: 0 });
      this.addCompanion(model, 0.5, 1.17, -0.74, 0.42, -2.1);
      this.addCompanion(model, 0.37, 3.82, 0.92, -0.34, -3.05);
      this.samplePath(0, this.basePosition);
      this.previousBasePosition.copy(this.basePosition).addScaledVector(this.forward, -0.1);
      this.group.position.copy(this.basePosition);
      this.group.visible = true;
      this.loaded = true;
    } catch {
      // The procedural school remains a complete fallback if the optional hero asset fails.
    }
  }

  setAvoidancePoint(point: THREE.Vector3): void {
    this.avoidancePoint.copy(point);
  }

  setCameraPoint(point: THREE.Vector3): void {
    this.cameraPoint.copy(point);
  }

  setAttractionPoint(point: THREE.Vector3): void {
    this.attractionPoint.copy(point);
    this.hasAttraction = true;
    this.attractionStrength = 1;
  }

  selectObject(object: THREE.Object3D): boolean {
    let current: THREE.Object3D | null = object;
    while (current && current !== this.group) {
      const focusable = this.focusableFish.find((entry) => entry.anchor === current);
      if (focusable) {
        this.focusedAnchor = focusable.anchor;
        return true;
      }
      current = current.parent;
    }
    return false;
  }

  clearFocus(): void {
    this.focusedAnchor = null;
  }

  update(time: number, delta: number): void {
    if (!this.loaded) return;
    const scaledTime = time * this.motionScale;
    if (this.hasAttraction) {
      this.attractionStrength *= Math.exp(-0.32 * delta);
      if (this.attractionStrength < 0.035) this.hasAttraction = false;
    }
    if (this.shader) this.shader.uniforms.uHeroFishTime.value = scaledTime;

    this.samplePath(scaledTime, this.basePosition);
    if (this.hasAttraction) {
      this.temporary.copy(this.attractionPoint).sub(this.basePosition);
      if (this.temporary.length() > 22) this.temporary.setLength(22);
      this.temporary.multiplyScalar(this.attractionStrength);
      this.attractionOffset.lerp(this.temporary, 1 - Math.exp(-0.62 * delta));
      this.basePosition.add(this.attractionOffset);
    }
    const safeDelta = Math.max(delta, 1 / 120);
    this.heading.copy(this.basePosition).sub(this.previousBasePosition).divideScalar(safeDelta);
    this.previousBasePosition.copy(this.basePosition);

    this.applyAvoidance(this.basePosition, this.avoidancePoint, 6.2, 4.6, delta);
    this.applyAvoidance(this.basePosition, this.cameraPoint, 2.05, 4.8, delta);
    this.avoidanceVelocity.addScaledVector(this.avoidanceOffset, -0.72 * delta);
    this.avoidanceVelocity.multiplyScalar(Math.exp(-1.65 * delta));
    this.avoidanceOffset.addScaledVector(this.avoidanceVelocity, delta);
    this.avoidanceOffset.multiplyScalar(Math.exp(-0.34 * delta));

    this.group.position.copy(this.basePosition).add(this.avoidanceOffset);
    this.heading.addScaledVector(this.avoidanceVelocity, 0.75).normalize();
    this.desiredRotation.setFromUnitVectors(this.forward, this.heading);
    this.group.quaternion.slerp(this.desiredRotation, 1 - Math.exp(-2.4 * delta));

    const bank = THREE.MathUtils.clamp(-this.heading.x * 0.08 + Math.sin(scaledTime * 0.56) * 0.025, -0.1, 0.1);
    this.group.rotateZ(bank * delta * 2.2);

    for (const companion of this.companions) {
      const pulse = scaledTime * 0.72 + companion.phase;
      companion.anchor.position.set(
        companion.lateral + Math.sin(pulse * 1.13) * 0.2,
        companion.vertical + Math.sin(pulse * 0.91) * 0.16,
        companion.trailing + Math.cos(pulse * 0.77) * 0.22,
      );
      companion.anchor.rotation.set(
        Math.sin(pulse * 0.63) * 0.035,
        Math.sin(pulse * 0.48) * 0.075,
        Math.sin(pulse * 0.82) * 0.055,
      );
    }
    for (const focusable of this.focusableFish) {
      const target = focusable.anchor === this.focusedAnchor ? 1 : 0;
      focusable.focus = THREE.MathUtils.damp(focusable.focus, target, 6.5, delta);
      focusable.anchor.scale.copy(focusable.baseScale).multiplyScalar(1 + focusable.focus * 0.72);
    }
  }

  private addCompanion(
    source: THREE.Object3D,
    relativeScale: number,
    phase: number,
    lateral: number,
    vertical: number,
    trailing: number,
  ): void {
    const anchor = new THREE.Group();
    const fish = source.clone(true);
    fish.scale.multiplyScalar(relativeScale);
    anchor.scale.set(
      0.9 + relativeScale * 0.16,
      1.08 - relativeScale * 0.12,
      0.94 + relativeScale * 0.09,
    );
    anchor.name = 'juvenile-barramundi';
    anchor.position.set(lateral, vertical, trailing);
    anchor.add(fish);
    this.group.add(anchor);
    this.companions.push({ anchor, phase, lateral, vertical, trailing });
    this.focusableFish.push({ anchor, baseScale: anchor.scale.clone(), focus: 0 });
  }

  private samplePath(time: number, target: THREE.Vector3): void {
    const phase = time * 0.145 - 0.65;
    target.set(
      Math.sin(phase) * 11.8,
      4.2 + Math.sin(phase * 1.7 + 0.8) * 0.72,
      -1.6 + Math.cos(phase) * 3.7 + Math.sin(phase * 0.43) * 1.2,
    );
  }

  private applyAvoidance(
    origin: THREE.Vector3,
    point: THREE.Vector3,
    radius: number,
    strength: number,
    delta: number,
  ): void {
    this.temporary.copy(origin).add(this.avoidanceOffset).sub(point);
    const distance = this.temporary.length();
    if (distance >= radius || distance < 0.001) return;
    const response = (1 - distance / radius) ** 2 * strength;
    this.avoidanceVelocity.addScaledVector(this.temporary, (response * delta) / distance);
  }
}
