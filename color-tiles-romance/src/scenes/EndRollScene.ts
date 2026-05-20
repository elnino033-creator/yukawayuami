/**
 * EndRollScene.ts
 * エンドロール（スタッフロール）を表示するシーン。
 * テキストが下から上へスクロールし、終了後にコールバックを呼ぶ。
 */

const CREDITS = [
  { role: '', text: 'カラータイル・ロマンス', big: true },
  { role: '', text: '～色彩の塔と失われた記憶～', big: false },
  { role: '', text: '', big: false },
  { role: '', text: '', big: false },
  { role: 'Story & Scenario', text: '' },
  { role: '', text: 'elnino033' },
  { role: '', text: '', big: false },
  { role: 'Game Design & Programming', text: '' },
  { role: '', text: 'elnino033' },
  { role: '', text: '', big: false },
  { role: 'Character Design', text: '' },
  { role: '', text: 'elnino033' },
  { role: '', text: '', big: false },
  { role: 'BGM', text: '' },
  { role: '', text: 'Piano Gentle Morning' },
  { role: '', text: 'Mysterious Wind' },
  { role: '', text: 'Steel and Shadows' },
  { role: '', text: 'オレンジ宮殿' },
  { role: '', text: '紫塔の終章' },
  { role: '', text: '', big: false },
  { role: '登場人物', text: '' },
  { role: '', text: '紅羽 あかり' },
  { role: '', text: '（第2章）みお' },
  { role: '', text: '翠川 すず' },
  { role: '', text: '黄宮 ひまり' },
  { role: '', text: '紫雲寺 ゆかり' },
  { role: '', text: '', big: false },
  { role: '', text: '', big: false },
  { role: '', text: '', big: false },
  { role: '', text: 'Special Thanks', big: false },
  { role: '', text: 'To everyone who played', big: false },
  { role: '', text: '', big: false },
  { role: '', text: '', big: false },
  { role: '', text: 'TRUE END', big: true },
  { role: '', text: '', big: false },
  { role: '', text: '', big: false },
  { role: '', text: '', big: false },
];

const LINE_H = 32;
const BIG_LINE_H = 52;
const ROLE_COLOR = '#aaa8cc';
const TEXT_COLOR = '#ffffff';
const BIG_COLOR = '#ffe080';
const SCROLL_PX_PER_SEC = 60;

interface CreditLine {
  y: number;
  text: string;
  role: boolean;
  big: boolean;
}

export class EndRollScene {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private onEnd: () => void;
  private lines: CreditLine[] = [];
  private scrollY = 0;
  private startTime = 0;
  private rafId: number | null = null;
  private ended = false;

  constructor(canvas: HTMLCanvasElement, onEnd: () => void) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable');
    this.ctx = ctx;
    this.onEnd = onEnd;
  }

  start(): void {
    // 行オブジェクトを構築
    let y = 0;
    for (const c of CREDITS) {
      if (c.role) {
        this.lines.push({ y, text: c.role, role: true, big: false });
        y += LINE_H;
      }
      const lh = c.big ? BIG_LINE_H : LINE_H;
      this.lines.push({ y, text: c.text, role: false, big: c.big ?? false });
      y += lh;
    }

    this.scrollY = this.canvas.height; // 画面下から開始
    this.startTime = performance.now();
    this.canvas.addEventListener('click', this.handleClick);
    this.canvas.addEventListener('keydown', this.handleKey as EventListener);
    this.canvas.setAttribute('tabindex', '0');
    this.canvas.focus();
    this.rafId = requestAnimationFrame(this.loop);
  }

  destroy(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.canvas.removeEventListener('click', this.handleClick);
    this.canvas.removeEventListener('keydown', this.handleKey as EventListener);
  }

  private handleClick = (): void => {
    if (!this.ended) this.finish();
  };

  private handleKey = (e: KeyboardEvent): void => {
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') {
      if (!this.ended) this.finish();
    }
  };

  private loop = (ts: number): void => {
    const elapsed = (ts - this.startTime) / 1000;
    this.scrollY = this.canvas.height - elapsed * SCROLL_PX_PER_SEC;

    this.render();

    // 最後の行が画面上端より上に出たら終了
    const lastLine = this.lines[this.lines.length - 1];
    if (lastLine && this.scrollY + lastLine.y < -80) {
      this.finish();
      return;
    }

    this.rafId = requestAnimationFrame(this.loop);
  };

  private render(): void {
    const w = this.canvas.width;
    const h = this.canvas.height;

    this.ctx.fillStyle = '#0d0e18';
    this.ctx.fillRect(0, 0, w, h);

    // 上下フェードグラデーション
    const fadeH = 80;
    const topGrad = this.ctx.createLinearGradient(0, 0, 0, fadeH);
    topGrad.addColorStop(0, '#0d0e18');
    topGrad.addColorStop(1, 'rgba(13,14,24,0)');
    const botGrad = this.ctx.createLinearGradient(0, h - fadeH, 0, h);
    botGrad.addColorStop(0, 'rgba(13,14,24,0)');
    botGrad.addColorStop(1, '#0d0e18');

    for (const line of this.lines) {
      const lineY = this.scrollY + line.y;
      if (lineY < -BIG_LINE_H || lineY > h + BIG_LINE_H) continue;
      if (!line.text) continue;

      if (line.big) {
        this.ctx.fillStyle = BIG_COLOR;
        this.ctx.font = 'bold 36px serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'top';
      } else if (line.role) {
        this.ctx.fillStyle = ROLE_COLOR;
        this.ctx.font = '13px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'top';
      } else {
        this.ctx.fillStyle = TEXT_COLOR;
        this.ctx.font = '18px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'top';
      }
      this.ctx.fillText(line.text, w / 2, lineY);
    }

    // フェードオーバーレイ
    this.ctx.fillStyle = topGrad;
    this.ctx.fillRect(0, 0, w, fadeH);
    this.ctx.fillStyle = botGrad;
    this.ctx.fillRect(0, h - fadeH, w, fadeH);

    // スキップヒント
    const alpha = 0.4 + 0.3 * Math.sin(performance.now() / 700);
    this.ctx.globalAlpha = alpha;
    this.ctx.fillStyle = '#aaa';
    this.ctx.font = '13px sans-serif';
    this.ctx.textAlign = 'right';
    this.ctx.textBaseline = 'bottom';
    this.ctx.fillText('クリックでスキップ', w - 16, h - 12);
    this.ctx.globalAlpha = 1;
  }

  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.onEnd();
  }
}
