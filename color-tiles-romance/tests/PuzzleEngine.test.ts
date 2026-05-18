import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PuzzleEngine } from '@/core/PuzzleEngine';
import type { StageDefinition } from '@/types';

const simpleStage: StageDefinition = {
  id: 'test_simple',
  title: 'simple',
  chapter: 0,
  boardWidth: 4,
  boardHeight: 1,
  timeLimitSec: 60,
  missPenaltySec: 1,
  hintCount: 3,
  tilesLayout: [['red', null, null, 'red']],
  blockReleaseRule: { type: 'never' }
};

const iceStage: StageDefinition = {
  id: 'test_ice',
  title: 'ice',
  chapter: 3,
  boardWidth: 6,
  boardHeight: 1,
  timeLimitSec: 60,
  missPenaltySec: 0,
  hintCount: 3,
  tilesLayout: [
    [{ color: 'blue', type: 'ice' }, 'blue', null, 'blue', { color: 'blue', type: 'ice' }, null]
  ],
  blockReleaseRule: { type: 'never' }
};

describe('PuzzleEngine', () => {
  let engine: PuzzleEngine;

  beforeEach(() => {
    vi.useFakeTimers();
    engine = new PuzzleEngine();
  });

  it('ステージをロードして基本情報が反映される', () => {
    engine.loadStage(simpleStage);
    expect(engine.width).toBe(4);
    expect(engine.height).toBe(1);
    expect(engine.timer.remain).toBe(60);
  });

  it('正しい空マスをクリックするとタイルが消える', () => {
    engine.loadStage(simpleStage);
    const result = engine.onCellClick(1, 0);
    expect(result.type).toBe('success');
    expect(engine.board[0][0]).toBeNull();
    expect(engine.board[0][3]).toBeNull();
    expect(engine.isCleared()).toBe(true);
  });

  it('誤クリックでスコアと時間にペナルティが入る', () => {
    engine.loadStage(simpleStage);
    const before = engine.timer.remain;
    const result = engine.onCellClick(0, 0); // タイルの上 → noop
    expect(result.type).toBe('noop');
    expect(engine.timer.remain).toBe(before);

    // 別の不成立クリック点：水平に red がない位置はないので、模擬的に setup が必要だが
    // ここでは boardHeight=1 なので異なるy座標は無効。代わりに片側にタイルが無い盤面で再試行
    const stage: StageDefinition = {
      ...simpleStage,
      tilesLayout: [['red', null, null, null]]
    };
    engine.loadStage(stage);
    const before2 = engine.timer.remain;
    const result2 = engine.onCellClick(2, 0); // 右端にタイルなしなのでmiss
    expect(result2.type).toBe('miss');
    expect(engine.timer.remain).toBe(before2 - 1);
  });

  it('氷タイルは1回目でヒビ、2回目で消える', () => {
    engine.loadStage(iceStage);
    // 1回目：隣接する通常タイルを消してヒビを入れる
    let result = engine.onCellClick(2, 0);
    expect(result.type).toBe('success');
    expect(result.type === 'success' && result.removed.length).toBe(2);
    expect(engine.board[0][0]?.state).toBe('cracked');
    expect(engine.board[0][4]?.state).toBe('cracked');

    // 2回目：ヒビ入り氷タイルを消す
    result = engine.onCellClick(2, 0);
    expect(result.type).toBe('success');
    expect(engine.board[0][0]).toBeNull();
    expect(engine.board[0][4]).toBeNull();
    expect(engine.isCleared()).toBe(true);
  });

  it('時間タイルを消去すると残り時間が増える', () => {
    const stage: StageDefinition = {
      ...simpleStage,
      tilesLayout: [
        [{ color: 'red', type: 'time' }, null, null, { color: 'red', type: 'time' }]
      ]
    };
    engine.loadStage(stage);
    const before = engine.timer.remain;
    engine.onCellClick(1, 0);
    // 両方timeなので +20
    expect(engine.timer.remain).toBe(before + 20);
  });

  it('クリア時にイベントが発火する', () => {
    engine.loadStage(simpleStage);
    const events: string[] = [];
    engine.on((e) => events.push(e.type));
    engine.onCellClick(1, 0);
    expect(events).toContain('cleared');
  });

  it('ヒントが消去可能ペアと交点を返す', () => {
    engine.loadStage(simpleStage);
    const hint = engine.hint();
    expect(hint).not.toBeNull();
    expect(hint?.clickPoint.y).toBe(0);
    // ヒント残数が減る
    expect(engine.hintsRemaining).toBe(2);
  });

  it('ブロック解除ルール: afterPairs', () => {
    const stage: StageDefinition = {
      ...simpleStage,
      boardWidth: 6,
      tilesLayout: [
        ['red', null, 'red', { type: 'block', color: null }, 'blue', 'blue']
      ],
      blockReleaseRule: { type: 'afterPairs', count: 1 }
    };
    engine.loadStage(stage);
    expect(engine.board[0][3]?.type).toBe('block');
    // redのペアを消去
    engine.onCellClick(1, 0);
    // afterPairs:1 なのでブロックが解除される
    expect(engine.board[0][3]).toBeNull();
  });

  it('isCleared はブロックが残っていてもクリアと判定する', () => {
    const stage: StageDefinition = {
      ...simpleStage,
      boardWidth: 5,
      tilesLayout: [
        ['red', null, 'red', null, { type: 'block', color: null }]
      ],
      blockReleaseRule: { type: 'never' }
    };
    engine.loadStage(stage);
    engine.onCellClick(1, 0);
    expect(engine.isCleared()).toBe(true);
  });
});
