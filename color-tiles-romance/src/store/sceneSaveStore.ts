/**
 * sceneSaveStore.ts
 * シナリオ途中セーブ（3スロット）を localStorage で管理する。
 */

/** キャラクター状態のスナップショット */
export interface CharaSnapshot {
  id: string;
  expr: string;
  pos: 'left' | 'center' | 'right';
  scale: number;
  y: number;
}

/** 選択肢スナップショット（セーブ用） */
export interface ChoiceSnapshot {
  label: string;
  flag?: string;
  value?: number;
  next?: string;
}

/** シナリオセーブデータ（1スロット） */
export interface ScenarioSaveData {
  slot: number;
  scenarioId: string;
  stepIndex: number;
  bgKey: string | null;
  bgmKey: string | null;
  characters: CharaSnapshot[];
  currentName: string;
  displayedText: string;
  flags: Record<string, number>;
  readLines: string[];
  savedAt: string;       // ISO 8601
  previewText: string;   // up to 40 chars for slot preview
  /** 選択肢待機中フラグ。ロード時に選択肢を復元するために使用 */
  awaitingChoice?: boolean;
  /** 選択肢待機中のとき、選択肢の内容を保持 */
  pendingChoices?: ChoiceSnapshot[];
  /** 選択肢と一緒に表示する直前のセリフ（話者名） */
  choiceContextName?: string;
  /** 選択肢と一緒に表示する直前のセリフ（本文） */
  choiceContextBody?: string;
  /**
   * このシナリオが終了したあとに起動すべきステージID。
   * - scenarioRole === 'pre': このステージのパズルを起動する（既読マーク付き）
   * - scenarioRole === 'post': このステージの次のステージへ進む（既読マーク不要）
   * タイトル画面LOADからロードしたとき、GOODルートを選んだ場合の遷移先に使用する。
   */
  nextStageId?: string;
  /**
   * シナリオの種別（タイトルLOADからの正しい遷移先を判定するために使用）。
   * - 'pre': パズル前シナリオ → GOODルート後はパズル起動（pre:stageId を既読マーク）
   * - 'post': パズル後/flashback → GOODルート後は次ステージへ（既読マーク不要）
   * undefined のセーブ（過去互換）は 'pre' として扱う。
   */
  scenarioRole?: 'pre' | 'post';
}

const STORAGE_KEY = 'ctr-scene-saves';
const SLOT_COUNT = 3;

function loadAll(): (ScenarioSaveData | null)[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return Array(SLOT_COUNT).fill(null);
    return JSON.parse(raw) as (ScenarioSaveData | null)[];
  } catch {
    return Array(SLOT_COUNT).fill(null);
  }
}

function saveAll(slots: (ScenarioSaveData | null)[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slots));
  } catch (e) {
    console.error('[SceneSaveStore] save failed:', e);
  }
}

export const SceneSaveStore = {
  getAll(): (ScenarioSaveData | null)[] {
    return loadAll();
  },
  get(slot: number): ScenarioSaveData | null {
    return loadAll()[slot] ?? null;
  },
  set(slot: number, data: ScenarioSaveData): void {
    const slots = loadAll();
    slots[slot] = { ...data, slot };
    saveAll(slots);
  },
  delete(slot: number): void {
    const slots = loadAll();
    slots[slot] = null;
    saveAll(slots);
  }
};
