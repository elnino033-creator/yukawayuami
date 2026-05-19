/**
 * TitleScene.ts
 * タイトル画面を Canvas API で描画するシーン。
 * グラデーション背景、タイトルテキスト、メニューボタンを表示する。
 */

/** メニュー選択肢の種別 */
export type TitleChoice = 'new' | 'continue' | 'stage';

/** ボタン定義 */
interface TitleButton {
  label: string;
  choice: TitleChoice;
  x: number;
  y: number;
  w: number;
  h: number;
  hovered: boolean;
  disabled: boolean;
}

/**
 * タイトル画面シーン。
 * Canvasにグラデーション、タイトル、メニューボタンを描画する。
 */
export class TitleScene {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private onSelect: (choice: TitleChoice) => void;
  private hasSave: boolean;
  private buttons: TitleButton[] = [];
  private rafId: number | null = null;
  private startTime: number = Date.now();
  private bgmAudio: HTMLAudioElement | null = null;

  /** マウス位置 */
  private mouseX = 0;
  private mouseY = 0;

  /** イベントリスナー（後でremoveするため保持） */
  private boundMouseMove: (e: MouseEvent) => void;
  private boundClick: (e: MouseEvent) => void;
  private boundTouchEnd: (e: TouchEvent) => void;
  private boundResize: () => void;

  /**
   * @param canvas 描画対象のCanvas要素
   * @param onSelect ボタン選択時のコールバック
   * @param hasSave セーブデータが存在するかどうか
   */
  constructor(
    canvas: HTMLCanvasElement,
    onSelect: (choice: TitleChoice) => void,
    hasSave: boolean,
    _allStagesComplete: boolean = false
  ) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable');
    this.ctx = ctx;
    this.onSelect = onSelect;
    this.hasSave = hasSave;

    this.boundMouseMove = (e: MouseEvent) => this.handleMouseMove(e);
    this.boundClick = (e: MouseEvent) => this.handleClick(e);
    this.boundTouchEnd = (e: TouchEvent) => this.handleTouchEnd(e);
    this.boundResize = () => this.handleResize();

    this.canvas.addEventListener('mousemove', this.boundMouseMove);
    this.canvas.addEventListener('click', this.boundClick);
    this.canvas.addEventListener('touchend', this.boundTouchEnd, { passive: false });
    window.addEventListener('resize', this.boundResize);
  }

  /**
   * シーンを開始してアニメーションループを起動する。
   */
  start(): void {
    this.handleResize();
    this.buildButtons();
    this.startRenderLoop();
    this.bgmAudio = new Audio(`${import.meta.env.BASE_URL}assets/bgm/${encodeURIComponent('op_色彩の塔へ.mp3')}`);
    this.bgmAudio.loop = true;
    this.bgmAudio.volume = 0.4;
    this.bgmAudio.play().catch(() => {
      const resume = () => {
        this.bgmAudio?.play().catch(() => {});
      };
      this.canvas.addEventListener('click', resume, { once: true });
    });
  }

  /**
   * シーンを破棄してリソースを解放する。
   */
  destroy(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.canvas.removeEventListener('mousemove', this.boundMouseMove);
    this.canvas.removeEventListener('click', this.boundClick);
    this.canvas.removeEventListener('touchend', this.boundTouchEnd);
    window.removeEventListener('resize', this.boundResize);
    if (this.bgmAudio) {
      this.bgmAudio.pause();
      this.bgmAudio.src = '';
      this.bgmAudio = null;
    }
  }

  // ---------- プライベートメソッド ----------

  private handleResize(): void {
    const parent = this.canvas.parentElement;
    if (parent) {
      this.canvas.width = parent.clientWidth || window.innerWidth;
      this.canvas.height = parent.clientHeight || window.innerHeight;
    }
    this.buildButtons();
  }

  private buildButtons(): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const bw = Math.min(280, w * 0.5);
    const bh = 52;
    const gap = 16;
    const startX = (w - bw) / 2;
    const startY = h * 0.58;

    this.buttons = [
      {
        label: 'NEW GAME',
        choice: 'new',
        x: startX,
        y: startY,
        w: bw,
        h: bh,
        hovered: false,
        disabled: false
      },
      {
        label: 'CONTINUE',
        choice: 'continue',
        x: startX,
        y: startY + bh + gap,
        w: bw,
        h: bh,
        hovered: false,
        disabled: !this.hasSave
      },
      {
        label: 'STAGE SELECT',
        choice: 'stage',
        x: startX,
        y: startY + (bh + gap) * 2,
        w: bw,
        h: bh,
        hovered: false,
        disabled: !this.hasSave
      }
    ];
  }

  private startRenderLoop(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    const tick = () => {
      this.render();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private render(): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const now = Date.now();
    const elapsed = (now - this.startTime) / 1000;

    // 背景グラデーション（暗い夜空風）
    const bgGrad = this.ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, '#0d0d1a');
    bgGrad.addColorStop(0.6, '#1a1030');
    bgGrad.addColorStop(1, '#0d0d1a');
    this.ctx.fillStyle = bgGrad;
    this.ctx.fillRect(0, 0, w, h);

    // 星のエフェクト（シンプルな点）
    this.drawStars(w, h, elapsed);

    // タイトルのグロー効果（アニメーション）
    const glowIntensity = 0.5 + 0.5 * Math.sin(elapsed * 1.2);
    this.ctx.save();
    this.ctx.shadowColor = `rgba(180, 100, 255, ${glowIntensity * 0.6})`;
    this.ctx.shadowBlur = 30;

    // メインタイトル
    const titleFontSize = Math.min(52, w * 0.08);
    this.ctx.fillStyle = '#f0d8ff';
    this.ctx.font = `bold ${titleFontSize}px 'Yu Gothic', 'Meiryo', sans-serif`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText('カラータイル・ロマンス', w / 2, h * 0.28);
    this.ctx.restore();

    // サブタイトル
    const subFontSize = Math.min(22, w * 0.035);
    this.ctx.fillStyle = '#c8a8e8';
    this.ctx.font = `${subFontSize}px 'Arial', sans-serif`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText('Color Tiles Romance', w / 2, h * 0.28 + titleFontSize * 0.9);

    // 装飾ライン
    const lineY = h * 0.42;
    const lineW = Math.min(400, w * 0.6);
    const lineGrad = this.ctx.createLinearGradient(w / 2 - lineW / 2, 0, w / 2 + lineW / 2, 0);
    lineGrad.addColorStop(0, 'transparent');
    lineGrad.addColorStop(0.5, 'rgba(180, 100, 255, 0.7)');
    lineGrad.addColorStop(1, 'transparent');
    this.ctx.strokeStyle = lineGrad;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(w / 2 - lineW / 2, lineY);
    this.ctx.lineTo(w / 2 + lineW / 2, lineY);
    this.ctx.stroke();

    // ボタン描画
    this.updateButtonHover();
    for (const btn of this.buttons) {
      this.drawButton(btn);
    }

    // バージョン表示
    this.ctx.fillStyle = 'rgba(150, 130, 180, 0.5)';
    this.ctx.font = '12px monospace';
    this.ctx.textAlign = 'right';
    this.ctx.textBaseline = 'bottom';
    this.ctx.fillText('ver 1.0', w - 12, h - 10);
  }

  private drawStars(w: number, h: number, elapsed: number): void {
    // シード付き疑似乱数で星の位置を固定
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    for (let i = 0; i < 60; i++) {
      const sx = ((i * 137.5 * (i + 1)) % w);
      const sy = ((i * 97.3 * (i + 2)) % h);
      const alpha = 0.3 + 0.4 * Math.sin(elapsed * 0.5 + i * 0.8);
      const radius = 0.5 + (i % 3) * 0.5;
      this.ctx.globalAlpha = alpha;
      this.ctx.beginPath();
      this.ctx.arc(sx, sy, radius, 0, Math.PI * 2);
      this.ctx.fill();
    }
    this.ctx.globalAlpha = 1;
  }

  private updateButtonHover(): void {
    const mx = this.mouseX;
    const my = this.mouseY;
    for (const btn of this.buttons) {
      btn.hovered = !btn.disabled &&
        mx >= btn.x && mx <= btn.x + btn.w &&
        my >= btn.y && my <= btn.y + btn.h;
    }
  }

  private drawButton(btn: TitleButton): void {
    const { x, y, w, h, label, hovered, disabled } = btn;

    // ボタン背景
    if (disabled) {
      this.ctx.fillStyle = 'rgba(50, 40, 70, 0.4)';
    } else if (hovered) {
      this.ctx.fillStyle = 'rgba(140, 80, 220, 0.85)';
      this.ctx.save();
      this.ctx.shadowColor = 'rgba(180, 100, 255, 0.8)';
      this.ctx.shadowBlur = 15;
    } else {
      this.ctx.fillStyle = 'rgba(80, 50, 130, 0.7)';
    }
    this.ctx.fillRect(x, y, w, h);

    if (hovered && !disabled) {
      this.ctx.restore();
    }

    // ボタン枠
    this.ctx.strokeStyle = disabled
      ? 'rgba(100, 80, 130, 0.3)'
      : hovered
        ? 'rgba(220, 160, 255, 0.9)'
        : 'rgba(160, 110, 220, 0.6)';
    this.ctx.lineWidth = hovered ? 2 : 1;
    this.ctx.strokeRect(x, y, w, h);

    // ボタンテキスト
    this.ctx.fillStyle = disabled ? 'rgba(150, 130, 180, 0.4)' : '#fff';
    this.ctx.font = `bold ${Math.min(18, w * 0.07)}px 'Arial', sans-serif`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(label, x + w / 2, y + h / 2);
  }

  private handleMouseMove(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.mouseX = (e.clientX - rect.left) * (this.canvas.width / rect.width);
    this.mouseY = (e.clientY - rect.top) * (this.canvas.height / rect.height);
  }

  private handleClick(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (this.canvas.width / rect.width);
    const my = (e.clientY - rect.top) * (this.canvas.height / rect.height);

    for (const btn of this.buttons) {
      if (!btn.disabled &&
        mx >= btn.x && mx <= btn.x + btn.w &&
        my >= btn.y && my <= btn.y + btn.h) {
        this.onSelect(btn.choice);
        return;
      }
    }
  }

  private handleTouchEnd(e: TouchEvent): void {
    e.preventDefault();
    const touch = e.changedTouches[0];
    if (!touch) return;
    const rect = this.canvas.getBoundingClientRect();
    const mx = (touch.clientX - rect.left) * (this.canvas.width / rect.width);
    const my = (touch.clientY - rect.top) * (this.canvas.height / rect.height);

    for (const btn of this.buttons) {
      if (!btn.disabled &&
        mx >= btn.x && mx <= btn.x + btn.w &&
        my >= btn.y && my <= btn.y + btn.h) {
        this.onSelect(btn.choice);
        return;
      }
    }
  }
}
