/**
 * ScenarioPlayer.ts
 * YAML/JSON シナリオファイルの解釈とCanvas/DOM描画を担当するノベルプレイヤー。
 * Phase 1 では実画像・音声を使わず、図形プレースホルダで代替する。
 */

import type { ScenarioContext } from '@/store/progressStore';

/** 背景変更ステップ */
export interface BgStep {
  bg: string;
}

/** BGM変更ステップ */
export interface BgmStep {
  bgm: string;
}

/** キャラクター表示ステップ */
export interface CharaStep {
  chara: {
    id: string;
    expr: string;
    pos: 'left' | 'center' | 'right';
  };
}

/** テキスト表示ステップ */
export interface TextStep {
  text: {
    name: string;
    body: string;
  };
  /** 既読トラッキング用オプションID */
  id?: string;
}

/** 選択肢ステップ */
export interface ChoiceStep {
  choice: Array<{
    label: string;
    flag?: string;
  }>;
}

/** シナリオのひとつのステップ */
export type ScenarioStep = BgStep | BgmStep | CharaStep | TextStep | ChoiceStep;

/** キャラクター表示状態 */
interface CharaState {
  id: string;
  expr: string;
  pos: 'left' | 'center' | 'right';
  color: string;
}

/** キャラクターIDに対応するプレースホルダ色 */
const CHARA_COLORS: Record<string, string> = {
  akari: '#ff8fb1',
  hikari: '#4a90e2',
  sora: '#5ec76a',
  yuki: '#9c6bd8',
  luna: '#c04060',
  default: '#ffd234'
};

/**
 * Canvas/DOM を使ったシナリオ再生クラス。
 * container に Canvas を挿入し、シナリオステップを順番に表示する。
 */
export class ScenarioPlayer {
  private container: HTMLElement;
  private context: ScenarioContext;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private steps: ScenarioStep[] = [];
  private stepIndex = 0;

  /** 現在表示中のテキスト（タイプライタ状態） */
  private displayedText = '';
  private targetText = '';
  private typewriterTimer: ReturnType<typeof setTimeout> | null = null;
  private isTyping = false;

  /** 現在のビジュアル状態 */
  private bgColor = '#1a1a2e';
  private characters: CharaState[] = [];
  private currentName = '';
  private choiceButtons: Array<{ label: string; x: number; y: number; w: number; h: number; flag?: string }> = [];

  /** 選択肢待機中フラグ */
  private awaitingChoice = false;

  /** シナリオ終了コールバック */
  private endCallback: (() => void) | null = null;

  /** start()が返すPromiseのresolve */
  private resolveStart: (() => void) | null = null;

  /** アニメーションフレームID */
  private rafId: number | null = null;

  /** 現在再生中のBGM */
  private bgmAudio: HTMLAudioElement | null = null;

  /** 読み込み済みキャラ画像キャッシュ（キー: "${id}_${expr}"） */
  private charaImageCache: Map<string, HTMLImageElement> = new Map();

  /** 現在の背景画像（読み込み済みの場合のみ） */
  private bgImage: HTMLImageElement | null = null;

  /** クリック/スペースキーのイベントリスナー（後でremoveするため保持） */
  private boundClick: (e: MouseEvent) => void;
  private boundKey: (e: KeyboardEvent) => void;

  /**
   * @param container シナリオを描画するコンテナ要素
   * @param context シナリオ実行コンテキスト（フラグ・既読管理）
   */
  constructor(container: HTMLElement, context: ScenarioContext) {
    this.container = container;
    this.context = context;

    this.canvas = document.createElement('canvas');
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';
    this.canvas.style.cursor = 'pointer';

    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable');
    this.ctx = ctx;

    this.container.appendChild(this.canvas);
    this.resizeCanvas();

    window.addEventListener('resize', () => this.resizeCanvas());

    this.boundClick = (e: MouseEvent) => this.handleClick(e);
    this.boundKey = (e: KeyboardEvent) => this.handleKey(e);
    this.canvas.addEventListener('click', this.boundClick);
    window.addEventListener('keydown', this.boundKey);
  }

  /**
   * シナリオステップ配列をロードする。
   * @param steps シナリオステップの配列
   */
  loadScenario(steps: ScenarioStep[]): void {
    this.steps = steps;
    this.stepIndex = 0;
    this.characters = [];
    this.displayedText = '';
    this.targetText = '';
    this.currentName = '';
    this.choiceButtons = [];
    this.awaitingChoice = false;
  }

  /**
   * シナリオ再生を開始する。
   * @returns シナリオが終了したときに解決するPromise
   */
  start(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.resolveStart = resolve;
      this.startRenderLoop();
      this.advanceStep();
    });
  }

  /**
   * 現在のテキスト表示をスキップして全文を即表示する。
   */
  skip(): void {
    if (this.isTyping) {
      this.finishTyping();
    }
  }

  /**
   * シナリオ終了時のコールバックを登録する。
   * @param callback シナリオ終了時に呼ばれる関数
   */
  onScenarioEnd(callback: () => void): void {
    this.endCallback = callback;
  }

  /**
   * BGMを停止する。
   */
  stopBgm(): void {
    if (this.bgmAudio) {
      this.bgmAudio.pause();
      this.bgmAudio.src = '';
      this.bgmAudio = null;
    }
  }

  /**
   * リソースを解放してCanvasをコンテナから削除する。
   */
  destroy(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    if (this.typewriterTimer !== null) clearTimeout(this.typewriterTimer);
    this.stopBgm();
    this.canvas.removeEventListener('click', this.boundClick);
    window.removeEventListener('keydown', this.boundKey);
    window.removeEventListener('resize', () => this.resizeCanvas());
    if (this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
  }

  // ---------- プライベートメソッド ----------

  private resizeCanvas(): void {
    const rect = this.container.getBoundingClientRect();
    const w = Math.max(rect.width, 320);
    const h = Math.max(rect.height, 240);
    this.canvas.width = w;
    this.canvas.height = h;
  }

  private startRenderLoop(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    const tick = () => {
      this.render();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  /** 次のステップへ進む */
  private advanceStep(): void {
    if (this.stepIndex >= this.steps.length) {
      this.endScenario();
      return;
    }

    const step = this.steps[this.stepIndex];
    this.stepIndex++;

    if ('bg' in step) {
      this.bgColor = this.filenameToColor(step.bg);
      this.bgImage = null;
      const img = new Image();
      img.onload = () => { this.bgImage = img; };
      img.src = `/assets/bg/${step.bg}.jpg`;
      this.advanceStep();
    } else if ('bgm' in step) {
      // BGM再生
      const src = `/assets/bgm/${step.bgm}`;
      if (this.bgmAudio) {
        this.bgmAudio.pause();
        this.bgmAudio.src = '';
      }
      this.bgmAudio = new Audio(src);
      this.bgmAudio.loop = true;
      this.bgmAudio.volume = 0.5;
      this.bgmAudio.play().catch(() => {}); // autoplayエラーは無視
      this.advanceStep();
    } else if ('chara' in step) {
      this.updateChara(step.chara);
      this.preloadCharaImage(step.chara.id, step.chara.expr);
      this.advanceStep();
    } else if ('text' in step) {
      // テキスト表示（ユーザー入力待ち）
      const lineId = (step as TextStep).id ?? `line_${this.stepIndex}`;
      const isRead = this.context.readLines.has(lineId);
      this.currentName = step.text.name;
      this.targetText = step.text.body;
      this.displayedText = '';
      this.choiceButtons = [];
      this.awaitingChoice = false;

      if (isRead) {
        // 既読行はスキップ（即表示）
        this.displayedText = this.targetText;
        this.isTyping = false;
      } else {
        this.context.readLines.add(lineId);
        this.startTypewriter();
      }
    } else if ('choice' in step) {
      // 選択肢表示
      this.awaitingChoice = true;
      this.buildChoiceButtons(step.choice);
    }
  }

  /** タイプライタアニメーション開始 */
  private startTypewriter(): void {
    this.isTyping = true;
    let i = 0;
    const speed = 30; // ms/文字

    const typeNext = () => {
      if (i < this.targetText.length) {
        this.displayedText = this.targetText.slice(0, i + 1);
        i++;
        this.typewriterTimer = setTimeout(typeNext, speed);
      } else {
        this.isTyping = false;
        this.typewriterTimer = null;
      }
    };
    typeNext();
  }

  /** タイプライタを即完了させる */
  private finishTyping(): void {
    if (this.typewriterTimer !== null) {
      clearTimeout(this.typewriterTimer);
      this.typewriterTimer = null;
    }
    this.displayedText = this.targetText;
    this.isTyping = false;
  }

  /** キャラクター状態を更新する */
  private updateChara(charaData: CharaStep['chara']): void {
    const existing = this.characters.find(c => c.id === charaData.id);
    const color = CHARA_COLORS[charaData.id] ?? CHARA_COLORS['default']!;
    if (existing) {
      existing.expr = charaData.expr;
      existing.pos = charaData.pos;
    } else {
      this.characters.push({ ...charaData, color });
    }
  }

  /** 選択肢ボタンを構築する */
  private buildChoiceButtons(
    choices: Array<{ label: string; flag?: string }>
  ): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const bw = Math.min(w * 0.6, 400);
    const bh = 48;
    const gap = 12;
    const totalH = choices.length * (bh + gap) - gap;
    const startY = (h - totalH) / 2;
    const startX = (w - bw) / 2;

    this.choiceButtons = choices.map((c, i) => ({
      label: c.label,
      flag: c.flag,
      x: startX,
      y: startY + i * (bh + gap),
      w: bw,
      h: bh
    }));
  }

  /** クリックイベント処理 */
  private handleClick(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (this.canvas.width / rect.width);
    const my = (e.clientY - rect.top) * (this.canvas.height / rect.height);

    if (this.awaitingChoice) {
      for (const btn of this.choiceButtons) {
        if (mx >= btn.x && mx <= btn.x + btn.w && my >= btn.y && my <= btn.y + btn.h) {
          if (btn.flag) {
            this.context.flags[btn.flag] = (this.context.flags[btn.flag] ?? 0) + 1;
          }
          this.awaitingChoice = false;
          this.choiceButtons = [];
          this.advanceStep();
          return;
        }
      }
      return;
    }

    if (this.isTyping) {
      this.finishTyping();
    } else if (this.targetText) {
      // テキスト表示中（全文表示済み）→ 次へ
      this.targetText = '';
      this.displayedText = '';
      this.advanceStep();
    }
  }

  /** キーボードイベント処理 */
  private handleKey(e: KeyboardEvent): void {
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      if (!this.awaitingChoice) {
        if (this.isTyping) {
          this.finishTyping();
        } else if (this.targetText) {
          this.targetText = '';
          this.displayedText = '';
          this.advanceStep();
        }
      }
    }
  }

  /** シナリオ終了処理 */
  private endScenario(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.stopBgm();
    if (this.endCallback) this.endCallback();
    if (this.resolveStart) this.resolveStart();
  }

  // ---------- 描画 ----------

  private render(): void {
    const w = this.canvas.width;
    const h = this.canvas.height;

    // 背景
    if (this.bgImage) {
      this.ctx.drawImage(this.bgImage, 0, 0, w, h);
    } else {
      const grad = this.ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, this.bgColor);
      grad.addColorStop(1, this.darkenColor(this.bgColor));
      this.ctx.fillStyle = grad;
      this.ctx.fillRect(0, 0, w, h);
    }

    // キャラクタープレースホルダ
    this.drawCharacters(w, h);

    // テキストウィンドウ
    if (this.displayedText || this.targetText) {
      this.drawTextWindow(w, h);
    }

    // 選択肢
    if (this.awaitingChoice) {
      this.drawChoices();
    }

    // クリックプロンプト（テキスト全文表示済み・非選択肢時）
    if (!this.isTyping && !this.awaitingChoice && this.targetText) {
      this.drawClickPrompt(w, h);
    }
  }

  /** キャラ画像を非同期でプリロードしてキャッシュする */
  private preloadCharaImage(id: string, expr: string): void {
    const key = `${id}_${expr}`;
    if (this.charaImageCache.has(key)) return;
    const img = new Image();
    img.onload = () => { this.charaImageCache.set(key, img); };
    img.src = `/assets/chara/${key}.png`;
  }

  private drawCharacters(w: number, h: number): void {
    for (const chara of this.characters) {
      let cx = w / 2;
      if (chara.pos === 'left') cx = w * 0.25;
      else if (chara.pos === 'right') cx = w * 0.75;

      const img = this.charaImageCache.get(`${chara.id}_${chara.expr}`);
      if (img) {
        // スプライト画像を描画（下辺をテキストウィンドウ上端に合わせる）
        const displayH = h * 0.78;
        const displayW = displayH * (img.naturalWidth / img.naturalHeight);
        this.ctx.drawImage(img, cx - displayW / 2, h - displayH - h * 0.28, displayW, displayH);
      } else {
        // フォールバック: カラーシルエット描画
        const charHeight = h * 0.55;
        const charWidth = charHeight * 0.5;
        const cy = h * 0.35;

        this.ctx.fillStyle = chara.color;
        this.ctx.globalAlpha = 0.85;
        this.ctx.fillRect(cx - charWidth / 2, cy - charHeight / 2, charWidth, charHeight);

        const headR = charWidth * 0.45;
        this.ctx.beginPath();
        this.ctx.arc(cx, cy - charHeight / 2 - headR * 0.5, headR, 0, Math.PI * 2);
        this.ctx.fillStyle = this.lightenColor(chara.color);
        this.ctx.fill();

        this.ctx.globalAlpha = 1;

        this.ctx.fillStyle = '#fff';
        this.ctx.font = `bold ${Math.max(12, charWidth * 0.25)}px sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(chara.id, cx, cy);
      }
    }
  }

  private drawTextWindow(w: number, h: number): void {
    const winH = h * 0.28;
    const winY = h - winH - 16;
    const pad = 16;

    // 半透明背景
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    this.ctx.fillRect(8, winY, w - 16, winH);

    // 枠線
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(8, winY, w - 16, winH);

    // 名前プレート
    if (this.currentName) {
      const nameW = Math.min(180, w * 0.4);
      this.ctx.fillStyle = 'rgba(80, 40, 120, 0.9)';
      this.ctx.fillRect(8, winY - 30, nameW, 28);
      this.ctx.fillStyle = '#fff';
      this.ctx.font = 'bold 16px sans-serif';
      this.ctx.textAlign = 'left';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(this.currentName, 8 + pad, winY - 16);
    }

    // 本文テキスト（折り返し）
    this.ctx.fillStyle = '#f0f0f0';
    this.ctx.font = '16px sans-serif';
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';
    this.wrapText(this.displayedText, 8 + pad, winY + pad, w - 32, 24);
  }

  private drawChoices(): void {
    for (const btn of this.choiceButtons) {
      // ボタン背景
      this.ctx.fillStyle = 'rgba(40, 40, 80, 0.92)';
      this.ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
      this.ctx.strokeStyle = 'rgba(180, 150, 255, 0.8)';
      this.ctx.lineWidth = 1.5;
      this.ctx.strokeRect(btn.x, btn.y, btn.w, btn.h);

      // ボタンテキスト
      this.ctx.fillStyle = '#fff';
      this.ctx.font = 'bold 16px sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2);
    }
  }

  private drawClickPrompt(w: number, h: number): void {
    const t = (Date.now() / 600) % 1;
    this.ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
    this.ctx.fillStyle = '#ffd234';
    this.ctx.font = '14px sans-serif';
    this.ctx.textAlign = 'right';
    this.ctx.textBaseline = 'bottom';
    this.ctx.fillText('▼', w - 24, h - 24);
    this.ctx.globalAlpha = 1;
  }

  /** テキスト折り返し描画 */
  private wrapText(text: string, x: number, y: number, maxW: number, lineH: number): void {
    const chars = Array.from(text);
    let line = '';
    let currentY = y;

    for (const char of chars) {
      const testLine = line + char;
      const metrics = this.ctx.measureText(testLine);
      if (metrics.width > maxW && line.length > 0) {
        this.ctx.fillText(line, x, currentY);
        line = char;
        currentY += lineH;
      } else {
        line = testLine;
      }
    }
    if (line) {
      this.ctx.fillText(line, x, currentY);
    }
  }

  /** ファイル名からプレースホルダ色を生成 */
  private filenameToColor(filename: string): string {
    let hash = 0;
    for (let i = 0; i < filename.length; i++) {
      hash = (hash * 31 + filename.charCodeAt(i)) & 0xffffff;
    }
    const h = hash % 360;
    return `hsl(${h}, 40%, 20%)`;
  }

  /** 色を少し暗くする */
  private darkenColor(hsl: string): string {
    return hsl.replace(/(\d+)%\)$/, (_, n) => `${Math.max(0, Number(n) - 10)}%)`);
  }

  /** 色を少し明るくする */
  private lightenColor(hex: string): string {
    // hexを少し明るくする簡易実装
    if (hex.startsWith('#') && hex.length === 7) {
      const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + 40);
      const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + 40);
      const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + 40);
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }
    return hex;
  }
}
