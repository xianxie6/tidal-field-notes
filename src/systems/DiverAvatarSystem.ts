import * as THREE from 'three';

export class DiverAvatarSystem {
  readonly group = new THREE.Group();

  private readonly model = new THREE.Group();
  private readonly faceAnchor = new THREE.Group();
  private readonly leftFin = new THREE.Group();
  private readonly rightFin = new THREE.Group();
  private readonly leftArm = new THREE.Group();
  private readonly rightArm = new THREE.Group();
  private readonly bubbles: Array<{ mesh: THREE.Mesh; phase: number; speed: number }> = [];
  private readonly movement = new THREE.Vector3();
  private readonly velocity = new THREE.Vector3();
  private readonly desiredVelocity = new THREE.Vector3();
  private readonly forward = new THREE.Vector3(0, 0, -1);
  private readonly right = new THREE.Vector3(1, 0, 0);
  private readonly motionScale: number;
  private faceSprite: THREE.Sprite | null = null;
  private active = false;
  private entryProgress = 0;
  private heading = 0;

  constructor(scene: THREE.Scene, reducedMotion: boolean) {
    this.motionScale = reducedMotion ? 0.35 : 1;
    this.group.name = 'personal-2d5-diver';
    this.group.visible = false;
    this.createSuit();
    this.group.add(this.model);
    scene.add(this.group);
  }

  async enterWithPhoto(file: File): Promise<void> {
    const texture = await this.createFaceTexture(file);
    if (this.faceSprite) {
      this.faceAnchor.remove(this.faceSprite);
      this.faceSprite.material.map?.dispose();
      this.faceSprite.material.dispose();
    }
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    this.faceSprite = new THREE.Sprite(material);
    this.faceSprite.name = 'uploaded-diver-face';
    this.faceSprite.scale.set(0.68, 0.78, 1);
    this.faceAnchor.add(this.faceSprite);
    this.active = true;
    this.entryProgress = 0;
    this.heading = 0;
    this.velocity.set(0, 0, 0);
    this.movement.set(0, 0, 0);
    this.group.position.set(0, -3.2, 10.2);
    this.group.rotation.set(0, Math.PI / 2, 0);
    this.group.visible = true;
  }

  isActive(): boolean {
    return this.active;
  }

  setMovement(turn: number, vertical: number, forward: number): void {
    this.movement.set(
      THREE.MathUtils.clamp(turn, -1, 1),
      THREE.MathUtils.clamp(vertical, -1, 1),
      THREE.MathUtils.clamp(forward, -1, 1),
    );
  }

  getPosition(target: THREE.Vector3): THREE.Vector3 {
    return target.copy(this.group.position);
  }

  getForward(target: THREE.Vector3): THREE.Vector3 {
    return target.copy(this.forward);
  }

  update(time: number, delta: number): void {
    if (!this.active) return;
    const scaledTime = time * this.motionScale;
    this.entryProgress = Math.min(1, this.entryProgress + delta * 0.72);
    const easedEntry = 1 - (1 - this.entryProgress) ** 3;

    this.heading -= this.movement.x * delta * 1.28;
    this.forward.set(-Math.sin(this.heading), 0, -Math.cos(this.heading)).normalize();
    this.right.set(Math.cos(this.heading), 0, -Math.sin(this.heading)).normalize();
    const swimSpeed = this.movement.z >= 0 ? 3.65 : 2.2;
    this.desiredVelocity.set(0, this.movement.y * 2.65, 0);
    this.desiredVelocity.addScaledVector(this.forward, this.movement.z * swimSpeed);
    // Turning underwater creates a small side glide, so left/right still feels spatial.
    this.desiredVelocity.addScaledVector(this.right, this.movement.x * 0.72);
    this.velocity.lerp(this.desiredVelocity, 1 - Math.exp(-3.6 * delta));

    if (this.entryProgress < 1) {
      this.group.position.x = THREE.MathUtils.lerp(0, this.group.position.x, easedEntry);
      this.group.position.y = THREE.MathUtils.lerp(-3.2, 3.05, easedEntry);
      this.group.position.z = THREE.MathUtils.lerp(10.2, 7.6, easedEntry);
    } else {
      this.group.position.addScaledVector(this.velocity, delta);
      this.group.position.y += Math.sin(scaledTime * 0.72) * delta * 0.055;
    }
    this.group.position.x = THREE.MathUtils.clamp(this.group.position.x, -8.05, 8.05);
    this.group.position.y = THREE.MathUtils.clamp(this.group.position.y, 0.5, 12.1);
    this.group.position.z = THREE.MathUtils.clamp(this.group.position.z, -86, 10.5);
    this.group.rotation.y = this.heading + Math.PI / 2;

    const movementAmount = THREE.MathUtils.clamp(this.velocity.length() / 3.65, 0, 1);
    this.model.rotation.x = THREE.MathUtils.damp(this.model.rotation.x, -this.movement.x * 0.2, 4.8, delta);
    this.model.rotation.z = THREE.MathUtils.damp(
      this.model.rotation.z,
      this.movement.y * 0.13 + Math.sin(scaledTime * 0.48) * 0.025,
      4.2,
      delta,
    );
    const entryScale = 0.18 + easedEntry * 0.82;
    this.group.scale.setScalar(entryScale);

    const kick = Math.sin(scaledTime * (2.35 + movementAmount * 3.4));
    const kickRange = 0.08 + movementAmount * 0.27;
    this.leftFin.rotation.z = -0.08 + kick * kickRange;
    this.rightFin.rotation.z = -0.08 - kick * kickRange;
    this.leftArm.rotation.z = -0.42 + Math.sin(scaledTime * 1.55) * 0.1 - this.movement.x * 0.12;
    this.rightArm.rotation.z = 0.32 - Math.sin(scaledTime * 1.55 + 0.7) * 0.1 - this.movement.x * 0.12;
    this.faceAnchor.position.y = 0.2 + Math.sin(scaledTime * 0.72) * 0.018;
    this.updateBubbles(scaledTime, movementAmount);
  }

  private createSuit(): void {
    const suit = new THREE.MeshPhysicalMaterial({
      color: 0x071d2a,
      roughness: 0.32,
      metalness: 0.08,
      clearcoat: 0.56,
      clearcoatRoughness: 0.22,
      envMapIntensity: 1.25,
    });
    const seam = new THREE.MeshPhysicalMaterial({
      color: 0x45c7b9,
      emissive: 0x0b413e,
      emissiveIntensity: 0.42,
      roughness: 0.24,
      clearcoat: 0.52,
    });
    const tankMaterial = new THREE.MeshStandardMaterial({ color: 0x9baeb0, roughness: 0.34, metalness: 0.44 });
    const tankAccent = new THREE.MeshStandardMaterial({ color: 0xd9b759, roughness: 0.35, metalness: 0.16 });
    const finMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x187f7a,
      emissive: 0x062f31,
      emissiveIntensity: 0.18,
      roughness: 0.34,
      clearcoat: 0.38,
    });
    const hardware = new THREE.MeshStandardMaterial({ color: 0x16242a, roughness: 0.3, metalness: 0.62 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x030a0d, roughness: 0.7, metalness: 0.02 });
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0x8ddbd6,
      transparent: true,
      opacity: 0.28,
      roughness: 0.08,
      metalness: 0.05,
      transmission: 0.2,
      depthWrite: false,
    });

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.82, 8, 18), suit);
    torso.rotation.z = -Math.PI / 2;
    torso.scale.set(1, 0.92, 0.78);
    torso.castShadow = true;
    this.model.add(torso);

    const stripe = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.72, 5, 10), seam);
    stripe.rotation.z = -Math.PI / 2;
    stripe.position.set(0.02, 0.26, 0.25);
    this.model.add(stripe);

    const buoyancyVest = new THREE.Mesh(new THREE.CapsuleGeometry(0.29, 0.62, 7, 16), rubber);
    buoyancyVest.rotation.z = -Math.PI / 2;
    buoyancyVest.scale.set(1, 1.04, 0.94);
    buoyancyVest.position.set(-0.06, 0.01, -0.08);
    this.model.add(buoyancyVest);

    const waistBuckle = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.45), hardware);
    waistBuckle.position.set(-0.34, -0.06, 0.03);
    this.model.add(waistBuckle);

    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.4, 24, 16), suit);
    hood.scale.set(1.05, 1.12, 0.78);
    hood.position.set(0.78, 0.18, 0);
    this.model.add(hood);
    this.faceAnchor.position.set(0.8, 0.2, 0.34);
    this.model.add(this.faceAnchor);

    const visor = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.035, 8, 32), seam);
    visor.scale.y = 1.12;
    visor.position.set(0.8, 0.2, 0.39);
    this.model.add(visor);
    const visorGlass = new THREE.Mesh(new THREE.CircleGeometry(0.32, 32), glass);
    visorGlass.scale.y = 1.12;
    visorGlass.position.set(0.8, 0.2, 0.38);
    this.model.add(visorGlass);

    const regulator = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.095, 0.09, 16), hardware);
    regulator.rotation.x = Math.PI / 2;
    regulator.position.set(0.89, -0.09, 0.4);
    this.model.add(regulator);

    const tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.68, 6, 12), tankMaterial);
    tank.rotation.z = -Math.PI / 2;
    tank.position.set(-0.1, 0.31, 0);
    this.model.add(tank);

    const tankBand = new THREE.Mesh(new THREE.TorusGeometry(0.185, 0.025, 6, 20), hardware);
    tankBand.rotation.y = Math.PI / 2;
    tankBand.position.set(-0.08, 0.31, 0);
    tankBand.scale.x = 0.72;
    this.model.add(tankBand);
    const tankValve = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.18, 10), hardware);
    tankValve.rotation.z = Math.PI / 2;
    tankValve.position.set(0.38, 0.31, 0);
    this.model.add(tankValve);
    const tankShoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.181, 0.181, 0.12, 18), tankAccent);
    tankShoulder.rotation.z = Math.PI / 2;
    tankShoulder.position.set(0.29, 0.31, 0);
    this.model.add(tankShoulder);

    const hoseCurve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0.32, 0.31, -0.04),
      new THREE.Vector3(0.72, -0.28, -0.14),
      new THREE.Vector3(0.9, -0.1, 0.35),
    );
    const hose = new THREE.Mesh(new THREE.TubeGeometry(hoseCurve, 22, 0.022, 6, false), rubber);
    this.model.add(hose);

    this.addArm(this.leftArm, 0.18, 0.18, 0.29, suit, seam);
    this.addArm(this.rightArm, 0.12, -0.2, -0.25, suit, seam);
    this.addLeg(this.leftFin, -0.58, 0.13, 0.2, suit, finMaterial, seam);
    this.addLeg(this.rightFin, -0.58, -0.12, -0.18, suit, finMaterial, seam);
    this.createBubbles(glass);
  }

  private addArm(
    anchor: THREE.Group,
    x: number,
    y: number,
    z: number,
    suit: THREE.Material,
    accent: THREE.Material,
  ): void {
    anchor.position.set(x, y, z);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.52, 5, 10), suit);
    upper.rotation.z = -Math.PI / 2;
    upper.position.x = 0.31;
    const glove = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), accent);
    glove.position.x = 0.68;
    anchor.add(upper, glove);
    this.model.add(anchor);
  }

  private addLeg(
    anchor: THREE.Group,
    x: number,
    y: number,
    z: number,
    suit: THREE.Material,
    finMaterial: THREE.Material,
    accent: THREE.Material,
  ): void {
    anchor.position.set(x, y, z);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.72, 5, 12), suit);
    leg.rotation.z = Math.PI / 2;
    leg.position.x = -0.42;
    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.145, 14, 10), accent);
    knee.scale.set(1.18, 0.55, 1.04);
    knee.position.set(-0.28, 0.015, 0);
    const fin = new THREE.Mesh(this.createFinGeometry(), finMaterial);
    fin.position.x = -1.02;
    fin.rotation.z = -0.08;
    const finRib = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.022, 0.026), accent);
    finRib.position.set(-1.02, 0.044, 0);
    finRib.rotation.z = -0.08;
    anchor.add(leg, knee, fin, finRib);
    this.model.add(anchor);
  }

  private createFinGeometry(): THREE.ExtrudeGeometry {
    const shape = new THREE.Shape();
    shape.moveTo(0.34, -0.09);
    shape.lineTo(0.32, 0.09);
    shape.lineTo(-0.28, 0.18);
    shape.lineTo(-0.4, 0);
    shape.lineTo(-0.28, -0.18);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.055,
      bevelEnabled: true,
      bevelThickness: 0.018,
      bevelSize: 0.018,
      bevelSegments: 2,
    });
    geometry.center();
    geometry.rotateX(Math.PI / 2);
    return geometry;
  }

  private createBubbles(material: THREE.Material): void {
    for (let index = 0; index < 7; index += 1) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.026 + (index % 3) * 0.008, 9, 7), material);
      mesh.position.set(0.94, 0.06, 0.39);
      mesh.visible = false;
      this.model.add(mesh);
      this.bubbles.push({ mesh, phase: index / 7, speed: 0.76 + (index % 4) * 0.13 });
    }
  }

  private updateBubbles(time: number, movementAmount: number): void {
    this.bubbles.forEach((bubble, index) => {
      const cycle = (time * bubble.speed + bubble.phase) % 1;
      bubble.mesh.visible = cycle > 0.1;
      bubble.mesh.position.set(
        0.94 - cycle * 0.16,
        0.08 + cycle * (0.7 + movementAmount * 0.22),
        0.39 + Math.sin(time * 2.1 + index) * 0.045,
      );
      const size = 0.52 + cycle * 0.9;
      bubble.mesh.scale.setScalar(size);
    });
  }

  private async createFaceTexture(file: File): Promise<THREE.CanvasTexture> {
    const image = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Unable to prepare diver portrait.');
    const sourceSize = Math.min(image.width, image.height);
    const sourceX = Math.max(0, (image.width - sourceSize) * 0.5);
    const sourceY = image.height > image.width
      ? Math.min(image.height - sourceSize, image.height * 0.055)
      : Math.max(0, (image.height - sourceSize) * 0.5);
    context.clearRect(0, 0, 512, 512);
    context.save();
    context.beginPath();
    context.ellipse(256, 258, 208, 238, 0, 0, Math.PI * 2);
    context.clip();
    context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, 512, 512);
    const light = context.createLinearGradient(0, 0, 512, 512);
    light.addColorStop(0, 'rgba(190,255,244,0.12)');
    light.addColorStop(0.52, 'rgba(60,155,160,0.01)');
    light.addColorStop(1, 'rgba(2,35,48,0.2)');
    context.fillStyle = light;
    context.fillRect(0, 0, 512, 512);
    context.restore();
    image.close();
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  }
}
