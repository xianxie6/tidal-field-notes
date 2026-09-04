import type { QualityLevel } from '../core/config';

const QUALITY_NAMES: Record<QualityLevel, string> = {
  high: 'HIGH',
  medium: 'MED',
  low: 'LOW',
};

const OBSERVATIONS = {
  school: {
    title: '蓝绿拟鲡群',
    latin: 'Carangidae / juvenile study',
    note: '受光束惊扰时会短暂散开，随后沿邻近个体的方向重新聚拢。',
  },
  barramundi: {
    title: '金目鲈',
    latin: 'Lates calcarifer / barramundi',
    note: '幼鱼常出现在河口与近岸水域；观察光束靠近时，它会偏离原有游动轨迹。',
  },
  reef: {
    title: '珠光礁鱼群',
    latin: 'Iridescent reef study / 06 forms',
    note: '六种体型分别占据礁缘与开放水层。单击水域可引导鱼群；银蓝、铜金与青紫鳞光只在转身和潜水灯扫过时短暂显现。',
  },
} as const;

export class Interface {
  readonly canvas: HTMLCanvasElement;

  private readonly loading = this.required<HTMLElement>('loading-screen');
  private readonly progress = this.required<HTMLElement>('loading-progress');
  private readonly card = this.required<HTMLElement>('observation-card');
  private readonly qualityLabel = this.required<HTMLElement>('quality-label');
  private readonly depthValue = this.required<HTMLElement>('depth-value');
  private readonly reticle = this.required<HTMLElement>('reticle');
  private readonly diverPanel = this.required<HTMLElement>('diver-panel');
  private readonly portraitInput = this.required<HTMLInputElement>('portrait-file');
  private readonly portraitPreview = this.required<HTMLImageElement>('portrait-preview');
  private readonly beginDive = this.required<HTMLButtonElement>('begin-dive');
  private portraitFile: File | null = null;
  private portraitPreviewUrl: string | null = null;
  private hintDismissed = false;

  constructor(level: QualityLevel) {
    this.canvas = this.required<HTMLCanvasElement>('ocean-canvas');
    this.setQuality(level);
    this.required<HTMLButtonElement>('close-observation').addEventListener('click', () => this.hideObservation());
    this.required<HTMLButtonElement>('diver-entry').addEventListener('click', () => this.openDiverPanel());
    this.required<HTMLButtonElement>('close-diver-panel').addEventListener('click', () => this.closeDiverPanel());
    this.portraitInput.addEventListener('change', () => this.previewPortrait());
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.hideObservation();
      if (event.key === 'Escape') this.closeDiverPanel();
    });
  }

  private required<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Missing interface element: ${id}`);
    return element as T;
  }

  setLoading(value: number, label?: string): void {
    this.progress.textContent = Math.round(value).toString().padStart(2, '0');
    if (label) {
      const copy = this.loading.querySelector('p');
      if (copy) copy.textContent = label;
    }
  }

  reveal(): void {
    this.setLoading(100, '能见度校准完成');
    window.setTimeout(() => this.loading.classList.add('is-complete'), 260);
    window.setTimeout(() => this.loading.setAttribute('hidden', ''), 1300);
  }

  showFatalError(): void {
    this.loading.setAttribute('hidden', '');
    this.required<HTMLElement>('fatal-error').hidden = false;
  }

  setQuality(level: QualityLevel): void {
    this.qualityLabel.textContent = QUALITY_NAMES[level];
  }

  onQualityToggle(callback: () => void): void {
    this.required<HTMLButtonElement>('quality-toggle').addEventListener('click', callback);
  }

  onDiverStart(callback: (file: File) => Promise<void>): void {
    this.beginDive.addEventListener('click', async () => {
      if (!this.portraitFile || this.beginDive.disabled) return;
      this.beginDive.disabled = true;
      this.beginDive.textContent = '正在换上潜水服…';
      try {
        await callback(this.portraitFile);
        this.closeDiverPanel();
        this.playDiveTransition();
        this.required<HTMLButtonElement>('diver-entry').querySelector('span')!.textContent = '你已在海中';
        this.setDiverMode();
      } finally {
        this.beginDive.textContent = '重新换装并潜入';
        this.beginDive.disabled = false;
      }
    });
  }

  updateDepth(meters: number): void {
    this.depthValue.textContent = `− ${meters.toFixed(1).padStart(4, '0')} M`;
  }

  updatePointer(clientX: number, clientY: number): void {
    this.reticle.style.translate = `${clientX}px ${clientY}px`;
    if (!this.hintDismissed) {
      this.hintDismissed = true;
      document.getElementById('interaction-hint')?.classList.add('is-used');
    }
  }

  signalAttraction(): void {
    this.reticle.classList.remove('is-attracting');
    void this.reticle.offsetWidth;
    this.reticle.classList.add('is-attracting');
  }

  signalTouch(): void {
    this.reticle.classList.remove('is-touching');
    void this.reticle.offsetWidth;
    this.reticle.classList.add('is-touching');
  }

  private openDiverPanel(): void {
    this.diverPanel.hidden = false;
    requestAnimationFrame(() => this.diverPanel.classList.add('is-visible'));
  }

  private closeDiverPanel(): void {
    this.diverPanel.classList.remove('is-visible');
    window.setTimeout(() => {
      if (!this.diverPanel.classList.contains('is-visible')) this.diverPanel.hidden = true;
    }, 360);
  }

  private previewPortrait(): void {
    const file = this.portraitInput.files?.[0] ?? null;
    if (!file) return;
    if (this.portraitPreviewUrl) URL.revokeObjectURL(this.portraitPreviewUrl);
    this.portraitFile = file;
    this.portraitPreviewUrl = URL.createObjectURL(file);
    this.portraitPreview.src = this.portraitPreviewUrl;
    this.portraitPreview.hidden = false;
    this.required<HTMLElement>('portrait-upload-copy').textContent = '更换照片';
    this.beginDive.disabled = false;
  }

  private playDiveTransition(): void {
    const transition = this.required<HTMLElement>('dive-transition');
    transition.classList.remove('is-active');
    void transition.offsetWidth;
    transition.classList.add('is-active');
  }

  private setDiverMode(): void {
    const hint = this.required<HTMLElement>('interaction-hint');
    hint.innerHTML = 'W / S 前后游 <i>·</i> A / D 转向 <i>·</i> Q / E 升降 <i>·</i> 拖动环视';
    hint.classList.remove('is-used');
    this.hintDismissed = false;
    this.required<HTMLElement>('experience').classList.add('is-diver-mode');
    this.required<HTMLElement>('dive-transition').setAttribute('data-mode', 'follow');
    document.querySelector<HTMLElement>('.dive-controls__label')!.textContent = '潜水员控制';
    document.querySelector<HTMLElement>('.sound-note')!.textContent = '第三人称跟随 / 滚轮调整距离';
    document.querySelector<HTMLButtonElement>('[data-move="left"]')!.setAttribute('aria-label', '向左转向');
    document.querySelector<HTMLButtonElement>('[data-move="right"]')!.setAttribute('aria-label', '向右转向');
  }

  showObservation(kind: keyof typeof OBSERVATIONS = 'school'): void {
    const observation = OBSERVATIONS[kind];
    const title = this.card.querySelector('h2');
    const latin = this.card.querySelector<HTMLElement>('.observation-card__latin');
    const note = this.card.querySelector<HTMLElement>('.observation-card__rule + p');
    if (title) title.textContent = observation.title;
    if (latin) latin.textContent = observation.latin;
    if (note) note.textContent = observation.note;
    this.card.hidden = false;
    requestAnimationFrame(() => this.card.classList.add('is-visible'));
  }

  hideObservation(): void {
    this.card.classList.remove('is-visible');
    window.setTimeout(() => {
      if (!this.card.classList.contains('is-visible')) this.card.hidden = true;
    }, 360);
  }
}
