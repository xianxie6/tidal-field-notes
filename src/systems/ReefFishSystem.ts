import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { QualityPreset } from '../core/config';
import { createRandom, range } from '../utils/random';
import { createFinMembrane } from '../utils/fishGeometry';

interface FishShader {
  uniforms: Record<string, { value: number }>;
}

interface ShaderRef {
  current: FishShader | null;
}

interface ReefSchool {
  meshes: THREE.InstancedMesh[];
  positions: Float32Array;
  velocities: Float32Array;
  laneX: Float32Array;
  laneY: Float32Array;
  laneZ: Float32Array;
  phases: Float32Array;
  scales: Float32Array;
  focusAmounts: Float32Array;
  orientations: THREE.Quaternion[];
  shaderRefs: ShaderRef[];
  speed: number;
}

type Pattern = 'opal' | 'koi' | 'tetra' | 'discus' | 'angel' | 'garnet';

export class ReefFishSystem {
  readonly meshes: THREE.InstancedMesh[] = [];

  private readonly schools: ReefSchool[] = [];
  private readonly scaleBumpTexture = this.createScaleBumpTexture();
  private readonly motionScale: number;
  private readonly avoidancePoint = new THREE.Vector3(1000, 1000, 1000);
  private readonly cameraPoint = new THREE.Vector3(1000, 1000, 1000);
  private readonly attractionPoint = new THREE.Vector3();
  private hasAttraction = false;
  private attractionStrength = 0;
  private readonly position = new THREE.Vector3();
  private readonly velocity = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly bankQuaternion = new THREE.Quaternion();
  private readonly forward = new THREE.Vector3(0, 0, 1);
  private readonly projected = new THREE.Vector3();
  private focusedSchool: ReefSchool | null = null;
  private focusedIndex = -1;

  constructor(scene: THREE.Scene, preset: QualityPreset, reducedMotion: boolean) {
    this.motionScale = reducedMotion ? 0.35 : 1;
    const total = preset.reefFishCount;
    const opal = Math.round(total * 0.2);
    const koi = Math.round(total * 0.15);
    const tetra = Math.round(total * 0.25);
    const discus = Math.round(total * 0.13);
    const angel = Math.round(total * 0.13);
    this.addSchool(scene, 'opal', opal, 0x77c6d4, 0.7, 1701);
    this.addSchool(scene, 'koi', koi, 0xe8d7bd, 0.5, 3719);
    this.addSchool(scene, 'tetra', tetra, 0x8bd9c9, 0.84, 8123);
    this.addSchool(scene, 'discus', discus, 0x80c6bd, 0.43, 10111);
    this.addSchool(scene, 'angel', angel, 0xe59a45, 0.46, 12091);
    this.addSchool(scene, 'garnet', total - opal - koi - tetra - discus - angel, 0xe974a5, 0.57, 19139);
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

  hasHit(raycaster: THREE.Raycaster): boolean {
    return raycaster.intersectObjects(this.meshes, false).length > 0;
  }

  selectObject(object: THREE.Object3D, instanceId: number | undefined): boolean {
    if (instanceId === undefined) return false;
    const school = this.schools.find((candidate) => candidate.meshes.includes(object as THREE.InstancedMesh));
    if (!school || instanceId < 0 || instanceId >= school.positions.length / 3) return false;
    this.focusedSchool = school;
    this.focusedIndex = instanceId;
    return true;
  }

  selectNearPointer(pointer: THREE.Vector2, camera: THREE.Camera, radius = 0.11): boolean {
    const radiusSq = radius * radius;
    const aspect = camera instanceof THREE.PerspectiveCamera ? camera.aspect : 1;
    let nearestSchool: ReefSchool | null = null;
    let nearestIndex = -1;
    let nearestDistance = radiusSq;
    for (const school of this.schools) {
      for (let i = 0; i < school.positions.length / 3; i += 1) {
        const index = i * 3;
        this.projected.set(
          school.positions[index],
          school.positions[index + 1],
          school.positions[index + 2],
        ).project(camera);
        if (this.projected.z < -1 || this.projected.z > 1) continue;
        const dx = (this.projected.x - pointer.x) * aspect;
        const dy = this.projected.y - pointer.y;
        const distance = dx * dx + dy * dy;
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestSchool = school;
          nearestIndex = i;
        }
      }
    }
    if (!nearestSchool) return false;
    this.focusedSchool = nearestSchool;
    this.focusedIndex = nearestIndex;
    return true;
  }

  clearFocus(): void {
    this.focusedSchool = null;
    this.focusedIndex = -1;
  }

  update(time: number, delta: number): void {
    const scaledDelta = delta * this.motionScale;
    const scaledTime = time * this.motionScale;
    if (this.hasAttraction) {
      this.attractionStrength *= Math.exp(-0.32 * delta);
      if (this.attractionStrength < 0.035) this.hasAttraction = false;
    }
    for (const school of this.schools) {
      for (const shaderRef of school.shaderRefs) {
        if (shaderRef.current) shaderRef.current.uniforms.uReefFishTime.value = scaledTime;
      }
      for (let i = 0; i < school.positions.length / 3; i += 1) {
        const index = i * 3;
        this.position.fromArray(school.positions, index);
        this.velocity.fromArray(school.velocities, index);
        const phase = school.phases[i];
        const targetX = school.laneX[i] + Math.sin(scaledTime * 0.31 + phase) * 2.1;
        const targetY = school.laneY[i] + Math.sin(scaledTime * 0.43 + phase * 1.7) * 0.38;
        const targetZ = school.laneZ[i] + Math.sin(scaledTime * 0.22 + phase * 0.73) * 1.65;
        this.velocity.x += (targetX - this.position.x) * 0.28 * scaledDelta;
        this.velocity.y += (targetY - this.position.y) * 0.2 * scaledDelta;
        this.velocity.z += (targetZ - this.position.z) * 0.18 * scaledDelta;
        this.velocity.x += Math.sin(scaledTime * 0.52 + phase + this.position.z * 0.08) * 0.09 * scaledDelta;
        this.velocity.y += Math.cos(scaledTime * 0.37 + phase) * 0.035 * scaledDelta;
        if (this.hasAttraction) {
          this.direction.copy(this.attractionPoint).sub(this.position);
          this.direction.x += Math.sin(phase * 1.7) * 1.4;
          this.direction.y += Math.cos(phase * 1.3) * 0.85;
          this.direction.z += Math.sin(phase * 0.9) * 1.5;
          const distance = this.direction.length();
          if (distance > 1.1) {
            const pull = 1.35 + THREE.MathUtils.smoothstep(distance, 1.1, 8) * 0.65;
            this.velocity.addScaledVector(this.direction, (pull * this.attractionStrength * scaledDelta) / distance);
          }
        }
        this.applyAvoidance(this.position, this.velocity, this.avoidancePoint, 4.8, 6.2, scaledDelta);
        this.applyAvoidance(this.position, this.velocity, this.cameraPoint, 1.55, 5.4, scaledDelta);

        const focusTarget = school === this.focusedSchool && i === this.focusedIndex ? 1 : 0;
        school.focusAmounts[i] = THREE.MathUtils.damp(school.focusAmounts[i], focusTarget, 7.5, delta);
        this.velocity.multiplyScalar(1 - school.focusAmounts[i] * Math.min(0.72, delta * 2.4));
        const speed = this.velocity.length();
        const targetSpeed = school.speed * (0.82 + Math.sin(phase * 2.3) * 0.13);
        this.velocity.multiplyScalar(THREE.MathUtils.clamp(targetSpeed / Math.max(speed, 0.001), 0.97, 1.03));
        this.position.addScaledVector(this.velocity, scaledDelta);
        if (this.position.z < -72) this.velocity.z += 1.1 * scaledDelta;
        if (this.position.z > 9) this.velocity.z -= 1.1 * scaledDelta;
        if (Math.abs(this.position.x) > 9.2) this.velocity.x -= Math.sign(this.position.x) * 0.8 * scaledDelta;
        if (this.position.y < -1.8) this.velocity.y += 0.9 * scaledDelta;
        if (this.position.y > 8.5) this.velocity.y -= 0.8 * scaledDelta;
        this.position.toArray(school.positions, index);
        this.velocity.toArray(school.velocities, index);

        this.direction.copy(this.velocity).normalize();
        this.quaternion.setFromUnitVectors(this.forward, this.direction);
        this.bankQuaternion.setFromAxisAngle(this.forward, THREE.MathUtils.clamp(-this.velocity.x * 0.18, -0.18, 0.18));
        this.quaternion.multiply(this.bankQuaternion);
        school.orientations[i].slerp(this.quaternion, 1 - Math.exp(-4.2 * delta));
        const pulse = 1 + Math.sin(scaledTime * 0.68 + phase) * 0.025;
        const tactileScale = 1 + THREE.MathUtils.smoothstep(school.focusAmounts[i], 0, 1) * 1.55;
        this.scale.setScalar(school.scales[i] * pulse * tactileScale);
        this.matrix.compose(this.position, school.orientations[i], this.scale);
        for (const mesh of school.meshes) mesh.setMatrixAt(i, this.matrix);
      }
      for (const mesh of school.meshes) mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private addSchool(
    scene: THREE.Scene,
    pattern: Pattern,
    count: number,
    baseColor: number,
    speed: number,
    seed: number,
  ): void {
    const bodyShaderRef: ShaderRef = { current: null };
    const finShaderRef: ShaderRef = { current: null };
    const bodyMesh = new THREE.InstancedMesh(
      this.createBodyGeometry(pattern),
      this.createMaterial(pattern, baseColor, bodyShaderRef),
      count,
    );
    const finMesh = new THREE.InstancedMesh(
      this.createFinGeometry(pattern),
      this.createFinMaterial(pattern, finShaderRef),
      count,
    );
    const eyeMesh = new THREE.InstancedMesh(
      this.createEyeGeometry(pattern),
      this.createEyeMaterial(),
      count,
    );
    const meshes = [bodyMesh, finMesh, eyeMesh];
    meshes.forEach((mesh, layer) => {
      mesh.name = `reef-fish-${pattern}-${['body', 'fins', 'eyes'][layer]}`;
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = layer === 0;
    });
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const laneX = new Float32Array(count);
    const laneY = new Float32Array(count);
    const laneZ = new Float32Array(count);
    const phases = new Float32Array(count);
    const scales = new Float32Array(count);
    const focusAmounts = new Float32Array(count);
    const orientations = Array.from({ length: count }, () => new THREE.Quaternion());
    const random = createRandom(seed);
    const color = new THREE.Color();
    for (let i = 0; i < count; i += 1) {
      const index = i * 3;
      const side = random() < 0.5 ? -1 : 1;
      const openWater = pattern === 'tetra' || pattern === 'opal';
      const reefBias = openWater ? range(random, 1.8, 6.6) : range(random, 4.0, 7.8);
      laneX[i] = side * reefBias;
      laneY[i] = pattern === 'tetra'
        ? range(random, 1.5, 6.2)
        : pattern === 'opal'
          ? range(random, 0.8, 5.2)
          : range(random, -0.45, 3.5);
      positions[index] = laneX[i] + range(random, -1.2, 1.2);
      positions[index + 1] = laneY[i] + range(random, -0.45, 0.45);
      const zRange: Record<Pattern, [number, number]> = {
        opal: [-61, 3],
        koi: [-34, 2],
        tetra: [-67, 1],
        discus: [-39, 1],
        angel: [-38, 1],
        garnet: [-46, 3],
      };
      positions[index + 2] = range(random, ...zRange[pattern]);
      laneZ[i] = positions[index + 2];
      velocities[index] = (random() < 0.5 ? -1 : 1) * speed * range(random, 0.72, 1.04);
      velocities[index + 1] = range(random, -0.04, 0.04);
      velocities[index + 2] = range(random, -0.22, 0.22);
      phases[i] = random() * Math.PI * 2;
      const scaleRange: Record<Pattern, [number, number]> = {
        opal: [0.37, 0.57],
        koi: [0.39, 0.54],
        tetra: [0.34, 0.51],
        discus: [0.35, 0.49],
        angel: [0.34, 0.48],
        garnet: [0.36, 0.51],
      };
      scales[i] = range(random, ...scaleRange[pattern]);
      if (pattern !== 'tetra' && i < 2) {
        const kind = ['opal', 'koi', 'discus', 'angel', 'garnet'].indexOf(pattern);
        laneX[i] = (i === 0 ? -1 : 1) * (1.8 + kind * 0.65);
        laneY[i] = 2.7 + (kind % 3) * 0.65;
        laneZ[i] = 3.5 - kind * 1.6 - i * 2.5;
        positions[index] = laneX[i];
        positions[index + 1] = laneY[i];
        positions[index + 2] = laneZ[i];
      }
      if (pattern === 'tetra' && i < 3) {
        const nearX = [-4.6, 4.9, -2.8];
        const nearY = [4.35, 3.75, 5.05];
        const nearZ = [1.8, -1.6, -5.2];
        laneX[i] = nearX[i];
        laneY[i] = nearY[i];
        laneZ[i] = nearZ[i];
        positions[index] = nearX[i];
        positions[index + 1] = nearY[i];
        positions[index + 2] = nearZ[i];
        velocities[index] = (i % 2 === 0 ? 1 : -1) * speed * 0.86;
        velocities[index + 1] = 0;
        velocities[index + 2] = i === 2 ? 0.08 : -0.04;
        scales[i] = 0.62 - i * 0.045;
      }
      color.set(baseColor).offsetHSL(range(random, -0.018, 0.018), range(random, -0.08, 0.08), range(random, -0.07, 0.07));
      bodyMesh.setColorAt(i, color);
    }
    bodyMesh.instanceColor!.needsUpdate = true;
    scene.add(...meshes);
    const school: ReefSchool = {
      meshes,
      positions,
      velocities,
      laneX,
      laneY,
      laneZ,
      phases,
      scales,
      focusAmounts,
      orientations,
      shaderRefs: [bodyShaderRef, finShaderRef],
      speed,
    };
    this.schools.push(school);
    this.meshes.push(bodyMesh, finMesh, eyeMesh);
  }

  private bodyScale(pattern: Pattern): [number, number, number] {
    const scales: Record<Pattern, [number, number, number]> = {
      opal: [0.11, 0.31, 0.58],
      koi: [0.15, 0.47, 0.5],
      tetra: [0.072, 0.215, 0.66],
      discus: [0.11, 0.68, 0.44],
      angel: [0.1, 0.68, 0.46],
      garnet: [0.14, 0.4, 0.5],
    };
    return scales[pattern];
  }

  private createBodyGeometry(pattern: Pattern): THREE.BufferGeometry {
    const profiles: Record<Pattern, Array<[number, number]>> = {
      opal: [[-1, 0.05], [-0.9, 0.28], [-0.58, 0.75], [-0.12, 1], [0.42, 0.95], [0.76, 0.78], [0.95, 0.5], [1, 0.03]],
      koi: [[-1, 0.06], [-0.88, 0.32], [-0.58, 0.82], [-0.1, 1.06], [0.4, 1.02], [0.76, 0.88], [0.95, 0.58], [1, 0.04]],
      tetra: [[-1, 0.04], [-0.91, 0.18], [-0.7, 0.57], [-0.28, 0.9], [0.18, 1], [0.56, 0.88], [0.82, 0.64], [0.96, 0.34], [1, 0.025]],
      discus: [[-1, 0.055], [-0.86, 0.38], [-0.5, 0.86], [-0.05, 1.01], [0.4, 0.98], [0.76, 0.84], [0.95, 0.57], [1, 0.035]],
      angel: [[-1, 0.06], [-0.86, 0.36], [-0.5, 0.83], [-0.04, 1], [0.43, 0.94], [0.78, 0.78], [0.95, 0.52], [1, 0.035]],
      garnet: [[-1, 0.06], [-0.88, 0.34], [-0.55, 0.83], [-0.08, 1.02], [0.4, 0.98], [0.76, 0.84], [0.95, 0.56], [1, 0.035]],
    };
    const [bodyWidth, bodyHeight, bodyLength] = this.bodyScale(pattern);
    const profileCurve = new THREE.CatmullRomCurve3(
      profiles[pattern].map(([z, radius]) => new THREE.Vector3(
        radius * (1 - THREE.MathUtils.smoothstep(z, 0.42, 1) * 0.36), z * bodyLength, 0,
      )),
      false, 'centripetal',
    );
    const profile = profileCurve.getPoints(48).map((p) => new THREE.Vector2(Math.max(0.015, p.x), p.y));
    const body = new THREE.LatheGeometry(profile, 28);
    body.rotateX(Math.PI / 2);
    body.scale(bodyWidth, bodyHeight, 1);
    const parts: THREE.BufferGeometry[] = [body];
    if (pattern === 'angel') {
      const snout = new THREE.ConeGeometry(0.075, 0.18, 10, 1);
      snout.rotateX(Math.PI / 2);
      snout.translate(0, -0.05, 0.48);
      parts.push(snout);
    }
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`Unable to create ${pattern} reef fish body.`);
    merged.computeVertexNormals();
    merged.computeBoundingSphere();
    return merged;
  }

  private createFinGeometry(pattern: Pattern): THREE.BufferGeometry {
    const bodyScale = this.bodyScale(pattern);

    const tailHeight: Record<Pattern, number> = { opal: 0.38, koi: 0.66, tetra: 0.34, discus: 0.48, angel: 0.46, garnet: 0.57 };
    const tailLength: Record<Pattern, number> = { opal: 0.93, koi: 1.08, tetra: 1.02, discus: 0.88, angel: 0.91, garnet: 0.95 };
    const bodyEnd = pattern === 'tetra' || pattern === 'opal' ? -0.57 : -0.46;
    const tailUpper = this.createFin([0, 0, bodyEnd, 0, tailHeight[pattern], -tailLength[pattern], 0, 0, -0.8]);
    const tailLower = this.createFin([0, 0, bodyEnd, 0, 0, -0.8, 0, -tailHeight[pattern], -tailLength[pattern]]);

    const dorsal = new THREE.BufferGeometry();
    const dorsalTop: Record<Pattern, number> = { opal: 0.57, koi: 0.76, tetra: 0.43, discus: 0.94, angel: 0.98, garnet: 0.62 };
    dorsal.setAttribute('position', new THREE.Float32BufferAttribute([
      0, bodyScale[1] * 0.72, 0.25, 0, dorsalTop[pattern], -0.15, 0, bodyScale[1] * 0.74, -0.43,
    ], 3));
    dorsal.setAttribute('uv', new THREE.Float32BufferAttribute([1, 0, 0.5, 1, 0, 0], 2));
    dorsal.setIndex([0, 1, 2]);
    dorsal.computeVertexNormals();

    const pectoralHeight = pattern === 'tetra' ? 0.12 : 0.2;
    const pectoralLeft = this.createFin([
      bodyScale[0] * 0.55, 0.02, 0.2,
      bodyScale[0] * 2.2, -pectoralHeight, -0.04,
      bodyScale[0] * 0.62, -0.08, -0.19,
    ]);
    const pectoralRight = pectoralLeft.clone();
    pectoralRight.scale(-1, 1, 1);
    const curvedDorsal = this.createFin(Array.from(dorsal.getAttribute('position').array));
    dorsal.dispose();
    const parts: THREE.BufferGeometry[] = [tailUpper, tailLower, curvedDorsal, pectoralLeft, pectoralRight];
    if (pattern === 'koi' || pattern === 'tetra' || pattern === 'discus' || pattern === 'angel') {
      const anal = this.createFin([
        0, -bodyScale[1] * 0.7, 0.2,
        0, pattern === 'tetra' ? -0.34 : pattern === 'angel' || pattern === 'discus' ? -0.92 : -0.69, -0.18,
        0, -bodyScale[1] * 0.72, -0.4,
      ]);
      parts.push(anal);
    }
    if (pattern === 'tetra') {
      const adipose = this.createFin([
        0, bodyScale[1] * 0.68, -0.34,
        0, 0.31, -0.5,
        0, bodyScale[1] * 0.66, -0.57,
      ]);
      parts.push(adipose);
    }
    if (pattern === 'angel') {
      const filamentLeft = new THREE.TubeGeometry(
        new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(-0.035, -0.42, 0.08),
          new THREE.Vector3(-0.05, -0.86, -0.05),
          new THREE.Vector3(-0.025, -1.25, -0.36),
        ), 6, 0.008, 4, false,
      );
      const filamentRight = filamentLeft.clone();
      filamentRight.scale(-1, 1, 1);
      parts.push(filamentLeft, filamentRight);
    }
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`Unable to create ${pattern} reef fish fins.`);
    merged.computeVertexNormals();
    merged.computeBoundingSphere();
    return merged;
  }

  private createEyeGeometry(pattern: Pattern): THREE.BufferGeometry {
    const [bodyWidth, bodyHeight, bodyLength] = this.bodyScale(pattern);
    const radius: Record<Pattern, number> = {
      opal: 0.052,
      koi: 0.065,
      tetra: 0.057,
      discus: 0.066,
      angel: 0.062,
      garnet: 0.061,
    };
    const eyeRadius = radius[pattern];
    const parts: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      const iris = new THREE.SphereGeometry(eyeRadius, 10, 7);
      iris.translate(side * (bodyWidth * 0.77 + eyeRadius * 0.12), bodyHeight * 0.18, bodyLength * 0.64);
      this.addGeometryColor(iris, pattern === 'tetra' ? 0x8de1d4 : pattern === 'opal' ? 0x8aa7c8 : 0xb69a5a);
      const pupil = new THREE.SphereGeometry(eyeRadius * 0.58, 9, 6);
      pupil.translate(side * (bodyWidth * 0.77 + eyeRadius * 0.66), bodyHeight * 0.18, bodyLength * 0.65);
      this.addGeometryColor(pupil, 0x05090a);
      if (pattern === 'tetra') {
        const catchlight = new THREE.SphereGeometry(eyeRadius * 0.16, 7, 5);
        catchlight.translate(
          side * (bodyWidth * 0.77 + eyeRadius * 1.05),
          bodyHeight * 0.24,
          bodyLength * 0.68,
        );
        this.addGeometryColor(catchlight, 0xeafff7);
        parts.push(catchlight);
      }
      parts.push(iris, pupil);
    }

    const mouthRadius = pattern === 'angel' || pattern === 'koi' ? 0.043 : 0.031;
    const mouth = new THREE.TorusGeometry(mouthRadius, 0.007, 5, 12);
    mouth.scale(pattern === 'tetra' ? 0.72 : 1, 0.55, 1);
    mouth.translate(0, -bodyHeight * 0.08, bodyLength * 0.99);
    this.addGeometryColor(mouth, pattern === 'angel' ? 0x986343 : 0x665b4b);
    parts.push(mouth);
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`Unable to create ${pattern} reef fish eyes.`);
    merged.computeBoundingSphere();
    return merged;
  }

  private createMaterial(
    pattern: Pattern,
    color: number,
    shaderRef: ShaderRef,
  ): THREE.MeshPhysicalMaterial {
    const material = new THREE.MeshPhysicalMaterial({
      color,
      transparent: false,
      opacity: 1,
      depthWrite: true,
      roughness: 0.34,
      metalness: 0.012,
      clearcoat: 0.32,
      clearcoatRoughness: 0.27,
      iridescence: pattern === 'tetra' ? 0.44 : 0.23,
      iridescenceIOR: 1.32,
      iridescenceThicknessRange: [110, 390],
      envMapIntensity: 0.7,
      bumpMap: this.scaleBumpTexture,
      bumpScale: pattern === 'tetra' ? 0.006 : 0.009,
      side: THREE.DoubleSide,
    });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uReefFishTime = { value: 0 };
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform float uReefFishTime;\nvarying vec3 vReefFishLocal;',
        )
        .replace(
          '#include <begin_vertex>',
          `vec3 transformed = vec3(position);
          float tailMask = 1.0 - smoothstep(-0.48, 0.04, transformed.z);
          float phase = instanceMatrix[3].x * 0.63 + instanceMatrix[3].y * 0.37 + instanceMatrix[3].z * 0.21;
          transformed.x += sin(uReefFishTime * 5.1 + phase + transformed.z * 5.0) * tailMask * tailMask * 0.075;
          float gillMask = exp(-pow((transformed.z - 0.26) * 7.5, 2.0));
          float breath = sin(uReefFishTime * 1.28 + phase * 0.73) * 0.018 * gillMask;
          transformed.x *= 1.0 + breath;
          transformed.y *= 1.0 + breath * 0.28;
          vReefFishLocal = transformed;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uReefFishTime;\nvarying vec3 vReefFishLocal;')
        .replace('#include <color_fragment>', `#include <color_fragment>\n${this.patternShader(pattern)}\n${this.sharedPearlescenceShader(pattern)}`)
        .replace(
          '#include <opaque_fragment>',
          `outgoingLight = pow(max(outgoingLight, vec3(0.0)), vec3(1.08)) * 0.48;
          #include <opaque_fragment>`,
        );
      shaderRef.current = shader as FishShader;
    };
    material.customProgramCacheKey = () => `tidal-reef-fish-${pattern}-v6-jewel-patterns`;
    return material;
  }

  private createFinMaterial(pattern: Pattern, shaderRef: ShaderRef): THREE.MeshPhysicalMaterial {
    const colors: Record<Pattern, number> = {
      opal: 0x60b8d0,
      koi: 0xd8813f,
      tetra: 0x8177a8,
      discus: 0x67bdb2,
      angel: 0xf0ae45,
      garnet: 0xb7643e,
    };
    const material = new THREE.MeshPhysicalMaterial({
      color: colors[pattern],
      transparent: true,
      opacity: pattern === 'tetra' ? 0.54 : 0.68,
      depthWrite: false,
      roughness: 0.42,
      metalness: 0,
      clearcoat: 0.18,
      clearcoatRoughness: 0.35,
      iridescence: pattern === 'opal' || pattern === 'angel' || pattern === 'tetra' ? 0.3 : 0.14,
      envMapIntensity: 0.64,
      side: THREE.DoubleSide,
    });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uReefFishTime = { value: 0 };
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform float uReefFishTime;\nvarying vec3 vReefFinLocal;\nvarying vec2 vFinUv;',
        )
        .replace(
          '#include <begin_vertex>',
          `vec3 transformed = vec3(position);
          float tailMask = 1.0 - smoothstep(-0.43, 0.12, transformed.z);
          float phase = instanceMatrix[3].x * 0.63 + instanceMatrix[3].y * 0.37 + instanceMatrix[3].z * 0.21;
          transformed.x += sin(uReefFishTime * 5.1 + phase + transformed.z * 5.0) * tailMask * tailMask * 0.11;
          transformed.x += sin(uReefFishTime * 3.4 + phase + transformed.y * 7.0) * abs(transformed.y) * 0.018;
          float pectoralMask = smoothstep(0.04, 0.16, abs(transformed.x)) * smoothstep(-0.2, 0.18, transformed.z);
          transformed.y += sin(uReefFishTime * 2.45 + phase * 1.37) * pectoralMask * 0.026;
          vReefFinLocal = transformed;
          vFinUv = uv;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vReefFinLocal;\nvarying vec2 vFinUv;')
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float finRays = pow(abs(cos(vFinUv.x * 56.5487)), 18.0);
          float rayDetail = finRays * 0.26;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.68, 0.67), rayDetail);
          float pearlEdge = smoothstep(0.91, 0.99, vFinUv.y);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.78, 0.85), pearlEdge * 0.36);
          diffuseColor.a *= mix(0.85, 0.38, vFinUv.y) + rayDetail + pearlEdge * 0.18;`,
        );
      shaderRef.current = shader as FishShader;
    };
    material.customProgramCacheKey = () => `tidal-reef-fin-${pattern}-v2-ribbed-membrane`;
    return material;
  }

  private createEyeMaterial(): THREE.MeshPhysicalMaterial {
    return new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.16,
      metalness: 0.02,
      clearcoat: 0.78,
      clearcoatRoughness: 0.12,
      envMapIntensity: 1.05,
    });
  }

  private patternShader(pattern: Pattern): string {
    if (pattern === 'opal') {
      return `float dorsalTone = smoothstep(-0.12, 0.28, vReefFishLocal.y);
      float lateral = exp(-pow((vReefFishLocal.y + 0.015) * 12.0, 2.0));
      diffuseColor.rgb = mix(vec3(0.13, 0.68, 0.82), vec3(0.12, 0.17, 0.56), dorsalTone * 0.76);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.47, 0.22, 0.72), smoothstep(0.18, 0.43, vReefFishLocal.y) * 0.48);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.24, 0.25), lateral * 0.38);`;
    }
    if (pattern === 'koi') {
      return `float patches = sin(vReefFishLocal.z * 13.0 + sin(vReefFishLocal.y * 17.0) * 1.7) * 0.5 + 0.5;
      patches = smoothstep(0.48, 0.72, patches);
      float head = smoothstep(0.2, 0.48, vReefFishLocal.z);
      diffuseColor.rgb = mix(vec3(0.72, 0.78, 0.75), vec3(0.92, 0.22, 0.065), clamp(patches * 0.85 + head * 0.3, 0.0, 1.0));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.13, 0.055, 0.12), patches * (1.0 - head) * 0.12);`;
    }
    if (pattern === 'tetra') {
      return `float bodyLengthMask = smoothstep(-0.62, -0.5, vReefFishLocal.z)
        * (1.0 - smoothstep(0.53, 0.65, vReefFishLocal.z));
      float dorsalWash = smoothstep(0.035, 0.19, vReefFishLocal.y);
      float bellyWash = 1.0 - smoothstep(-0.17, -0.035, vReefFishLocal.y);
      float headWash = smoothstep(0.27, 0.61, vReefFishLocal.z);
      float limeLantern = exp(-pow((vReefFishLocal.z - 0.02) * 3.2, 2.0)
        - pow((vReefFishLocal.y - 0.055) * 8.5, 2.0));
      float lateralStripe = exp(-pow((vReefFishLocal.y + 0.025) * 19.0, 2.0)) * bodyLengthMask;
      float gillPlate = exp(-pow((vReefFishLocal.z - 0.42) * 19.0, 2.0))
        * exp(-pow(vReefFishLocal.y * 7.0, 2.0));
      float tetraScaleRows = sin(vReefFishLocal.z * 48.0 + sin(vReefFishLocal.y * 41.0) * 0.72);
      float tetraScaleColumns = sin(vReefFishLocal.y * 68.0);
      float tetraScaleFlash = smoothstep(0.67, 0.97, tetraScaleRows * tetraScaleColumns * 0.5 + 0.5);
      vec3 tetraColor = mix(vec3(0.08, 0.67, 0.62), vec3(0.12, 0.42, 0.56), bellyWash);
      tetraColor = mix(tetraColor, vec3(0.45, 0.2, 0.56), dorsalWash * 0.58);
      tetraColor = mix(tetraColor, vec3(0.43, 0.69, 0.095), limeLantern * 0.88);
      tetraColor = mix(tetraColor, vec3(0.08, 0.48, 0.51), headWash * 0.5);
      tetraColor = mix(tetraColor, vec3(0.71, 0.43, 0.16), bellyWash * 0.55);
      tetraColor = mix(tetraColor, vec3(0.025, 0.13, 0.18), lateralStripe * 0.83);
      tetraColor += vec3(0.22, 0.34, 0.24) * tetraScaleFlash * 0.12;
      tetraColor *= 1.0 - gillPlate * 0.13;
      diffuseColor.rgb = mix(diffuseColor.rgb, tetraColor, 0.92);`;
    }
    if (pattern === 'discus') {
      return `float pearlFlow = sin(vReefFishLocal.z * 21.0 + sin(vReefFishLocal.y * 17.0) * 1.35) * 0.5 + 0.5;
      pearlFlow = smoothstep(0.42, 0.82, pearlFlow);
      float warmCore = exp(-pow((vReefFishLocal.z + 0.02) * 3.5, 2.0) - pow(vReefFishLocal.y * 2.2, 2.0));
      float cheek = smoothstep(0.22, 0.43, vReefFishLocal.z);
      diffuseColor.rgb = mix(vec3(0.025, 0.27, 0.38), vec3(0.12, 0.76, 0.71), pearlFlow * 0.88);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.94, 0.43, 0.13), (warmCore * 0.5 + cheek * 0.35) * (1.0 - pearlFlow));`;
    }
    if (pattern === 'angel') {
      return `float crown = smoothstep(0.05, 0.48, vReefFishLocal.y + vReefFishLocal.z * 0.2);
      float blueLower = 1.0 - smoothstep(-0.25, 0.12, vReefFishLocal.y);
      float bands = smoothstep(0.55, 0.84, sin((vReefFishLocal.z + 0.52) * 18.0) * 0.5 + 0.5);
      diffuseColor.rgb = mix(vec3(0.7, 0.78, 0.8), vec3(0.95, 0.64, 0.14), crown * 0.78);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.09, 0.39, 0.66), blueLower * 0.58);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.035, 0.06, 0.13), bands * 0.86);`;
    }
    return `vec2 scaleUv = vec2((vReefFishLocal.z + 0.52) * 15.0, (vReefFishLocal.y + 0.42) * 18.0);
    float scaleRow = floor(scaleUv.y);
    float scaleX = fract(scaleUv.x + mod(scaleRow, 2.0) * 0.5) - 0.5;
    float scaleY = fract(scaleUv.y) - 0.52;
    float scaleArc = 1.0 - smoothstep(0.035, 0.105, abs(length(vec2(scaleX, scaleY)) - 0.41));
    float copperTail = 1.0 - smoothstep(-0.72, -0.45, vReefFishLocal.z);
    float roseBack = smoothstep(-0.2, 0.3, vReefFishLocal.y);
    diffuseColor.rgb = mix(vec3(0.95, 0.38, 0.24), vec3(0.42, 0.065, 0.4), roseBack);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.94, 0.66, 0.28), scaleArc * 0.28);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.68, 0.2, 0.47), copperTail * 0.5);`;
  }

  private sharedPearlescenceShader(pattern: Pattern): string {
    const [, height, length] = this.bodyScale(pattern);
    return `vec2 flank = vReefFishLocal.zy / vec2(${length.toFixed(3)}, ${height.toFixed(3)});
    float cheekLine = exp(-pow((flank.x - (0.35 - 0.24 * (1.0 - flank.y * flank.y))) * 95.0, 2.0))
      * (1.0 - smoothstep(0.5, 0.76, abs(flank.y)));
    float flankLine = exp(-pow((flank.y + 0.07 - flank.x * 0.025) * 100.0, 2.0))
      * smoothstep(-0.88, -0.6, flank.x) * (1.0 - smoothstep(0.05, 0.2, flank.x));
    vec2 cells = vec2(flank.x * 16.0, flank.y * 13.0);
    cells.x += mod(floor(cells.y), 2.0) * 0.5;
    float arcDistance = abs(length(fract(cells) - vec2(0.5, 0.3)) - 0.49);
    float arc = 1.0 - smoothstep(0.028, 0.09, arcDistance);
    float scaleMask = (1.0 - smoothstep(0.35, 0.68, flank.x)) * (1.0 - smoothstep(0.65, 1.0, abs(flank.y)));
    diffuseColor.rgb *= 1.0 - cheekLine * 0.28 - flankLine * 0.12 - arc * scaleMask * 0.13;
    diffuseColor.rgb += vec3(0.09, 0.13, 0.15) * arc * scaleMask * 0.14;
    vec3 glitterCell = floor((vReefFishLocal + vec3(0.17, 0.31, 0.43)) * vec3(31.0, 29.0, 23.0));
    float glitterSeed = fract(sin(dot(glitterCell, vec3(12.9898, 78.233, 39.346))) * 43758.5453);
    float glitter = smoothstep(0.965, 0.998, glitterSeed);
    float viewFacing = abs(dot(normalize(vNormal), normalize(vViewPosition)));
    float angularGlint = pow(max(0.0, 1.0 - abs(viewFacing - 0.7) * 3.2), 7.0);
    float glint = angularGlint * (0.32 + glitterSeed * 0.24);
    vec3 glintColor = mix(vec3(0.48, 0.66, 0.68), vec3(0.7, 0.43, 0.16), step(0.68, glitterSeed));
    diffuseColor.rgb += glintColor * glitter * glint * 0.11;
    float scaleRows = sin(vReefFishLocal.z * 46.0 + sin(vReefFishLocal.y * 32.0) * 0.65);
    float scaleColumns = sin(vReefFishLocal.y * 42.0);
    float scaleRelief = smoothstep(0.82, 0.98, scaleRows * scaleColumns * 0.5 + 0.5);
    diffuseColor.rgb *= 1.0 - scaleRelief * 0.055;
    diffuseColor.rgb += vec3(0.055, 0.075, 0.068) * scaleRelief * 0.08;`;
  }

  private addGeometryColor(geometry: THREE.BufferGeometry, colorValue: number): void {
    const color = new THREE.Color(colorValue);
    const colors = new Float32Array(geometry.getAttribute('position').count * 3);
    for (let i = 0; i < colors.length; i += 3) {
      colors[i] = color.r;
      colors[i + 1] = color.g;
      colors[i + 2] = color.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }

  private createScaleBumpTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Unable to create procedural scale texture.');
    context.fillStyle = '#727272';
    context.fillRect(0, 0, 256, 256);
    context.lineCap = 'round';
    for (let row = -1; row < 13; row += 1) {
      const y = row * 22;
      const offset = row % 2 === 0 ? 0 : 13;
      for (let column = -1; column < 12; column += 1) {
        const x = column * 26 + offset;
        const gradient = context.createRadialGradient(x + 13, y + 5, 2, x + 13, y + 5, 17);
        gradient.addColorStop(0, '#a5a5a5');
        gradient.addColorStop(0.68, '#858585');
        gradient.addColorStop(1, '#676767');
        context.fillStyle = gradient;
        context.beginPath();
        context.ellipse(x + 13, y + 9, 13, 17, 0, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = '#b8b8b8';
        context.lineWidth = 2;
        context.beginPath();
        context.arc(x + 13, y + 7, 13, 0.12 * Math.PI, 0.88 * Math.PI);
        context.stroke();
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.name = 'procedural-overlapping-fish-scales';
    texture.colorSpace = THREE.NoColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(3.5, 5.5);
    texture.anisotropy = 4;
    return texture;
  }

  private createFin(vertices: number[]): THREE.BufferGeometry {
    return createFinMembrane(vertices);
  }

  private applyAvoidance(
    position: THREE.Vector3,
    velocity: THREE.Vector3,
    point: THREE.Vector3,
    radius: number,
    strength: number,
    delta: number,
  ): void {
    this.direction.copy(position).sub(point);
    const distance = this.direction.length();
    if (distance >= radius || distance < 0.001) return;
    velocity.addScaledVector(this.direction, ((1 - distance / radius) * strength * delta) / distance);
  }
}
