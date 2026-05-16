/**
 * NovelScene.ts
 * ScenarioPlayer をラップして、シナリオJSONのロードと再生を行うシーン。
 * public/data/scenarios/{scenarioId}.json からシナリオを取得する。
 */

import { ScenarioPlayer } from '@/novel/ScenarioPlayer';
import type { ScenarioStep } from '@/novel/ScenarioPlayer';
import type { ScenarioContext } from '@/store/progressStore';

/**
 * ノベルシーン。
 * シナリオJSONを取得してScenarioPlayerに渡し、終了時にコールバックを呼ぶ。
 */
export class NovelScene {
  private container: HTMLElement;
  private scenarioId: string;
  private context: ScenarioContext;
  private onEnd: () => void;
  private player: ScenarioPlayer | null = null;

  /**
   * @param container シナリオを描画するコンテナ要素
   * @param scenarioId シナリオID（public/data/scenarios/{id}.json）
   * @param context シナリオ実行コンテキスト
   * @param onEnd シナリオ終了時のコールバック
   */
  constructor(
    container: HTMLElement,
    scenarioId: string,
    context: ScenarioContext,
    onEnd: () => void
  ) {
    this.container = container;
    this.scenarioId = scenarioId;
    this.context = context;
    this.onEnd = onEnd;
  }

  /**
   * シナリオをロードして再生を開始する。
   * @returns シナリオが終了したときに解決するPromise
   */
  async start(): Promise<void> {
    const steps = await this.loadScenario();

    this.player = new ScenarioPlayer(this.container, this.context);
    this.player.loadScenario(steps);
    this.player.onScenarioEnd(() => {
      this.onEnd();
    });

    await this.player.start();
  }

  /**
   * シーンを破棄してリソースを解放する。
   */
  destroy(): void {
    if (this.player) {
      this.player.destroy();
      this.player = null;
    }
  }

  // ---------- プライベートメソッド ----------

  /**
   * シナリオJSONを fetch で取得する。
   * 取得失敗時はフォールバックシナリオを返す。
   */
  private async loadScenario(): Promise<ScenarioStep[]> {
    try {
      const url = `/data/scenarios/${this.scenarioId}.json`;
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`[NovelScene] scenario not found: ${this.scenarioId}, using fallback`);
        return this.fallbackScenario();
      }
      const data = await res.json() as ScenarioStep[];
      return data;
    } catch (e) {
      console.error('[NovelScene] failed to load scenario:', e);
      return this.fallbackScenario();
    }
  }

  /**
   * シナリオが見つからない場合のフォールバックシナリオ。
   */
  private fallbackScenario(): ScenarioStep[] {
    return [
      { bg: 'classroom.png' },
      { chara: { id: 'akari', expr: 'normal', pos: 'center' } },
      {
        text: {
          name: 'あかり',
          body: 'あれ……シナリオファイルが見つかりませんでした。'
        },
        id: 'fallback_01'
      },
      {
        text: {
          name: 'あかり',
          body: 'でも、ゲームは続けられます。ステージへ進みましょう！'
        },
        id: 'fallback_02'
      }
    ];
  }
}
