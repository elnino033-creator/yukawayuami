/**
 * saveStore.ts
 * localStorage を使ったセーブデータ管理モジュール。
 * ゲームの進行状況、ステージ記録、設定を永続化する。
 */

/** ステージのベスト記録 */
export interface StageRecord {
  /** ベストスコア */
  bestScore: number;
  /** ベストレーティング */
  bestRating: 'S' | 'A' | 'B' | 'C' | null;
  /** クリア済みかどうか */
  cleared: boolean;
}

/** ゲーム設定 */
export interface GameSettings {
  /** BGM音量 (0.0 – 1.0) */
  bgmVolume: number;
  /** SE音量 (0.0 – 1.0) */
  seVolume: number;
  /** テキスト速度 */
  textSpeed: 'slow' | 'normal' | 'fast';
  /** オートセーブ有効フラグ */
  autoSave: boolean;
}

/** セーブデータの全体構造 */
export interface SaveData {
  /** セーブデータのバージョン番号 */
  version: number;
  /** 現在のチャプター番号 */
  currentChapter: number;
  /** 現在のステージ番号（チャプター内インデックス） */
  currentStage: number;
  /** ステージIDをキーとしたステージ記録マップ */
  stageRecords: Record<string, StageRecord>;
  /** ゲーム設定 */
  settings: GameSettings;
}

/** デフォルトのゲーム設定 */
const DEFAULT_SETTINGS: GameSettings = {
  bgmVolume: 0.8,
  seVolume: 0.8,
  textSpeed: 'normal',
  autoSave: true
};

/** デフォルトのセーブデータ */
const DEFAULT_SAVE_DATA: SaveData = {
  version: 1,
  currentChapter: 0,
  currentStage: 0,
  stageRecords: {},
  settings: { ...DEFAULT_SETTINGS }
};

/**
 * localStorage を使ったセーブデータ管理クラス。
 * セーブ・ロード・リセットなどのI/Oを担当する。
 */
export class SaveStore {
  /** localStorage のキー */
  static readonly STORAGE_KEY = 'color-tiles-romance-save';

  /** インメモリのセーブデータキャッシュ */
  private data: SaveData;

  constructor() {
    this.data = this.load();
  }

  /**
   * 現在のデータを localStorage に保存する。
   */
  save(): void {
    try {
      localStorage.setItem(SaveStore.STORAGE_KEY, JSON.stringify(this.data));
    } catch (e) {
      console.error('[SaveStore] save failed:', e);
    }
  }

  /**
   * localStorage からデータを読み込む。
   * データが存在しない場合やパースに失敗した場合はデフォルト値を返す。
   */
  load(): SaveData {
    try {
      const raw = localStorage.getItem(SaveStore.STORAGE_KEY);
      if (!raw) {
        this.data = this.createDefault();
        return this.data;
      }
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      // バージョンチェック（将来のマイグレーション用）
      if (parsed.version !== 1) {
        console.warn('[SaveStore] unknown version, resetting to default');
        this.data = this.createDefault();
        return this.data;
      }
      this.data = this.mergeWithDefault(parsed);
      return this.data;
    } catch (e) {
      console.error('[SaveStore] load failed:', e);
      this.data = this.createDefault();
      return this.data;
    }
  }

  /**
   * 指定したステージIDの記録を取得する。
   * @param stageId ステージID
   * @returns ステージ記録、未記録の場合は null
   */
  getRecord(stageId: string): StageRecord | null {
    return this.data.stageRecords[stageId] ?? null;
  }

  /**
   * 指定したステージIDに記録を保存する。
   * 既存の記録がある場合、ベストスコア・ベストレーティングを更新する。
   * @param stageId ステージID
   * @param record 新しいステージ記録
   */
  setRecord(stageId: string, record: StageRecord): void {
    const existing = this.data.stageRecords[stageId];
    if (existing) {
      // ベストを保持するマージ
      const ratingOrder = ['S', 'A', 'B', 'C'] as const;
      const existingIdx = existing.bestRating ? ratingOrder.indexOf(existing.bestRating) : 999;
      const newIdx = record.bestRating ? ratingOrder.indexOf(record.bestRating) : 999;
      this.data.stageRecords[stageId] = {
        bestScore: Math.max(existing.bestScore, record.bestScore),
        bestRating: existingIdx <= newIdx ? existing.bestRating : record.bestRating,
        cleared: existing.cleared || record.cleared
      };
    } else {
      this.data.stageRecords[stageId] = { ...record };
    }
    if (this.data.settings.autoSave) {
      this.save();
    }
  }

  /**
   * 現在のゲーム設定を取得する。
   * @returns ゲーム設定のコピー
   */
  getSettings(): GameSettings {
    return { ...this.data.settings };
  }

  /**
   * ゲーム設定を更新する。
   * @param settings 更新する設定（部分的でも可）
   */
  setSettings(settings: Partial<GameSettings>): void {
    this.data.settings = { ...this.data.settings, ...settings };
    this.save();
  }

  /**
   * セーブデータをデフォルト値にリセットする。
   */
  reset(): void {
    this.data = this.createDefault();
    this.save();
  }

  /**
   * 現在チャプター番号を更新する。
   * @param chapter チャプター番号
   */
  setCurrentChapter(chapter: number): void {
    this.data.currentChapter = chapter;
    if (this.data.settings.autoSave) this.save();
  }

  /**
   * 現在ステージ番号を更新する。
   * @param stage ステージ番号（チャプター内インデックス）
   */
  setCurrentStage(stage: number): void {
    this.data.currentStage = stage;
    if (this.data.settings.autoSave) this.save();
  }

  /**
   * 読み込んだセーブデータのスナップショットを返す（読み取り専用）。
   */
  getData(): Readonly<SaveData> {
    return this.data;
  }

  // ---------- プライベートヘルパー ----------

  private createDefault(): SaveData {
    return {
      ...DEFAULT_SAVE_DATA,
      stageRecords: {},
      settings: { ...DEFAULT_SETTINGS }
    };
  }

  private mergeWithDefault(partial: Partial<SaveData>): SaveData {
    return {
      version: partial.version ?? 1,
      currentChapter: partial.currentChapter ?? 0,
      currentStage: partial.currentStage ?? 0,
      stageRecords: partial.stageRecords ?? {},
      settings: { ...DEFAULT_SETTINGS, ...(partial.settings ?? {}) }
    };
  }
}
