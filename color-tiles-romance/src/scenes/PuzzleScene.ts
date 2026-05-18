import type { StageDefinition, Tile, MatchResult, TutorialStep } from '@/types';
import { PuzzleEngine } from '@/core/PuzzleEngine';
import { soundEngine } from '@/core/SoundEngine';

/**
 * 色名 → 表示色のマッピング（仮素材）
 */
const COLOR_MAP: Record<string, string> = {
  red: '#ff5b6a',
  blue: '#4a90e2',
  green: '#5ec76a',
  yellow: '#ffd234',
  purple: '#9c6bd8',
  orange: '#ff9844',
  pink: '#ff8fb1',
  cyan: '#3fc8d8',
  teal: '#2ea48a',
  brown: '#a8714b'
};

/** タイル1辺のピクセル数 */
const TILE_SIZE = 56;
/** タイル間の余白 */
const TILE_GAP = 4;
/** 盤面の外枠余白 */
const BOARD_PADDING = 16;

interface HoverState {
  cx: number;
  cy: number;
  matches: MatchResult[];
}

interface MissEffect {
  cx: number;
  cy: number;
  startedAt: number;
}

interface RemovedEffect {
  tiles: Tile[];
  startedAt: number;
}

interface FloatText {
  text: string;
  x: number;
  y: number;
  startedAt: number;
  color: string;
}

interface TutorialState {
  steps: TutorialStep[];
  currentIndex: number;
  stepStartTime: number;
  /** "次へ" ボタンの canvas ピクセル矩形（描画後にセット）*/
  nextButtonRect: { x: number; y: number; w: number; h: number } | null;
}

/**
 * パズル画面：Canvas上に盤面を描画し、クリック/ホバーを処理する。
 */
export class PuzzleScene {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  /** パズルエンジン（SceneManager などからイベント監視に利用する） */
  readonly engine: PuzzleEngine;

  private hover: HoverState | null = null;
  private missEffects: MissEffect[] = [];
  private removedEffects: RemovedEffect[] = [];
  private floatTexts: FloatText[] = [];
  private hintHighlight: { tiles: Tile[]; clickPoint: { x: number; y: number }; until: number } | null = null;
  private shuffleFlashUntil = 0;
  private timeUpFlashUntil = 0;
  private tutorial: TutorialState | null = null;
  /** シャドウタイルの一時的な色表示期限マップ。key: "x,y"、value: 公開期限(ms timestamp) */
  private shadowReveals: Map<string, number> = new Map();

  private rafId: number | null = null;
  private bgmAudio: HTMLAudioElement | null = null;

  // HUD要素
  private hudTimer: HTMLElement;
  private hudScore: HTMLElement;
  private hudCombo: HTMLElement;
  private hudHint: HTMLElement;
  private hudStatus: HTMLElement;

  constructor(
    canvas: HTMLCanvasElement,
    hud: {
      timer: HTMLElement;
      score: HTMLElement;
      combo: HTMLElement;
      hint: HTMLElement;
      status: HTMLElement;
    }
  ) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable');
    this.ctx = ctx;
    this.engine = new PuzzleEngine();
    this.hudTimer = hud.timer;
    this.hudScore = hud.score;
    this.hudCombo = hud.combo;
    this.hudHint = hud.hint;
    this.hudStatus = hud.status;

    this.attachInputHandlers();
    this.attachEngineEvents();
  }

  /** ステージをロードして開始 */
  loadStage(stage: StageDefinition): void {
    this.engine.loadStage(stage);
    this.resizeCanvasToBoard();
    this.hover = null;
    this.missEffects = [];
    this.removedEffects = [];
    this.floatTexts = [];
    this.hintHighlight = null;
    this.shuffleFlashUntil = 0;
    this.timeUpFlashUntil = 0;
    this.tutorial = stage.tutorialSteps && stage.tutorialSteps.length > 0
      ? { steps: stage.tutorialSteps, currentIndex: 0, stepStartTime: Date.now(), nextButtonRect: null }
      : null;
    this.hudStatus.textContent = `${stage.title}`;
    this.startRenderLoop();
    if (!this.bgmAudio) {
      this.bgmAudio = new Audio('/assets/bgm/Steel_and_Shadows.mp3');
      this.bgmAudio.loop = true;
      this.bgmAudio.volume = 0.4;
      this.bgmAudio.play().catch(() => {});
    }
  }

  /** ヒントボタン用 */
  requestHint(): void {
    const result = this.engine.hint();
    if (!result) {
      this.flashStatus('ヒントは使用できません');
      return;
    }
    this.hintHighlight = {
      tiles: [result.a, result.b],
      clickPoint: result.clickPoint,
      until: Date.now() + 3000
    };
  }

  /** リスタート */
  restart(stage: StageDefinition): void {
    this.engine.timer.stop();
    this.loadStage(stage);
  }

  /** クリーンアップ */
  destroy(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.engine.timer.stop();
    if (this.bgmAudio) {
      this.bgmAudio.pause();
      this.bgmAudio.src = '';
      this.bgmAudio = null;
    }
  }

  // ---------- 入力 ----------

  private attachInputHandlers(): void {
    this.canvas.addEventListener('mousemove', (e) => {
      const cell = this.pointerToCell(e.clientX, e.clientY);
      this.updateHover(cell);
    });
    this.canvas.addEventListener('mouseleave', () => {
      this.hover = null;
    });
    this.canvas.addEventListener('click', (e) => {
      if (this.tutorial !== null) {
        // チュートリアルオーバーレイ中
        if (this.handleTutorialClick(e.clientX, e.clientY)) return;
        const step = this.tutorial.steps[this.tutorial.currentIndex];
        if (step.type !== 'force_match') return; // explain/praise 中はゲーム入力をブロック
        // force_match: 許可セルのみ通す
        const cell = this.pointerToCell(e.clientX, e.clientY);
        if (!cell) return;
        const allowed = step.allowedCells?.some(c => c.x === cell.cx && c.y === cell.cy) ?? false;
        if (!allowed) return;
        soundEngine.playClick();
        this.engine.onCellClick(cell.cx, cell.cy);
        return;
      }
      const cell = this.pointerToCell(e.clientX, e.clientY);
      if (cell) {
        soundEngine.playClick();
        this.engine.onCellClick(cell.cx, cell.cy);
      }
    });

    // タッチ：tapで発火、ドラッグでプレビュー
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.touches[0];
      const cell = this.pointerToCell(t.clientX, t.clientY);
      this.updateHover(cell);
    }, { passive: false });
    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const t = e.touches[0];
      const cell = this.pointerToCell(t.clientX, t.clientY);
      this.updateHover(cell);
    }, { passive: false });
    this.canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      if (this.hover) {
        if (this.tutorial !== null) {
          const step = this.tutorial.steps[this.tutorial.currentIndex];
          if (step.type === 'force_match') {
            const allowed = step.allowedCells?.some(c => c.x === this.hover!.cx && c.y === this.hover!.cy) ?? false;
            if (allowed) {
              soundEngine.playClick();
              this.engine.onCellClick(this.hover.cx, this.hover.cy);
            }
          }
        } else {
          soundEngine.playClick();
          this.engine.onCellClick(this.hover.cx, this.hover.cy);
        }
      }
      this.hover = null;
    }, { passive: false });
  }

  private updateHover(cell: { cx: number; cy: number } | null): void {
    if (!cell) {
      this.hover = null;
      return;
    }
    const matches = this.engine.previewClickAll(cell.cx, cell.cy);
    this.hover = { cx: cell.cx, cy: cell.cy, matches };

    // シャドウタイルが含まれるマッチのとき、3000ms だけ色を表示する
    for (const match of matches) {
      for (const t of [match.a, match.b]) {
        if (t.type === 'shadow') {
          this.shadowReveals.set(`${t.x},${t.y}`, Date.now() + 3000);
        }
      }
    }
  }

  private pointerToCell(clientX: number, clientY: number): { cx: number; cy: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    const cx = Math.floor((x - BOARD_PADDING) / (TILE_SIZE + TILE_GAP));
    const cy = Math.floor((y - BOARD_PADDING) / (TILE_SIZE + TILE_GAP));
    if (cx < 0 || cy < 0 || cx >= this.engine.width || cy >= this.engine.height) {
      return null;
    }
    return { cx, cy };
  }

  // ---------- エンジンイベント ----------

  private attachEngineEvents(): void {
    this.engine.on((e) => {
      switch (e.type) {
        case 'tilesRemoved':
          soundEngine.playMatch();
          this.removedEffects.push({ tiles: e.tiles, startedAt: Date.now() });
          if (e.tiles.length >= 4) {
            this.spawnFloatText('CROSS!', '#ff9844');
          } else if (e.tiles.length === 3) {
            this.spawnFloatText('T字！', '#ff9844');
          }
          if (e.bonusSec && e.bonusSec > 0) {
            this.spawnFloatText(`+${e.bonusSec}s`, '#5ec76a');
          }
          if (this.tutorial) {
            const step = this.tutorial.steps[this.tutorial.currentIndex];
            if (step.type === 'force_match') {
              const idx = this.tutorial.currentIndex;
              setTimeout(() => this.advanceTutorial(idx), 500);
            }
          }
          break;
        case 'iceCracked':
          soundEngine.playIceCrack();
          this.spawnFloatText('Crack!', '#9ed3ff');
          if (this.tutorial) {
            const step = this.tutorial.steps[this.tutorial.currentIndex];
            if (step.type === 'force_match') {
              const idx = this.tutorial.currentIndex;
              setTimeout(() => this.advanceTutorial(idx), 500);
            }
          }
          break;
        case 'miss':
          soundEngine.playMiss();
          this.missEffects.push({
            cx: e.clickPoint.x,
            cy: e.clickPoint.y,
            startedAt: Date.now()
          });
          if (e.penaltySec > 0) {
            this.spawnFloatText(`-${e.penaltySec}s`, '#ff5b6a');
          }
          break;
        case 'shuffle':
          this.shuffleFlashUntil = Date.now() + 800;
          this.flashStatus('シャッフル！');
          break;
        case 'blocksReleased':
          this.flashStatus('障害ブロック解除！');
          break;
        case 'cleared':
          soundEngine.playClear();
          this.flashStatus('CLEAR！');
          break;
        case 'gameOver':
          soundEngine.playGameOver();
          this.timeUpFlashUntil = Date.now() + 2000;
          this.flashStatus('TIME UP');
          break;
      }
    });

    this.engine.timer.onTick(() => this.updateTimerHud());
  }

  // ---------- 描画ループ ----------

  private startRenderLoop(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    const tick = () => {
      this.render();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private render(): void {
    const now = Date.now();
    const w = this.canvas.width;
    const h = this.canvas.height;

    // 背景
    this.ctx.fillStyle = '#1c1f2a';
    this.ctx.fillRect(0, 0, w, h);

    // 盤面の枠
    this.drawBoardBackground();

    // ホバープレビュー（ホバー先のマスとマッチ可能な直線）
    this.drawHoverPreview();

    // ヒントハイライト
    this.drawHintHighlight(now);

    // タイル本体
    this.drawTiles();

    // ミス演出（×マーク）
    this.drawMissEffects(now);

    // 消去演出（パーティクル風）
    this.drawRemovedEffects(now);

    // フロートテキスト
    this.drawFloatTexts(now);

    // チュートリアルオーバーレイ
    this.drawTutorialOverlay(now);

    // シャッフル / タイムアップフラッシュ
    if (now < this.shuffleFlashUntil) {
      const alpha = (this.shuffleFlashUntil - now) / 800;
      this.ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.4})`;
      this.ctx.fillRect(0, 0, w, h);
    }
    if (now < this.timeUpFlashUntil) {
      const alpha = (this.timeUpFlashUntil - now) / 2000;
      this.ctx.fillStyle = `rgba(255, 60, 80, ${alpha * 0.5})`;
      this.ctx.fillRect(0, 0, w, h);
    }

    // HUD更新
    this.updateHud();

    // 期限切れ要素を削除
    this.cleanupExpired(now);
  }

  private drawBoardBackground(): void {
    const w = this.engine.width * (TILE_SIZE + TILE_GAP) - TILE_GAP;
    const h = this.engine.height * (TILE_SIZE + TILE_GAP) - TILE_GAP;
    this.ctx.fillStyle = '#252938';
    this.ctx.fillRect(BOARD_PADDING - 6, BOARD_PADDING - 6, w + 12, h + 12);
  }

  private drawHoverPreview(): void {
    if (!this.hover) return;
    const { cx, cy, matches } = this.hover;

    // ホバーセルの強調
    const { x, y } = this.cellToPixel(cx, cy);
    const isCross = matches.length >= 2;
    this.ctx.strokeStyle = matches.length > 0 ? (isCross ? '#ff9844' : '#ffd234') : 'rgba(255,255,255,0.4)';
    this.ctx.lineWidth = isCross ? 3 : 2;
    this.ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);

    if (matches.length === 0) return;

    // 各マッチについて接続線と両端強調を描画
    const clickPx = this.cellToPixel(cx, cy);
    const clickCx = clickPx.x + TILE_SIZE / 2;
    const clickCy = clickPx.y + TILE_SIZE / 2;

    for (const match of matches) {
      const pa = this.cellToPixel(match.a.x, match.a.y);
      const pb = this.cellToPixel(match.b.x, match.b.y);
      const ax = pa.x + TILE_SIZE / 2;
      const ay = pa.y + TILE_SIZE / 2;
      const bx = pb.x + TILE_SIZE / 2;
      const by_ = pb.y + TILE_SIZE / 2;

      this.ctx.strokeStyle = COLOR_MAP[match.a.color ?? 'red'] ?? '#ffd234';
      this.ctx.lineWidth = isCross ? 5 : 4;
      this.ctx.globalAlpha = 0.7;
      this.ctx.beginPath();

      if (match.direction === 'corner') {
        // L字: A → クリックセル → B の2線分
        this.ctx.moveTo(ax, ay);
        this.ctx.lineTo(clickCx, clickCy);
        this.ctx.lineTo(bx, by_);
      } else {
        // 直線
        this.ctx.moveTo(ax, ay);
        this.ctx.lineTo(bx, by_);
      }

      this.ctx.stroke();
      this.ctx.globalAlpha = 1;

      for (const t of [match.a, match.b]) {
        const p = this.cellToPixel(t.x, t.y);
        this.ctx.strokeStyle = isCross ? '#ff9844' : '#fff';
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(p.x - 2, p.y - 2, TILE_SIZE + 4, TILE_SIZE + 4);
      }
    }
  }

  private drawHintHighlight(now: number): void {
    if (!this.hintHighlight) return;
    if (now > this.hintHighlight.until) {
      this.hintHighlight = null;
      return;
    }
    const phase = ((now / 200) | 0) % 2 === 0;
    if (!phase) return;
    for (const t of this.hintHighlight.tiles) {
      const p = this.cellToPixel(t.x, t.y);
      this.ctx.strokeStyle = '#ffd234';
      this.ctx.lineWidth = 4;
      this.ctx.strokeRect(p.x - 4, p.y - 4, TILE_SIZE + 8, TILE_SIZE + 8);
    }
    const cp = this.cellToPixel(
      this.hintHighlight.clickPoint.x,
      this.hintHighlight.clickPoint.y
    );
    this.ctx.fillStyle = 'rgba(255, 210, 52, 0.4)';
    this.ctx.beginPath();
    this.ctx.arc(cp.x + TILE_SIZE / 2, cp.y + TILE_SIZE / 2, 14, 0, Math.PI * 2);
    this.ctx.fill();
  }

  private drawTiles(): void {
    for (let y = 0; y < this.engine.height; y++) {
      for (let x = 0; x < this.engine.width; x++) {
        const t = this.engine.board[y][x];
        if (!t) continue;
        this.drawTile(t);
      }
    }
  }

  private drawTile(t: Tile): void {
    const { x, y } = this.cellToPixel(t.x, t.y);

    if (t.type === 'block') {
      // 障害ブロック：暗いグレーの石
      this.ctx.fillStyle = '#3d4252';
      this.ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
      this.ctx.strokeStyle = '#1c1f2a';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
      this.ctx.fillStyle = '#1c1f2a';
      this.ctx.font = 'bold 24px sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText('▣', x + TILE_SIZE / 2, y + TILE_SIZE / 2);
      return;
    }

    // シャドウタイル：未公開時はダークグレーに "?" を表示
    if (t.type === 'shadow') {
      const revealExpiry = this.shadowReveals.get(`${t.x},${t.y}`) ?? 0;
      const revealed = revealExpiry > Date.now();
      if (!revealed) {
        // 未公開：色を隠してダークグレー表示
        this.ctx.fillStyle = 'rgba(0,0,0,0.3)';
        this.ctx.fillRect(x + 2, y + 2, TILE_SIZE, TILE_SIZE);
        this.ctx.fillStyle = '#4a4f60';
        this.ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
        this.ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
        this.ctx.fillStyle = 'rgba(255,255,255,0.7)';
        this.ctx.font = 'bold 26px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('?', x + TILE_SIZE / 2, y + TILE_SIZE / 2);
        return;
      }
      // 公開中：通常タイルとして色を表示（以降の描画処理に続く）
    }

    const color = COLOR_MAP[t.color ?? 'red'] ?? '#888';

    // 影
    this.ctx.fillStyle = 'rgba(0,0,0,0.3)';
    this.ctx.fillRect(x + 2, y + 2, TILE_SIZE, TILE_SIZE);

    // タイル本体
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);

    // ハイライト
    this.ctx.fillStyle = 'rgba(255,255,255,0.2)';
    this.ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE * 0.4);

    // 枠
    this.ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);

    // 種類アイコン
    if (t.type === 'ice') {
      this.ctx.fillStyle = 'rgba(255,255,255,0.6)';
      this.ctx.font = 'bold 22px sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText('❄', x + TILE_SIZE / 2, y + TILE_SIZE / 2);
      // ヒビが入っていれば線を入れる
      if (t.state === 'cracked') {
        this.ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(x + 8, y + 12);
        this.ctx.lineTo(x + TILE_SIZE / 2, y + TILE_SIZE / 2);
        this.ctx.lineTo(x + TILE_SIZE - 12, y + 14);
        this.ctx.lineTo(x + TILE_SIZE / 2 + 4, y + TILE_SIZE - 10);
        this.ctx.stroke();
      }
    } else if (t.type === 'time') {
      this.ctx.fillStyle = 'rgba(255,255,255,0.85)';
      this.ctx.font = 'bold 22px sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText('⌛', x + TILE_SIZE / 2, y + TILE_SIZE / 2);
    } else if (t.type === 'linked') {
      // 連結タイル：右下隅にチェーンアイコンを描画
      this.ctx.font = '14px sans-serif';
      this.ctx.textAlign = 'right';
      this.ctx.textBaseline = 'bottom';
      this.ctx.fillStyle = 'rgba(255,255,255,0.9)';
      this.ctx.fillText('⛓', x + TILE_SIZE - 4, y + TILE_SIZE - 4);
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
    }
  }

  private drawMissEffects(now: number): void {
    for (const m of this.missEffects) {
      const elapsed = now - m.startedAt;
      const t = elapsed / 500;
      if (t > 1) continue;
      const { x, y } = this.cellToPixel(m.cx, m.cy);
      this.ctx.strokeStyle = `rgba(255, 91, 106, ${1 - t})`;
      this.ctx.lineWidth = 4;
      this.ctx.beginPath();
      this.ctx.moveTo(x + 12, y + 12);
      this.ctx.lineTo(x + TILE_SIZE - 12, y + TILE_SIZE - 12);
      this.ctx.moveTo(x + TILE_SIZE - 12, y + 12);
      this.ctx.lineTo(x + 12, y + TILE_SIZE - 12);
      this.ctx.stroke();
    }
  }

  private drawRemovedEffects(now: number): void {
    for (const r of this.removedEffects) {
      const elapsed = now - r.startedAt;
      const t = elapsed / 500;
      if (t > 1) continue;
      for (const tile of r.tiles) {
        const { x, y } = this.cellToPixel(tile.x, tile.y);
        const cx = x + TILE_SIZE / 2;
        const cy = y + TILE_SIZE / 2;
        const radius = 10 + t * 40;
        const color = COLOR_MAP[tile.color ?? 'red'] ?? '#fff';
        this.ctx.strokeStyle = color;
        this.ctx.globalAlpha = 1 - t;
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.globalAlpha = 1;
      }
    }
  }

  private drawFloatTexts(now: number): void {
    for (const f of this.floatTexts) {
      const elapsed = now - f.startedAt;
      const t = elapsed / 1000;
      if (t > 1) continue;
      this.ctx.fillStyle = f.color;
      this.ctx.globalAlpha = 1 - t;
      this.ctx.font = 'bold 20px sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(f.text, f.x, f.y - t * 30);
      this.ctx.globalAlpha = 1;
    }
  }

  // ---------- チュートリアル ----------

  private advanceTutorial(fromIndex?: number): void {
    if (!this.tutorial) return;
    if (fromIndex !== undefined && this.tutorial.currentIndex !== fromIndex) return;
    this.tutorial.currentIndex++;
    this.tutorial.stepStartTime = Date.now();
    this.tutorial.nextButtonRect = null;
    if (this.tutorial.currentIndex >= this.tutorial.steps.length) {
      this.tutorial = null;
    }
  }

  /** "次へ" ボタンのクリック判定。ボタンを押したら true を返す */
  private handleTutorialClick(clientX: number, clientY: number): boolean {
    if (!this.tutorial || !this.tutorial.nextButtonRect) return false;
    const step = this.tutorial.steps[this.tutorial.currentIndex];
    if (step.type === 'force_match') return false;

    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const cx = (clientX - rect.left) * scaleX;
    const cy = (clientY - rect.top) * scaleY;

    const btn = this.tutorial.nextButtonRect;
    if (cx >= btn.x && cx <= btn.x + btn.w && cy >= btn.y && cy <= btn.y + btn.h) {
      this.advanceTutorial();
      return true;
    }
    return false;
  }

  private drawTutorialOverlay(now: number): void {
    if (!this.tutorial) return;
    const step = this.tutorial.steps[this.tutorial.currentIndex];

    // praise ステップの自動進行
    if (step.type === 'praise' && step.autoAdvanceMs) {
      if (now - this.tutorial.stepStartTime >= step.autoAdvanceMs) {
        this.advanceTutorial();
        return;
      }
    }

    const w = this.canvas.width;
    const h = this.canvas.height;

    // 半透明オーバーレイ
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.52)';
    this.ctx.fillRect(0, 0, w, h);

    // ハイライトセル（指定タイルに黄色の枠と光彩）
    const pulse = 0.5 + 0.5 * Math.sin(now / 280);
    if (step.highlightCells && step.highlightCells.length > 0) {
      for (const cell of step.highlightCells) {
        const p = this.cellToPixel(cell.x, cell.y);
        this.ctx.strokeStyle = `rgba(255, 210, 52, ${0.55 + 0.45 * pulse})`;
        this.ctx.lineWidth = 4;
        this.ctx.strokeRect(p.x - 4, p.y - 4, TILE_SIZE + 8, TILE_SIZE + 8);
        this.ctx.strokeStyle = `rgba(255, 210, 52, ${0.15 * pulse})`;
        this.ctx.lineWidth = 12;
        this.ctx.strokeRect(p.x - 10, p.y - 10, TILE_SIZE + 20, TILE_SIZE + 20);
      }
    }

    // force_match: 許可セルを点滅で示す
    if (step.type === 'force_match' && step.allowedCells) {
      for (const cell of step.allowedCells) {
        const p = this.cellToPixel(cell.x, cell.y);
        this.ctx.fillStyle = `rgba(255, 255, 255, ${0.12 + 0.1 * pulse})`;
        this.ctx.fillRect(p.x, p.y, TILE_SIZE, TILE_SIZE);
        this.ctx.strokeStyle = `rgba(255, 255, 255, ${0.5 + 0.5 * pulse})`;
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(p.x, p.y, TILE_SIZE, TILE_SIZE);
      }
    }

    // レイアウト定数
    const FONT_SIZE = 15;
    const LINE_H = 26;
    const BOX_PAD = 18;
    const BTN_H = 36;
    const BTN_GAP = 10;
    const boxX = 10;
    const boxW = w - 20;

    // テキスト折り返し（\n 改行 + 幅超過で自動折り返し）
    this.ctx.font = `${FONT_SIZE}px sans-serif`;
    const maxTextW = boxW - BOX_PAD * 2;
    const rawLines = step.text.split('\n');
    const wrappedLines: string[] = [];
    for (const raw of rawLines) {
      wrappedLines.push(...this.wrapTextLine(raw, maxTextW));
    }

    const hasButton = step.type !== 'force_match';
    const textH = wrappedLines.length * LINE_H;
    const boxH = BOX_PAD + textH + (hasButton ? BTN_GAP + BTN_H + BOX_PAD : BOX_PAD);
    const boxY = h - boxH - 10;

    // ボックス背景と枠線
    this.ctx.fillStyle = 'rgba(20, 24, 44, 0.96)';
    this.drawRoundRect(boxX, boxY, boxW, boxH, 12);
    this.ctx.fill();
    this.ctx.strokeStyle = step.type === 'praise' ? '#ffd234' : step.type === 'force_match' ? '#5ec76a' : '#4a90e2';
    this.ctx.lineWidth = 2;
    this.drawRoundRect(boxX, boxY, boxW, boxH, 12);
    this.ctx.stroke();

    // テキスト描画
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = `${FONT_SIZE}px sans-serif`;
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';
    wrappedLines.forEach((line, i) => {
      this.ctx.fillText(line, boxX + BOX_PAD, boxY + BOX_PAD + i * LINE_H);
    });

    // "次へ" ボタン（explain / praise のみ）
    if (hasButton) {
      const btnW = 90;
      const btnX = boxX + boxW - btnW - BOX_PAD;
      const btnY = boxY + boxH - BTN_H - BOX_PAD;

      this.ctx.fillStyle = step.type === 'praise' ? '#ffd234' : '#4a90e2';
      this.drawRoundRect(btnX, btnY, btnW, BTN_H, 8);
      this.ctx.fill();

      this.ctx.fillStyle = step.type === 'praise' ? '#1c1f2a' : '#ffffff';
      this.ctx.font = 'bold 14px sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText('次へ ▶', btnX + btnW / 2, btnY + BTN_H / 2);

      if (this.tutorial) {
        this.tutorial.nextButtonRect = { x: btnX, y: btnY, w: btnW, h: BTN_H };
      }
    } else if (this.tutorial) {
      this.tutorial.nextButtonRect = null;
    }
  }

  /** 1行のテキストを maxWidth に収まるよう文字単位で折り返す */
  private wrapTextLine(text: string, maxWidth: number): string[] {
    if (!text) return [''];
    const result: string[] = [];
    let current = '';
    for (const char of text) {
      const candidate = current + char;
      if (this.ctx.measureText(candidate).width > maxWidth && current.length > 0) {
        result.push(current);
        current = char;
      } else {
        current = candidate;
      }
    }
    if (current) result.push(current);
    return result.length > 0 ? result : [''];
  }

  private drawRoundRect(x: number, y: number, w: number, h: number, r: number): void {
    this.ctx.beginPath();
    this.ctx.moveTo(x + r, y);
    this.ctx.lineTo(x + w - r, y);
    this.ctx.arcTo(x + w, y, x + w, y + r, r);
    this.ctx.lineTo(x + w, y + h - r);
    this.ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    this.ctx.lineTo(x + r, y + h);
    this.ctx.arcTo(x, y + h, x, y + h - r, r);
    this.ctx.lineTo(x, y + r);
    this.ctx.arcTo(x, y, x + r, y, r);
    this.ctx.closePath();
  }

  private cleanupExpired(now: number): void {
    this.missEffects = this.missEffects.filter((m) => now - m.startedAt < 500);
    this.removedEffects = this.removedEffects.filter((r) => now - r.startedAt < 500);
    this.floatTexts = this.floatTexts.filter((f) => now - f.startedAt < 1000);
    // 期限切れのシャドウタイル公開を削除
    for (const [key, expiry] of this.shadowReveals) {
      if (expiry <= now) this.shadowReveals.delete(key);
    }
  }

  private spawnFloatText(text: string, color: string): void {
    this.floatTexts.push({
      text,
      x: this.canvas.width / 2,
      y: this.canvas.height / 2,
      startedAt: Date.now(),
      color
    });
  }

  // ---------- HUD ----------

  private updateHud(): void {
    const snap = this.engine.getScoreSnapshot();
    this.hudScore.textContent = String(snap.score);
    this.hudCombo.textContent = `×${snap.combo}`;
    this.hudHint.textContent = String(this.engine.hintsRemaining);
  }

  private updateTimerHud(): void {
    const sec = this.engine.timer.remain;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    this.hudTimer.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    this.hudTimer.classList.toggle('warn', sec <= 10 && sec > 0);
  }

  private flashStatus(text: string): void {
    this.hudStatus.textContent = text;
  }

  // ---------- 座標 ----------

  private cellToPixel(cx: number, cy: number): { x: number; y: number } {
    return {
      x: BOARD_PADDING + cx * (TILE_SIZE + TILE_GAP),
      y: BOARD_PADDING + cy * (TILE_SIZE + TILE_GAP)
    };
  }

  private resizeCanvasToBoard(): void {
    this.canvas.width =
      BOARD_PADDING * 2 + this.engine.width * (TILE_SIZE + TILE_GAP) - TILE_GAP;
    this.canvas.height =
      BOARD_PADDING * 2 + this.engine.height * (TILE_SIZE + TILE_GAP) - TILE_GAP;
  }
}
