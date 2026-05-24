/**
 * progressStore.ts
 * セッション中のインメモリ進行状態を管理するモジュール。
 * シーン遷移、フラグ管理、既読行の追跡を担当する。
 * このストアの内容は localStorage に保存されない（揮発性）。
 */

/** シナリオ実行コンテキスト */
export interface ScenarioContext {
  /** ストーリーフラグのマップ（フラグ名 → 数値） */
  flags: Record<string, number>;
  /** 既読行IDのセット */
  readLines: Set<string>;
}

/**
 * インメモリの進行状態管理クラス。
 * 現在のシーン、チャプター、ステージ、シナリオコンテキストを保持する。
 */
export class ProgressStore {
  /** 現在表示中のシーンタイプ */
  currentSceneType: string = 'title';

  /** 現在のステージID（パズル中は有効、それ以外は null） */
  currentStageId: string | null = null;

  /** 現在のチャプター番号 */
  currentChapter: number = 0;

  /** 現在のステージインデックス（チャプター内） */
  currentStageIndex: number = 0;

  /** シナリオ実行コンテキスト */
  scenarioContext: ScenarioContext = {
    flags: {},
    readLines: new Set<string>()
  };

  /**
   * 現在のシーンを切り替える。
   * @param type シーンタイプ文字列
   * @param stageId ステージID（パズルシーン時のみ指定）
   */
  setScene(type: string, stageId?: string): void {
    this.currentSceneType = type;
    this.currentStageId = stageId ?? null;
  }

  /**
   * ストーリーフラグに値を加算する。
   * フラグが未設定の場合は 0 から加算する。
   * @param key フラグ名
   * @param delta 加算する値（省略時は 1）
   */
  addFlag(key: string, delta: number = 1): void {
    this.scenarioContext.flags[key] = (this.scenarioContext.flags[key] ?? 0) + delta;
  }

  /**
   * 指定した行IDを既読としてマークする。
   * @param lineId 行ID
   */
  markLineRead(lineId: string): void {
    this.scenarioContext.readLines.add(lineId);
  }

  /**
   * 指定した行IDが既読かどうかを返す。
   * @param lineId 行ID
   * @returns 既読なら true
   */
  isRead(lineId: string): boolean {
    return this.scenarioContext.readLines.has(lineId);
  }

  /**
   * フラグの現在値を取得する。
   * @param key フラグ名
   * @returns フラグの値（未設定なら 0）
   */
  getFlag(key: string): number {
    return this.scenarioContext.flags[key] ?? 0;
  }

  /**
   * シナリオコンテキストをリセットする（新規ゲーム開始時など）。
   */
  resetScenarioContext(): void {
    this.scenarioContext = {
      flags: {},
      readLines: new Set<string>()
    };
  }

  /**
   * ルートフラグのみリセットする（BADエンド後にCONTINUEで選び直せるようにする）。
   * readLines（既読行・SKIP制御）は保持する。
   */
  resetFlags(): void {
    this.scenarioContext.flags = {};
  }
}
