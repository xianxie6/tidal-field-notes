import * as THREE from 'three';
import { CameraRig } from '../core/CameraRig';
import { FishSchoolSystem } from './FishSchoolSystem';
import { HeroFishSystem } from './HeroFishSystem';
import { ReefFishSystem } from './ReefFishSystem';
import { Interface } from '../ui/Interface';
import { DiverAvatarSystem } from './DiverAvatarSystem';

export class InputController {
  private readonly pointer = new THREE.Vector2();
  private readonly raycaster = new THREE.Raycaster();
  private readonly avoidancePoint = new THREE.Vector3();
  private readonly attractionPoint = new THREE.Vector3();
  private readonly cameraForward = new THREE.Vector3();
  private readonly downPosition = new THREE.Vector2();
  private readonly lastPosition = new THREE.Vector2();
  private readonly pressedKeys = new Set<string>();
  private readonly touchMoves = new Set<string>();
  private readonly spotTarget = new THREE.Object3D();
  private readonly diveLight: THREE.SpotLight;
  private pointerDownAt = 0;
  private pointerDown = false;

  constructor(
    private readonly ui: Interface,
    private readonly rig: CameraRig,
    private readonly fish: FishSchoolSystem,
    private readonly reefFish: ReefFishSystem,
    private readonly heroFish: HeroFishSystem,
    private readonly diver: DiverAvatarSystem,
  ) {
    this.diveLight = new THREE.SpotLight(0xc0e2d5, 28, 44, 0.24, 0.9, 1.35);
    this.diveLight.position.set(0, -0.08, -0.18);
    this.spotTarget.position.set(0, -0.4, -18);
    this.rig.camera.add(this.diveLight, this.spotTarget);
    this.diveLight.target = this.spotTarget;

    this.ui.canvas.addEventListener('pointermove', this.onPointerMove, { passive: true });
    this.ui.canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    this.ui.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.ui.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.releaseMovement);
    document.querySelectorAll<HTMLButtonElement>('[data-move]').forEach((button) => {
      const action = button.dataset.move;
      if (!action) return;
      const begin = (event: PointerEvent): void => {
        event.preventDefault();
        event.stopPropagation();
        this.touchMoves.add(action);
        button.classList.add('is-pressed');
        button.setPointerCapture(event.pointerId);
      };
      const end = (event: PointerEvent): void => {
        event.preventDefault();
        this.touchMoves.delete(action);
        button.classList.remove('is-pressed');
      };
      button.addEventListener('pointerdown', begin);
      button.addEventListener('pointerup', end);
      button.addEventListener('pointercancel', end);
      button.addEventListener('lostpointercapture', end);
    });
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    this.pointer.set(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1,
    );
    if (this.pointerDown) {
      const deltaX = event.clientX - this.lastPosition.x;
      const deltaY = event.clientY - this.lastPosition.y;
      if (Math.abs(deltaX) + Math.abs(deltaY) > 0.2) this.rig.rotateBy(deltaX, deltaY);
      this.lastPosition.set(event.clientX, event.clientY);
    }
    this.ui.updatePointer(event.clientX, event.clientY);
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    this.pointerDown = true;
    this.pointerDownAt = performance.now();
    this.downPosition.set(event.clientX, event.clientY);
    this.lastPosition.copy(this.downPosition);
    this.ui.canvas.setPointerCapture(event.pointerId);
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (!this.pointerDown) return;
    this.pointerDown = false;
    const distance = this.downPosition.distanceTo(new THREE.Vector2(event.clientX, event.clientY));
    const duration = performance.now() - this.pointerDownAt;
    if (distance < 8 && duration < 320) this.handleClick(event);
  };

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    this.rig.nudgeTravel(event.deltaY * 0.007);
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    const key = event.key.toLowerCase();
    if (!['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift', ' '].includes(key)) return;
    event.preventDefault();
    this.pressedKeys.add(key);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.pressedKeys.delete(event.key.toLowerCase());
  };

  private readonly releaseMovement = (): void => {
    this.pressedKeys.clear();
    this.touchMoves.clear();
    document.querySelectorAll('.dive-control.is-pressed').forEach((button) => button.classList.remove('is-pressed'));
  };

  private handleClick(event: PointerEvent): void {
    this.pointer.set(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.rig.camera);

    const hits = [
      ...this.raycaster.intersectObjects([this.fish.mesh, this.fish.eyes, this.fish.pupils], false),
      ...this.raycaster.intersectObjects(this.reefFish.meshes, false),
      ...this.raycaster.intersectObject(this.heroFish.group, true),
    ].sort((a, b) => a.distance - b.distance);
    const touched = hits[0];
    if (touched && this.heroFish.selectObject(touched.object)) {
      this.fish.clearFocus();
      this.reefFish.clearFocus();
      this.ui.signalTouch();
      this.ui.showObservation('barramundi');
      return;
    }
    if (touched && this.reefFish.selectObject(touched.object, touched.instanceId)) {
      this.fish.clearFocus();
      this.heroFish.clearFocus();
      this.ui.signalTouch();
      this.ui.showObservation('reef');
      return;
    }
    if (touched && this.fish.selectObject(touched.object, touched.instanceId)) {
      this.reefFish.clearFocus();
      this.heroFish.clearFocus();
      this.ui.signalTouch();
      this.ui.showObservation('school');
      return;
    }
    if (this.reefFish.selectNearPointer(this.pointer, this.rig.camera)) {
      this.fish.clearFocus();
      this.heroFish.clearFocus();
      this.ui.signalTouch();
      this.ui.showObservation('reef');
      return;
    }
    if (this.fish.selectNearPointer(this.pointer, this.rig.camera)) {
      this.reefFish.clearFocus();
      this.heroFish.clearFocus();
      this.ui.signalTouch();
      this.ui.showObservation('school');
      return;
    }

    this.fish.clearFocus();
    this.reefFish.clearFocus();
    this.heroFish.clearFocus();
    this.attractionPoint.copy(this.raycaster.ray.origin).addScaledVector(this.raycaster.ray.direction, 28);
    this.attractionPoint.x = THREE.MathUtils.clamp(this.attractionPoint.x, -8.5, 8.5);
    this.attractionPoint.y = THREE.MathUtils.clamp(this.attractionPoint.y, -0.8, 10.5);
    this.attractionPoint.z = THREE.MathUtils.clamp(this.attractionPoint.z, -76, 5);
    this.fish.setAttractionPoint(this.attractionPoint);
    this.reefFish.setAttractionPoint(this.attractionPoint);
    this.heroFish.setAttractionPoint(this.attractionPoint);
    this.ui.signalAttraction();
  }

  update(): void {
    const active = (action: string): boolean => this.touchMoves.has(action);
    const strafe = (this.pressedKeys.has('d') || this.pressedKeys.has('arrowright') || active('right') ? 1 : 0)
      - (this.pressedKeys.has('a') || this.pressedKeys.has('arrowleft') || active('left') ? 1 : 0);
    const forward = (this.pressedKeys.has('w') || this.pressedKeys.has('arrowup') || active('forward') ? 1 : 0)
      - (this.pressedKeys.has('s') || this.pressedKeys.has('arrowdown') || active('back') ? 1 : 0);
    const vertical = (this.pressedKeys.has('e') || this.pressedKeys.has(' ') || active('up') ? 1 : 0)
      - (this.pressedKeys.has('q') || this.pressedKeys.has('shift') || active('down') ? 1 : 0);
    if (this.diver.isActive()) {
      this.diver.setMovement(strafe, vertical, forward);
      this.rig.setMovement(0, 0, 0);
    } else {
      this.diver.setMovement(0, 0, 0);
      this.rig.setMovement(strafe, vertical, forward);
    }
    this.raycaster.setFromCamera(this.pointer, this.rig.camera);
    this.avoidancePoint.copy(this.raycaster.ray.origin).addScaledVector(this.raycaster.ray.direction, 14);
    this.fish.setAvoidancePoint(this.avoidancePoint);
    this.rig.camera.getWorldDirection(this.cameraForward);
    this.fish.setCameraPoint(this.rig.camera.position, this.cameraForward);
    this.reefFish.setAvoidancePoint(this.avoidancePoint);
    this.reefFish.setCameraPoint(this.rig.camera.position);
    this.heroFish.setAvoidancePoint(this.avoidancePoint);
    this.heroFish.setCameraPoint(this.rig.camera.position);
    this.spotTarget.position.set(this.pointer.x * 4.8, this.pointer.y * 2.8 - 0.35, -18);
  }
}
