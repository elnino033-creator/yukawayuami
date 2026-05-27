/**
 * TitleScene.ts
 * タイトル画面を Canvas API で描画するシーン。
 * 背景画像（title_bg.jpg）の上にメニューボタンを配置する。
 */
import { BgmManager } from '@/audio/BgmManager';

/** メニュー選択肢の種別 */
export type TitleChoice = 'new' | 'continue' | 'load' | 'stage' | 'settings' | 'gallery';

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

/** 花びらパーティクル */
interface Petal {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  rotSpeed: number;
  size: number;
  alpha: number;
  swayOffset: number;
}

/**
 * タイトル画面シーン。
 * ゴシックファンタジー調の背景画像上にメニューボタンを描画する。
 */
export class TitleScene {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private onSelect: (choice: TitleChoice) => void;
  private hasSave: boolean;
  private buttons: TitleButton[] = [];
  private rafId: number | null = null;
  private startTime: number = Date.now();
  private bgImage: HTMLImageElement | null = null;

  /** 花びらパーティクル */
  private petals: Petal[] = [];

  /** マウス位置 */
  private mouseX = 0;
  private mouseY = 0;

  /** イベントリスナー（後でremoveするため保持） */
  private boundMouseMove: (e: MouseEvent) => void;
  private boundClick: (e: MouseEvent) => void;
  private boundTouchEnd: (e: TouchEvent) => void;
  private boundResize: () => void;

  /** 1つ以上のステージをクリア済みかどうか（STAGE SELECT解放条件） */
  private stageSelectUnlocked: boolean;

  /** シナリオセーブが存在するかどうか（LOAD ボタン有効化条件） */
  private hasSceneSave: boolean;

  /**
   * @param canvas 描画対象のCanvas要素
   * @param onSelect ボタン選択時のコールバック
   * @param hasSave セーブデータが存在するかどうか
   * @param stageSelectUnlocked ステージセレクト解放済みかどうか
   * @param hasSceneSave シナリオセーブが存在するかどうか
   */
  constructor(
    canvas: HTMLCanvasElement,
    onSelect: (choice: TitleChoice) => void,
    hasSave: boolean,
    stageSelectUnlocked: boolean = false,
    hasSceneSave: boolean = false
  ) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable');
    this.ctx = ctx;
    this.onSelect = onSelect;
    this.hasSave = hasSave;
    this.stageSelectUnlocked = stageSelectUnlocked;
    this.hasSceneSave = hasSceneSave;

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
    this.handleResize(); // buildButtons / initPetals / loadBgImage を内包
    this.startRenderLoop();
    // BgmManager 経由で再生することで bgmVolume 設定が反映される
    BgmManager.play('妖精の小径.mp3');
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
    // BGM は BgmManager 管理のため、次シーンの play() 呼び出し時に自動停止される
  }

  // ---------- プライベートメソッド ----------

  /** スマートフォン（縦向き・タッチデバイス）かどうかを判定する */
  private isSmartphone(): boolean {
    const ua = navigator.userAgent;
    const isMobileUA = /Android|iPhone|iPod|Windows Phone/i.test(ua);
    const isCoarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    const isNarrow = window.innerWidth <= 768;
    return isMobileUA || (isCoarsePointer && isNarrow);
  }

  private loadBgImage(): void {
    const filename = this.isSmartphone() ? 'title_bg_phone.jpg' : 'title_bg.jpg';
    const img = new Image();
    img.onload = () => {
      this.bgImage = img;
    };
    img.onerror = () => {
      // スマートフォン用画像が存在しない場合はPC用にフォールバック
      if (filename !== 'title_bg.jpg') {
        const fallback = new Image();
        fallback.onload = () => { this.bgImage = fallback; };
        fallback.src = `${import.meta.env.BASE_URL}assets/bg/title_bg.jpg`;
      }
    };
    img.src = `${import.meta.env.BASE_URL}assets/bg/${filename}`;
  }

  private initPetals(): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.petals = [];
    for (let i = 0; i < 35; i++) {
      this.petals.push(this.createPetal(w, h, true));
    }
  }

  private createPetal(w: number, h: number, randomY = false): Petal {
    return {
      x: Math.random() * w,
      y: randomY ? Math.random() * h : -10,
      vx: (Math.random() - 0.5) * 0.8,
      vy: 0.4 + Math.random() * 0.8,
      rot: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.04,
      size: 3 + Math.random() * 5,
      alpha: 0.4 + Math.random() * 0.5,
      swayOffset: Math.random() * Math.PI * 2,
    };
  }

  private handleResize(): void {
    const parent = this.canvas.parentElement;
    if (parent) {
      this.canvas.width = parent.clientWidth || window.innerWidth;
      this.canvas.height = parent.clientHeight || window.innerHeight;
    }
    this.buildButtons();
    this.initPetals();
    // 画面回転などで端末種別が変わった場合に背景を再読み込み
    this.loadBgImage();
  }

  private buildButtons(): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const bw = Math.min(260, w * 0.45);
    const bh = 44;
    const gap = 11;
    const startX = (w - bw) / 2;
    // 5行（4全幅 + 1横並び2ボタン）分のスペースを確保
    const startY = h * 0.53;

    // 下段2ボタン（SETTINGS・GALLERY）は横並びで半幅
    const halfGap = 8;
    const hw = (bw - halfGap) / 2;

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
        y: startY + (bh + gap),
        w: bw,
        h: bh,
        hovered: false,
        disabled: !this.hasSave
      },
      {
        label: 'LOAD',
        choice: 'load',
        x: startX,
        y: startY + (bh + gap) * 2,
        w: bw,
        h: bh,
        hovered: false,
        disabled: !this.hasSceneSave
      },
      {
        label: 'STAGE SELECT',
        choice: 'stage',
        x: startX,
        y: startY + (bh + gap) * 3,
        w: bw,
        h: bh,
        hovered: false,
        disabled: !this.stageSelectUnlocked
      },
      {
        label: 'SETTINGS',
        choice: 'settings',
        x: startX,
        y: startY + (bh + gap) * 4,
        w: hw,
        h: bh,
        hovered: false,
        disabled: false
      },
      {
        label: 'GALLERY',
        choice: 'gallery',
        x: startX + hw + halfGap,
        y: startY + (bh + gap) * 4,
        w: hw,
        h: bh,
        hovered: false,
        disabled: false
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

    // 背景
    if (this.bgImage) {
      // 画像をcanvasに合わせて描画（object-fit: cover 相当）
      const iw = this.bgImage.naturalWidth;
      const ih = this.bgImage.naturalHeight;
      const scale = Math.max(w / iw, h / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      const dx = (w - dw) / 2;
      const dy = (h - dh) / 2;
      this.ctx.drawImage(this.bgImage, dx, dy, dw, dh);
      // 下部を少し暗くしてボタンを見やすく
      const overlay = this.ctx.createLinearGradient(0, h * 0.45, 0, h);
      overlay.addColorStop(0, 'rgba(0,0,0,0)');
      overlay.addColorStop(1, 'rgba(0,0,10,0.55)');
      this.ctx.fillStyle = overlay;
      this.ctx.fillRect(0, 0, w, h);
    } else {
      // フォールバック：ダーク背景
      const bgGrad = this.ctx.createLinearGradient(0, 0, 0, h);
      bgGrad.addColorStop(0, '#0a0810');
      bgGrad.addColorStop(0.5, '#150f20');
      bgGrad.addColorStop(1, '#0a0810');
      this.ctx.fillStyle = bgGrad;
      this.ctx.fillRect(0, 0, w, h);
    }

    // 桜の花びらパーティクル
    this.updateAndDrawPetals(elapsed);

    // ボタン描画
    this.updateButtonHover();
    for (const btn of this.buttons) {
      this.drawButton(btn, elapsed);
    }

    // バージョン表示
    this.ctx.globalAlpha = 0.45;
    this.ctx.fillStyle = '#d4b896';
    this.ctx.font = '11px monospace';
    this.ctx.textAlign = 'right';
    this.ctx.textBaseline = 'bottom';
    this.ctx.fillText('ver 1.0', w - 12, h - 10);
    this.ctx.globalAlpha = 1;
  }

  private updateAndDrawPetals(elapsed: number): void {
    const w = this.canvas.width;
    const h = this.canvas.height;

    for (let i = 0; i < this.petals.length; i++) {
      const p = this.petals[i];
      // 横揺れ（サインカーブ）
      p.x += p.vx + Math.sin(elapsed * 0.8 + p.swayOffset) * 0.4;
      p.y += p.vy;
      p.rot += p.rotSpeed;

      if (p.y > h + 20) {
        this.petals[i] = this.createPetal(w, h, false);
        continue;
      }

      this.ctx.save();
      this.ctx.translate(p.x, p.y);
      this.ctx.rotate(p.rot);
      this.ctx.globalAlpha = p.alpha;

      // 花びらの形（楕円を回転）
      this.ctx.beginPath();
      this.ctx.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, Math.PI * 2);
      const petalGrad = this.ctx.createRadialGradient(0, 0, 0, 0, 0, p.size);
      petalGrad.addColorStop(0, '#f8d8e8');
      petalGrad.addColorStop(1, '#e8a0bc');
      this.ctx.fillStyle = petalGrad;
      this.ctx.fill();

      this.ctx.restore();
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

  private drawButton(btn: TitleButton, elapsed: number): void {
    const { x, y, w, h, label, hovered, disabled } = btn;

    this.ctx.save();

    // ボタン背景
    if (disabled) {
      this.ctx.fillStyle = 'rgba(15, 12, 20, 0.45)';
    } else if (hovered) {
      this.ctx.shadowColor = 'rgba(200, 160, 80, 0.7)';
      this.ctx.shadowBlur = 20;
      this.ctx.fillStyle = 'rgba(60, 45, 20, 0.88)';
    } else {
      this.ctx.fillStyle = 'rgba(15, 12, 20, 0.72)';
    }

    // 角丸矩形
    const radius = 3;
    this.ctx.beginPath();
    this.ctx.moveTo(x + radius, y);
    this.ctx.lineTo(x + w - radius, y);
    this.ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    this.ctx.lineTo(x + w, y + h - radius);
    this.ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    this.ctx.lineTo(x + radius, y + h);
    this.ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    this.ctx.lineTo(x, y + radius);
    this.ctx.quadraticCurveTo(x, y, x + radius, y);
    this.ctx.closePath();
    this.ctx.fill();

    // ボタン枠（金縁）
    const borderAlpha = disabled ? 0.2 : hovered ? 1.0 : 0.65;
    const pulse = hovered ? 1 : 0.85 + 0.15 * Math.sin(elapsed * 1.5);
    const borderGrad = this.ctx.createLinearGradient(x, y, x + w, y + h);
    if (disabled) {
      borderGrad.addColorStop(0, `rgba(100, 90, 70, ${borderAlpha})`);
      borderGrad.addColorStop(1, `rgba(80, 72, 55, ${borderAlpha})`);
    } else {
      borderGrad.addColorStop(0, `rgba(220, 180, 90, ${borderAlpha * pulse})`);
      borderGrad.addColorStop(0.5, `rgba(255, 215, 120, ${borderAlpha})`);
      borderGrad.addColorStop(1, `rgba(200, 155, 70, ${borderAlpha * pulse})`);
    }
    this.ctx.strokeStyle = borderGrad;
    this.ctx.lineWidth = hovered ? 1.5 : 1;
    this.ctx.stroke();

    // コーナー装飾（金の隅飾り）
    if (!disabled) {
      this.drawCornerDecoration(x, y, w, h, hovered ? 'rgba(255, 215, 120, 0.9)' : 'rgba(200, 160, 80, 0.6)');
    }

    // ボタンテキスト
    const fontSize = Math.min(15, w * 0.065);
    this.ctx.font = `bold ${fontSize}px 'Cinzel', 'Times New Roman', serif`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    if (disabled) {
      this.ctx.fillStyle = 'rgba(120, 105, 80, 0.45)';
    } else if (hovered) {
      this.ctx.shadowColor = 'rgba(255, 220, 120, 0.9)';
      this.ctx.shadowBlur = 8;
      this.ctx.fillStyle = '#ffe8a0';
    } else {
      this.ctx.fillStyle = '#d4b87a';
    }
    this.ctx.fillText(label, x + w / 2, y + h / 2);

    this.ctx.restore();
  }

  /** ボタン四隅に小さな金の装飾を描画 */
  private drawCornerDecoration(x: number, y: number, w: number, h: number, color: string): void {
    const size = 6;
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 1;
    // 左上
    this.ctx.beginPath();
    this.ctx.moveTo(x + size, y);
    this.ctx.lineTo(x, y);
    this.ctx.lineTo(x, y + size);
    this.ctx.stroke();
    // 右上
    this.ctx.beginPath();
    this.ctx.moveTo(x + w - size, y);
    this.ctx.lineTo(x + w, y);
    this.ctx.lineTo(x + w, y + size);
    this.ctx.stroke();
    // 左下
    this.ctx.beginPath();
    this.ctx.moveTo(x + size, y + h);
    this.ctx.lineTo(x, y + h);
    this.ctx.lineTo(x, y + h - size);
    this.ctx.stroke();
    // 右下
    this.ctx.beginPath();
    this.ctx.moveTo(x + w - size, y + h);
    this.ctx.lineTo(x + w, y + h);
    this.ctx.lineTo(x + w, y + h - size);
    this.ctx.stroke();
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
