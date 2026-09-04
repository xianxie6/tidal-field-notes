import * as THREE from 'three';
import { OCEAN } from './config';

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;

  private readonly basePosition = new THREE.Vector3(0, 3.8, 14.5);
  private readonly velocity = new THREE.Vector3();
  private readonly movement = new THREE.Vector3();
  private readonly desiredVelocity = new THREE.Vector3();
  private readonly forward = new THREE.Vector3(0, 0, -1);
  private readonly planarForward = new THREE.Vector3(0, 0, -1);
  private readonly right = new THREE.Vector3(1, 0, 0);
  private readonly lookTarget = new THREE.Vector3();
  private readonly followPosition = new THREE.Vector3();
  private readonly followForward = new THREE.Vector3(0, 0, -1);
  private readonly followBack = new THREE.Vector3();
  private readonly followDesired = new THREE.Vector3();
  private readonly worldUp = new THREE.Vector3(0, 1, 0);
  private yaw = 0;
  private pitch = -0.035;
  private yawTarget = 0;
  private pitchTarget = -0.035;
  private wheelTravel = 0;
  private followActive = false;
  private followDistance = 5.6;
  private orbitYaw = 0.42;
  private orbitPitch = 0.12;
  private orbitYawTarget = 0.42;
  private orbitPitchTarget = 0.12;
  private readonly floatScale: number;

  constructor(reducedMotion: boolean) {
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(aspect < 0.72 ? 64 : 52, aspect, 0.08, 150);
    this.camera.position.copy(this.basePosition);
    this.floatScale = reducedMotion ? 0.18 : 1;
  }

  resize(width: number, height: number): void {
    const aspect = width / height;
    this.camera.aspect = aspect;
    this.camera.fov = aspect < 0.72 ? 64 : aspect < 1 ? 58 : 52;
    this.camera.updateProjectionMatrix();
  }

  setMovement(strafe: number, vertical: number, forward: number): void {
    this.movement.set(
      THREE.MathUtils.clamp(strafe, -1, 1),
      THREE.MathUtils.clamp(vertical, -1, 1),
      THREE.MathUtils.clamp(forward, -1, 1),
    );
  }

  rotateBy(deltaX: number, deltaY: number): void {
    if (this.followActive) {
      this.orbitYawTarget -= deltaX * 0.00245;
      this.orbitPitchTarget = THREE.MathUtils.clamp(this.orbitPitchTarget - deltaY * 0.0018, -0.18, 0.62);
      return;
    }
    this.yawTarget -= deltaX * 0.00245;
    this.pitchTarget = THREE.MathUtils.clamp(this.pitchTarget - deltaY * 0.0021, -0.72, 0.58);
  }

  nudgeTravel(delta: number): void {
    if (this.followActive) {
      this.followDistance = THREE.MathUtils.clamp(this.followDistance + delta, 3.6, 8.5);
      return;
    }
    this.wheelTravel = THREE.MathUtils.clamp(this.wheelTravel + delta, -3.5, 3.5);
  }

  setFollowTarget(position: THREE.Vector3, forward: THREE.Vector3, active: boolean): void {
    if (active && !this.followActive) {
      this.orbitYaw = 0.42;
      this.orbitYawTarget = 0.42;
      this.orbitPitch = 0.12;
      this.orbitPitchTarget = 0.12;
      this.velocity.set(0, 0, 0);
      this.movement.set(0, 0, 0);
    }
    this.followActive = active;
    if (!active) return;
    this.followPosition.copy(position);
    this.followForward.copy(forward).setY(0).normalize();
  }

  update(time: number, delta: number): void {
    if (this.followActive) {
      this.updateFollowCamera(time, delta);
      return;
    }
    this.yaw = THREE.MathUtils.damp(this.yaw, this.yawTarget, 10, delta);
    this.pitch = THREE.MathUtils.damp(this.pitch, this.pitchTarget, 10, delta);
    const cosPitch = Math.cos(this.pitch);
    this.forward.set(
      -Math.sin(this.yaw) * cosPitch,
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * cosPitch,
    ).normalize();
    this.planarForward.set(this.forward.x, 0, this.forward.z).normalize();
    this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).normalize();

    const forwardSpeed = 5.15;
    this.desiredVelocity.set(0, this.movement.y * 3.4, 0);
    this.desiredVelocity.addScaledVector(this.planarForward, this.movement.z * forwardSpeed);
    this.desiredVelocity.addScaledVector(this.right, this.movement.x * 4.35);
    if (this.desiredVelocity.lengthSq() > forwardSpeed * forwardSpeed) this.desiredVelocity.setLength(forwardSpeed);
    this.velocity.lerp(this.desiredVelocity, 1 - Math.exp(-5.2 * delta));
    this.basePosition.addScaledVector(this.velocity, delta);

    const wheelStep = this.wheelTravel * (1 - Math.exp(-11 * delta));
    this.basePosition.addScaledVector(this.planarForward, wheelStep);
    this.wheelTravel -= wheelStep;
    this.basePosition.x = THREE.MathUtils.clamp(this.basePosition.x, -8.35, 8.35);
    this.basePosition.y = THREE.MathUtils.clamp(this.basePosition.y, 0.15, 12.8);
    this.basePosition.z = THREE.MathUtils.clamp(this.basePosition.z, -88, 14.5);

    const floatAmp = OCEAN.cameraFloatAmplitude * this.floatScale;
    const driftX = Math.sin(time * 0.27) * floatAmp * 0.75;
    const driftY = Math.sin(time * OCEAN.cameraFloatSpeed) * floatAmp;
    const moving = THREE.MathUtils.clamp(this.velocity.length() / forwardSpeed, 0, 1);
    this.camera.position.copy(this.basePosition);
    this.camera.position.x += driftX;
    this.camera.position.y += driftY + Math.sin(time * 2.1) * moving * 0.024;
    this.lookTarget.copy(this.camera.position).addScaledVector(this.forward, 15);
    this.camera.lookAt(this.lookTarget);
  }

  getDepthMeters(): number {
    const sourceY = this.followActive ? this.followPosition.y : this.basePosition.y;
    return THREE.MathUtils.clamp(8.4 + (3.8 - sourceY) * 0.72, 2, 11.2);
  }

  private updateFollowCamera(time: number, delta: number): void {
    this.orbitYaw = THREE.MathUtils.damp(this.orbitYaw, this.orbitYawTarget, 7.5, delta);
    this.orbitPitch = THREE.MathUtils.damp(this.orbitPitch, this.orbitPitchTarget, 7.5, delta);
    this.followBack.copy(this.followForward).multiplyScalar(-1).applyAxisAngle(this.worldUp, this.orbitYaw);
    const planarDistance = this.followDistance * Math.cos(this.orbitPitch);
    const height = 1.5 + this.followDistance * Math.sin(this.orbitPitch);
    this.followDesired.copy(this.followPosition)
      .addScaledVector(this.followBack, planarDistance)
      .addScaledVector(this.worldUp, height);
    this.followDesired.y += Math.sin(time * OCEAN.cameraFloatSpeed) * OCEAN.cameraFloatAmplitude * this.floatScale * 0.35;
    const followBlend = 1 - Math.exp(-3.8 * delta);
    this.camera.position.lerp(this.followDesired, followBlend);
    this.lookTarget.copy(this.followPosition)
      .addScaledVector(this.followForward, 1.35)
      .addScaledVector(this.worldUp, 0.24);
    this.camera.lookAt(this.lookTarget);
  }
}
