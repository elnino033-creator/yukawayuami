/**
 * ResultScene.ts
 * ステージクリア/失敗後のリザルト画面を Canvas API で描画するシーン。
 * スコア、レーティング、タイムボーナス、コンボを表示する。
 */

import type { ResultData } from '@/scenes/SceneManager';

/** レーティングの表示色 */
const RATING_DISPLAY: Record<string, { color: string; glow: string; label: string }> = {
  S: { color: '#ffd234', glow: 'rgba(255, 210, 52, 0.8)', label: 'S' },
  A: { color: '#e0e0e0', glow: 'rgba(220, 220, 220, 0.8)', label: 'A' },
  B: { color: '#cd7f32', glow: 'rgba(180, 110, 50, 0.8)', label: 'B' },
  C: { color: '#a0a0a0', glow: 'rgba(140, 140, 140, 0.6)', label: 'C' }
};

/** ボタン定義 */
interface ResultButton {
  label: string;
  action: 'retry' | 'next' | 'title';
  x: number;
  y: number;
  w: number;
  h: number;
  hovered: boolean;
  color: string;
}

/**
 * リザルト画面シーン。
 * スコア・レーティング・ボーナスを大きく表示し、次の行動を選択できる。
 */
export class ResultScene {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private data: ResultData;
  private onRetry: () => void;
  private onNext: () => void;
  private onTitle: () => void;

  private buttons: ResultButton[] = [];
  private mouseX = 0;
  private mouseY = 0;
  private rafId: number | null = null;
  private startTime: number = Date.now();

  /** イベントリスナー保持 */
  private boundMouseMove: (e: MouseEvent) => void;
  private boundClick: (e: MouseEvent) => void;
  private boundTouchEnd: (e: TouchEvent) => void;
  private boundResize: () => void;

  /**
   * スコアからレーティングを計算する静的メソッド。
   * S>=5000, A>=3000, B>=1500, C=else
   * @param score スコア
   * @returns レーティング
   */
  static calcRating(score: number): 'S' | 'A' | 'B' | 'C' {
    if (score >= 5000) return 'S';
    if (score >= 3000) return 'A';
    if (score >= 1500) return 'B';
    return 'C';
  }

  /**
   * @param canvas 描画対象のCanvas要素
   * @param data リザルトデータ
   * @param onRetry リトライボタン押下時のコールバック
   * @param onNext 次のステージボタン押下時のコールバック
   * @param onTitle タイトルボタン押下時のコールバック
   */
  constructor(
    canvas: HTMLCanvasElement,
    data: ResultData,
    onRetry: () => void,
    onNext: () => void,
    onTitle: () => void
  ) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable');
    this.ctx = ctx;
    this.data = data;
    this.onRetry = onRetry;
    this.onNext = onNext;
    this.onTitle = onTitle;

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
    this.startRenderLoop();
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
    const bw = Math.min(160, w * 0.3);
    const bh = 48;
    const gap = 16;
    const totalW = bw * 3 + gap * 2;
    const startX = (w - totalW) / 2;
    const startY = h * 0.78;

    this.buttons = [
      {
        label: 'リトライ',
        action: 'retry',
        x: startX,
        y: startY,
        w: bw,
        h: bh,
        hovered: false,
        color: 'rgba(180, 80, 80, 0.8)'
      },
      {
        label: '次へ',
        action: 'next',
        x: startX + bw + gap,
        y: startY,
        w: bw,
        h: bh,
        hovered: false,
        color: 'rgba(60, 140, 60, 0.8)'
      },
      {
        label: 'タイトル',
        action: 'title',
        x: startX + (bw + gap) * 2,
        y: startY,
        w: bw,
        h: bh,
        hovered: false,
        color: 'rgba(80, 80, 160, 0.8)'
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
    const elapsed = (Date.now() - this.startTime) / 1000;

    // 背景
    const bgGrad = this.ctx.createLinearGradient(0, 0, 0, h);
    if (this.data.cleared) {
      bgGrad.addColorStop(0, '#0d1a0d');
      bgGrad.addColorStop(1, '#1a2a1a');
    } else {
      bgGrad.addColorStop(0, '#1a0d0d');
      bgGrad.addColorStop(1, '#2a1a1a');
    }
    this.ctx.fillStyle = bgGrad;
    this.ctx.fillRect(0, 0, w, h);

    // クリア/失敗バナー
    this.drawResultBanner(w, h, elapsed);

    // レーティング
    this.drawRating(w, h, elapsed);

    // スコア情報
    this.drawScoreInfo(w, h);

    // ボタン
    this.updateHover();
    for (const btn of this.buttons) {
      this.drawButton(btn);
    }
  }

  private drawResultBanner(w: number, h: number, elapsed: number): void {
    const pulse = 0.9 + 0.1 * Math.sin(elapsed * 2);

    if (this.data.cleared) {
      this.ctx.save();
      this.ctx.shadowColor = 'rgba(100, 255, 100, 0.8)';
      this.ctx.shadowBlur = 20;
      this.ctx.fillStyle = `rgba(100, 255, 100, ${pulse})`;
      this.ctx.font = `bold ${Math.min(48, w * 0.08)}px sans-serif`;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText('STAGE CLEAR！', w / 2, h * 0.12);
      this.ctx.restore();
    } else {
      this.ctx.save();
      this.ctx.shadowColor = 'rgba(255, 80, 80, 0.8)';
      this.ctx.shadowBlur = 20;
      this.ctx.fillStyle = `rgba(255, 100, 100, ${pulse})`;
      this.ctx.font = `bold ${Math.min(48, w * 0.08)}px sans-serif`;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText('GAME OVER', w / 2, h * 0.12);
      this.ctx.restore();
    }

    // ステージID
    this.ctx.fillStyle = 'rgba(200, 180, 240, 0.6)';
    this.ctx.font = `${Math.min(16, w * 0.025)}px monospace`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(this.data.stageId, w / 2, h * 0.21);
  }

  private drawRating(w: number, h: number, elapsed: number): void {
    const ratingInfo = RATING_DISPLAY[this.data.rating] ?? RATING_DISPLAY['C']!;
    const pulse = 0.8 + 0.2 * Math.sin(elapsed * 1.5);

    this.ctx.save();
    this.ctx.shadowColor = ratingInfo.glow;
    this.ctx.shadowBlur = 40 * pulse;
    this.ctx.fillStyle = ratingInfo.color;
    this.ctx.font = `bold ${Math.min(120, h * 0.22)}px sans-serif`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(ratingInfo.label, w / 2, h * 0.43);
    this.ctx.restore();

    // レーティングラベル
    this.ctx.fillStyle = 'rgba(200, 180, 240, 0.6)';
    this.ctx.font = `${Math.min(14, w * 0.022)}px sans-serif`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText('RATING', w / 2, h * 0.27);
  }

  private drawScoreInfo(w: number, h: number): void {
    const panelW = Math.min(400, w * 0.7);
    const panelH = 130;
    const panelX = (w - panelW) / 2;
    const panelY = h * 0.56;

    // パネル背景
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    this.ctx.fillRect(panelX, panelY, panelW, panelH);
    this.ctx.strokeStyle = 'rgba(160, 130, 220, 0.4)';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(panelX, panelY, panelW, panelH);

    const rows: Array<{ label: string; value: string; color: string }> = [
      { label: 'SCORE', value: this.data.score.toLocaleString(), color: '#ffd234' },
      { label: 'TIME BONUS', value: `+${this.data.timeBonus}`, color: '#5ec76a' },
      { label: 'MAX COMBO', value: `×${this.data.comboMax}`, color: '#4a90e2' }
    ];

    const rowH = panelH / rows.length;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const ry = panelY + i * rowH + rowH / 2;

      this.ctx.fillStyle = 'rgba(200, 180, 240, 0.6)';
      this.ctx.font = `${Math.min(14, panelW * 0.035)}px monospace`;
      this.ctx.textAlign = 'left';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(row.label, panelX + 20, ry);

      this.ctx.fillStyle = row.color;
      this.ctx.font = `bold ${Math.min(18, panelW * 0.045)}px monospace`;
      this.ctx.textAlign = 'right';
      this.ctx.fillText(row.value, panelX + panelW - 20, ry);
    }
  }

  private drawButton(btn: ResultButton): void {
    const { x, y, w, h, label, hovered, color } = btn;

    if (hovered) {
      this.ctx.save();
      this.ctx.shadowColor = color.replace('0.8)', '1)');
      this.ctx.shadowBlur = 12;
    }

    this.ctx.fillStyle = hovered
      ? color.replace('0.8)', '1)')
      : color;
    this.ctx.fillRect(x, y, w, h);

    if (hovered) this.ctx.restore();

    this.ctx.strokeStyle = hovered
      ? 'rgba(255, 255, 255, 0.8)'
      : 'rgba(255, 255, 255, 0.3)';
    this.ctx.lineWidth = hovered ? 2 : 1;
    this.ctx.strokeRect(x, y, w, h);

    this.ctx.fillStyle = '#fff';
    this.ctx.font = `bold ${Math.min(15, w * 0.1)}px sans-serif`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(label, x + w / 2, y + h / 2);
  }

  private updateHover(): void {
    const mx = this.mouseX;
    const my = this.mouseY;
    for (const btn of this.buttons) {
      btn.hovered = mx >= btn.x && mx <= btn.x + btn.w &&
        my >= btn.y && my <= btn.y + btn.h;
    }
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
    this.activateButton(mx, my);
  }

  private handleTouchEnd(e: TouchEvent): void {
    e.preventDefault();
    const touch = e.changedTouches[0];
    if (!touch) return;
    const rect = this.canvas.getBoundingClientRect();
    const mx = (touch.clientX - rect.left) * (this.canvas.width / rect.width);
    const my = (touch.clientY - rect.top) * (this.canvas.height / rect.height);
    this.activateButton(mx, my);
  }

  private activateButton(mx: number, my: number): void {
    for (const btn of this.buttons) {
      if (mx >= btn.x && mx <= btn.x + btn.w &&
        my >= btn.y && my <= btn.y + btn.h) {
        switch (btn.action) {
          case 'retry': this.onRetry(); break;
          case 'next': this.onNext(); break;
          case 'title': this.onTitle(); break;
        }
        return;
      }
    }
  }
}
