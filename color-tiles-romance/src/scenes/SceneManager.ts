/**
 * SceneManager.ts
 * シーン遷移を管理するクラス。
 * 各シーンのマウント・アンマウントと、シーン間のデータ受け渡しを担当する。
 */

import { SaveStore } from '@/store/saveStore';
import { ProgressStore } from '@/store/progressStore';

const LINEAR_STAGES = [
  'ch00_tutorial',
  'ch00_tutorial2',
  'ch01_stage01', 'ch01_stage02', 'ch01_stage03',
  'ch02_stage01', 'ch02_stage02', 'ch02_stage03',
  'ch03_stage01', 'ch03_stage02', 'ch03_stage03',
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
  /** タイムボーナス */
  timeBonus: number;
  /** 最大コンボ数 */
  comboMax: number;
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

    const scene = new TitleScene(canvas, (choice) => {
      switch (choice) {
        case 'new':
          this.saveStore.reset();
          this.progressStore.resetScenarioContext();
          this.transition({ to: 'puzzle', stageId: LINEAR_STAGES[0] });
          break;
        case 'continue': {
          const next = this.getFirstUncompletedStage();
          this.transition(next
            ? { to: 'puzzle', stageId: next }
            : { to: 'stageSelect' }
          );
          break;
        }
        case 'stage':
          this.transition({ to: 'stageSelect' });
          break;
      }
    }, hasSave, hasSave);

    this.currentScene = scene;
    scene.start();
  }

  private async mountNovelScene(scenarioId: string): Promise<void> {
    const { NovelScene } = await import('@/scenes/NovelScene');

    const div = document.createElement('div');
    div.style.cssText = 'width:100%;height:100%;position:relative;';
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
      await this.transition({ to: 'stageSelect' });
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
      await this.transition({ to: 'stageSelect' });
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
            this.progressStore.markLineRead(`pre:${stageId}`);
            // BAD ルートが選ばれた場合はパズルを起動せずタイトルへ戻る（ch05_stage07のみ）
            if (stageId === 'ch05_stage07' && this.progressStore.getFlag('route_bad') > 0) {
              void this.transition({ to: 'title' });
            } else {
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
    wrapper.style.cssText = 'width:100%;height:100%;display:flex;flex-direction:column;align-items:center;background:#1c1f2a;';

    const hud = this.createPuzzleHud(wrapper);
    const canvas = document.createElement('canvas');
    // max-width:100% + height:auto でボードが画面幅を超えても縮小表示される
    // pointerToCell は getBoundingClientRect() でスケールを補正するので座標ずれなし
    canvas.style.cssText = 'margin:auto;display:block;max-width:100%;height:auto;';
    wrapper.appendChild(canvas);
    this.appContainer.appendChild(wrapper);

    const scene = new PuzzleScene(canvas, hud);

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
      await this.transition({ to: 'stageSelect' });
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
    div.style.cssText = 'width:100%;height:100%;position:relative;';
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
              : { to: 'stageSelect' }
            );
          });
        } else if (data.stageId === 'ch02_stage03' && data.cleared) {
          void this.mountNovelSceneWithCallback('ch02_final_flashback', () => {
            const next = this.getNextStage(data.stageId);
            void this.transition(next
              ? { to: 'puzzle', stageId: next }
              : { to: 'stageSelect' }
            );
          });
        } else if (data.stageId === 'ch03_stage03' && data.cleared) {
          void this.mountNovelSceneWithCallback('ch03_final_flashback', () => {
            const next = this.getNextStage(data.stageId);
            void this.transition(next
              ? { to: 'puzzle', stageId: next }
              : { to: 'stageSelect' }
            );
          });
        } else if (data.stageId === 'ch04_stage03' && data.cleared) {
          void this.mountNovelSceneWithCallback('ch04_final_flashback', () => {
            const next = this.getNextStage(data.stageId);
            void this.transition(next
              ? { to: 'puzzle', stageId: next }
              : { to: 'stageSelect' }
            );
          });
        } else {
          const next = this.getNextStage(data.stageId);
          void this.transition(next
            ? { to: 'puzzle', stageId: next }
            : { to: 'stageSelect' }
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
      this.currentScene = scene as unknown as import('@/scenes/NovelScene').NovelScene;
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
  private createPuzzleHud(parent: HTMLElement): {
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
      'font-size:60px;font-weight:900;',
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
          timeBonus: scene.engine.timer.remain * 10,
          comboMax: snap.maxCombo
        };
        if (stageDef.postScenario) {
          const sid = stageDef.postScenario
            .replace(/^scenarios\//, '')
            .replace(/\.json$/, '');
          void this.mountNovelSceneWithCallback(sid, () => {
            void this.transition({ to: 'result', resultData });
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
          timeBonus: 0,
          comboMax: snap.maxCombo
        };
        void this.transition({ to: 'result', resultData });
      }
    });
  }
}
