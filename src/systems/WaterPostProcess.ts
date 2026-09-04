import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export class WaterPostProcess {
  private readonly composer: EffectComposer;
  private readonly waterPass: ShaderPass;
  private readonly motionScale: number;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    reducedMotion: boolean,
  ) {
    this.motionScale = reducedMotion ? 0.22 : 1;
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.composer.addPass(new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.1,
      0.3,
      0.9,
    ));
    this.waterPass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float uTime;
        uniform vec2 uResolution;
        varying vec2 vUv;

        float hash21(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }

        float waterWeb(vec2 p) {
          vec2 q = p;
          float web = 0.0;
          for (int i = 0; i < 3; i++) {
            float fi = float(i);
            q += vec2(
              sin(q.y * 1.22 + uTime * (0.28 + fi * 0.05)),
              cos(q.x * 1.37 - uTime * (0.22 + fi * 0.04))
            ) * 0.32;
            q = mat2(0.82, -0.57, 0.57, 0.82) * q * 1.31;
            float ridge = abs(sin(q.x + fi * 1.7)) + abs(sin(q.y - fi * 0.8));
            web += 0.034 / (ridge * ridge + 0.055);
          }
          return smoothstep(0.12, 0.42, web);
        }

        void main() {
          vec2 uv = vUv;
          float aspect = uResolution.x / max(uResolution.y, 1.0);
          float topWater = smoothstep(0.2, 1.0, uv.y);
          vec2 flow = vec2(
            sin(uv.y * 31.0 + uTime * 0.46) + sin(uv.y * 67.0 - uTime * 0.29),
            cos(uv.x * aspect * 36.0 - uTime * 0.34) + sin(uv.x * aspect * 57.0 + uTime * 0.21)
          );
          flow += vec2(
            sin((uv.x + uv.y) * 18.0 + uTime * 0.17),
            cos((uv.x - uv.y) * 21.0 - uTime * 0.19)
          ) * 0.55;
          vec2 refractedUv = clamp(uv + flow * (0.0003 + topWater * 0.00075), 0.002, 0.998);

          float split = 0.00042 + topWater * 0.00038;
          vec3 color;
          color.r = texture2D(tDiffuse, refractedUv + flow * split).r;
          color.g = texture2D(tDiffuse, refractedUv).g;
          color.b = texture2D(tDiffuse, refractedUv - flow * split).b;

          float caustic = waterWeb(vec2(uv.x * aspect, uv.y) * 14.5 + vec2(0.0, uTime * 0.08));
          float causticMask = smoothstep(0.06, 0.96, uv.y) * (0.62 + topWater * 0.38);
          color += vec3(0.12, 0.29, 0.3) * caustic * causticMask * 0.045;

          float surfaceBands = sin(uv.x * aspect * 15.0 + sin(uv.x * 5.0 - uTime * 0.22) * 2.6 + uTime * 0.16);
          surfaceBands = pow(max(0.0, surfaceBands), 9.0);
          float surfaceMask = smoothstep(0.53, 1.0, uv.y) * (1.0 - smoothstep(0.93, 1.0, uv.y));
          color += vec3(0.18, 0.42, 0.43) * surfaceBands * surfaceMask * 0.065;

          float airlight = pow(smoothstep(0.08, 1.0, uv.y), 1.6);
          color = mix(color, color + vec3(0.018, 0.072, 0.086), airlight * 0.42);
          float vignette = smoothstep(0.95, 0.24, length((uv - 0.5) * vec2(0.86, 1.0)));
          color *= 0.93 + vignette * 0.07;

          float dither = hash21(gl_FragCoord.xy + floor(uTime * 12.0)) - 0.5;
          color += dither / 520.0;
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });
    this.waterPass.material.toneMapped = false;
    this.composer.addPass(this.waterPass);
    this.composer.addPass(new OutputPass());
  }

  render(time: number): void {
    this.waterPass.uniforms.uTime.value = time * this.motionScale;
    this.composer.render();
  }

  resize(width: number, height: number, pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    this.waterPass.uniforms.uResolution.value.set(width * pixelRatio, height * pixelRatio);
  }
}
