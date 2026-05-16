/**
 * ProgressStore のユニットテスト
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ProgressStore } from '../src/store/progressStore';

describe('ProgressStore', () => {
  let store: ProgressStore;

  beforeEach(() => {
    store = new ProgressStore();
  });

  it('初期状態はタイトルシーン', () => {
    expect(store.currentSceneType).toBe('title');
    expect(store.currentStageId).toBeNull();
  });

  it('setScene でシーンを変更できる', () => {
    store.setScene('puzzle', 'ch01_stage01');
    expect(store.currentSceneType).toBe('puzzle');
    expect(store.currentStageId).toBe('ch01_stage01');
  });

  it('setScene にstageIdを渡さない場合は null', () => {
    store.setScene('title');
    expect(store.currentStageId).toBeNull();
  });

  it('addFlag でフラグを加算できる', () => {
    store.addFlag('akari_friendly', 1);
    store.addFlag('akari_friendly', 2);
    expect(store.getFlag('akari_friendly')).toBe(3);
  });

  it('addFlag で未設定フラグは 0 から始まる', () => {
    store.addFlag('new_flag', 5);
    expect(store.getFlag('new_flag')).toBe(5);
  });

  it('未設定フラグは 0 を返す', () => {
    expect(store.getFlag('nonexistent')).toBe(0);
  });

  it('markLineRead と isRead が正常に動作する', () => {
    expect(store.isRead('line:001')).toBe(false);
    store.markLineRead('line:001');
    expect(store.isRead('line:001')).toBe(true);
  });

  it('resetScenarioContext でコンテキストがリセットされる', () => {
    store.addFlag('test', 10);
    store.markLineRead('pre:ch01_stage01');
    store.resetScenarioContext();
    expect(store.getFlag('test')).toBe(0);
    expect(store.isRead('pre:ch01_stage01')).toBe(false);
  });
});
