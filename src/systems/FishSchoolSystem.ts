import * as THREE from 'three';
import { CANYON, OCEAN, type QualityPreset } from '../core/config';
import { createRandom, range } from '../utils/random';

interface FishShader {
  uniforms: Record<string, { value: number }>;
}

export class FishSchoolSystem {
  readonly mesh: THREE.InstancedMesh;
  readonly eyes: THREE.InstancedMesh;
  readonly pupils: THREE.InstancedMesh;

  private readonly count: number;
  private readonly positions: Float32Array;
  private readonly velocities: Float32Array;
  private readonly nextVelocities: Float32Array;
  private readonly scales: Float32Array;
  private readonly phases: Float32Array;
  private readonly focusAmounts: Float32Array;
  private readonly orientations: THREE.Quaternion[];
  private readonly grid = new Map<string, number[]>();
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly bankQuaternion = new THREE.Quaternion();
  private readonly eyeLocalMatrix = new THREE.Matrix4();
  private readonly eyeWorldMatrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly projected = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly forward = new THREE.Vector3(0, 0, 1);
  private readonly localForward = new THREE.Vector3(0, 0, 1);
  private readonly avoidancePoint = new THREE.Vector3(1000, 1000, 1000);
  private readonly cameraPoint = new THREE.Vector3();
  private readonly cameraForward = new THREE.Vector3(0, 0, -1);
  private readonly cameraRight = new THREE.Vector3(1, 0, 0);
  private readonly worldUp = new THREE.Vector3(0, 1, 0);
  private readonly attractionPoint = new THREE.Vector3();
  private hasAttraction = false;
  private attractionStrength = 0;
  private fishShader: FishShader | null = null;
  private accumulator = 0;
  private simulationTime = 0;
  private focusedIndex = -1;
  private readonly motionScale: number;
  private readonly closeFollowerCount: number;

  constructor(scene: THREE.Scene, preset: QualityPreset, reducedMotion: boolean) {
    this.count = preset.fishCount;
    this.closeFollowerCount = Math.min(10, Math.max(6, Math.round(this.count * 0.04)));
    this.motionScale = reducedMotion ? 0.35 : 1;
    this.positions = new Float32Array(this.count * 3);
    this.velocities = new Float32Array(this.count * 3);
    this.nextVelocities = new Float32Array(this.count * 3);
    this.scales = new Float32Array(this.count);
    this.phases = new Float32Array(this.count);
    this.focusAmounts = new Float32Array(this.count);
    this.orientations = Array.from({ length: this.count }, () => new THREE.Quaternion());

    const geometry = this.createFishGeometry();
    const species = new Float32Array(this.count);
    const speciesRandom = createRandom(7919);
    for (let i = 0; i < this.count; i += 1) species[i] = Math.floor(speciesRandom() * 4);
    geometry.setAttribute('aFishSpecies', new THREE.InstancedBufferAttribute(species, 1));
    const material = new THREE.MeshPhysicalMaterial({
      color: 0xaebcb4,
      roughness: 0.43,
      metalness: 0.015,
      clearcoat: 0.22,
      clearcoatRoughness: 0.34,
      iridescence: 0.2,
      iridescenceIOR: 1.31,
      iridescenceThicknessRange: [120, 420],
      sheen: 0.1,
      sheenColor: new THREE.Color(0xa8eee1),
      envMapIntensity: 0.72,
      side: THREE.DoubleSide,
    });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uFishTime = { value: 0 };
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform float uFishTime;\nattribute float aFishSpecies;\nvarying vec3 vFishLocal;\nvarying float vFishSpecies;',
        )
        .replace(
          '#include <begin_vertex>',
          `vec3 transformed = vec3(position);
          vFishSpecies = aFishSpecies;
          float slenderSpecies = step(1.5, aFishSpecies) * (1.0 - step(2.5, aFishSpecies));
          float tallSpecies = step(2.5, aFishSpecies);
          transformed.x *= mix(1.0, 0.72, slenderSpecies) * mix(1.0, 0.82, tallSpecies);
          transformed.y *= mix(1.0, 0.74, slenderSpecies) * mix(1.0, 1.24, tallSpecies);
          transformed.z *= mix(1.0, 1.12, slenderSpecies) * mix(1.0, 0.88, tallSpecies);
          float fishPhase = instanceMatrix[3].x * 1.27 + instanceMatrix[3].y * 0.83 + instanceMatrix[3].z * 0.39;
          float bodyMask = clamp((-transformed.z + 0.18) / 1.18, 0.0, 1.0);
          float tailMask = clamp((-transformed.z - 0.38) / 0.7, 0.0, 1.0);
          float swim = sin(uFishTime * 5.4 + fishPhase + transformed.z * 1.2);
          transformed.x += swim * bodyMask * bodyMask * 0.085;
          transformed.x += swim * tailMask * tailMask * 0.16;
          vFishLocal = transformed;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vFishLocal;\nvarying float vFishSpecies;')
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float dorsal = smoothstep(-0.13, 0.23, vFishLocal.y);
          float belly = 1.0 - smoothstep(-0.2, 0.025, vFishLocal.y);
          float flankBand = exp(-pow((vFishLocal.y + 0.015) * 7.0, 2.0));
          float scaleMottle = sin(vFishLocal.z * 25.0 + sin(vFishLocal.y * 34.0) * 0.9);
          float rearBars = smoothstep(0.4, 0.96, sin((vFishLocal.z + 0.76) * 17.0))
            * smoothstep(0.48, -0.34, vFishLocal.z);
          float gill = exp(-pow((vFishLocal.z - 0.39) * 24.0, 2.0)) * flankBand;
          float lateralLine = exp(-pow((vFishLocal.y + 0.025) * 34.0, 2.0))
            * smoothstep(-0.58, -0.24, vFishLocal.z) * smoothstep(0.55, 0.2, vFishLocal.z);
          float mouth = smoothstep(0.62, 0.77, vFishLocal.z)
            * (1.0 - smoothstep(-0.075, -0.005, vFishLocal.y));
          vec3 silver = mix(vec3(0.48, 0.67, 0.63), vec3(0.09, 0.35, 0.39), dorsal);
          vec3 chromis = mix(vec3(0.18, 0.63, 0.69), vec3(0.035, 0.18, 0.43), dorsal);
          chromis = mix(chromis, vec3(0.74, 0.61, 0.1), (1.0 - smoothstep(-0.7, -0.52, vFishLocal.z)) * 0.72);
          vec3 anthias = mix(vec3(0.8, 0.31, 0.15), vec3(0.5, 0.045, 0.18), dorsal);
          anthias = mix(anthias, vec3(0.86, 0.58, 0.13), flankBand * 0.42);
          float butterflyBands = smoothstep(0.25, 0.82, sin((vFishLocal.z + 0.72) * 14.0) * 0.5 + 0.5);
          vec3 butterfly = mix(vec3(0.74, 0.61, 0.19), vec3(0.025, 0.085, 0.12), butterflyBands * 0.88);
          butterfly = mix(butterfly, vec3(0.72, 0.68, 0.48), belly * 0.44);
          vec3 speciesColor = silver;
          if (vFishSpecies > 0.5 && vFishSpecies < 1.5) speciesColor = chromis;
          if (vFishSpecies > 1.5 && vFishSpecies < 2.5) speciesColor = anthias;
          if (vFishSpecies > 2.5) speciesColor = butterfly;
          diffuseColor.rgb = mix(diffuseColor.rgb, speciesColor, 0.94);
          float scaleSpark = smoothstep(0.88, 0.995, scaleMottle * 0.5 + 0.5)
            * (0.35 + 0.65 * sin(vFishLocal.z * 61.0 + vFishLocal.y * 47.0) * 0.5 + 0.325);
          diffuseColor.rgb += vec3(0.13, 0.2, 0.18) * scaleSpark * flankBand * 0.18;
          diffuseColor.rgb *= 1.0 - rearBars * 0.2 - gill * 0.34 - lateralLine * 0.24 - mouth * 0.32;`,
        )
        .replace(
          '#include <opaque_fragment>',
          `outgoingLight = pow(max(outgoingLight, vec3(0.0)), vec3(1.08)) * 0.46;
          #include <opaque_fragment>`,
        );
      this.fishShader = shader as FishShader;
    };
    material.customProgramCacheKey = () => 'tidal-instanced-fish-v7-pattern-contrast';

    this.mesh = new THREE.InstancedMesh(geometry, material, this.count);
    this.mesh.name = 'responsive-fish-school';
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = preset.shadowMapSize > 0;
    this.mesh.receiveShadow = true;
    const eyeGeometry = new THREE.SphereGeometry(0.058, 12, 8);
    const eyeMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x9c9a69,
      roughness: 0.22,
      metalness: 0,
      clearcoat: 0.75,
      clearcoatRoughness: 0.1,
      envMapIntensity: 1.55,
    });
    this.eyes = new THREE.InstancedMesh(eyeGeometry, eyeMaterial, this.count * 2);
    this.eyes.name = 'fish-eyes';
    this.eyes.frustumCulled = false;
    const pupilGeometry = new THREE.SphereGeometry(0.032, 10, 7);
    const pupilMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x020809,
      roughness: 0.06,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      envMapIntensity: 2.4,
    });
    this.pupils = new THREE.InstancedMesh(pupilGeometry, pupilMaterial, this.count * 2);
    this.pupils.name = 'fish-pupils';
    this.pupils.frustumCulled = false;
    this.initializeFish();
    scene.add(this.mesh, this.eyes, this.pupils);
  }

  private createFishGeometry(): THREE.BufferGeometry {
    const vertices: number[] = [];
    const indices: number[] = [];
    const radialSegments = 10;
    const zLevels = [-0.68, -0.54, -0.31, -0.05, 0.2, 0.43, 0.63, 0.76];
    const radii = [0.045, 0.12, 0.21, 0.245, 0.235, 0.185, 0.1, 0.025];
    for (let ring = 0; ring < zLevels.length; ring += 1) {
      for (let segment = 0; segment < radialSegments; segment += 1) {
        const angle = (segment / radialSegments) * Math.PI * 2;
        const lateral = Math.cos(angle) * radii[ring];
        const vertical = Math.sin(angle) * radii[ring] * 0.76;
        vertices.push(lateral, vertical, zLevels[ring]);
      }
    }
    for (let ring = 0; ring < zLevels.length - 1; ring += 1) {
      for (let segment = 0; segment < radialSegments; segment += 1) {
        const next = (segment + 1) % radialSegments;
        const a = ring * radialSegments + segment;
        const b = ring * radialSegments + next;
        const c = (ring + 1) * radialSegments + next;
        const d = (ring + 1) * radialSegments + segment;
        indices.push(a, b, d, b, c, d);
      }
    }

    const addVertex = (x: number, y: number, z: number): number => {
      vertices.push(x, y, z);
      return vertices.length / 3 - 1;
    };
    const tailRootTop = addVertex(0, 0.055, -0.63);
    const tailRootBottom = addVertex(0, -0.055, -0.63);
    const tailTop = addVertex(0, 0.36, -1.08);
    const tailCenter = addVertex(0, 0, -0.86);
    const tailBottom = addVertex(0, -0.32, -1.08);
    indices.push(tailRootTop, tailTop, tailCenter, tailRootBottom, tailCenter, tailBottom);

    const dorsalFront = addVertex(0, 0.17, 0.2);
    const dorsalTip = addVertex(0, 0.36, -0.12);
    const dorsalBack = addVertex(0, 0.15, -0.34);
    indices.push(dorsalFront, dorsalTip, dorsalBack);

    const finRoot = addVertex(0, -0.02, 0.08);
    const leftFin = addVertex(-0.38, -0.06, -0.12);
    const rightFin = addVertex(0.38, -0.06, -0.12);
    const finBack = addVertex(0, -0.04, -0.26);
    indices.push(finRoot, leftFin, finBack, finRoot, finBack, rightFin);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }

  private initializeFish(): void {
    const random = createRandom(5182);
    const centers = [
      new THREE.Vector3(-2.4, 4.3, -11),
      new THREE.Vector3(3.1, 7.2, -31),
      new THREE.Vector3(-1.2, 3.2, -55),
      new THREE.Vector3(2.4, 9.3, -74),
    ];
    const color = new THREE.Color();

    for (let i = 0; i < this.count; i += 1) {
      const index = i * 3;
      const center = centers[i % centers.length];
      this.positions[index] = center.x + range(random, -5.2, 5.2);
      this.positions[index + 1] = center.y + range(random, -2.1, 2.1);
      this.positions[index + 2] = center.z + range(random, -8.5, 8.5);
      if (i < this.closeFollowerCount) {
        this.positions[index] = range(random, -4.6, 4.6);
        this.positions[index + 1] = range(random, 2.2, 5.8);
        this.positions[index + 2] = range(random, 3.2, 8.8);
      }
      this.velocities[index] = range(random, -0.35, 0.35);
      this.velocities[index + 1] = range(random, -0.12, 0.12);
      this.velocities[index + 2] = range(random, -1.1, -0.35);
      this.scales[i] = range(random, 0.4, 0.78);
      if (i < this.closeFollowerCount) this.scales[i] = range(random, 0.32, 0.49);
      this.phases[i] = random() * Math.PI * 2;
      color.setHSL(range(random, 0.43, 0.57), range(random, 0.12, 0.31), range(random, 0.42, 0.62));
      this.mesh.setColorAt(i, color);
    }
    this.mesh.instanceColor!.needsUpdate = true;
    this.updateMatrices();
  }

  setAvoidancePoint(point: THREE.Vector3): void {
    this.avoidancePoint.copy(point);
  }

  setCameraPoint(point: THREE.Vector3, forward?: THREE.Vector3): void {
    this.cameraPoint.copy(point);
    if (forward) {
      this.cameraForward.copy(forward).normalize();
      this.cameraRight.crossVectors(this.cameraForward, this.worldUp).normalize();
    }
  }

  setAttractionPoint(point: THREE.Vector3): void {
    this.attractionPoint.copy(point);
    this.hasAttraction = true;
    this.attractionStrength = 1;
  }

  selectObject(object: THREE.Object3D, instanceId: number | undefined): boolean {
    if (instanceId === undefined) return false;
    let index = -1;
    if (object === this.mesh) index = instanceId;
    if (object === this.eyes || object === this.pupils) index = Math.floor(instanceId / 2);
    if (index < 0 || index >= this.count) return false;
    this.focusedIndex = index;
    return true;
  }

  selectNearPointer(pointer: THREE.Vector2, camera: THREE.Camera, radius = 0.105): boolean {
    const radiusSq = radius * radius;
    const aspect = camera instanceof THREE.PerspectiveCamera ? camera.aspect : 1;
    let nearestIndex = -1;
    let nearestDistance = radiusSq;
    for (let i = 0; i < this.count; i += 1) {
      const index = i * 3;
      this.projected.set(this.positions[index], this.positions[index + 1], this.positions[index + 2]).project(camera);
      if (this.projected.z < -1 || this.projected.z > 1) continue;
      const dx = (this.projected.x - pointer.x) * aspect;
      const dy = this.projected.y - pointer.y;
      const distance = dx * dx + dy * dy;
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = i;
      }
    }
    if (nearestIndex < 0) return false;
    this.focusedIndex = nearestIndex;
    return true;
  }

  clearFocus(): void {
    this.focusedIndex = -1;
  }

  hasFishNearRay(ray: THREE.Ray, radius = 3.2): boolean {
    const radiusSq = radius * radius;
    for (let i = 0; i < this.count; i += 1) {
      const index = i * 3;
      this.position.set(this.positions[index], this.positions[index + 1], this.positions[index + 2]);
      const alongRay = this.direction.copy(this.position).sub(ray.origin).dot(ray.direction);
      if (alongRay < 2 || alongRay > 58) continue;
      if (ray.distanceSqToPoint(this.position) < radiusSq) return true;
    }
    return false;
  }

  hasFishNearPointer(pointer: THREE.Vector2, camera: THREE.Camera, radius = 0.13): boolean {
    const radiusSq = radius * radius;
    const aspect = camera instanceof THREE.PerspectiveCamera ? camera.aspect : 1;
    for (let i = 0; i < this.count; i += 1) {
      const index = i * 3;
      this.projected
        .set(this.positions[index], this.positions[index + 1], this.positions[index + 2])
        .project(camera);
      if (this.projected.z < -1 || this.projected.z > 1) continue;
      const dx = (this.projected.x - pointer.x) * aspect;
      const dy = this.projected.y - pointer.y;
      if (dx * dx + dy * dy < radiusSq) return true;
    }
    return false;
  }

  update(time: number, delta: number): void {
    this.simulationTime = time;
    if (this.fishShader) this.fishShader.uniforms.uFishTime.value = time * this.motionScale;
    if (this.hasAttraction) {
      this.attractionStrength *= Math.exp(-0.32 * delta);
      if (this.attractionStrength < 0.035) this.hasAttraction = false;
    }
    this.accumulator += Math.min(delta, 0.05);
    const fixedStep = 1 / 30;
    while (this.accumulator >= fixedStep) {
      this.simulate(fixedStep * this.motionScale);
      this.accumulator -= fixedStep;
    }
    this.updateMatrices();
  }

  private simulate(delta: number): void {
    this.rebuildGrid();
    const neighborRadiusSq = 15.5;
    const separationRadiusSq = 1.9;
    const cellSize = 4;
    const nextVelocities = this.nextVelocities;

    for (let i = 0; i < this.count; i += 1) {
      const index = i * 3;
      const px = this.positions[index];
      const py = this.positions[index + 1];
      const pz = this.positions[index + 2];
      let alignX = 0;
      let alignY = 0;
      let alignZ = 0;
      let cohesionX = 0;
      let cohesionY = 0;
      let cohesionZ = 0;
      let separationX = 0;
      let separationY = 0;
      let separationZ = 0;
      let neighbors = 0;
      let followerDistance = 0;

      const cx = Math.floor(px / cellSize);
      const cy = Math.floor(py / cellSize);
      const cz = Math.floor(pz / cellSize);
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dz = -1; dz <= 1; dz += 1) {
            const bucket = this.grid.get(`${cx + dx}|${cy + dy}|${cz + dz}`);
            if (!bucket) continue;
            for (const other of bucket) {
              if (other === i) continue;
              const otherIndex = other * 3;
              const ox = this.positions[otherIndex] - px;
              const oy = this.positions[otherIndex + 1] - py;
              const oz = this.positions[otherIndex + 2] - pz;
              const distanceSq = ox * ox + oy * oy + oz * oz;
              if (distanceSq > neighborRadiusSq || distanceSq < 0.0001) continue;
              alignX += this.velocities[otherIndex];
              alignY += this.velocities[otherIndex + 1];
              alignZ += this.velocities[otherIndex + 2];
              cohesionX += this.positions[otherIndex];
              cohesionY += this.positions[otherIndex + 1];
              cohesionZ += this.positions[otherIndex + 2];
              if (distanceSq < separationRadiusSq) {
                const inverse = 1 / distanceSq;
                separationX -= ox * inverse;
                separationY -= oy * inverse;
                separationZ -= oz * inverse;
              }
              neighbors += 1;
            }
          }
        }
      }

      let vx = this.velocities[index];
      let vy = this.velocities[index + 1];
      let vz = this.velocities[index + 2];
      if (neighbors > 0) {
        const inverse = 1 / neighbors;
        vx += ((alignX * inverse - vx) * 0.72 + (cohesionX * inverse - px) * 0.035 + separationX * 0.5) * delta;
        vy += ((alignY * inverse - vy) * 0.72 + (cohesionY * inverse - py) * 0.035 + separationY * 0.5) * delta;
        vz += ((alignZ * inverse - vz) * 0.72 + (cohesionZ * inverse - pz) * 0.035 + separationZ * 0.5) * delta;
      }

      const avoid = this.avoidance(px, py, pz, this.avoidancePoint, OCEAN.fishAvoidanceRadius, 7.4);
      vx += avoid.x * delta;
      vy += avoid.y * delta;
      vz += avoid.z * delta;
      const cameraAvoid = this.avoidance(px, py, pz, this.cameraPoint, 1.35, 5.8);
      vx += cameraAvoid.x * delta;
      vy += cameraAvoid.y * delta;
      vz += cameraAvoid.z * delta;

      if (this.hasAttraction) {
        const targetX = this.attractionPoint.x + Math.sin(this.phases[i] * 1.7) * 1.65;
        const targetY = this.attractionPoint.y + Math.cos(this.phases[i] * 1.3) * 1.1;
        const targetZ = this.attractionPoint.z + Math.sin(this.phases[i] * 0.9) * 1.8;
        const dx = targetX - px;
        const dy = targetY - py;
        const dz = targetZ - pz;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (distance > 1.2) {
          const arrival = THREE.MathUtils.smoothstep(distance, 1.2, 9);
          const pull = (0.72 + arrival * 1.18) * this.attractionStrength * delta / distance;
          vx += dx * pull;
          vy += dy * pull;
          vz += dz * pull;
        }
      }

      if (i < this.closeFollowerCount) {
        const phase = this.phases[i];
        const laneDistance = 5.4 + (i % 5) * 1.08;
        const lateral = Math.sin(phase + this.simulationTime * 0.17) * (1.8 + (i % 4) * 0.62);
        const vertical = 0.2 + Math.cos(phase * 1.37 + this.simulationTime * 0.21) * (0.7 + (i % 3) * 0.32);
        const targetX = this.cameraPoint.x + this.cameraForward.x * laneDistance + this.cameraRight.x * lateral;
        const targetY = this.cameraPoint.y + this.cameraForward.y * laneDistance + vertical;
        const targetZ = this.cameraPoint.z + this.cameraForward.z * laneDistance + this.cameraRight.z * lateral;
        const dx = targetX - px;
        const dy = targetY - py;
        const dz = targetZ - pz;
        followerDistance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const pull = followerDistance > 10 ? 1.4 : 0.2;
        vx += dx * pull * delta;
        vy += dy * pull * delta;
        vz += dz * pull * delta;
      }

      if (Math.abs(px) > CANYON.halfWidth - 1.5) vx += -Math.sign(px) * 1.8 * delta;
      if (py < -1.4) vy += 1.5 * delta;
      if (py > 13.5) vy -= 1.35 * delta;
      if (pz < -86) vz += 1.3 * delta;
      if (pz > (i < this.closeFollowerCount ? 12.6 : 8)) vz -= 1.4 * delta;

      const current = Math.sin(this.simulationTime * 0.19 + py * 0.4 + pz * 0.06);
      vx += current * 0.07 * delta;
      vy += Math.sin(this.simulationTime * 0.31 + px) * 0.025 * delta;

      const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
      const focus = this.focusAmounts[i];
      const targetMin = THREE.MathUtils.lerp(0.45, 0.16, focus);
      const cruiseMax = i < this.closeFollowerCount
        ? THREE.MathUtils.lerp(2.05, 5.7, THREE.MathUtils.smoothstep(followerDistance, 7, 15))
        : OCEAN.fishSpeed * 1.45;
      const targetMax = THREE.MathUtils.lerp(cruiseMax, 0.52, focus);
      if (speed > targetMax) {
        const factor = targetMax / speed;
        vx *= factor;
        vy *= factor;
        vz *= factor;
      } else if (speed < targetMin) {
        const factor = targetMin / Math.max(speed, 0.001);
        vx *= factor;
        vy *= factor;
        vz *= factor;
      }

      nextVelocities[index] = vx;
      nextVelocities[index + 1] = vy;
      nextVelocities[index + 2] = vz;
    }

    this.velocities.set(nextVelocities);
    for (let i = 0; i < this.positions.length; i += 1) this.positions[i] += this.velocities[i] * delta;
  }

  private avoidance(
    px: number,
    py: number,
    pz: number,
    point: THREE.Vector3,
    radius: number,
    strength: number,
  ): THREE.Vector3 {
    const result = this.direction.set(px - point.x, py - point.y, pz - point.z);
    const distanceSq = result.lengthSq();
    if (distanceSq > radius * radius || distanceSq < 0.001) return result.set(0, 0, 0);
    const distance = Math.sqrt(distanceSq);
    return result.multiplyScalar((1 - distance / radius) * strength / distance);
  }

  private rebuildGrid(): void {
    this.grid.clear();
    const cellSize = 4;
    for (let i = 0; i < this.count; i += 1) {
      const index = i * 3;
      const key = `${Math.floor(this.positions[index] / cellSize)}|${Math.floor(this.positions[index + 1] / cellSize)}|${Math.floor(this.positions[index + 2] / cellSize)}`;
      const bucket = this.grid.get(key);
      if (bucket) bucket.push(i);
      else this.grid.set(key, [i]);
    }
  }

  private updateMatrices(): void {
    for (let i = 0; i < this.count; i += 1) {
      const index = i * 3;
      this.position.set(this.positions[index], this.positions[index + 1], this.positions[index + 2]);
      this.direction.set(this.velocities[index], this.velocities[index + 1], this.velocities[index + 2]).normalize();
      this.quaternion.setFromUnitVectors(this.forward, this.direction);
      const bank = THREE.MathUtils.clamp(-this.velocities[index] * 0.16, -0.22, 0.22);
      this.bankQuaternion.setFromAxisAngle(this.localForward, bank);
      this.quaternion.multiply(this.bankQuaternion);
      if (this.simulationTime === 0) this.orientations[i].copy(this.quaternion);
      else this.orientations[i].slerp(this.quaternion, 0.075);
      const flutter = 1 + Math.sin(this.simulationTime * 0.7 + this.phases[i]) * 0.035;
      const focusTarget = i === this.focusedIndex ? 1 : 0;
      this.focusAmounts[i] = THREE.MathUtils.lerp(this.focusAmounts[i], focusTarget, 0.1);
      const tactileScale = 1 + THREE.MathUtils.smoothstep(this.focusAmounts[i], 0, 1) * 1.35;
      this.scale.setScalar(this.scales[i] * flutter * tactileScale);
      this.matrix.compose(this.position, this.orientations[i], this.scale);
      this.mesh.setMatrixAt(i, this.matrix);

      this.eyeLocalMatrix.makeTranslation(-0.205, 0.035, 0.42);
      this.eyeWorldMatrix.multiplyMatrices(this.matrix, this.eyeLocalMatrix);
      this.eyes.setMatrixAt(i * 2, this.eyeWorldMatrix);
      this.eyeLocalMatrix.makeTranslation(0.205, 0.035, 0.42);
      this.eyeWorldMatrix.multiplyMatrices(this.matrix, this.eyeLocalMatrix);
      this.eyes.setMatrixAt(i * 2 + 1, this.eyeWorldMatrix);

      this.eyeLocalMatrix.makeTranslation(-0.248, 0.035, 0.425);
      this.eyeWorldMatrix.multiplyMatrices(this.matrix, this.eyeLocalMatrix);
      this.pupils.setMatrixAt(i * 2, this.eyeWorldMatrix);
      this.eyeLocalMatrix.makeTranslation(0.248, 0.035, 0.425);
      this.eyeWorldMatrix.multiplyMatrices(this.matrix, this.eyeLocalMatrix);
      this.pupils.setMatrixAt(i * 2 + 1, this.eyeWorldMatrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.eyes.instanceMatrix.needsUpdate = true;
    this.pupils.instanceMatrix.needsUpdate = true;
  }
}
