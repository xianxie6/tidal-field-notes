import * as THREE from 'three';
import { OCEAN } from './config';
import { CameraRig } from './CameraRig';
import { QualityManager } from './QualityManager';
import { EnvironmentSystem } from '../systems/EnvironmentSystem';
import { FishSchoolSystem } from '../systems/FishSchoolSystem';
import { HeroFishSystem } from '../systems/HeroFishSystem';
import { ReefFishSystem } from '../systems/ReefFishSystem';
import { InputController } from '../systems/InputController';
import { ParticleSystem } from '../systems/ParticleSystem';
import { WaterPostProcess } from '../systems/WaterPostProcess';
import { DiverAvatarSystem } from '../systems/DiverAvatarSystem';
import { JellyfishSystem } from '../systems/JellyfishSystem';
import { Interface } from '../ui/Interface';

interface TidalMetrics {
  quality: string;
  fps: number | null;
  drawCalls: number;
  triangles: number;
  fish: number;
  renderer: string;
}

declare global {
  interface Window {
    __TIDAL_METRICS__?: TidalMetrics;
  }
}

export class UnderwaterExperience {
  private readonly quality = new QualityManager();
  private readonly ui = new Interface(this.quality.level);
  private readonly scene = new THREE.Scene();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly rig: CameraRig;
  private readonly environment: EnvironmentSystem;
  private readonly particles: ParticleSystem;
  private readonly fish: FishSchoolSystem;
  private readonly heroFish: HeroFishSystem;
  private readonly reefFish: ReefFishSystem;
  private readonly input: InputController;
  private readonly waterPost: WaterPostProcess;
  private readonly diver: DiverAvatarSystem;
  private readonly jellyfish: JellyfishSystem;
  private readonly timer = new THREE.Timer();
  private elapsed = 0;
  private lastMetricUpdate = 0;
  private readonly diverPosition = new THREE.Vector3();
  private readonly diverForward = new THREE.Vector3(0, 0, -1);

  constructor() {
    this.ui.setLoading(12, '正在测量海流');
    this.scene.background = OCEAN.clearColor;
    this.scene.fog = new THREE.FogExp2(OCEAN.fogColor, OCEAN.fogDensity);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.ui.canvas,
      antialias: this.quality.level !== 'low',
      alpha: false,
      powerPreference: 'high-performance',
      logarithmicDepthBuffer: false,
    });
    this.renderer.setPixelRatio(this.pixelRatio());
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.13;
    this.renderer.shadowMap.enabled = this.quality.preset.shadowMapSize > 0;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.timer.connect(document);

    this.ui.setLoading(34, '正在寻找峡谷入口');
    this.rig = new CameraRig(this.quality.reducedMotion);
    this.scene.add(this.rig.camera);
    this.environment = new EnvironmentSystem(
      this.scene,
      this.quality.preset,
      this.quality.level,
      this.quality.reducedMotion,
    );

    this.ui.setLoading(61, '正在等待鱼群');
    this.particles = new ParticleSystem(this.scene, this.quality.preset, this.quality.reducedMotion);
    this.fish = new FishSchoolSystem(this.scene, this.quality.preset, this.quality.reducedMotion);
    this.reefFish = new ReefFishSystem(this.scene, this.quality.preset, this.quality.reducedMotion);
    this.heroFish = new HeroFishSystem(this.scene, this.quality.reducedMotion);
    void this.heroFish.load();
    this.jellyfish = new JellyfishSystem(this.scene, this.quality.preset, this.quality.reducedMotion);
    this.diver = new DiverAvatarSystem(this.scene, this.quality.reducedMotion);
    this.ui.onDiverStart((file) => this.diver.enterWithPhoto(file));
    this.input = new InputController(this.ui, this.rig, this.fish, this.reefFish, this.heroFish, this.diver);
    this.waterPost = new WaterPostProcess(
      this.renderer,
      this.scene,
      this.rig.camera,
      this.quality.reducedMotion,
    );
    this.waterPost.resize(window.innerWidth, window.innerHeight, this.pixelRatio());

    this.ui.onQualityToggle(() => {
      this.quality.cycle();
      window.location.reload();
    });
    window.addEventListener('resize', this.onResize, { passive: true });
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  start(): void {
    this.ui.setLoading(84, '正在调平观察光束');
    this.timer.reset();
    this.renderer.setAnimationLoop(this.animate);
    this.waterPost.render(this.elapsed);
    window.setTimeout(() => this.ui.reveal(), 280);
  }

  private readonly animate = (): void => {
    this.timer.update();
    const delta = Math.min(this.timer.getDelta(), 0.05);
    this.elapsed += delta;
    this.input.update();
    this.diver.update(this.elapsed, delta);
    this.rig.setFollowTarget(
      this.diver.getPosition(this.diverPosition),
      this.diver.getForward(this.diverForward),
      this.diver.isActive(),
    );
    this.rig.update(this.elapsed, delta);
    this.environment.update(this.elapsed);
    this.particles.update(this.elapsed);
    this.jellyfish.update(this.elapsed);
    this.fish.update(this.elapsed, delta);
    this.reefFish.update(this.elapsed, delta);
    this.heroFish.update(this.elapsed, delta);
    this.ui.updateDepth(this.rig.getDepthMeters());
    this.waterPost.render(this.elapsed);
    this.quality.sample(delta);
    this.updateMetrics();
  };

  private updateMetrics(): void {
    if (this.elapsed - this.lastMetricUpdate < 0.5) return;
    this.lastMetricUpdate = this.elapsed;
    const gl = this.renderer.getContext();
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const rendererName = debugInfo
      ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL))
      : 'WebGL 2';
    window.__TIDAL_METRICS__ = {
      quality: this.quality.level,
      fps: this.quality.getAverageFps(),
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      fish: this.quality.preset.fishCount + this.quality.preset.reefFishCount + 3,
      renderer: rendererName,
    };
  }

  private readonly onResize = (): void => {
    this.rig.resize(window.innerWidth, window.innerHeight);
    const pixelRatio = this.pixelRatio();
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.waterPost.resize(window.innerWidth, window.innerHeight, pixelRatio);
    this.particles.resize(pixelRatio);
  };

  private readonly onVisibilityChange = (): void => {
    if (document.hidden) {
      this.renderer.setAnimationLoop(null);
    } else {
      this.timer.reset();
      this.renderer.setAnimationLoop(this.animate);
    }
  };

  private pixelRatio(): number {
    return Math.min(window.devicePixelRatio, this.quality.preset.pixelRatio);
  }
}
