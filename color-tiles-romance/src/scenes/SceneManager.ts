/**
 * SceneManager.ts
 * シーン遷移を管理するクラス。
 * 各シーンのマウント・アンマウントと、シーン間のデータ受け渡しを担当する。
 */

import { SaveStore } from '@/store/saveStore';
import { ProgressStore } from '@/store/progressStore';
import { DebugMode } from '@/debug/DebugMode';
import { SceneSaveStore } from '@/store/sceneSaveStore';
import type { ScenarioSaveData } from '@/store/sceneSaveStore';

const LINEAR_STAGES = [
  'ch00_tutorial',
  'ch00_tutorial2',
  'ch01_stage01', 'ch01_stage02', 'ch01_stage03',
  'ch02_stage01', 'ch02_stage02', 'ch02_stage03',
  'ch03_stage01', 'ch03_stage02', 'ch03_stage03',
  'ch04_time_demo',
  'ch04_stage01', 'ch04_stage02', 'ch04_stage03',
  'ch05_stage01', 'ch05_stage02', 'ch05_stage03',
  'ch05_stage04', 'ch05_stage05', 'ch05_stage06', 'ch05_stage07',
] as const;

/** アプリ内のシーン種別 */
export type SceneType = 'title' | 'novel' | 'stageSelect' | 'puzzle' | 'result';

/** リザルトデータ */
export interface ResultData {
  /** ステージID */
  stageId: string;
  /** 最終スコア */
  score: number;
  /** レーティング */
  rating: 'S' | 'A' | 'B' | 'C';
  /** クリア成否 */
  cleared: boolean;
  /** タイムボーナス（時間制限なしステージは 0） */
  timeBonus: number;
  /** 最大コンボ数 */
  comboMax: number;
  /** 十字消し回数 */
  crossCount: number;
  /** T字消し回数 */
  tShapeCount: number;
}

/** シーン遷移リクエスト */
export interface SceneTransition {
  /** 遷移先シーン */
  to: SceneType;
  /** ステージID（puzzle / result シーン用） */
  stageId?: string;
  /** チャプターID（stageSelect / novel シーン用） */
  chapterId?: number;
  /** リザルトデータ（result シーン用） */
  resultData?: ResultData;
  /** シナリオID（novel シーン用） */
  scenarioId?: string;
}

/** 各シーンが実装するインターフェース */
interface ManagedScene {
  destroy(): void;
}

/**
 * アプリ全体のシーン遷移を管理するクラス。
 * appContainer の内容をクリアして各シーンを描画する。
 */
export class SceneManager {
  private appContainer: HTMLElement;
  /** セーブデータストア */
  saveStore: SaveStore;
  /** 進行状態ストア */
  progressStore: ProgressStore;
  /** 現在アクティブなシーン */
  private currentScene: ManagedScene | null = null;

  /**
   * @param appContainer シーンを描画するルートDOM要素
   */
  constructor(appContainer: HTMLElement) {
    this.appContainer = appContainer;
    this.saveStore = new SaveStore();
    this.progressStore = new ProgressStore();
    if (DebugMode.isActive()) {
      this.buildDebugPanel();
    }
  }

  /**
   * アプリを起動してタイトル画面を表示する。
   */
  async start(): Promise<void> {
    await this.transition({ to: 'title' });
  }

  /**
   * 指定されたシーンへ遷移する。
   * @param req 遷移リクエスト
   */
  async transition(req: SceneTransition): Promise<void> {
    // 現在のシーンを破棄
    if (this.currentScene) {
      this.currentScene.destroy();
      this.currentScene = null;
    }

    // コンテナをクリア
    this.appContainer.innerHTML = '';
    this.progressStore.setScene(req.to, req.stageId);

    switch (req.to) {
      case 'title':
        await this.mountTitleScene();
        break;
      case 'novel':
        await this.mountNovelScene(req.scenarioId ?? 'ch00_intro');
        break;
      case 'stageSelect':
        await this.mountStageSelectScene();
        break;
      case 'puzzle':
        await this.mountPuzzleScene(req.stageId ?? '');
        break;
      case 'result':
        if (req.resultData) {
          await this.mountResultScene(req.resultData);
        }
        break;
    }
  }

  // ---------- 線形進行ヘルパー ----------

  private getNextStage(currentId: string): string | null {
    const idx = (LINEAR_STAGES as readonly string[]).indexOf(currentId);
    if (idx === -1 || idx >= LINEAR_STAGES.length - 1) return null;
    return LINEAR_STAGES[idx + 1];
  }

  private getFirstUncompletedStage(): string | null {
    const records = this.saveStore.getData().stageRecords;
    for (const id of LINEAR_STAGES) {
      if (!records[id]?.cleared) return id;
    }
    return null;
  }

  // ---------- 各シーンのマウント ----------

  private async mountTitleScene(): Promise<void> {
    // 動的インポートで循環依存を回避
    const { TitleScene } = await import('@/scenes/TitleScene');

    const canvas = this.createFullCanvas();
    this.appContainer.appendChild(canvas);

    const hasSave = this.saveStore.getData().currentChapter > 0 ||
      Object.keys(this.saveStore.getData().stageRecords).length > 0;
    // ステージセレクトは5章真エンド（currentChapter >= 6）後に解放
    const trueEndSeen = this.saveStore.getData().currentChapter >= 6;
    // シナリオセーブが1件以上あればLOADボタンを有効化
    const hasSceneSave = SceneSaveStore.getAll().some(s => s !== null);

    const scene = new TitleScene(canvas, (choice) => {
      switch (choice) {
        case 'new':
          this.saveStore.reset();
          this.progressStore.resetScenarioContext();
          void this.transition({ to: 'puzzle', stageId: LINEAR_STAGES[0] });
          break;
        case 'continue': {
          const next = this.getFirstUncompletedStage();
          void this.transition(next
            ? { to: 'puzzle', stageId: next }
            : { to: 'title' }
          );
          break;
        }
        case 'load':
          this.showTitleLoadPanel();
          break;
        case 'stage':
          void this.transition({ to: 'stageSelect' });
          break;
      }
    }, hasSave, trueEndSeen, hasSceneSave);

    this.currentScene = scene;
    scene.start();
  }

  private async mountNovelScene(scenarioId: string): Promise<void> {
    const { NovelScene } = await import('@/scenes/NovelScene');

    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;';
    this.appContainer.appendChild(div);

    const scene = new NovelScene(
      div,
      scenarioId,
      this.progressStore.scenarioContext,
      () => {
        // 導入シナリオ終了後は最初のステージへ
        this.transition({ to: 'puzzle', stageId: LINEAR_STAGES[0] });
      }
    );

    this.currentScene = scene;
    await scene.start();
  }

  private async mountStageSelectScene(): Promise<void> {
    const { StageSelectScene } = await import('@/scenes/StageSelectScene');

    const canvas = this.createFullCanvas();
    this.appContainer.appendChild(canvas);

    const scene = new StageSelectScene(
      canvas,
      this.saveStore,
      (stageId) => {
        this.transition({ to: 'puzzle', stageId });
      },
      () => {
        this.transition({ to: 'title' });
      }
    );

    this.currentScene = scene;
    scene.start();
  }

  private async mountPuzzleScene(stageId: string): Promise<void> {
    if (!stageId) {
      await this.transition({ to: 'title' });
      return;
    }

    // ステージ定義を先にロードしてpreScenarioを確認する
    let stageDef: import('@/types').StageDefinition;
    try {
      const url = `${import.meta.env.BASE_URL}data/stages/${stageId}.json`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to load stage: ${stageId}`);
      stageDef = await res.json() as import('@/types').StageDefinition;
    } catch (e) {
      console.error('[SceneManager] stage load error:', e);
      await this.transition({ to: 'title' });
      return;
    }

    // preScenarioが指定されており未プレイの場合は先にシナリオを表示する
    if (stageDef.preScenario) {
      const scenarioId = stageDef.preScenario.replace(/^scenarios\//, '').replace(/\.json$/, '');
      const alreadyRead = this.progressStore.isRead(`pre:${stageId}`);
      if (!alreadyRead) {
        // シナリオ終了後にパズルを起動する
        await this.mountNovelSceneWithCallback(
          scenarioId,
          () => {
            // BAD ルートが選ばれた場合はパズルを起動せずタイトルへ戻る
            if (this.progressStore.getFlag('route_bad') > 0) {
              // BADエンド後にCONTINUEで選び直せるようルートフラグをリセット。
              // markLineRead を呼ばないことで、次回 CONTINUE 時に再び選択肢が表示される。
              this.progressStore.resetFlags();
              void this.transition({ to: 'title' });
            } else {
              // GOOD ルート：既読マークしてパズルを起動
              this.progressStore.markLineRead(`pre:${stageId}`);
              void this.launchPuzzleWithDef(stageDef);
            }
          }
        );
        return;
      }
    }

    await this.launchPuzzleWithDef(stageDef);
  }

  /** ステージ定義を受け取ってパズル画面を直接マウントする */
  private async launchPuzzleWithDef(stageDef: import('@/types').StageDefinition): Promise<void> {
    try {
    // 前のシーン（NovelScene など）のリソースをここで解放する
    if (this.currentScene) {
      this.currentScene.destroy();
      this.currentScene = null;
    }

    const { PuzzleScene } = await import('@/scenes/PuzzleScene');
    const { StageValidator } = await import('@/core/StageValidator');

    // tilesLayout が無く generationParams がある場合は自動生成する
    if (!stageDef.tilesLayout && stageDef.generationParams) {
      const { StageGenerator } = await import('@/core/StageGenerator');
      stageDef = {
        ...stageDef,
        tilesLayout: StageGenerator.generate(
          stageDef.boardWidth,
          stageDef.boardHeight,
          stageDef.generationParams
        )
      };
    }

    // コンテナをクリアして再構築
    this.appContainer.innerHTML = '';

    const wrapper = document.createElement('div');
    // position:relative + overflow:hidden でチュートリアルオーバーレイの絶対配置基準にする
    wrapper.style.cssText = 'position:relative;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;background:#1c1f2a;overflow:hidden;';

    const hud = this.createPuzzleHud(wrapper, () => {
      void this.transition({ to: 'puzzle', stageId: stageDef.id });
    });

    // キャンバスを flex で縦方向にも収める（高さが余ればセンタリング、足りなければ収縮）
    const canvasWrap = document.createElement('div');
    canvasWrap.style.cssText = 'flex:1;min-height:0;width:100%;display:flex;align-items:flex-start;justify-content:center;overflow:hidden;';
    const canvas = document.createElement('canvas');
    // max-width/max-height:100% でボードを canvasWrap 内に収める
    // pointerToCell は getBoundingClientRect() でスケールを補正するので座標ずれなし
    canvas.style.cssText = 'display:block;max-width:100%;max-height:100%;width:auto;height:auto;';
    canvasWrap.appendChild(canvas);
    wrapper.appendChild(canvasWrap);

    // チュートリアルダイアログ用 DOM
    // canvas の下ではなく wrapper 内の絶対配置オーバーレイとして配置する。
    // これにより HUD + タイマー + キャンバスの合計が画面高さを超えても
    // テキスト枠は常にビューポート内（画面下端）に表示される。
    // force_match ステップ中は display:none なのでタイル操作を妨げない。
    const tutorialDiv = document.createElement('div');
    tutorialDiv.style.cssText = [
      // position:fixed でビジュアルビューポート（Safari ツールバーの上）を基準に配置する。
      // position:absolute だと Safari ナビゲーションバーの裏に隠れてしまうため fixed が必須。
      'position:fixed',
      'bottom:0',
      // left:50% + translateX(-50%) で中央寄せ、max-width で幅制限（wide screen 対応）
      'left:50%',
      'transform:translateX(-50%)',
      'width:100%',
      'max-width:640px',
      // 上端から 45vh まで拡張可能。コンテンツが溢れたらスクロール可能にする（iPhone 対応）
      'max-height:45vh',
      'overflow-y:auto',
      '-webkit-overflow-scrolling:touch',
      // iPhone home indicator（safe-area-inset-bottom）分だけ底辺に余白を取る
      'padding:8px 8px calc(8px + env(safe-area-inset-bottom, 0px)) 8px',
      'box-sizing:border-box',
      'z-index:100',
      'display:none',
    ].join(';');
    wrapper.appendChild(tutorialDiv);

    this.appContainer.appendChild(wrapper);

    const scene = new PuzzleScene(canvas, hud, tutorialDiv);

    // 解検証（24枚以下のみ）
    let count = 0;
    for (const row of stageDef.tilesLayout ?? []) {
      for (const cell of row) {
        if (cell !== null) count++;
      }
    }
    if (count <= 24 && !StageValidator.hasSolution(stageDef)) {
      console.warn(`[SceneManager] Stage ${stageDef.id} has no solution!`);
    }

    scene.loadStage(stageDef);
    this.progressStore.currentStageId = stageDef.id;
    this.currentScene = scene;

    // クリア/ゲームオーバーイベントを監視してリザルト画面へ遷移する
    this.watchPuzzleEnd(scene, stageDef);
    } catch (e) {
      console.error('[SceneManager] launchPuzzleWithDef failed:', e);
      await this.transition({ to: 'title' });
    }
  }

  /** シナリオ終了後にコールバックを呼ぶ一時的なノベル画面マウント */
  private async mountNovelSceneWithCallback(scenarioId: string, onEnd: () => void): Promise<void> {
    const { NovelScene } = await import('@/scenes/NovelScene');

    // 前のシーン（PuzzleScene など）の BGM とリソースを明示的に解放する
    this.currentScene?.destroy();
    this.currentScene = null;
    this.appContainer.innerHTML = '';
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;';
    this.appContainer.appendChild(div);

    const scene = new NovelScene(
      div,
      scenarioId,
      this.progressStore.scenarioContext,
      onEnd
    );
    this.currentScene = scene;
    await scene.start();
  }

  private async mountResultScene(data: ResultData): Promise<void> {
    const { ResultScene } = await import('@/scenes/ResultScene');

    const canvas = this.createFullCanvas();
    this.appContainer.appendChild(canvas);

    // セーブ記録更新
    this.saveStore.setRecord(data.stageId, {
      bestScore: data.score,
      bestRating: data.rating,
      cleared: data.cleared
    });

    // 章末ステージをクリアしたときに currentChapter を進める
    if (data.cleared) {
      const CHAPTER_LAST_STAGES: Record<string, number> = {
        'ch00_tutorial2': 1,
        'ch01_stage03': 2,
        'ch02_stage03': 3,
        'ch03_stage03': 4,
        'ch04_stage03': 5,
        'ch05_stage07': 6,
      };
      const nextChapter = CHAPTER_LAST_STAGES[data.stageId];
      if (nextChapter !== undefined) {
        const current = this.saveStore.getData().currentChapter;
        if (nextChapter > current) {
          this.saveStore.setCurrentChapter(nextChapter);
        }
      }
    }

    const scene = new ResultScene(
      canvas,
      data,
      () => {
        // リトライ
        this.transition({ to: 'puzzle', stageId: data.stageId });
      },
      () => {
        // 最終ステージクリアならエンディングシーケンスへ
        if (data.stageId === 'ch05_stage07' && data.cleared) {
          void this.mountNovelSceneWithCallback('ch05_final_flashback', () => {
            void this.mountNovelSceneWithCallback('epilogue_true', () => {
              this.mountEndRoll();
            });
          });
        } else if (data.stageId === 'ch01_stage03' && data.cleared) {
          void this.mountNovelSceneWithCallback('ch01_final_flashback', () => {
            const next = this.getNextStage(data.stageId);
            void this.transition(next
              ? { to: 'puzzle', stageId: next }
              : { to: 'title' }
            );
          });
        } else if (data.stageId === 'ch02_stage03' && data.cleared) {
          void this.mountNovelSceneWithCallback('ch02_final_flashback', () => {
            const next = this.getNextStage(data.stageId);
            void this.transition(next
              ? { to: 'puzzle', stageId: next }
              : { to: 'title' }
            );
          });
        } else if (data.stageId === 'ch03_stage03' && data.cleared) {
          void this.mountNovelSceneWithCallback('ch03_final_flashback', () => {
            const next = this.getNextStage(data.stageId);
            void this.transition(next
              ? { to: 'puzzle', stageId: next }
              : { to: 'title' }
            );
          });
        } else if (data.stageId === 'ch04_stage03' && data.cleared) {
          void this.mountNovelSceneWithCallback('ch04_final_flashback', () => {
            const next = this.getNextStage(data.stageId);
            void this.transition(next
              ? { to: 'puzzle', stageId: next }
              : { to: 'title' }
            );
          });
        } else {
          const next = this.getNextStage(data.stageId);
          void this.transition(next
            ? { to: 'puzzle', stageId: next }
            : { to: 'title' }
          );
        }
      },
      () => {
        this.transition({ to: 'title' });
      }
    );

    this.currentScene = scene;
    scene.start();
  }

  /** エンドロールを表示してタイトルへ */
  private mountEndRoll(): void {
    this.appContainer.innerHTML = '';
    const canvas = this.createFullCanvas();
    this.appContainer.appendChild(canvas);
    import('@/scenes/EndRollScene').then(({ EndRollScene }) => {
      const scene = new EndRollScene(canvas, () => {
        void this.transition({ to: 'title' });
      });
      this.currentScene = scene;
      scene.start();
    });
  }

  // ---------- ヘルパー ----------

  /** ウィンドウサイズに合わせたCanvasを作成する */
  private createFullCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = this.appContainer.clientWidth || window.innerWidth;
    canvas.height = this.appContainer.clientHeight || window.innerHeight;
    canvas.style.cssText = 'width:100%;height:100%;display:block;';
    return canvas;
  }

  /** パズルシーンのHUD要素を作成する */
  private createPuzzleHud(parent: HTMLElement, onRetry?: () => void): {
    timer: HTMLElement;
    score: HTMLElement;
    combo: HTMLElement;
    hint: HTMLElement;
    status: HTMLElement;
  } {
    // スコア等ステータスバーを上部に配置
    const hudBar = document.createElement('div');
    hudBar.style.cssText = 'display:flex;gap:16px;padding:4px 16px;background:#1a1d2e;width:100%;box-sizing:border-box;align-items:center;color:#fff;font-family:monospace;font-size:13px;';

    const makeEl = (label: string, id: string) => {
      const span = document.createElement('span');
      span.style.cssText = 'display:inline-flex;gap:4px;align-items:center;';
      span.innerHTML = `<small style="color:#aaa;">${label}</small><strong id="${id}">--</strong>`;
      hudBar.appendChild(span);
      return span.querySelector('strong') as HTMLElement;
    };

    const score = makeEl('SCORE', 'hud-score-sm');
    const combo = makeEl('COMBO', 'hud-combo-sm');
    const hint = makeEl('HINT', 'hud-hint-sm');
    const status = makeEl('', 'hud-status-sm');
    status.style.marginLeft = 'auto';

    // リトライボタン（右端）
    if (onRetry) {
      const retryBtn = document.createElement('button');
      retryBtn.textContent = '↺ リトライ';
      retryBtn.style.cssText = [
        'margin-left:auto',
        'background:rgba(160,60,60,0.75)',
        'color:#fff',
        'border:1px solid rgba(255,120,120,0.5)',
        'border-radius:4px',
        'padding:2px 10px',
        'font-size:12px',
        'cursor:pointer',
        'font-family:sans-serif',
      ].join(';');
      retryBtn.addEventListener('click', onRetry);
      hudBar.appendChild(retryBtn);
    }

    parent.appendChild(hudBar);

    // タイマーはパズルエリアの直上にPOPに表示
    const timerBar = document.createElement('div');
    timerBar.style.cssText = [
      'display:flex;justify-content:center;align-items:center;',
      'padding:8px 16px;',
      'background:linear-gradient(180deg,#1a1025 0%,#0f0c1e 100%);',
      'border-top:3px solid #ffb700;border-bottom:3px solid #ff6a00;',
      'box-shadow:0 0 24px #ffb70055,inset 0 0 32px #ff440022;',
      'width:100%;box-sizing:border-box;',
    ].join('');

    const timer = document.createElement('span');
    timer.id = 'hud-timer-sm';
    timer.style.cssText = [
      'font-family:"Courier New",monospace;',
      'font-size:clamp(36px, 12vw, 60px);font-weight:900;',
      'color:#ffe080;',
      'letter-spacing:8px;',
      'text-shadow:',
      '0 0 6px #fff,',
      '0 0 14px #ffcc00,',
      '0 0 28px #ff8800,',
      '0 0 48px #ff440088;',
      'line-height:1;',
    ].join('');
    timer.textContent = '--:--';
    timerBar.appendChild(timer);
    parent.appendChild(timerBar);

    return { timer, score, combo, hint, status };
  }

  /**
   * パズルエンジンのクリア/ゲームオーバーイベントを監視して、
   * リザルト画面へ遷移するハンドラを登録する。
   */
  private watchPuzzleEnd(
    scene: import('@/scenes/PuzzleScene').PuzzleScene,
    stageDef: import('@/types').StageDefinition
  ): void {
    const calcRating = (score: number): 'S' | 'A' | 'B' | 'C' =>
      score >= 5000 ? 'S' : score >= 3000 ? 'A' : score >= 1500 ? 'B' : 'C';

    scene.engine.on((e) => {
      if (e.type === 'cleared') {
        const snap = scene.engine.getScoreSnapshot();
        const score = snap.score;
        const resultData: ResultData = {
          stageId: stageDef.id,
          score,
          rating: calcRating(score),
          cleared: true,
          timeBonus: stageDef.timeLimitSec > 0 ? scene.engine.timer.remain * 10 : 0,
          comboMax: snap.maxCombo,
          crossCount: snap.crossCount,
          tShapeCount: snap.tShapeCount
        };
        // postScenario で BADエンドを選ぶとリザルト画面が表示されず saveStore.setRecord が
        // 呼ばれない。クリア状態を即時保存することでリロード後も再プレイが不要になる。
        this.saveStore.setRecord(stageDef.id, {
          bestScore: score,
          bestRating: calcRating(score),
          cleared: true
        });
        if (stageDef.postScenario) {
          const sid = stageDef.postScenario
            .replace(/^scenarios\//, '')
            .replace(/\.json$/, '');
          void this.mountNovelSceneWithCallback(sid, () => {
            // BAD ルートが選ばれた場合はリザルトを出さずタイトルへ戻る
            if (this.progressStore.getFlag('route_bad') > 0) {
              // BADエンド後にCONTINUEで選び直せるようルートフラグをリセット
              this.progressStore.resetFlags();
              void this.transition({ to: 'title' });
            } else {
              void this.transition({ to: 'result', resultData });
            }
          });
        } else {
          void this.transition({ to: 'result', resultData });
        }
      } else if (e.type === 'gameOver') {
        const snap = scene.engine.getScoreSnapshot();
        const score = snap.score;
        const resultData: ResultData = {
          stageId: stageDef.id,
          score,
          rating: calcRating(score),
          cleared: false,
          timeBonus: stageDef.timeLimitSec > 0 ? scene.engine.timer.remain * 10 : 0,
          comboMax: snap.maxCombo,
          crossCount: snap.crossCount,
          tShapeCount: snap.tShapeCount
        };
        void this.transition({ to: 'result', resultData });
      }
    });
  }

  /**
   * タイトル画面上にロードパネルを表示する。
   * シナリオセーブスロットを選択してシナリオを再開できる。
   */
  private showTitleLoadPanel(): void {
    const saves = SceneSaveStore.getAll();

    const overlay = document.createElement('div');
    overlay.style.cssText = [
      'position:fixed', 'inset:0',
      'background:rgba(0,0,0,0.78)',
      'z-index:200',
      'display:flex', 'align-items:center', 'justify-content:center',
      'font-family:sans-serif',
    ].join(';');

    const panel = document.createElement('div');
    panel.style.cssText = [
      'background:rgba(16,12,36,0.97)',
      'border:1px solid rgba(180,140,255,0.5)',
      'border-radius:10px',
      'padding:24px 24px 20px',
      'width:min(480px,90vw)',
      'color:#e0dcf0',
      'display:flex', 'flex-direction:column', 'gap:0',
    ].join(';');

    // ヘッダー
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;margin-bottom:16px;';
    const titleEl = document.createElement('span');
    titleEl.style.cssText = 'font-size:15px;font-weight:bold;flex:1;';
    titleEl.textContent = 'ロード';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕ 閉じる';
    closeBtn.style.cssText = [
      'background:rgba(20,20,40,0.78)',
      'color:#c8c0e8',
      'border:1px solid rgba(180,140,255,0.4)',
      'border-radius:4px',
      'padding:4px 10px',
      'font-size:12px',
      'cursor:pointer',
    ].join(';');
    closeBtn.addEventListener('click', () => overlay.remove());
    header.appendChild(titleEl);
    header.appendChild(closeBtn);
    panel.appendChild(header);

    // スロット一覧
    const slotsEl = document.createElement('div');
    slotsEl.style.cssText = 'display:flex;flex-direction:column;gap:10px;';

    for (let i = 0; i < 3; i++) {
      const save = saves[i];
      const slotEl = document.createElement('div');
      slotEl.style.cssText = [
        'display:flex', 'align-items:center', 'gap:12px',
        'padding:12px 16px',
        'background:rgba(40,30,70,0.7)',
        'border:1px solid rgba(180,140,255,0.3)',
        'border-radius:6px',
        save ? 'cursor:pointer' : 'cursor:default',
      ].join(';');

      if (save) {
        slotEl.innerHTML = `
          <div style="flex:1;">
            <div style="font-size:12px;color:#b49fff;margin-bottom:4px;">スロット ${i + 1}</div>
            <div style="font-size:13px;">${save.previewText || '(テキストなし)'}</div>
            <div style="font-size:11px;color:#888;margin-top:3px;">${new Date(save.savedAt).toLocaleString('ja-JP')}</div>
          </div>
          <span style="font-size:11px;color:#99c8ff;">▶ ロード</span>
        `;
        slotEl.addEventListener('click', () => {
          overlay.remove();
          void this.mountNovelSceneFromSave(save);
        });
        slotEl.addEventListener('mouseenter', () => {
          slotEl.style.background = 'rgba(60,45,100,0.85)';
        });
        slotEl.addEventListener('mouseleave', () => {
          slotEl.style.background = 'rgba(40,30,70,0.7)';
        });
      } else {
        slotEl.innerHTML = `<div style="flex:1;color:#666;">スロット ${i + 1} — 空き</div>`;
      }
      slotsEl.appendChild(slotEl);
    }

    panel.appendChild(slotsEl);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
  }

  /**
   * シナリオセーブデータからノベルシーンをロードして再開する。
   * ロードしたシナリオ終了後はタイトルへ戻る。
   */
  private async mountNovelSceneFromSave(save: ScenarioSaveData): Promise<void> {
    const { NovelScene } = await import('@/scenes/NovelScene');

    this.currentScene?.destroy();
    this.currentScene = null;
    this.appContainer.innerHTML = '';

    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;';
    this.appContainer.appendChild(div);

    const scene = new NovelScene(
      div,
      save.scenarioId,
      this.progressStore.scenarioContext,
      () => { void this.transition({ to: 'title' }); }
    );
    this.currentScene = scene;
    await scene.startFromSave(save);
  }

  /** デバッグパネルを document.body に生成する（?debug=1 専用） */
  private buildDebugPanel(): void {
    const ALL_SCENARIOS = [
      'intro_main', 'prologue_main', 'prologue_post', 'tutorial_intro',
      'ch00_tutorial_post', 'ch00_tutorial2_post',
      'ch01_s01_pre', 'ch01_s01_post', 'ch01_s02_pre', 'ch01_s02_post',
      'ch01_s03_pre', 'ch01_s03_pre_A', 'ch01_s03_pre_B', 'ch01_s03_pre_end', 'ch01_s03_post',
      'ch01_s04_pre', 'ch01_s04_post', 'ch01_s05_pre', 'ch01_s05_pre_A', 'ch01_s05_pre_B', 'ch01_s05_post',
      'ch01_final_flashback', 'ch01_end',
      'ch02_s01_pre', 'ch02_s01_post', 'ch02_s02_pre', 'ch02_s02_post',
      'ch02_s03_pre', 'ch02_s03_pre_A', 'ch02_s03_pre_B', 'ch02_s03_puzzle', 'ch02_s03_post',
      'ch02_s04_pre', 'ch02_s04_post', 'ch02_s05_pre', 'ch02_s05_pre_A', 'ch02_s05_pre_B',
      'ch02_final_flashback', 'ch02_end',
      'ch03_s01_pre', 'ch03_s01_post', 'ch03_s02_pre', 'ch03_s02_post',
      'ch03_s03_pre', 'ch03_s03_pre_A', 'ch03_s03_pre_B', 'ch03_s03_post',
      'ch03_s04_pre', 'ch03_s04_post', 'ch03_s05_pre', 'ch03_s05_pre_A', 'ch03_s05_pre_B',
      'ch03_s06_pre', 'ch03_final_flashback', 'ch03_end',
      'ch04_s01_pre', 'ch04_s01_pre2', 'ch04_s01_post', 'ch04_s02_pre', 'ch04_s02_post',
      'ch04_s03_pre', 'ch04_s03_pre_A', 'ch04_s03_pre_B', 'ch04_s03_post',
      'ch04_s04_pre', 'ch04_s04_post', 'ch04_s05_pre', 'ch04_s05_pre_A', 'ch04_s05_pre_B',
      'ch04_s06_pre', 'ch04_final_flashback', 'ch04_end',
      'ch05_s01_pre', 'ch05_s01_post', 'ch05_s02_pre', 'ch05_s02_post',
      'ch05_s03_pre', 'ch05_s03_post', 'ch05_s04_pre', 'ch05_s04_post',
      'ch05_s05_pre', 'ch05_s05_post', 'ch05_s06_pre', 'ch05_s06_post',
      'ch05_s07_pre', 'ch05_route_BAD', 'ch05_route_TRUE', 'ch05_final_flashback', 'ch05_end',
      'epilogue_true',
    ];
    const ALL_STAGES = [
      'ch00_prologue', 'ch00_tutorial', 'ch00_tutorial2',
      'ch01_stage01', 'ch01_stage02', 'ch01_stage03',
      'ch02_stage01', 'ch02_stage02', 'ch02_stage03',
      'ch03_ice_demo', 'ch03_stage01', 'ch03_stage02', 'ch03_stage03',
      'ch04_time_demo', 'ch04_stage01', 'ch04_stage02', 'ch04_stage03',
      'ch05_stage01', 'ch05_stage02', 'ch05_stage03',
      'ch05_stage04', 'ch05_stage05', 'ch05_stage06', 'ch05_stage07',
    ];

    // トグルボタン
    const toggle = document.createElement('button');
    toggle.textContent = '🐛';
    toggle.title = 'デバッグパネル（?debug=1）';
    toggle.style.cssText = [
      'position:fixed', 'top:4px', 'left:4px', 'z-index:9999',
      'background:rgba(200,50,50,0.85)', 'color:#fff',
      'border:none', 'border-radius:4px',
      'padding:4px 8px', 'font-size:16px', 'cursor:pointer',
      'line-height:1',
    ].join(';');
    document.body.appendChild(toggle);

    // パネル本体
    const panel = document.createElement('div');
    panel.style.cssText = [
      'position:fixed', 'top:36px', 'left:4px', 'z-index:9998',
      'width:260px', 'max-height:80vh',
      'background:rgba(16,12,32,0.97)', 'color:#e0dcf0',
      'border:1px solid rgba(200,80,80,0.5)', 'border-radius:8px',
      'font-family:monospace', 'font-size:11px',
      'display:none', 'flex-direction:column',
      'overflow:hidden',
    ].join(';');

    const headerStyle = 'padding:6px 10px;font-size:12px;font-weight:bold;color:#ff8888;border-bottom:1px solid rgba(200,80,80,0.3);flex-shrink:0;';
    const listStyle = 'flex:1;overflow-y:auto;padding:4px 0;';
    const itemStyle = 'display:block;width:100%;text-align:left;background:none;border:none;color:#ccc;padding:4px 12px;cursor:pointer;font-family:monospace;font-size:11px;';
    const itemHoverStyle = 'background:rgba(200,80,80,0.2);color:#fff;';

    const makeSection = (title: string, items: string[], onClick: (id: string) => void) => {
      const sec = document.createElement('div');
      sec.style.cssText = 'display:flex;flex-direction:column;min-height:0;flex-shrink:0;';
      const hdr = document.createElement('div');
      hdr.style.cssText = headerStyle;
      hdr.textContent = title;
      sec.appendChild(hdr);
      const list = document.createElement('div');
      list.style.cssText = listStyle + 'max-height:200px;';
      for (const id of items) {
        const btn = document.createElement('button');
        btn.style.cssText = itemStyle;
        btn.textContent = id;
        btn.addEventListener('mouseenter', () => { btn.style.cssText = itemStyle + itemHoverStyle; });
        btn.addEventListener('mouseleave', () => { btn.style.cssText = itemStyle; });
        btn.addEventListener('click', () => {
          panel.style.display = 'none';
          onClick(id);
        });
        list.appendChild(btn);
      }
      sec.appendChild(list);
      return sec;
    };

    // シナリオ終了後の遷移先マップ（null = タイトルへ、文字列 = そのステージを起動）
    const SCENARIO_AFTER: Record<string, string | null> = {
      // 序章・チュートリアル
      'intro_main':          'ch00_prologue',
      'prologue_main':       'ch00_tutorial',
      'prologue_post':       'ch00_tutorial',
      'tutorial_intro':      'ch00_tutorial',
      'ch00_tutorial_post':  'ch00_tutorial2',
      'ch00_tutorial2_post': 'ch01_stage01',
      // ch01
      'ch01_s01_pre': 'ch01_stage01',  'ch01_s01_post': 'ch01_stage02',
      'ch01_s02_pre': 'ch01_stage02',  'ch01_s02_post': 'ch01_stage03',
      'ch01_s03_pre': 'ch01_stage03',  'ch01_s03_pre_A': 'ch01_stage03',
      'ch01_s03_pre_B': 'ch01_stage03', 'ch01_s03_pre_end': 'ch01_stage03',
      'ch01_s03_post': 'ch02_stage01',
      'ch01_s04_pre': 'ch01_stage02',  'ch01_s04_post': 'ch01_stage03',
      'ch01_s05_pre': 'ch01_stage03',  'ch01_s05_pre_A': 'ch01_stage03',
      'ch01_s05_pre_B': 'ch01_stage03', 'ch01_s05_post': 'ch02_stage01',
      'ch01_final_flashback': 'ch02_stage01',
      'ch01_end': 'ch02_stage01',
      // ch02
      'ch02_s01_pre': 'ch02_stage01',  'ch02_s01_post': 'ch02_stage02',
      'ch02_s02_pre': 'ch02_stage02',  'ch02_s02_post': 'ch02_stage03',
      'ch02_s03_pre': 'ch02_stage03',  'ch02_s03_pre_A': 'ch02_stage03',
      'ch02_s03_pre_B': 'ch02_stage03', 'ch02_s03_puzzle': 'ch02_stage03',
      'ch02_s04_pre': 'ch02_stage02',  'ch02_s04_post': 'ch02_stage03',
      'ch02_s05_pre': 'ch02_stage03',  'ch02_s05_pre_A': 'ch02_stage03',
      'ch02_s05_pre_B': 'ch02_stage03',
      'ch02_final_flashback': 'ch03_stage01',
      'ch02_end': 'ch03_stage01',
      // ch03
      'ch03_s01_pre': 'ch03_stage01',  'ch03_s01_post': 'ch03_stage02',
      'ch03_s02_pre': 'ch03_stage02',  'ch03_s02_post': 'ch03_stage03',
      'ch03_s03_pre': 'ch03_stage03',  'ch03_s03_pre_A': 'ch03_stage03',
      'ch03_s03_pre_B': 'ch03_stage03', 'ch03_s03_post': 'ch04_time_demo',
      'ch03_s04_pre': 'ch03_stage02',  'ch03_s04_post': 'ch03_stage03',
      'ch03_s05_pre': 'ch03_stage03',  'ch03_s05_pre_A': 'ch03_stage03',
      'ch03_s05_pre_B': 'ch03_stage03', 'ch03_s06_pre': 'ch03_stage03',
      'ch03_final_flashback': 'ch04_time_demo',
      'ch03_end': 'ch04_time_demo',
      // ch04
      'ch04_s01_pre': 'ch04_time_demo', 'ch04_s01_pre2': 'ch04_stage01',
      'ch04_s01_post': 'ch04_stage02',
      'ch04_s02_pre': 'ch04_stage02',  'ch04_s02_post': 'ch04_stage03',
      'ch04_s03_pre': 'ch04_stage03',  'ch04_s03_pre_A': 'ch04_stage03',
      'ch04_s03_pre_B': 'ch04_stage03', 'ch04_s03_post': 'ch05_stage01',
      'ch04_s04_pre': 'ch04_stage02',  'ch04_s04_post': 'ch04_stage03',
      'ch04_s05_pre': 'ch04_stage03',  'ch04_s05_pre_A': 'ch04_stage03',
      'ch04_s05_pre_B': 'ch04_stage03', 'ch04_s06_pre': 'ch04_stage03',
      'ch04_final_flashback': 'ch05_stage01',
      'ch04_end': 'ch05_stage01',
      // ch05
      'ch05_s01_pre': 'ch05_stage01',  'ch05_s01_post': 'ch05_stage02',
      'ch05_s02_pre': 'ch05_stage02',  'ch05_s02_post': 'ch05_stage03',
      'ch05_s03_pre': 'ch05_stage03',  'ch05_s03_post': 'ch05_stage04',
      'ch05_s04_pre': 'ch05_stage04',  'ch05_s04_post': 'ch05_stage05',
      'ch05_s05_pre': 'ch05_stage05',  'ch05_s05_pre_A': 'ch05_stage05',
      'ch05_s05_pre_B': 'ch05_stage05', 'ch05_s05_post': 'ch05_stage06',
      'ch05_s06_pre': 'ch05_stage06',  'ch05_s06_post': 'ch05_stage07',
      'ch05_s07_pre': 'ch05_stage07',
      'ch05_route_BAD': null,           // BADエンド → タイトル
      'ch05_route_TRUE': 'ch05_stage07',
      'ch05_final_flashback': null,     // 真エンド後 → タイトル
      'ch05_end': null,
      'epilogue_true': null,
    };

    // デバッグ用シナリオ起動：終了後は次のステージへ直接遷移（preScenario 二重再生を防ぐため launchPuzzleWithDef を使用）
    panel.appendChild(makeSection('📖 SCENARIOS', ALL_SCENARIOS, (id) => {
      void this.mountNovelSceneWithCallback(id, () => {
        const nextStage = Object.prototype.hasOwnProperty.call(SCENARIO_AFTER, id)
          ? SCENARIO_AFTER[id]
          : undefined;
        if (nextStage != null && nextStage !== undefined) {
          // transition() を使うと次ステージの preScenario が再び再生されてしまうため、
          // STAGES パネルと同様に launchPuzzleWithDef で直接ステージを起動する。
          void (async () => {
            try {
              const url = `${import.meta.env.BASE_URL}data/stages/${nextStage}.json`;
              const res = await fetch(url);
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              const stageDef = await res.json() as import('@/types').StageDefinition;
              await this.launchPuzzleWithDef(stageDef);
            } catch (e) {
              console.error('[Debug] stage load failed after scenario:', nextStage, e);
              void this.transition({ to: 'title' });
            }
          })();
        } else {
          void this.transition({ to: 'title' });
        }
      });
    }));
    // デバッグ用ステージ起動：preScenario をスキップして直接ステージを開く
    panel.appendChild(makeSection('🎮 STAGES', ALL_STAGES, (id) => {
      void (async () => {
        try {
          const url = `${import.meta.env.BASE_URL}data/stages/${id}.json`;
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const stageDef = await res.json() as import('@/types').StageDefinition;
          await this.launchPuzzleWithDef(stageDef);
        } catch (e) {
          console.error('[Debug] stage load failed:', id, e);
        }
      })();
    }));

    document.body.appendChild(panel);

    toggle.addEventListener('click', () => {
      panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
    });
  }
}
