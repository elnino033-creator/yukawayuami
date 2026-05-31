/**
 * ScenarioPlayer.ts
 * YAML/JSON シナリオファイルの解釈とCanvas/DOM描画を担当するノベルプレイヤー。
 * Phase 1 では実画像・音声を使わず、図形プレースホルダで代替する。
 */

import type { ScenarioContext } from '@/store/progressStore';
import { BgmManager } from '@/audio/BgmManager';
import { playSe, playSeFile } from '@/audio/SeManager';
import type { ScenarioSaveData } from '@/store/sceneSaveStore';

/** 背景変更ステップ（null で背景をリセット） */
export interface BgStep {
  bg: string | null;
}

/** BGM変更ステップ（null で停止） */
export interface BgmStep {
  bgm: string | null;
}

/** SE 再生ステップ */
export interface SeStep {
  se: {
    src: string;
    loop?: boolean;
    /** 再生音量（0.0〜1.0）。省略時は SeManager のデフォルト値 */
    volume?: number;
    /** 再生時間の割合（0.0〜1.0）。0.5 なら前半半分で停止。省略時は末尾まで再生 */
    durationRatio?: number;
  };
}

/** エフェクトステップ */
export interface EffectStep {
  effect: { type: string; duration: number };
}

/**
 * キャラと主人公の距離感プリセット。
 * 指定すると scale の代わりに使われる（scale と併用した場合は distance 優先）。
 * - veryClose : 手を取る・抱擁など超接近（×1.35）
 * - close     : 顔を近づける・囁くなど近距離（×1.15）
 * - normal    : 通常の会話（×1.0）
 * - far       : 少し離れた距離（×0.80）
 * - veryFar   : 遠くに離れている・見送りなど（×0.60）
 */
export type CharaDistance = 'veryClose' | 'close' | 'normal' | 'far' | 'veryFar';

/** キャラクター表示ステップ */
export interface CharaStep {
  chara: {
    id: string;
    expr: string;
    pos: 'left' | 'center' | 'right';
    show?: boolean;
    hide?: boolean;
    /** 表示スケール倍率（省略時 1.0）。distance と併用した場合は distance 優先 */
    scale?: number;
    /** 距離感プリセット（指定すると scale より優先される） */
    distance?: CharaDistance;
    /**
     * 縦位置（0.0=画面上端に画像の上端を合わせる, 1.0=画面下端に画像の下端を合わせる）
     * 省略時は 1.0（下固定・通常キャラの立ち絵向け）
     */
    y?: number;
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
    value?: number;
    next?: string;
  }>;
  prompt?: string;
}

/** シナリオ間ジャンプステップ（選択肢なしで別シナリオへ移動） */
export interface JumpStep {
  jump: string;
}

/** シナリオのひとつのステップ */
export type ScenarioStep = BgStep | BgmStep | SeStep | EffectStep | CharaStep | TextStep | ChoiceStep | JumpStep;

/** キャラクター表示状態 */
interface CharaState {
  id: string;
  expr: string;
  pos: 'left' | 'center' | 'right';
  color: string;
  /** 目標スケール（distance または scale から解決済み） */
  scale: number;
  /** 補間中の現在スケール（毎フレーム scale へ近づく） */
  currentScale: number;
  /** 縦位置 (0〜1, 省略時 1.0) */
  y: number;
}

/** キャラクターIDに対応するプレースホルダ色 */
const CHARA_COLORS: Record<string, string> = {
  akari: '#ff8fb1',
  mio: '#4a90e2',
  suzu: '#5ec76a',
  himari: '#ffaa33',
  yukari: '#9c6bd8',
  mashiro: '#dce8ff',
  default: '#ffd234'
};

/** 距離感プリセット → スケール倍率 */
const DISTANCE_SCALE: Record<CharaDistance, number> = {
  veryClose: 1.35,
  close:     1.15,
  normal:    1.0,
  far:       0.80,
  veryFar:   0.60,
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
  private choiceButtons: Array<{ label: string; x: number; y: number; w: number; h: number; flag?: string; value?: number; next?: string }> = [];

  /** 選択肢待機中フラグ */
  private awaitingChoice = false;

  /** シナリオ終了コールバック */
  private endCallback: (() => void) | null = null;

  /** start()が返すPromiseのresolve */
  private resolveStart: (() => void) | null = null;

  /** アニメーションフレームID */
  private rafId: number | null = null;

  /** 読み込み済みキャラ画像キャッシュ（キー: "${id}_${expr}"） */
  private charaImageCache: Map<string, HTMLImageElement> = new Map();

  /** 現在の背景画像（読み込み済みの場合のみ） */
  private bgImage: HTMLImageElement | null = null;
  /** 現在ロード中 or 表示中の背景キー（リサイズ後の再ロード用） */
  private currentBgKey: string | null = null;

  /** クリック/スペースキーのイベントリスナー（後でremoveするため保持） */
  private boundClick: (e: MouseEvent) => void;
  private boundKey: (e: KeyboardEvent) => void;
  /** resizeリスナー（後でremoveするため保持） */
  private boundResize: () => void;
  private boundViewportResize: () => void;

  // ---------- Feature additions ----------

  /** ログ: 表示済みテキスト行の履歴 */
  private logEntries: Array<{ name: string; body: string }> = [];

  /** 暗転フラグ（blackout エフェクト中は true）*/
  private blackoutActive = false;
  private blackoutTimer: ReturnType<typeof setTimeout> | null = null;

  /** スキップモード: 既読行を自動スキップ */
  private isSkipping = false;

  /** 早送りモード: テキスト即表示・自動進行 */
  private isFastForward = false;

  /** オートモード: テキスト表示後2.5秒で自動進行 */
  private isAutoMode = false;

  /** 自動進行タイマー */
  private autoAdvanceTimer: ReturnType<typeof setTimeout> | null = null;

  /** セーブ用シナリオID */
  private currentScenarioId = '';

  /** セーブ用BGMキー */
  private currentBgmKey: string | null = null;

  /** 選択肢表示時に使う直前セリフのコンテキスト（選択肢と一緒にテキスト欄に表示） */
  private choiceContextName = '';
  private choiceContextBody = '';
  /** 選択肢の生データ（キャンバスリサイズ時にレイアウトを再計算するために保持） */
  private rawChoices: Array<{ label: string; flag?: string; value?: number; next?: string }> = [];

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
    // 初回はブラウザのレイアウト確定後に実行する（getBoundingClientRect が 0 を返すのを防ぐ）
    requestAnimationFrame(() => this.resizeCanvas());

    this.boundResize = () => this.resizeCanvas();
    this.boundViewportResize = () => this.resizeCanvas();
    window.addEventListener('resize', this.boundResize);
    // iOS Safari のアドレスバー表示切替など visualViewport 変化にも対応
    window.visualViewport?.addEventListener('resize', this.boundViewportResize);

    this.boundClick = (e: MouseEvent) => this.handleClick(e);
    this.boundKey = (e: KeyboardEvent) => this.handleKey(e);
    this.canvas.addEventListener('click', this.boundClick);
    window.addEventListener('keydown', this.boundKey);
  }

  // ---------- Public API ----------

  /** シナリオIDをセットする（セーブ用） */
  setScenarioId(id: string): void { this.currentScenarioId = id; }

  /**
   * スキップモード（次の選択肢 or シナリオ終了まで自動で飛ばす）のON/OFF。
   * true にした瞬間、現在のテキスト待機・タイプライタ中であっても即進行する。
   */
  setSkipMode(v: boolean): void {
    this.isSkipping = v;
    if (v) {
      this.isFastForward = false;
      this.isAutoMode = false;
      if (this.autoAdvanceTimer !== null) { clearTimeout(this.autoAdvanceTimer); this.autoAdvanceTimer = null; }
      if (this.typewriterTimer !== null) { clearTimeout(this.typewriterTimer); this.typewriterTimer = null; }
      this.isTyping = false;
      // 現在テキスト待機中なら即スキップ開始
      if (!this.awaitingChoice && this.targetText) {
        this.targetText = '';
        this.displayedText = '';
        this.advanceStep();
      }
    }
  }

  /** 早送りモード（テキスト即表示・自動進行）のON/OFF */
  setFastForward(v: boolean): void {
    this.isFastForward = v;
    if (v) {
      this.isAutoMode = false;
      // 現在タイプライタ中なら即完了してスケジュール
      if (this.isTyping) {
        this.finishTyping();
      } else if (this.targetText && !this.awaitingChoice) {
        // テキスト表示済みで待機中なら即自動進行
        this.scheduleAutoAdvance(80);
      }
    } else {
      // OFFにしたときはタイマーをキャンセル
      if (this.autoAdvanceTimer !== null) {
        clearTimeout(this.autoAdvanceTimer);
        this.autoAdvanceTimer = null;
      }
      // 早送り中の高速な BGM 切替で play() が中断されて停止したままに
      // なることがあるため、現在の BGM を再アサートして確実に再生させる。
      this.ensureBgmPlaying();
    }
  }

  /**
   * 現在ステップに対応する BGM が確実に鳴っている状態にする。
   * BgmManager.play は同一曲なら一時停止中のみ再開する（再生中は音量更新のみ）。
   * currentBgmKey が null（演出上の無音）のときは何もしないため、意図した無音は保たれる。
   */
  private ensureBgmPlaying(): void {
    if (this.currentBgmKey) {
      BgmManager.play(this.currentBgmKey);
    }
  }

  /** オートモード（テキスト表示後2.5秒で自動進行）のON/OFF */
  setAutoMode(v: boolean): void {
    this.isAutoMode = v;
    if (v) {
      this.isFastForward = false;
      // テキスト表示済みで待機中なら即タイマー開始
      if (!this.isTyping && this.targetText && !this.awaitingChoice) {
        this.scheduleAutoAdvance(2500);
      }
    } else {
      if (this.autoAdvanceTimer !== null) {
        clearTimeout(this.autoAdvanceTimer);
        this.autoAdvanceTimer = null;
      }
    }
  }

  /** 現在のログを返す */
  getLog(): Array<{ name: string; body: string }> {
    return [...this.logEntries];
  }

  /** セーブ用の状態スナップショットを返す */
  getState(): Omit<ScenarioSaveData, 'slot' | 'savedAt'> {
    // タイプライター演出の途中でセーブしても行全体を保存する（残りが欠落しないように）
    const fullText = this.isTyping ? this.targetText : this.displayedText;
    return {
      scenarioId: this.currentScenarioId,
      stepIndex: this.stepIndex,
      bgKey: this.currentBgKey,
      bgmKey: this.currentBgmKey,
      characters: this.characters.map(c => ({
        id: c.id, expr: c.expr, pos: c.pos, scale: c.scale, y: c.y
      })),
      currentName: this.currentName,
      displayedText: fullText,
      flags: { ...this.context.flags },
      readLines: [...this.context.readLines],
      previewText: (fullText || this.currentName || '').slice(0, 40),
      // 選択肢表示中のセーブに対応：選択肢内容を保持してロード時に復元できるようにする
      awaitingChoice: this.awaitingChoice || undefined,
      pendingChoices: this.awaitingChoice
        ? this.choiceButtons.map(b => ({ label: b.label, flag: b.flag, value: b.value, next: b.next }))
        : undefined,
      choiceContextName: this.awaitingChoice ? this.choiceContextName : undefined,
      choiceContextBody: this.awaitingChoice ? this.choiceContextBody : undefined,
    };
  }

  /** セーブデータから状態を復元する（steps は外部でロード済みのもの） */
  restoreState(state: Omit<ScenarioSaveData, 'slot' | 'savedAt' | 'previewText' | 'scenarioId'>): void {
    // Cancel any pending timers
    if (this.typewriterTimer !== null) { clearTimeout(this.typewriterTimer); this.typewriterTimer = null; }
    if (this.autoAdvanceTimer !== null) { clearTimeout(this.autoAdvanceTimer); this.autoAdvanceTimer = null; }

    this.stepIndex = state.stepIndex;
    this.currentBgmKey = state.bgmKey;
    this.currentName = state.currentName;
    this.targetText = state.displayedText;
    this.displayedText = state.displayedText;
    this.isTyping = false;
    this.choiceButtons = [];
    this.awaitingChoice = false;

    // Restore bg
    if (state.bgKey) {
      this.loadBgImage(state.bgKey);
    } else {
      this.bgImage = null;
      this.currentBgKey = null;
    }

    // Restore bgm（音量は BgmManager のデフォルト値 = SaveStore.bgmVolume を使用）
    if (state.bgmKey) {
      BgmManager.play(state.bgmKey);
    } else {
      // セーブ時点でBGMなし → 完全停止（forceStop: currentKey もリセット）
      BgmManager.forceStop();
    }

    // Restore characters（currentScale はセーブに無いため scale に揃えて即時表示）
    this.characters = state.characters.map(ch => ({
      ...ch,
      color: (CHARA_COLORS as Record<string, string>)[ch.id] ?? CHARA_COLORS['default']!,
      currentScale: ch.scale
    }));

    // Preload character images
    for (const ch of this.characters) {
      const key = `${ch.id}_${ch.expr}`;
      if (!this.charaImageCache.has(key)) {
        const img = new Image();
        img.src = `${import.meta.env.BASE_URL}assets/chara/${key}.png`;
        img.onload = () => this.charaImageCache.set(key, img);
      }
    }

    // Restore context
    this.context.flags = { ...state.flags };
    this.context.readLines = new Set(state.readLines);

    // 選択肢コンテキストを復元
    this.choiceContextName = state.choiceContextName ?? '';
    this.choiceContextBody = state.choiceContextBody ?? '';

    // 選択肢待機中のセーブを復元：rawChoices を保持 + レイアウトを構築
    // （canvasサイズが未確定の場合は resizeCanvas() が確定後に再計算する）
    if (state.awaitingChoice && state.pendingChoices && state.pendingChoices.length > 0) {
      this.awaitingChoice = true;
      this.rawChoices = state.pendingChoices;
      this.buildChoiceLayout();
    }
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
    this.rawChoices = [];
    this.choiceContextName = '';
    this.choiceContextBody = '';
    this.logEntries = [];
    this.isSkipping = false;
    this.isFastForward = false;
    this.isAutoMode = false;
    if (this.autoAdvanceTimer !== null) { clearTimeout(this.autoAdvanceTimer); this.autoAdvanceTimer = null; }
    if (this.blackoutTimer !== null) { clearTimeout(this.blackoutTimer); this.blackoutTimer = null; }
    this.blackoutActive = false;
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
   * restoreState() 後に呼び出す。advanceStepを呼ばずにレンダーループのみ開始する。
   */
  startFromRestored(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.resolveStart = resolve;
      this.startRenderLoop();
      // Don't call advanceStep - wait for user click to advance
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
    BgmManager.stop();
  }

  /**
   * シナリオを強制終了する（デバッグ用）。
   */
  forceEnd(): void {
    this.endScenario();
  }

  /**
   * リソースを解放してCanvasをコンテナから削除する。
   * BGM は停止しない。次のシーンの play() 呼び出しで自動切り替え or 継続する。
   * 同じ BGM を使う隣接シーン間で曲が頭から再スタートするのを防ぐためのポリシー。
   */
  destroy(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    if (this.typewriterTimer !== null) clearTimeout(this.typewriterTimer);
    if (this.autoAdvanceTimer !== null) clearTimeout(this.autoAdvanceTimer);
    if (this.blackoutTimer !== null) clearTimeout(this.blackoutTimer);
    // stopBgm() を呼ばない — BGM継続ポリシーのため
    this.canvas.removeEventListener('click', this.boundClick);
    window.removeEventListener('keydown', this.boundKey);
    window.removeEventListener('resize', this.boundResize);
    window.visualViewport?.removeEventListener('resize', this.boundViewportResize);
    if (this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
  }

  // ---------- プライベートメソッド ----------

  private resizeCanvas(): void {
    // getBoundingClientRect が 0 を返す場合（モバイルの初回レイアウト等）に備え
    // container → visualViewport → innerWidth/Height の順でフォールバック
    const rect = this.container.getBoundingClientRect();
    const vp = window.visualViewport;
    const w = rect.width  || vp?.width  || window.innerWidth;
    const h = rect.height || vp?.height || window.innerHeight;
    this.canvas.width  = Math.max(w, 320);
    this.canvas.height = Math.max(h, 240);
    // キャンバスサイズが変わると描画がリセットされるため背景を再ロードする
    if (this.currentBgKey) {
      this.loadBgImage(this.currentBgKey);
    }
    // 選択肢待機中の場合、新しいキャンバスサイズでレイアウトを再計算する
    if (this.awaitingChoice && this.rawChoices.length > 0) {
      this.buildChoiceLayout();
    }
  }

  /** 背景画像をロードして bgImage にセットする */
  private loadBgImage(key: string): void {
    this.currentBgKey = key;
    this.bgImage = null;
    const img = new Image();
    img.onload = () => { this.bgImage = img; };
    img.onerror = () => {
      const fallback = new Image();
      fallback.onload = () => { this.bgImage = fallback; };
      fallback.src = `${import.meta.env.BASE_URL}assets/bg/${key}.jpg`;
    };
    img.src = `${import.meta.env.BASE_URL}assets/bg/${key}.png`;
  }

  private startRenderLoop(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    const tick = () => {
      this.render();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  /** 自動進行タイマーをセットする */
  private scheduleAutoAdvance(delay: number): void {
    if (this.autoAdvanceTimer !== null) clearTimeout(this.autoAdvanceTimer);
    this.autoAdvanceTimer = setTimeout(() => {
      this.autoAdvanceTimer = null;
      if (!this.awaitingChoice && this.targetText) {
        this.targetText = '';
        this.displayedText = '';
        this.advanceStep();
      }
    }, delay);
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
      if (step.bg === null) {
        this.bgColor = '#1a1a2e';
        this.bgImage = null;
        this.currentBgKey = null;
      } else {
        this.bgColor = this.filenameToColor(step.bg);
        this.loadBgImage(step.bg);
      }
      this.advanceStep();
    } else if ('bgm' in step) {
      if (step.bgm !== null) {
        this.currentBgmKey = step.bgm;
        BgmManager.play(step.bgm);
      } else {
        // {bgm: null} — 明示的に無音を指定 → forceStop（currentKey もリセット）
        this.currentBgmKey = null;
        BgmManager.forceStop();
      }
      this.advanceStep();
    } else if ('se' in step) {
      // スキップ中は SE を鳴らさない
      if (!this.isSkipping) {
        // playSeFile でファイル再生を試み、内部生成器にも登録があれば playSe を併用する
        playSeFile(step.se.src, step.se.volume, step.se.durationRatio);
        playSe(step.se.src);
      }
      this.advanceStep();
    } else if ('effect' in step) {
      if (this.isSkipping) {
        // スキップ中はエフェクト待機をスキップ
        this.advanceStep();
      } else if (step.effect.type === 'blackout') {
        // 画面を一瞬暗転させて duration 後に進む
        this.blackoutActive = true;
        this.blackoutTimer = setTimeout(() => {
          this.blackoutActive = false;
          this.blackoutTimer = null;
          this.advanceStep();
        }, step.effect.duration);
      } else {
        setTimeout(() => this.advanceStep(), step.effect.duration);
      }
    } else if ('chara' in step) {
      const c = step.chara;
      if (c.hide) {
        this.characters = this.characters.filter(ch => ch.id !== c.id);
        this.advanceStep();
      } else {
        const key = `${c.id}_${c.expr}`;
        if (this.charaImageCache.has(key)) {
          this.updateChara(c);
          this.advanceStep();
        } else {
          const img = new Image();
          img.onload = () => {
            this.charaImageCache.set(key, img);
            this.updateChara(c);
            this.advanceStep();
          };
          img.onerror = () => {
            this.advanceStep();
          };
          img.src = `${import.meta.env.BASE_URL}assets/chara/${key}.png`;
        }
      }
    } else if ('text' in step) {
      const lineId = (step as TextStep).id ?? `line_${this.stepIndex}`;
      const isRead = this.context.readLines.has(lineId);
      this.currentName = step.text.name;
      this.targetText = step.text.body;
      this.displayedText = '';
      this.choiceButtons = [];
      this.awaitingChoice = false;
      // 直前のセリフを選択肢コンテキストとして保持（選択肢表示時にテキスト欄に残す）
      this.choiceContextName = step.text.name;
      this.choiceContextBody = step.text.body;

      // スキップモード：既読・未読を問わずすべての行を飛ばす
      if (this.isSkipping) {
        if (!isRead) this.context.readLines.add(lineId);
        this.advanceStep();
        return;
      }

      // Add to log
      if (step.text.body) {
        this.logEntries.push({ name: step.text.name, body: step.text.body });
      }

      if (!isRead) this.context.readLines.add(lineId);

      if (this.isFastForward) {
        this.displayedText = this.targetText;
        this.isTyping = false;
        this.scheduleAutoAdvance(80);
      } else if (isRead) {
        this.displayedText = this.targetText;
        this.isTyping = false;
        if (this.isAutoMode) this.scheduleAutoAdvance(2500);
      } else {
        this.startTypewriter();
      }
    } else if ('choice' in step) {
      this.isSkipping = false;
      this.isFastForward = false;
      if (this.autoAdvanceTimer !== null) { clearTimeout(this.autoAdvanceTimer); this.autoAdvanceTimer = null; }
      this.rawChoices = step.choice;
      this.awaitingChoice = true;
      this.buildChoiceButtons(step.choice);
    } else if ('jump' in step) {
      this.jumpToScenario(step.jump);
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
        if (this.isAutoMode) this.scheduleAutoAdvance(2500);
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
    if (this.isFastForward) {
      this.scheduleAutoAdvance(80);
    } else if (this.isAutoMode) {
      this.scheduleAutoAdvance(2500);
    }
  }

  /** キャラクター状態を更新する */
  private updateChara(charaData: CharaStep['chara']): void {
    const existing = this.characters.find(c => c.id === charaData.id);
    const color = CHARA_COLORS[charaData.id] ?? CHARA_COLORS['default']!;
    // distance プリセットが指定されていれば優先、なければ scale（省略時 1.0）
    const targetScale = charaData.distance != null
      ? DISTANCE_SCALE[charaData.distance]
      : (charaData.scale ?? 1.0);
    const y = charaData.y ?? 1.0;
    if (existing) {
      existing.expr = charaData.expr;
      existing.pos = charaData.pos ?? existing.pos;
      existing.scale = targetScale;
      existing.y = y;
      // currentScale はそのまま保持して補間アニメーションを継続
    } else {
      // 初回登場時は currentScale = targetScale（アニメーションなし）
      this.characters.push({ id: charaData.id, expr: charaData.expr, pos: charaData.pos ?? 'center', color, scale: targetScale, currentScale: targetScale, y });
    }
  }

  /** 選択肢ボタンを構築する（rawChoices を保存して layout を計算） */
  private buildChoiceButtons(
    choices: Array<{ label: string; flag?: string; value?: number; next?: string }>
  ): void {
    this.rawChoices = choices;
    this.buildChoiceLayout();
  }

  /**
   * rawChoices から choiceButtons の座標を計算する。
   * canvas サイズ未確定時（ロード直後など）に 0 になるのを防ぐため、
   * resizeCanvas() からも呼び出されて再計算される。
   */
  private buildChoiceLayout(): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (w === 0 || h === 0 || this.rawChoices.length === 0) return;

    const textWinH = h * 0.26; // テキストウィンドウの高さ（render と合わせる）
    const availableH = h - textWinH;
    const bw = Math.min(w * 0.82, 520);
    const bh = 48;
    const gap = 12;
    const totalH = this.rawChoices.length * (bh + gap) - gap;
    // テキストウィンドウより上のエリアに中央配置
    const startY = (availableH - totalH) / 2;
    const startX = (w - bw) / 2;

    this.choiceButtons = this.rawChoices.map((c, i) => ({
      label: c.label,
      flag: c.flag,
      value: c.value,
      next: c.next,
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
            const delta = btn.value ?? 1;
            this.context.flags[btn.flag] = (this.context.flags[btn.flag] ?? 0) + delta;
          }
          this.awaitingChoice = false;
          this.choiceButtons = [];
          if (btn.next) {
            this.jumpToScenario(btn.next);
          } else {
            this.advanceStep();
          }
          return;
        }
      }
      return;
    }

    // Cancel auto-advance timer on manual click
    if (this.autoAdvanceTimer !== null) {
      clearTimeout(this.autoAdvanceTimer);
      this.autoAdvanceTimer = null;
    }
    // Stop FF/skip on manual click
    const wasAccelerating = this.isFastForward || this.isSkipping;
    this.isFastForward = false;
    this.isSkipping = false;
    // 早送り/スキップ解除時は BGM を再アサートして停止したままになるのを防ぐ
    if (wasAccelerating) this.ensureBgmPlaying();

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
        // Cancel auto-advance
        if (this.autoAdvanceTimer !== null) { clearTimeout(this.autoAdvanceTimer); this.autoAdvanceTimer = null; }
        const wasAccelerating = this.isFastForward || this.isSkipping;
        this.isFastForward = false;
        this.isSkipping = false;
        if (wasAccelerating) this.ensureBgmPlaying();
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

  /** 選択肢の next で指定されたシナリオに分岐する */
  private jumpToScenario(scenarioId: string): void {
    fetch(`${import.meta.env.BASE_URL}data/scenarios/${scenarioId}.json`)
      .then(r => r.json())
      .then((steps: ScenarioStep[]) => {
        this.steps = steps;
        this.stepIndex = 0;
        this.advanceStep();
      })
      .catch(() => {
        // 読み込み失敗時は次のステップへ
        this.advanceStep();
      });
  }

  /** シナリオ終了処理 */
  private endScenario(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    // Remove keydown listener immediately to prevent re-triggering endScenario via keypresses
    window.removeEventListener('keydown', this.boundKey);
    // stopBgm() を呼ばない — destroy() と同じBGM継続ポリシー
    // 次シーン（シナリオ→シナリオ含む）の play() が遷移を担う
    // Null out callbacks before calling to prevent double-fire if endScenario is somehow called again
    const cb = this.endCallback;
    const res = this.resolveStart;
    this.endCallback = null;
    this.resolveStart = null;
    if (cb) cb();
    if (res) res();
  }

  // ---------- 描画 ----------

  private render(): void {
    const w = this.canvas.width;
    const h = this.canvas.height;

    // 背景: 縦を画面高さに合わせてスケール、横は中央揃え（縦画面で横にはみ出す場合はクリップ）
    if (this.bgImage) {
      const iw = this.bgImage.naturalWidth;
      const ih = this.bgImage.naturalHeight;
      if (iw > 0 && ih > 0) {
        const scale = h / ih;
        const dw = iw * scale;
        const dh = h;
        const dx = (w - dw) / 2;
        this.ctx.drawImage(this.bgImage, dx, 0, dw, dh);
      }
    } else {
      const grad = this.ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, this.bgColor);
      grad.addColorStop(1, this.darkenColor(this.bgColor));
      this.ctx.fillStyle = grad;
      this.ctx.fillRect(0, 0, w, h);
    }

    // キャラクタープレースホルダ
    this.drawCharacters(w, h);

    // テキストウィンドウ: 通常テキスト表示中 or 選択肢表示中（直前のセリフをコンテキストとして表示）
    if (this.displayedText || this.targetText) {
      this.drawTextWindow(w, h, this.currentName, this.displayedText);
    } else if (this.awaitingChoice) {
      this.drawTextWindow(w, h, this.choiceContextName, this.choiceContextBody);
    }

    // 選択肢
    if (this.awaitingChoice) {
      this.drawChoices();
    }

    // クリックプロンプト（テキスト全文表示済み・非選択肢時）
    if (!this.isTyping && !this.awaitingChoice && this.targetText) {
      this.drawClickPrompt(w, h);
    }

    // 暗転オーバーレイ（blackout エフェクト中）
    if (this.blackoutActive) {
      this.ctx.fillStyle = '#000000';
      this.ctx.fillRect(0, 0, w, h);
    }
  }

  private drawCharacters(w: number, h: number): void {
    for (const chara of this.characters) {
      // スケールをターゲットへ向けて補間（~250ms でほぼ到達）
      const lerpSpeed = 0.12;
      chara.currentScale += (chara.scale - chara.currentScale) * lerpSpeed;

      let cx = w / 2;
      if (chara.pos === 'left') cx = w * 0.27;
      else if (chara.pos === 'right') cx = w * 0.73;

      const img = this.charaImageCache.get(`${chara.id}_${chara.expr}`);
      if (img) {
        // キャラ: 高さ85%・幅85%を基準にdistanceスケールを乗算。
        // ただし画面外へはみ出さないよう最終スケールを上限クランプ。
        const scaleByH = (h * 0.85) / img.naturalHeight;
        const scaleByW = (w * 0.85) / img.naturalWidth;
        const desired = Math.min(scaleByH, scaleByW) * chara.currentScale;
        const maxByH  = (h * 0.97) / img.naturalHeight;
        const maxByW  = (w * 0.97) / img.naturalWidth;
        const charaScale = Math.min(desired, maxByH, maxByW);
        const displayH = img.naturalHeight * charaScale;
        const displayW = img.naturalWidth * charaScale;
        // y: 0=上端基準, 1=下端基準（デフォルト1.0 = 画面下ぴったり）
        const spriteY = (h - displayH) * (chara.y ?? 1.0);
        this.ctx.drawImage(img, cx - displayW / 2, spriteY, displayW, displayH);
      } else {
        // 画像未ロード時のプレースホルダ（縦長の色付き矩形）
        const phW = Math.round(110 * chara.currentScale);
        const phH = Math.min(Math.round(h * 0.75 * chara.currentScale), Math.round(h * 0.97));
        const phX = cx - phW / 2;
        const phY = h - phH;
        this.ctx.fillStyle = chara.color + 'cc';
        this.ctx.fillRect(phX, phY, phW, phH);
        this.ctx.fillStyle = '#fff';
        this.ctx.font = 'bold 13px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'top';
        this.ctx.fillText(chara.id, cx, phY + 8);
      }
    }
  }

  private drawTextWindow(w: number, h: number, name: string, body: string): void {
    const winH = h * 0.26;
    const winY = h - winH; // 画面底辺ぴったり
    const padX = 20;
    const padY = 14;
    const namePlateH = 32;
    const namePlateW = 160;

    // テキストウィンドウ背景
    this.ctx.fillStyle = 'rgba(8, 10, 24, 0.82)';
    this.ctx.fillRect(0, winY, w, winH);

    // 上辺ライン
    this.ctx.strokeStyle = 'rgba(180, 160, 255, 0.5)';
    this.ctx.lineWidth = 1.5;
    this.ctx.beginPath();
    this.ctx.moveTo(0, winY);
    this.ctx.lineTo(w, winY);
    this.ctx.stroke();

    // 名前プレート（ウィンドウ上端左）
    if (name) {
      const found = this.characters.find(c => c.id !== '' && (name.includes(c.id) || c.id === name));
      const nameColor = found ? found.color + 'e0' : 'rgba(80, 40, 130, 0.92)';
      this.ctx.fillStyle = nameColor;
      this.roundRect(padX - 4, winY - namePlateH + 2, namePlateW, namePlateH, 6);
      this.ctx.fill();

      this.ctx.fillStyle = '#ffffff';
      this.ctx.font = 'bold 17px sans-serif';
      this.ctx.textAlign = 'left';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(name, padX + 6, winY - namePlateH / 2 + 2);
    }

    // 本文テキスト（折り返し）
    this.ctx.fillStyle = '#f4f0ff';
    this.ctx.font = '17px sans-serif';
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';
    this.wrapText(body, padX, winY + padY, w - padX * 2, 26);
  }

  /** 角丸矩形パスを作成 */
  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
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

  private drawChoices(): void {
    for (const btn of this.choiceButtons) {
      // ボタン背景
      this.ctx.fillStyle = 'rgba(40, 40, 80, 0.92)';
      this.ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
      this.ctx.strokeStyle = 'rgba(180, 150, 255, 0.8)';
      this.ctx.lineWidth = 1.5;
      this.ctx.strokeRect(btn.x, btn.y, btn.w, btn.h);

      // ボタンテキスト（幅に収まるようフォントサイズを動的調整）
      this.ctx.fillStyle = '#fff';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      const maxTextW = btn.w - 28;
      let fs = 16;
      this.ctx.font = `bold ${fs}px sans-serif`;
      while (fs > 10 && this.ctx.measureText(btn.label).width > maxTextW) {
        fs--;
        this.ctx.font = `bold ${fs}px sans-serif`;
      }
      this.ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2);
    }
  }

  private drawClickPrompt(w: number, h: number): void {
    const t = (Date.now() / 600) % 1;
    this.ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(t * Math.PI));
    this.ctx.fillStyle = '#ffd234';
    this.ctx.font = 'bold 18px sans-serif';
    this.ctx.textAlign = 'right';
    this.ctx.textBaseline = 'bottom';
    this.ctx.fillText('▼', w - 20, h - 14);
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
}
