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
