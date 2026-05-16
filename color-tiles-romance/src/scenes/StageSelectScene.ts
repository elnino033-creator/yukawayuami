/**
 * StageSelectScene.ts
 * ステージ選択画面を Canvas API で描画するシーン。
 * チャプタータブとステージグリッドを表示し、ステージを選択できる。
 */

import type { SaveStore, StageRecord } from '@/store/saveStore';

/** チャプター定義 */
interface ChapterInfo {
  id: number;
  label: string;
  stageIds: string[];
}

/** ステージタイル */
interface StageTile {
  stageId: string;
  label: string;
  record: StageRecord | null;
  x: number;
  y: number;
  w: number;
  h: number;
  hovered: boolean;
}

/** チャプタータブ */
interface ChapterTab {
  chapterId: number;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  hovered: boolean;
}

/** レーティング色マッピング */
const RATING_COLORS: Record<string, string> = {
  S: '#ffd234',
  A: '#c0c0c0',
  B: '#cd7f32',
  C: '#a0a0a0'
};

/** Phase 1 のハードコードチャプター/ステージ情報 */
const CHAPTERS: ChapterInfo[] = [
  {
    id: 0,
    label: 'プロローグ',
    stageIds: ['ch00_tutorial', 'ch00_prologue']
  },
  {
    id: 1,
    label: '第1章 緋色の階層',
    stageIds: [
      'ch01_stage01',
      'ch01_stage02',
      'ch01_stage03',
      'ch01_stage04',
      'ch01_stage05'
    ]
  },
  {
    id: 3,
    label: '第3章 翠葉の階層',
    stageIds: ['ch03_ice_demo']
  }
];

/**
 * ステージ選択シーン。
 * チャプタータブ切り替えとステージグリッドをCanvasで描画する。
 */
export class StageSelectScene {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private saveStore: SaveStore;
  private onSelect: (stageId: string) => void;
  private onBack: () => void;

  private selectedChapterIdx = 0;
  private tabs: ChapterTab[] = [];
  private tiles: StageTile[] = [];
  private backButton: { x: number; y: number; w: number; h: number; hovered: boolean } | null = null;

  private mouseX = 0;
  private mouseY = 0;
  private rafId: number | null = null;

  /** イベントリスナー保持 */
  private boundMouseMove: (e: MouseEvent) => void;
  private boundClick: (e: MouseEvent) => void;
  private boundResize: () => void;

  /**
   * @param canvas 描画対象のCanvas要素
   * @param saveStore セーブデータストア
   * @param onSelect ステージ選択時のコールバック
   * @param onBack 戻るボタン押下時のコールバック
   */
  constructor(
    canvas: HTMLCanvasElement,
    saveStore: SaveStore,
    onSelect: (stageId: string) => void,
    onBack: () => void
  ) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable');
    this.ctx = ctx;
    this.saveStore = saveStore;
    this.onSelect = onSelect;
    this.onBack = onBack;

    this.boundMouseMove = (e: MouseEvent) => this.handleMouseMove(e);
    this.boundClick = (e: MouseEvent) => this.handleClick(e);
    this.boundResize = () => this.handleResize();

    this.canvas.addEventListener('mousemove', this.boundMouseMove);
    this.canvas.addEventListener('click', this.boundClick);
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
    window.removeEventListener('resize', this.boundResize);
  }

  // ---------- プライベートメソッド ----------

  private handleResize(): void {
    const parent = this.canvas.parentElement;
    if (parent) {
      this.canvas.width = parent.clientWidth || window.innerWidth;
      this.canvas.height = parent.clientHeight || window.innerHeight;
    }
    this.buildLayout();
  }

  private buildLayout(): void {
    const w = this.canvas.width;
    const tabH = 44;
    const tabY = 60;
    const tabW = Math.min(140, (w - 80) / CHAPTERS.length);
    const tabStartX = 40;

    // チャプタータブ
    this.tabs = CHAPTERS.map((ch, i) => ({
      chapterId: ch.id,
      label: ch.label,
      x: tabStartX + i * (tabW + 8),
      y: tabY,
      w: tabW,
      h: tabH,
      hovered: false
    }));

    // ステージタイル
    this.buildStageTiles();

    // 戻るボタン
    this.backButton = {
      x: 20,
      y: 16,
      w: 80,
      h: 34,
      hovered: false
    };
  }

  private buildStageTiles(): void {
    const chapter = CHAPTERS[this.selectedChapterIdx];
    if (!chapter) {
      this.tiles = [];
      return;
    }

    const w = this.canvas.width;
    const tileW = Math.min(180, (w - 80) / 3);
    const tileH = 100;
    const gap = 16;
    const startX = 40;
    const startY = 140;
    const cols = Math.max(1, Math.floor((w - 80) / (tileW + gap)));

    this.tiles = chapter.stageIds.map((stageId, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const record = this.saveStore.getRecord(stageId);
      return {
        stageId,
        label: stageId,
        record,
        x: startX + col * (tileW + gap),
        y: startY + row * (tileH + gap),
        w: tileW,
        h: tileH,
        hovered: false
      };
    });
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

    // 背景
    const grad = this.ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#12101e');
    grad.addColorStop(1, '#1e1a2e');
    this.ctx.fillStyle = grad;
    this.ctx.fillRect(0, 0, w, h);

    // タイトル
    this.ctx.fillStyle = '#e0d0ff';
    this.ctx.font = `bold ${Math.min(24, w * 0.04)}px 'Yu Gothic', sans-serif`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText('ステージセレクト', w / 2, 30);

    // 戻るボタン
    this.drawBackButton();

    // チャプタータブ
    this.updateHover();
    for (const tab of this.tabs) {
      this.drawTab(tab, tab.chapterId === CHAPTERS[this.selectedChapterIdx]?.id);
    }

    // ステージタイル
    for (const tile of this.tiles) {
      this.drawStageTile(tile);
    }
  }

  private drawBackButton(): void {
    if (!this.backButton) return;
    const btn = this.backButton;

    this.ctx.fillStyle = btn.hovered
      ? 'rgba(100, 80, 160, 0.9)'
      : 'rgba(60, 50, 100, 0.7)';
    this.ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
    this.ctx.strokeStyle = 'rgba(160, 130, 220, 0.7)';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(btn.x, btn.y, btn.w, btn.h);

    this.ctx.fillStyle = '#fff';
    this.ctx.font = '14px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText('◀ BACK', btn.x + btn.w / 2, btn.y + btn.h / 2);
  }

  private drawTab(tab: ChapterTab, isActive: boolean): void {
    this.ctx.fillStyle = isActive
      ? 'rgba(140, 80, 220, 0.9)'
      : tab.hovered
        ? 'rgba(100, 60, 160, 0.8)'
        : 'rgba(60, 50, 100, 0.6)';
    this.ctx.fillRect(tab.x, tab.y, tab.w, tab.h);

    this.ctx.strokeStyle = isActive
      ? 'rgba(220, 160, 255, 0.9)'
      : 'rgba(140, 110, 200, 0.4)';
    this.ctx.lineWidth = isActive ? 2 : 1;
    this.ctx.strokeRect(tab.x, tab.y, tab.w, tab.h);

    this.ctx.fillStyle = isActive ? '#fff' : '#c8a8e8';
    this.ctx.font = `${Math.min(14, tab.w * 0.12)}px sans-serif`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(tab.label, tab.x + tab.w / 2, tab.y + tab.h / 2);
  }

  private drawStageTile(tile: StageTile): void {
    const { x, y, w, h, record, label, hovered } = tile;

    // タイル背景
    this.ctx.fillStyle = hovered
      ? 'rgba(100, 60, 180, 0.85)'
      : record?.cleared
        ? 'rgba(60, 90, 60, 0.7)'
        : 'rgba(50, 40, 80, 0.7)';
    this.ctx.fillRect(x, y, w, h);

    // 枠線
    this.ctx.strokeStyle = hovered
      ? 'rgba(200, 160, 255, 0.9)'
      : record?.cleared
        ? 'rgba(100, 200, 100, 0.5)'
        : 'rgba(120, 90, 180, 0.4)';
    this.ctx.lineWidth = hovered ? 2 : 1;
    this.ctx.strokeRect(x, y, w, h);

    // ステージID / ラベル
    this.ctx.fillStyle = '#e0d0ff';
    this.ctx.font = `bold ${Math.min(13, w * 0.08)}px monospace`;
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';
    this.ctx.fillText(label, x + 10, y + 10);

    // クリア/未クリアアイコン
    if (record?.cleared) {
      this.ctx.fillStyle = '#5ec76a';
      this.ctx.font = '18px sans-serif';
      this.ctx.textAlign = 'right';
      this.ctx.fillText('✓', x + w - 10, y + 8);
    }

    // レーティング表示
    if (record?.bestRating) {
      const ratingColor = RATING_COLORS[record.bestRating] ?? '#fff';
      this.ctx.save();
      this.ctx.shadowColor = ratingColor;
      this.ctx.shadowBlur = 8;
      this.ctx.fillStyle = ratingColor;
      this.ctx.font = `bold ${Math.min(32, h * 0.35)}px sans-serif`;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(record.bestRating, x + w / 2, y + h * 0.6);
      this.ctx.restore();
    } else if (!record) {
      // 未プレイ
      this.ctx.fillStyle = 'rgba(160, 140, 200, 0.5)';
      this.ctx.font = `${Math.min(13, w * 0.08)}px sans-serif`;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText('未プレイ', x + w / 2, y + h * 0.6);
    }

    // ベストスコア
    if (record && record.bestScore > 0) {
      this.ctx.fillStyle = 'rgba(200, 200, 200, 0.7)';
      this.ctx.font = `${Math.min(11, w * 0.07)}px monospace`;
      this.ctx.textAlign = 'left';
      this.ctx.textBaseline = 'bottom';
      this.ctx.fillText(`BEST: ${record.bestScore}`, x + 10, y + h - 8);
    }
  }

  private updateHover(): void {
    const mx = this.mouseX;
    const my = this.mouseY;

    for (const tab of this.tabs) {
      tab.hovered = mx >= tab.x && mx <= tab.x + tab.w &&
        my >= tab.y && my <= tab.y + tab.h;
    }

    for (const tile of this.tiles) {
      tile.hovered = mx >= tile.x && mx <= tile.x + tile.w &&
        my >= tile.y && my <= tile.y + tile.h;
    }

    if (this.backButton) {
      this.backButton.hovered = mx >= this.backButton.x &&
        mx <= this.backButton.x + this.backButton.w &&
        my >= this.backButton.y &&
        my <= this.backButton.y + this.backButton.h;
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

    // 戻るボタン
    if (this.backButton &&
      mx >= this.backButton.x && mx <= this.backButton.x + this.backButton.w &&
      my >= this.backButton.y && my <= this.backButton.y + this.backButton.h) {
      this.onBack();
      return;
    }

    // チャプタータブ
    for (let i = 0; i < this.tabs.length; i++) {
      const tab = this.tabs[i];
      if (mx >= tab.x && mx <= tab.x + tab.w &&
        my >= tab.y && my <= tab.y + tab.h) {
        this.selectedChapterIdx = i;
        this.buildStageTiles();
        return;
      }
    }

    // ステージタイル
    for (const tile of this.tiles) {
      if (mx >= tile.x && mx <= tile.x + tile.w &&
        my >= tile.y && my <= tile.y + tile.h) {
        this.onSelect(tile.stageId);
        return;
      }
    }
  }
}
