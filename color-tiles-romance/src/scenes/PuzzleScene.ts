import type { StageDefinition, Tile, MatchResult, TutorialStep, SpecialEventDef } from '@/types';
import { PuzzleEngine } from '@/core/PuzzleEngine';
import { soundEngine } from '@/core/SoundEngine';
import { BgmManager } from '@/audio/BgmManager';
import { playSeFile } from '@/audio/SeManager';

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

interface CutInState {
  startedAt: number;
  character: string;
  text: string;
  charaImg: HTMLImageElement | null;
  effect: SpecialEventDef['effect'];
}

interface TutorialState {
  steps: TutorialStep[];
  currentIndex: number;
  stepStartTime: number;
  /** "次へ" ボタンの canvas ピクセル矩形（canvas内クリック判定用）*/
  nextButtonRect: { x: number; y: number; w: number; h: number } | null;
  /** DOM描画用のコンテナ要素 */
  el: HTMLElement;
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
  private bombFlashUntil = 0;
  private tutorial: TutorialState | null = null;
  private cutIn: CutInState | null = null;
  /** シャドウタイルの一時的な色表示期限マップ。key: "x,y"、value: 公開期限(ms timestamp) */
  private shadowReveals: Map<string, number> = new Map();

  private rafId: number | null = null;

  // HUD要素
  private hudTimer: HTMLElement;
  private hudScore: HTMLElement;
  private hudCombo: HTMLElement;
  private hudHint: HTMLElement;
  private hudStatus: HTMLElement;

  /** チュートリアルダイアログを描画するDOM要素（canvas外・パズルエリア下） */
  private tutorialDomEl: HTMLElement | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    hud: {
      timer: HTMLElement;
      score: HTMLElement;
      combo: HTMLElement;
      hint: HTMLElement;
      status: HTMLElement;
    },
    tutorialEl?: HTMLElement
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
    this.tutorialDomEl = tutorialEl ?? null;

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
    this.bombFlashUntil = 0;
    if (this.tutorialDomEl) this.tutorialDomEl.innerHTML = '';
    const tutEl = this.tutorialDomEl ?? this.createFallbackTutorialEl();
    this.tutorial = stage.tutorialSteps && stage.tutorialSteps.length > 0
      ? { steps: stage.tutorialSteps, currentIndex: 0, stepStartTime: Date.now(), nextButtonRect: null, el: tutEl }
      : null;
    this.cutIn = null;
    this.hudStatus.textContent = `${stage.title}`;
    this.startRenderLoop();
    BgmManager.play(stage.puzzleBgm ?? 'Steel_and_Shadows.mp3');
    // 説明/称賛ステップ中（"次へ"が表示される間）はタイマーを停止する
    if (this.tutorial && this.tutorial.steps[0]?.type !== 'force_match') {
      this.engine.timer.pause();
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
    // BGM は呼び出し元シーンが制御するためここでは止めない
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
      const touch = e.changedTouches[0];
      if (this.tutorial !== null) {
        // チュートリアルオーバーレイ中：「次へ」ボタンを先にチェック
        if (touch && this.handleTutorialClick(touch.clientX, touch.clientY)) {
          this.hover = null;
          return;
        }
        const step = this.tutorial.steps[this.tutorial.currentIndex];
        if (step.type === 'force_match' && this.hover) {
          const allowed = step.allowedCells?.some(c => c.x === this.hover!.cx && c.y === this.hover!.cy) ?? false;
          if (allowed) {
            soundEngine.playClick();
            this.engine.onCellClick(this.hover.cx, this.hover.cy);
          }
        }
      } else if (this.hover) {
        soundEngine.playClick();
        this.engine.onCellClick(this.hover.cx, this.hover.cy);
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
        case 'miss': {
          // チュートリアルの force_match ステップ中はミス演出・ペナルティを抑制する
          const inTutForceMatch = this.tutorial !== null &&
            this.tutorial.steps[this.tutorial.currentIndex]?.type === 'force_match';
          if (!inTutForceMatch) {
            soundEngine.playMiss();
            this.missEffects.push({
              cx: e.clickPoint.x,
              cy: e.clickPoint.y,
              startedAt: Date.now()
            });
            if (e.penaltySec > 0) {
              this.spawnFloatText(`-${e.penaltySec}s`, '#ff5b6a');
            }
          }
          break;
        }
        case 'shuffle':
          this.shuffleFlashUntil = Date.now() + 800;
          this.flashStatus('シャッフル！');
          break;
        case 'blocksReleased':
          this.flashStatus('障害ブロック解除！');
          break;
        case 'bombExploded':
          soundEngine.playMiss();
          this.bombFlashUntil = Date.now() + 600;
          this.spawnFloatText(`💥 -${e.penaltySec}s`, '#ff4444');
          break;
        case 'specialTrigger': {
          // タイマーを一時停止してカットイン演出を開始
          this.engine.timer.pause();
          playSeFile('se_cutin.mp3');
          const state: CutInState = {
            startedAt: Date.now(),
            character: e.cutIn?.character ?? '',
            text: e.cutIn?.text ?? '',
            charaImg: null,
            effect: e.effect,
          };
          if (e.cutIn?.character) {
            const img = new Image();
            img.onload = () => { state.charaImg = img; };
            img.src = `${import.meta.env.BASE_URL}assets/chara/${e.cutIn.character}_angry.png`;
          }
          this.cutIn = state;
          break;
        }
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

    // カットイン演出（特殊イベント）
    this.drawCutIn(now);

    // 爆弾爆発フラッシュ
    if (now < this.bombFlashUntil) {
      const alpha = (this.bombFlashUntil - now) / 600;
      this.ctx.fillStyle = `rgba(255, 120, 0, ${alpha * 0.5})`;
      this.ctx.fillRect(0, 0, w, h);
    }

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
      // 解除までの残りペア数を表示（afterPairsルール時）
      const remaining = this.engine.blockRemainingCount;
      if (remaining !== null) {
        this.ctx.fillStyle = '#8a90a8';
        this.ctx.font = `bold ${TILE_SIZE >= 48 ? 18 : 13}px sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(String(remaining), x + TILE_SIZE / 2, y + TILE_SIZE / 2);
      } else {
        this.ctx.fillStyle = '#1c1f2a';
        this.ctx.font = 'bold 24px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('▣', x + TILE_SIZE / 2, y + TILE_SIZE / 2);
      }
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
    } else if (t.type === 'bomb') {
      const countdown = t.countdown ?? 0;
      const urgent = countdown <= 5;
      // 爆弾アイコン
      this.ctx.font = 'bold 20px sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillStyle = urgent ? 'rgba(255,80,80,0.95)' : 'rgba(255,255,255,0.85)';
      this.ctx.fillText('💣', x + TILE_SIZE / 2, y + TILE_SIZE / 2 - 7);
      // カウントダウン数字
      this.ctx.font = `bold ${urgent ? 15 : 13}px sans-serif`;
      this.ctx.fillStyle = urgent ? '#ff2222' : 'rgba(255,255,255,0.9)';
      this.ctx.fillText(String(countdown), x + TILE_SIZE / 2, y + TILE_SIZE / 2 + 12);
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
      // チュートリアル終了 → DOM ダイアログを非表示にしてタイマー再開
      if (this.tutorial.el) this.tutorial.el.style.display = 'none';
      this.tutorial = null;
      this._tutDomLastIndex = -1;
      this.engine.timer.resume();
    } else {
      const step = this.tutorial.steps[this.tutorial.currentIndex];
      if (step.type === 'force_match') {
        // force_match 中はダイアログを非表示（セルをクリックさせる）
        if (this.tutorial.el) this.tutorial.el.style.display = 'none';
        this.engine.timer.resume();
      } else {
        this.engine.timer.pause(); // explain/praise → タイマー停止
      }
    }
  }

  /**
   * チュートリアル中のキャンバスクリック判定。
   * explain/praise ステップはゲーム入力をブロックするため true を返す。
   * force_match ステップは false を返してセルクリック処理へ続く。
   */
  private handleTutorialClick(_clientX: number, _clientY: number): boolean {
    if (!this.tutorial) return false;
    const step = this.tutorial.steps[this.tutorial.currentIndex];
    // explain/praise はキャンバスクリックをブロック（"次へ"はDOMボタンで処理）
    return step.type !== 'force_match';
  }

  /** チュートリアル DOM ダイアログの最後に描画したステップ番号 */
  private _tutDomLastIndex = -1;

  /** チュートリアルオーバーレイ：Canvas側はセル強調のみ、ダイアログはDOM描画 */
  private drawTutorialOverlay(now: number): void {
    if (!this.tutorial) {
      // チュートリアル終了時に DOM を非表示
      if (this.tutorial === null && this.tutorialDomEl) {
        this.tutorialDomEl.style.display = 'none';
      }
      return;
    }
    const step = this.tutorial.steps[this.tutorial.currentIndex];

    // praise ステップは「次へ」ボタンで明示的に進める（auto-advance は使わない）

    // ---------- Canvas側：セル強調のみ ----------
    const pulse = 0.5 + 0.5 * Math.sin(now / 280);

    // ハイライトセル（指定タイルに黄色の枠と光彩）
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

    // ---------- DOM側：ダイアログ描画（ステップが変わったときのみ更新）----------
    if (this._tutDomLastIndex !== this.tutorial.currentIndex) {
      this._tutDomLastIndex = this.tutorial.currentIndex;
      this.renderTutorialDom(step);
    }
  }

  /** チュートリアルダイアログをDOM要素として描画する */
  private renderTutorialDom(step: TutorialStep): void {
    const el = this.tutorial?.el;
    if (!el) return;

    const SPEAKER_COLORS: Record<string, string> = {
      '主人公': '#b0b8cc',
      'みお':   '#4a90e2',
      'すず':   '#5ec76a',
      'ひまり': '#ffaa33',
      'ゆかり': '#9c6bd8',
      'あかり': '#ff8fb1',
    };

    const borderColor = step.type === 'praise' ? '#ffd234'
      : step.type === 'force_match' ? '#5ec76a'
      : '#4a90e2';
    const speakerColor = step.speaker ? (SPEAKER_COLORS[step.speaker] ?? '#ffffff') : '';
    // force_match はセルクリックで進める。それ以外（explain / praise）はすべてボタン表示
    const hasButton = step.type !== 'force_match';
    const isPraise = step.type === 'praise';

    // テキストを HTML エスケープしつつ改行を <br> に変換
    const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const bodyHtml = escapeHtml(step.text).replace(/\n/g, '<br>');

    el.style.display = 'block';
    el.innerHTML = `
      <div style="
        background:rgba(20,24,44,0.97);
        border:2px solid ${borderColor};
        border-radius:12px;
        padding:14px 18px 14px 18px;
        margin:0;
        position:relative;
        box-shadow:0 2px 12px rgba(0,0,0,0.5);
      ">
        ${step.speaker ? `
          <div style="
            display:inline-block;
            background:rgba(20,24,44,0.97);
            border:2px solid ${speakerColor};
            border-radius:6px;
            padding:3px 14px;
            color:${speakerColor};
            font:bold 13px sans-serif;
            margin-bottom:8px;
          ">${escapeHtml(step.speaker)}</div>
        ` : ''}
        <div style="
          color:#fff;
          font:15px/1.7 sans-serif;
          white-space:pre-wrap;
          word-break:break-all;
        ">${bodyHtml}</div>
        ${hasButton ? `
          <div style="text-align:right;margin-top:10px;">
            <button id="_tut_next_btn" style="
              background:${isPraise ? '#ffd234' : '#4a90e2'};
              color:${isPraise ? '#1c1f2a' : '#fff'};
              border:none;border-radius:8px;
              padding:8px 20px;
              font:bold 14px sans-serif;
              cursor:pointer;
              touch-action:manipulation;
            ">次へ ▶</button>
          </div>
        ` : ''}
      </div>
    `;

    // ボタンのクリックイベントを登録
    const btn = el.querySelector<HTMLButtonElement>('#_tut_next_btn');
    if (btn) {
      btn.addEventListener('click', () => this.advanceTutorial());
      btn.addEventListener('touchend', (e) => { e.preventDefault(); this.advanceTutorial(); });
    }
  }

  /** tutorialDomEl が渡されなかった場合のフォールバック（canvas直下に挿入） */
  private createFallbackTutorialEl(): HTMLElement {
    const div = document.createElement('div');
    div.style.cssText = 'width:100%;padding:0 8px;box-sizing:border-box;margin-top:6px;';
    this.canvas.parentNode?.insertBefore(div, this.canvas.nextSibling);
    return div;
  }

  /** 1行のテキストを maxWidth に収まるよう文字単位で折り返す */
  private drawCutIn(now: number): void {
    if (!this.cutIn) return;
    // 500ms スライドイン → 900ms ホールド → 300ms クイックフェード
    const DURATION   = 1700;
    const SLIDE_MS   = 500;
    const FADE_START = 1400;
    const elapsed = now - this.cutIn.startedAt;

    if (elapsed >= DURATION) {
      const eff = this.cutIn.effect;
      if (eff.type === 'transformToBomb') {
        this.engine.transformTilesToBombs(eff.count);
        this.spawnFloatText(`💣×${eff.count} 爆弾変換！`, '#ffaa33');
      } else if (eff.type === 'addIceTiles') {
        this.engine.addIceTiles(eff.count);
        this.spawnFloatText(`❄×${eff.count} 氷パネル追加！`, '#9ed3ff');
      } else if (eff.type === 'restoreBlocks') {
        this.engine.restoreBlocksSpecial(eff.newReleaseCount);
        this.spawnFloatText('🪨 ブロック全回復！', '#a0b0cc');
      }
      this.engine.timer.resume();
      this.cutIn = null;
      return;
    }

    const CHARA_COLORS: Record<string, string> = {
      himari: '#ffaa33',
      mio:    '#4a90e2',
      suzu:   '#5ec76a',
      yukari: '#9c6bd8',
      akari:  '#ff8fb1',
    };
    const CHARA_NAMES: Record<string, string> = {
      himari: 'ひまり',
      mio:    'みお',
      suzu:   'すず',
      yukari: 'ゆかり',
      akari:  'あかり',
    };
    const charaColor = CHARA_COLORS[this.cutIn.character] ?? '#ffffff';
    const charaName  = CHARA_NAMES[this.cutIn.character]  ?? this.cutIn.character;

    const eff = this.cutIn.effect;
    const subText = eff.type === 'transformToBomb'
      ? `💣 ${eff.count}個のタイルが爆弾に変わる！`
      : eff.type === 'addIceTiles'
        ? `❄ ${eff.count}個の氷パネルが追加される！`
        : '🪨 ブロックパネルが全回復する！';

    const w = this.canvas.width;
    const h = this.canvas.height;

    // フェードアルファ（FADE_START 以降のみ減衰）
    const alpha = elapsed > FADE_START
      ? 1 - (elapsed - FADE_START) / (DURATION - FADE_START)
      : 1;
    // スライドイーズ（上からスライドイン、SLIDE_MS で完了）
    const slideT = Math.min(1, elapsed / SLIDE_MS);
    const ease = 1 - Math.pow(1 - slideT, 3);

    // 暗幕
    this.ctx.globalAlpha = alpha * 0.82;
    this.ctx.fillStyle = '#14102a';
    this.ctx.fillRect(0, 0, w, h);

    // キャラカラーの右側グラデーション閃光
    const r = parseInt(charaColor.slice(1, 3), 16);
    const g = parseInt(charaColor.slice(3, 5), 16);
    const b = parseInt(charaColor.slice(5, 7), 16);
    const flashGrad = this.ctx.createLinearGradient(w, 0, w * 0.2, 0);
    flashGrad.addColorStop(0, `rgba(${r},${g},${b},${0.5 * alpha})`);
    flashGrad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    this.ctx.fillStyle = flashGrad;
    this.ctx.fillRect(0, 0, w, h);

    // キャラクター画像（右側・画面上から拡大スライドイン）
    if (this.cutIn.charaImg) {
      const img = this.cutIn.charaImg;
      // 画面高さいっぱいに拡大、横幅が画面の70%を超えないよう制限
      const scaleByH = h / img.naturalHeight;
      const scaleByW = (w * 0.70) / img.naturalWidth;
      const charaScale = Math.min(scaleByH, scaleByW);
      const charaH = img.naturalHeight * charaScale;
      const charaW = img.naturalWidth * charaScale;
      // 右端に配置（少しはみ出してよい）
      const charaX = w - charaW * 0.88;
      const startY = -charaH;
      const charaY = startY + (0 - startY) * ease;
      this.ctx.globalAlpha = alpha;
      this.ctx.drawImage(img, charaX, charaY, charaW, charaH);
    }

    // テキスト（150ms後にフェードイン、左側に配置）
    const textAlpha = Math.min(1, Math.max(0, (elapsed - 150) / 250));
    this.ctx.globalAlpha = alpha * textAlpha;

    // キャラ名プレート
    this.ctx.fillStyle = charaColor;
    this.ctx.font = 'bold 16px sans-serif';
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(charaName, 24, h * 0.38);

    // メインテキスト
    const fontSize = Math.max(22, Math.min(40, Math.floor(w * 0.07)));
    this.ctx.font = `bold ${fontSize}px sans-serif`;
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillText(this.cutIn.text, 24, h * 0.48);

    // サブテキスト
    this.ctx.font = '15px sans-serif';
    this.ctx.fillStyle = '#ffd080';
    this.ctx.fillText(subText, 24, h * 0.56);

    this.ctx.globalAlpha = 1;
    this.ctx.textAlign = 'center';
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
    const wasWarn = this.hudTimer.classList.contains('warn');
    const isWarn = sec <= 10 && sec > 0;
    this.hudTimer.classList.toggle('warn', isWarn);
    // 残り10秒になった瞬間からチクタク音を毎秒再生する
    if (isWarn && !wasWarn) {
      soundEngine.playTimeLow();
    } else if (isWarn && wasWarn && s !== this._lastTimerSec) {
      soundEngine.playTimeLow();
    }
    this._lastTimerSec = sec;
  }

  private _lastTimerSec = -1;

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
