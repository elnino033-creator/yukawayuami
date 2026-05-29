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
import { BgmManager } from '@/audio/BgmManager';
import { soundEngine } from '@/core/SoundEngine';

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
  /** パズル後シナリオID（.json拡張子なし）。リザルト画面の「次へ」後に再生する */
  postScenario?: string;
  /** Sランク時のご褒美シナリオID（.json拡張子なし）。postScenario より先に再生する */
  rewardScenario?: string;
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
    // 保存済み設定を音量に反映する
    const settings = this.saveStore.getSettings();
    BgmManager.setVolume(settings.bgmVolume);
    soundEngine.setVolume(settings.seVolume);
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
        case 'settings':
          this.showSettingsPanel();
          break;
        case 'gallery':
          this.showGalleryPanel();
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
          },
          { role: 'pre', stageId }  // preScenario: セーブ後LOADでGOODルートならパズルへ
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

  /**
   * シナリオ終了後にコールバックを呼ぶ一時的なノベル画面マウント。
   * @param scenarioContinue タイトルLOADからのロード後の遷移先情報（セーブ用）
   *   - role === 'pre': preScenario → GOODルート後にパズルへ（既読マーク付き）
   *   - role === 'post': postScenario / flashback → GOODルート後に次ステージへ
   */
  private async mountNovelSceneWithCallback(
    scenarioId: string,
    onEnd: () => void,
    scenarioContinue?: { role: 'pre' | 'post'; stageId: string }
  ): Promise<void> {
    // モジュールを事前ロード（遷移アニメーション中に遅延しないよう）
    const [{ NovelScene }, { sceneTransition }] = await Promise.all([
      import('@/scenes/NovelScene'),
      import('@/effects/WipeTransition'),
    ]);

    // シナリオ ID から遷移タイプと SE を自動判定（優先度順）
    //  1. flashback / epilogue → cloud（夢幻的な白い雲）+ playDream()
    //  2. ch05_* / route_BAD   → dark（暗い curtain）   + playDark()
    //     ※ reward は ch05 でも wipe に統一（下記 isDark に !isReward を含む）
    //  3. それ以外（reward 含む）→ wipe（斜めカーテン）  + playWipe()
    const isFlashback = /flashback|epilogue/i.test(scenarioId);
    const isReward    = /reward/i.test(scenarioId);
    const isDark      = !isFlashback && !isReward &&
                        (/route_bad/i.test(scenarioId) || scenarioId.startsWith('ch05'));
    const transType   = isFlashback ? 'cloud' as const
                      : isDark      ? 'dark' as const
                      :               'wipe' as const;

    if (isFlashback) {
      soundEngine.playDream();
    } else if (isDark) {
      soundEngine.playDark();
    } else {
      soundEngine.playWipe();
    }

    // TypeScript CFA はコールバック内の変数代入を追跡できないため
    // オブジェクトのプロパティとして保持して型安全に取り出す
    const holder: { scene: InstanceType<typeof NovelScene> | null } = { scene: null };

    await sceneTransition(transType, () => {
      // 画面が完全に覆われたタイミングで旧シーンを破棄し、新シーンの DOM を用意する
      this.currentScene?.destroy();
      this.currentScene = null;
      this.appContainer.innerHTML = '';

      const div = document.createElement('div');
      div.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;';
      this.appContainer.appendChild(div);

      holder.scene = new NovelScene(
        div,
        scenarioId,
        this.progressStore.scenarioContext,
        onEnd
      );
      // シナリオ継続情報を NovelScene に伝える（セーブ時にセーブデータへ含める）
      if (scenarioContinue) {
        holder.scene.setScenarioContinue(scenarioContinue.role, scenarioContinue.stageId);
      }
    });

    // 遷移アニメーションが完全に抜けたらシーンを開始する
    const scene = holder.scene;
    if (scene !== null) {
      this.currentScene = scene;
      await scene.start();
    }
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
        // シナリオチェーン：rewardScenario(Sランク) → postScenario(BAD ENDチェック) → 次ステージ
        // ① 章末flashback / 次ステージへ進む
        const goNext = () => {
          if (data.stageId === 'ch05_stage07' && data.cleared) {
            // 真エンドルート: flashback → epilogue_true → endRoll（次ステージなし）
            void this.mountNovelSceneWithCallback('ch05_final_flashback', () => {
              void this.mountNovelSceneWithCallback('epilogue_true', () => {
                this.mountEndRoll();
              });
            });
          } else if (data.stageId === 'ch01_stage03' && data.cleared) {
            const next = this.getNextStage(data.stageId);
            void this.mountNovelSceneWithCallback('ch01_final_flashback', () => {
              void this.transition(next ? { to: 'puzzle', stageId: next } : { to: 'title' });
            }, next ? { role: 'post', stageId: next } : undefined);
          } else if (data.stageId === 'ch02_stage03' && data.cleared) {
            const next = this.getNextStage(data.stageId);
            void this.mountNovelSceneWithCallback('ch02_final_flashback', () => {
              void this.transition(next ? { to: 'puzzle', stageId: next } : { to: 'title' });
            }, next ? { role: 'post', stageId: next } : undefined);
          } else if (data.stageId === 'ch03_stage03' && data.cleared) {
            const next = this.getNextStage(data.stageId);
            void this.mountNovelSceneWithCallback('ch03_final_flashback', () => {
              void this.transition(next ? { to: 'puzzle', stageId: next } : { to: 'title' });
            }, next ? { role: 'post', stageId: next } : undefined);
          } else if (data.stageId === 'ch04_stage03' && data.cleared) {
            const next = this.getNextStage(data.stageId);
            void this.mountNovelSceneWithCallback('ch04_final_flashback', () => {
              void this.transition(next ? { to: 'puzzle', stageId: next } : { to: 'title' });
            }, next ? { role: 'post', stageId: next } : undefined);
          } else {
            const next = this.getNextStage(data.stageId);
            void this.transition(next ? { to: 'puzzle', stageId: next } : { to: 'title' });
          }
        };

        // ② postScenario（BAD ENDチェック付き）→ ① へ
        const afterReward = () => {
          if (data.postScenario && data.cleared) {
            // 次ステージID（goNext のフラッシュバックをスキップした最終遷移先）
            const postNext = this.getNextStage(data.stageId);
            void this.mountNovelSceneWithCallback(data.postScenario, () => {
              if (this.progressStore.getFlag('route_bad') > 0) {
                // BADエンド後にCONTINUEで選び直せるようフラグをリセット
                this.progressStore.resetFlags();
                void this.transition({ to: 'title' });
              } else {
                goNext();
              }
            }, postNext ? { role: 'post', stageId: postNext } : undefined);
          } else {
            goNext();
          }
        };

        // ③ rewardScenario（Sランクボーナス）→ ② → ① へ
        if (data.cleared && data.rating === 'S' && data.rewardScenario) {
          // ギャラリー解放のため閲覧済みとして記録
          this.saveStore.markRewardViewed(data.rewardScenario);
          // rewardScenario 中にセーブ→LOADした場合の遷移先（postScenario はスキップし次ステージへ）
          const rewardNext = this.getNextStage(data.stageId);
          void this.mountNovelSceneWithCallback(data.rewardScenario, () => {
            afterReward();
          }, rewardNext ? { role: 'post', stageId: rewardNext } : undefined);
        } else {
          afterReward();
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
          tShapeCount: snap.tShapeCount,
          // postScenario / rewardScenario はリザルト画面の「次へ」後に処理する
          postScenario: stageDef.postScenario?.replace(/^scenarios\//, '').replace(/\.json$/, ''),
          rewardScenario: stageDef.rewardScenario?.replace(/^scenarios\//, '').replace(/\.json$/, ''),
        };
        // BADエンドでリザルトを経由しない場合も cleared を保存するため即時セーブ
        this.saveStore.setRecord(stageDef.id, {
          bestScore: score,
          bestRating: calcRating(score),
          cleared: true
        });
        // クリア後は常にリザルト画面を先に表示する
        void this.transition({ to: 'result', resultData });
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
   * 設定パネルをタイトル画面上に表示する。
   * bgmVolume / seVolume / textSpeed / autoSave を変更して保存できる。
   */
  private showSettingsPanel(): void {
    const settings = this.saveStore.getSettings();

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
      'width:min(420px,90vw)',
      'color:#e0dcf0',
      'display:flex', 'flex-direction:column', 'gap:16px',
    ].join(';');

    // ヘッダー
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;';
    const titleEl = document.createElement('span');
    titleEl.style.cssText = 'font-size:15px;font-weight:bold;flex:1;letter-spacing:0.05em;';
    titleEl.textContent = '⚙ 設定';
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

    /** スライダー行を作成するヘルパー */
    const makeSliderRow = (
      label: string,
      initVal: number,
      onChange: (v: number) => void
    ): HTMLElement => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
      const labelRow = document.createElement('div');
      labelRow.style.cssText = 'display:flex;justify-content:space-between;font-size:13px;';
      const lbl = document.createElement('span');
      lbl.textContent = label;
      const valEl = document.createElement('span');
      valEl.style.color = '#b49fff';
      valEl.textContent = Math.round(initVal * 100) + '%';
      labelRow.appendChild(lbl);
      labelRow.appendChild(valEl);
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = '0';
      slider.max = '100';
      slider.value = String(Math.round(initVal * 100));
      slider.style.cssText = 'width:100%;accent-color:#9b70ff;cursor:pointer;';
      slider.addEventListener('input', () => {
        const v = Number(slider.value) / 100;
        valEl.textContent = Math.round(v * 100) + '%';
        onChange(v);
      });
      row.appendChild(labelRow);
      row.appendChild(slider);
      return row;
    };

    // BGM音量
    panel.appendChild(makeSliderRow('BGM音量', settings.bgmVolume, (v) => {
      this.saveStore.setSettings({ bgmVolume: v });
      BgmManager.setVolume(v);
    }));

    // SE音量
    panel.appendChild(makeSliderRow('SE音量', settings.seVolume, (v) => {
      this.saveStore.setSettings({ seVolume: v });
      soundEngine.setVolume(v);
      soundEngine.playClick();
    }));

    // テキスト速度
    const speedRow = document.createElement('div');
    speedRow.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
    const speedLabel = document.createElement('span');
    speedLabel.style.cssText = 'font-size:13px;';
    speedLabel.textContent = 'テキスト速度';
    const speedBtns = document.createElement('div');
    speedBtns.style.cssText = 'display:flex;gap:8px;';
    const speeds: Array<{ label: string; val: 'slow' | 'normal' | 'fast' }> = [
      { label: 'ゆっくり', val: 'slow' },
      { label: '標準', val: 'normal' },
      { label: '速い', val: 'fast' },
    ];
    const updateSpeedBtns = (current: string) => {
      speedBtns.querySelectorAll('button').forEach((btn) => {
        const b = btn as HTMLButtonElement;
        const active = b.dataset['val'] === current;
        b.style.background = active ? 'rgba(120,80,220,0.85)' : 'rgba(30,25,60,0.7)';
        b.style.borderColor = active ? 'rgba(180,140,255,0.9)' : 'rgba(180,140,255,0.3)';
        b.style.color = active ? '#fff' : '#b0a8d8';
      });
    };
    for (const s of speeds) {
      const btn = document.createElement('button');
      btn.dataset['val'] = s.val;
      btn.textContent = s.label;
      btn.style.cssText = [
        'flex:1', 'padding:6px 0', 'border-radius:4px',
        'border:1px solid rgba(180,140,255,0.3)',
        'font-size:12px', 'cursor:pointer', 'color:#b0a8d8',
        'background:rgba(30,25,60,0.7)',
      ].join(';');
      btn.addEventListener('click', () => {
        this.saveStore.setSettings({ textSpeed: s.val });
        updateSpeedBtns(s.val);
      });
      speedBtns.appendChild(btn);
    }
    updateSpeedBtns(settings.textSpeed);
    speedRow.appendChild(speedLabel);
    speedRow.appendChild(speedBtns);
    panel.appendChild(speedRow);

    // オートセーブ
    const autoRow = document.createElement('div');
    autoRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;font-size:13px;';
    const autoLabel = document.createElement('span');
    autoLabel.textContent = 'オートセーブ';
    const autoToggle = document.createElement('button');
    const updateAutoToggle = (on: boolean) => {
      autoToggle.textContent = on ? 'ON' : 'OFF';
      autoToggle.style.background = on ? 'rgba(60,180,100,0.8)' : 'rgba(160,50,50,0.7)';
      autoToggle.style.borderColor = on ? 'rgba(80,220,120,0.6)' : 'rgba(220,80,80,0.4)';
    };
    autoToggle.style.cssText = [
      'padding:4px 18px', 'border-radius:4px',
      'border:1px solid', 'font-size:12px',
      'font-weight:bold', 'cursor:pointer', 'color:#fff',
    ].join(';');
    updateAutoToggle(settings.autoSave);
    autoToggle.addEventListener('click', () => {
      const current = this.saveStore.getSettings().autoSave;
      this.saveStore.setSettings({ autoSave: !current });
      updateAutoToggle(!current);
    });
    autoRow.appendChild(autoLabel);
    autoRow.appendChild(autoToggle);
    panel.appendChild(autoRow);

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
  }

  /**
   * ギャラリーパネルをタイトル画面上に表示する。
   * Sランクご褒美シナリオの閲覧済み一覧を表示し、解放済みを再生できる。
   */
  private showGalleryPanel(): void {
    /** ギャラリーに登録する全ご褒美シナリオ */
    const GALLERY_ENTRIES: Array<{
      id: string;
      title: string;
      chapter: string;
    }> = [
      // 1章 — あかり
      { id: 'ch01_s01_reward', title: 'ステージ1 Sランク', chapter: '第1章 あかり' },
      { id: 'ch01_s02_reward', title: 'ステージ2 Sランク', chapter: '第1章 あかり' },
      { id: 'ch01_s03_reward', title: 'ステージ3 Sランク', chapter: '第1章 あかり' },
      // 2章 — みお
      { id: 'ch02_s01_reward', title: 'ステージ1 Sランク', chapter: '第2章 みお' },
      { id: 'ch02_s02_reward', title: 'ステージ2 Sランク', chapter: '第2章 みお' },
      { id: 'ch02_s03_reward', title: 'ステージ3 Sランク', chapter: '第2章 みお' },
      // 3章 — すず
      { id: 'ch03_s01_reward', title: 'ステージ1 Sランク', chapter: '第3章 すず' },
      { id: 'ch03_s02_reward', title: 'ステージ2 Sランク', chapter: '第3章 すず' },
      { id: 'ch03_s03_reward', title: 'ステージ3 Sランク', chapter: '第3章 すず' },
      // 4章 — ひまり
      { id: 'ch04_s01_reward', title: 'ステージ1 Sランク', chapter: '第4章 ひまり' },
      { id: 'ch04_s02_reward', title: 'ステージ2 Sランク', chapter: '第4章 ひまり' },
      { id: 'ch04_s03_reward', title: 'ステージ3 Sランク', chapter: '第4章 ひまり' },
      // 5章 — ゆかり
      { id: 'ch05_s01_reward', title: 'ステージ1 Sランク', chapter: '第5章 ゆかり' },
      { id: 'ch05_s02_reward', title: 'ステージ2 Sランク', chapter: '第5章 ゆかり' },
      { id: 'ch05_s03_reward', title: 'ステージ3 Sランク', chapter: '第5章 ゆかり' },
      { id: 'ch05_s04_reward', title: 'ステージ4 Sランク', chapter: '第5章 ゆかり' },
      { id: 'ch05_s05_reward', title: 'ステージ5 Sランク', chapter: '第5章 ゆかり' },
      { id: 'ch05_s06_reward', title: 'ステージ6 Sランク', chapter: '第5章 ゆかり' },
      { id: 'ch05_s07_reward', title: 'ステージ7 Sランク', chapter: '第5章 ゆかり' },
    ];

    const viewed = new Set(this.saveStore.getViewedRewards());

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
      'max-height:85vh',
      'color:#e0dcf0',
      'display:flex', 'flex-direction:column', 'gap:0',
      'overflow:hidden',
    ].join(';');

    // ヘッダー
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;margin-bottom:14px;flex-shrink:0;';
    const titleEl = document.createElement('span');
    titleEl.style.cssText = 'font-size:15px;font-weight:bold;flex:1;letter-spacing:0.05em;';
    titleEl.textContent = '🖼 ギャラリー';
    const unlockedCount = GALLERY_ENTRIES.filter(e => viewed.has(e.id)).length;
    const countEl = document.createElement('span');
    countEl.style.cssText = 'font-size:12px;color:#9b70ff;margin-right:12px;';
    countEl.textContent = `${unlockedCount} / ${GALLERY_ENTRIES.length} 解放`;
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
    header.appendChild(countEl);
    header.appendChild(closeBtn);
    panel.appendChild(header);

    // エントリー一覧（スクロール可）
    const list = document.createElement('div');
    list.style.cssText = 'display:flex;flex-direction:column;gap:6px;overflow-y:auto;flex:1;padding-right:4px;';

    // 章ごとにグループ化して表示
    let currentChapter = '';
    for (const entry of GALLERY_ENTRIES) {
      if (entry.chapter !== currentChapter) {
        currentChapter = entry.chapter;
        const chapterHeader = document.createElement('div');
        chapterHeader.style.cssText = [
          'font-size:12px', 'font-weight:bold',
          'color:#b49fff', 'padding:8px 0 4px',
          'border-bottom:1px solid rgba(180,140,255,0.2)',
          'margin-top:4px',
        ].join(';');
        chapterHeader.textContent = entry.chapter;
        list.appendChild(chapterHeader);
      }

      const isUnlocked = viewed.has(entry.id);
      const item = document.createElement('div');
      item.style.cssText = [
        'display:flex', 'align-items:center', 'gap:10px',
        'padding:8px 12px',
        'background:rgba(40,30,70,0.6)',
        'border:1px solid',
        `border-color:${isUnlocked ? 'rgba(180,140,255,0.35)' : 'rgba(80,70,110,0.25)'}`,
        'border-radius:5px',
        isUnlocked ? 'cursor:pointer' : 'cursor:default',
        `opacity:${isUnlocked ? '1' : '0.5'}`,
      ].join(';');

      const lockIcon = document.createElement('span');
      lockIcon.style.cssText = 'font-size:14px;flex-shrink:0;';
      lockIcon.textContent = isUnlocked ? '💌' : '🔒';

      const text = document.createElement('span');
      text.style.cssText = 'flex:1;font-size:12px;';
      text.textContent = entry.title;

      const actionEl = document.createElement('span');
      actionEl.style.cssText = 'font-size:11px;color:#99c8ff;flex-shrink:0;';
      actionEl.textContent = isUnlocked ? '▶ 再生' : '';

      item.appendChild(lockIcon);
      item.appendChild(text);
      item.appendChild(actionEl);

      if (isUnlocked) {
        item.addEventListener('mouseenter', () => {
          item.style.background = 'rgba(70,50,120,0.8)';
        });
        item.addEventListener('mouseleave', () => {
          item.style.background = 'rgba(40,30,70,0.6)';
        });
        item.addEventListener('click', () => {
          overlay.remove();
          void this.mountNovelSceneWithCallback(entry.id, () => {
            void this.transition({ to: 'title' });
          });
        });
      }
      list.appendChild(item);
    }

    panel.appendChild(list);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
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
      () => {
        // BADルートが選ばれた場合はフラグをリセットしてタイトルへ
        if (this.progressStore.getFlag('route_bad') > 0) {
          this.progressStore.resetFlags();
          void this.transition({ to: 'title' });
          return;
        }
        // 章末 post（chXX_end）のセーブは、通常クリア時と同じ章末フロー
        // （章末フラッシュバック → 次章 / 真エンド）を再現する。
        // ※ scenarioRole / nextStageId に依存せず scenarioId で判定する
        //   （ch05_end は継続情報を持たないため）。
        if (/^ch0[1-5]_end$/.test(save.scenarioId)) {
          this.continueAfterLoadedPost(save.scenarioId, save.nextStageId);
          return;
        }
        const role = save.scenarioRole ?? 'pre'; // undefined は過去互換で 'pre' 扱い
        if (role === 'post') {
          // 章末以外の post: GOODルート後は次ステージへ（次ステージの preScenario は自然に再生）
          void this.transition(save.nextStageId
            ? { to: 'puzzle', stageId: save.nextStageId }
            : { to: 'title' });
        } else if (save.nextStageId) {
          // preScenario: GOODルート後はパズルへ（既読マークで preScenario の再生を防ぐ）
          this.progressStore.markLineRead(`pre:${save.nextStageId}`);
          void this.transition({ to: 'puzzle', stageId: save.nextStageId });
        } else {
          // nextStageId がない場合（単独シナリオ等）はタイトルへ
          void this.transition({ to: 'title' });
        }
      }
    );
    // ロード直後に setScenarioContinue しておくことで、このセッション中に
    // 再セーブした場合も正しい継続情報が引き継がれる
    if (save.nextStageId) {
      scene.setScenarioContinue(save.scenarioRole ?? 'pre', save.nextStageId);
    }
    this.currentScene = scene;
    await scene.startFromSave(save);
  }

  /**
   * 章末 post セーブ（chXX_end）を GOOD ルートで読み終えたあとの遷移。
   * 通常クリア時（ResultScene の goNext）と同じ章末フローを再現する。
   * - ch01〜04_end: chXX_final_flashback を挟んでから次ステージへ
   * - ch05_end:     ch05_final_flashback → epilogue_true → EndRoll（真エンド）
   */
  private continueAfterLoadedPost(scenarioId: string, nextStageId?: string): void {
    if (scenarioId === 'ch05_end') {
      void this.mountNovelSceneWithCallback('ch05_final_flashback', () => {
        void this.mountNovelSceneWithCallback('epilogue_true', () => {
          this.mountEndRoll();
        });
      });
      return;
    }
    const m = /^ch0([1-4])_end$/.exec(scenarioId);
    if (m) {
      const flashback = `ch0${m[1]}_final_flashback`;
      void this.mountNovelSceneWithCallback(
        flashback,
        () => {
          void this.transition(nextStageId ? { to: 'puzzle', stageId: nextStageId } : { to: 'title' });
        },
        nextStageId ? { role: 'post', stageId: nextStageId } : undefined
      );
      return;
    }
    // フォールバック（想定外の scenarioId）: 次ステージへ
    void this.transition(nextStageId ? { to: 'puzzle', stageId: nextStageId } : { to: 'title' });
  }

  /** デバッグパネルを document.body に生成する（?debug=1 専用） */
  private buildDebugPanel(): void {
    const ALL_SCENARIOS = [
      'intro_main', 'prologue_main', 'prologue_post', 'tutorial_intro',
      'ch00_tutorial_post', 'ch00_tutorial2_post',
      'ch01_s01_pre', 'ch01_s01_post', 'ch01_s02_pre', 'ch01_s02_post',
      'ch01_s03_pre', 'ch01_s03_pre_A', 'ch01_s03_pre_B', 'ch01_s03_pre_end', 'ch01_s03_post',
      'ch01_final_flashback', 'ch01_end',
      'ch02_s01_pre', 'ch02_s01_post', 'ch02_s02_pre', 'ch02_s02_post',
      'ch02_s03_pre', 'ch02_s03_pre_A', 'ch02_s03_pre_B', 'ch02_s03_post',
      'ch02_final_flashback', 'ch02_end',
      'ch03_s01_pre', 'ch03_s01_post', 'ch03_s02_pre', 'ch03_s02_post',
      'ch03_s03_pre', 'ch03_s03_post',
      'ch03_s05_pre_A', 'ch03_s05_pre_B',
      'ch03_final_flashback', 'ch03_end',
      'ch04_s01_pre', 'ch04_s01_pre2', 'ch04_s01_post', 'ch04_s02_pre', 'ch04_s02_post',
      'ch04_s03_pre', 'ch04_s03_post',
      'ch04_s05_pre_A', 'ch04_s05_pre_B',
      'ch04_final_flashback', 'ch04_end',
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
      'ch01_final_flashback': 'ch02_stage01',
      'ch01_end': 'ch02_stage01',
      // ch02
      'ch02_s01_pre': 'ch02_stage01',  'ch02_s01_post': 'ch02_stage02',
      'ch02_s02_pre': 'ch02_stage02',  'ch02_s02_post': 'ch02_stage03',
      'ch02_s03_pre': 'ch02_stage03',  'ch02_s03_pre_A': 'ch02_stage03',
      'ch02_s03_pre_B': 'ch02_stage03',
      'ch02_final_flashback': 'ch03_stage01',
      'ch02_end': 'ch03_stage01',
      // ch03
      'ch03_s01_pre': 'ch03_stage01',  'ch03_s01_post': 'ch03_stage02',
      'ch03_s02_pre': 'ch03_stage02',  'ch03_s02_post': 'ch03_stage03',
      'ch03_s03_pre': 'ch03_stage03',  'ch03_s03_post': 'ch04_time_demo',
      'ch03_s05_pre_A': 'ch03_stage03', 'ch03_s05_pre_B': 'ch03_stage03',
      'ch03_final_flashback': 'ch04_time_demo',
      'ch03_end': 'ch04_time_demo',
      // ch04
      'ch04_s01_pre': 'ch04_time_demo', 'ch04_s01_pre2': 'ch04_stage01',
      'ch04_s01_post': 'ch04_stage02',
      'ch04_s02_pre': 'ch04_stage02',  'ch04_s02_post': 'ch04_stage03',
      'ch04_s03_pre': 'ch04_stage03',  'ch04_s03_post': 'ch05_stage01',
      'ch04_s05_pre_A': 'ch04_stage03', 'ch04_s05_pre_B': 'ch04_stage03',
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
