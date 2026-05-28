/**
 * SaveStore のユニットテスト
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SaveStore } from '../src/store/saveStore';

// localStorage のモック
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get length() { return Object.keys(store).length; },
    key: vi.fn((i: number) => Object.keys(store)[i] ?? null)
  };
})();

Object.defineProperty(global, 'localStorage', { value: localStorageMock });

describe('SaveStore', () => {
  let store: SaveStore;

  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
    store = new SaveStore();
  });

  it('デフォルト値で初期化される', () => {
    const data = store.getData();
    expect(data.version).toBe(1);
    expect(data.currentChapter).toBe(0);
    expect(data.currentStage).toBe(0);
    expect(data.stageRecords).toEqual({});
    expect(data.settings.bgmVolume).toBe(0.8);
    expect(data.settings.autoSave).toBe(true);
  });

  it('ステージ記録を保存・取得できる', () => {
    store.setRecord('ch01_stage01', { bestScore: 3500, bestRating: 'A', cleared: true });
    const rec = store.getRecord('ch01_stage01');
    expect(rec).not.toBeNull();
    expect(rec!.bestScore).toBe(3500);
    expect(rec!.bestRating).toBe('A');
    expect(rec!.cleared).toBe(true);
  });

  it('ベストスコアは上書きされない（低いスコアが来ても最大を保持）', () => {
    store.setRecord('ch01_stage01', { bestScore: 5000, bestRating: 'S', cleared: true });
    store.setRecord('ch01_stage01', { bestScore: 2000, bestRating: 'B', cleared: true });
    const rec = store.getRecord('ch01_stage01');
    expect(rec!.bestScore).toBe(5000);
    expect(rec!.bestRating).toBe('S');
  });

  it('未登録ステージは null を返す', () => {
    expect(store.getRecord('unknown_stage')).toBeNull();
  });

  it('設定を更新できる', () => {
    store.setSettings({ bgmVolume: 0.5, textSpeed: 'fast' });
    const settings = store.getSettings();
    expect(settings.bgmVolume).toBe(0.5);
    expect(settings.textSpeed).toBe('fast');
    expect(settings.seVolume).toBe(0.8); // 変更していない項目は維持
  });

  it('リセットでデフォルト値に戻る', () => {
    store.setRecord('ch01_stage01', { bestScore: 9999, bestRating: 'S', cleared: true });
    store.reset();
    expect(store.getRecord('ch01_stage01')).toBeNull();
    expect(store.getData().currentChapter).toBe(0);
  });

  it('autoSave が true のとき自動的に localStorage に保存される', () => {
    store.setRecord('ch01_stage01', { bestScore: 100, bestRating: 'C', cleared: false });
    expect(localStorageMock.setItem).toHaveBeenCalled();
  });

  it('reset 後に viewedRewards が空に戻る（デフォルト配列の共有汚染がない）', () => {
    store.markRewardViewed('ch01_s01_reward');
    expect(store.getViewedRewards()).toContain('ch01_s01_reward');
    store.reset();
    expect(store.getViewedRewards()).toEqual([]);

    // 別インスタンスもデフォルトが汚染されていないこと
    const fresh = new SaveStore();
    fresh.reset();
    expect(fresh.getViewedRewards()).toEqual([]);
  });

  it('save/load のラウンドトリップが正常に動作する', () => {
    store.setRecord('ch01_stage02', { bestScore: 4200, bestRating: 'A', cleared: true });
    store.setCurrentChapter(1);
    store.setCurrentStage(2);

    const store2 = new SaveStore(); // 再ロード
    expect(store2.getData().currentChapter).toBe(1);
    const rec = store2.getRecord('ch01_stage02');
    expect(rec!.bestScore).toBe(4200);
  });
});
