/**
 * Phase 2 で追加したギミックステージのバリデーションテスト。
 * StageValidator.hasSolution() で全ステージに解が存在することを確認する。
 */
import { describe, it, expect } from 'vitest';
import type { StageDefinition } from '../src/types';
import { StageValidator } from '../src/core/StageValidator';

// ---------- Chapter 2: 氷雪の洗礼 ----------

const ch02Stage01: StageDefinition = {
  id: 'ch02_stage01', title: '', chapter: 2,
  boardWidth: 8, boardHeight: 6, timeLimitSec: 130, missPenaltySec: 1, hintCount: 3,
  tilesLayout: [
    [{ color: 'red', type: 'ice' }, null, null, { color: 'red', type: 'ice' }, null, 'blue', null, 'blue'],
    [null, null, null, null, null, null, null, null],
    ['green', null, null, 'green', null, { color: 'yellow', type: 'ice' }, null, { color: 'yellow', type: 'ice' }],
    [null, null, null, null, null, null, null, null],
    [{ color: 'red', type: 'ice' }, null, { color: 'red', type: 'ice' }, null, 'blue', null, 'blue', null],
    ['green', null, 'green', null, { color: 'yellow', type: 'ice' }, null, { color: 'yellow', type: 'ice' }, null]
  ]
};

const ch02Stage02: StageDefinition = {
  id: 'ch02_stage02', title: '', chapter: 2,
  boardWidth: 8, boardHeight: 6, timeLimitSec: 120, missPenaltySec: 1, hintCount: 3,
  tilesLayout: [
    [{ color: 'blue', type: 'ice' }, null, null, { color: 'blue', type: 'ice' }, null, { color: 'red', type: 'ice' }, null, { color: 'red', type: 'ice' }],
    [null, null, null, null, null, null, null, null],
    [{ color: 'green', type: 'ice' }, null, null, { color: 'green', type: 'ice' }, null, 'yellow', null, 'yellow'],
    [null, null, null, null, null, null, null, null],
    [{ color: 'blue', type: 'ice' }, null, { color: 'blue', type: 'ice' }, null, { color: 'red', type: 'ice' }, null, { color: 'red', type: 'ice' }, null],
    ['green', null, 'green', null, 'yellow', null, 'yellow', null]
  ]
};

const ch02Stage03: StageDefinition = {
  id: 'ch02_stage03', title: '', chapter: 2,
  boardWidth: 8, boardHeight: 6, timeLimitSec: 90, missPenaltySec: 1, hintCount: 2,
  tilesLayout: [
    [{ color: 'red', type: 'ice' }, null, null, { color: 'red', type: 'ice' }, null, { color: 'blue', type: 'time' }, null, { color: 'blue', type: 'time' }],
    [null, null, null, null, null, null, null, null],
    [{ color: 'green', type: 'ice' }, null, null, { color: 'green', type: 'ice' }, null, { color: 'yellow', type: 'time' }, null, { color: 'yellow', type: 'time' }],
    [null, null, null, null, null, null, null, null],
    [{ color: 'red', type: 'ice' }, null, { color: 'red', type: 'ice' }, null, { color: 'blue', type: 'time' }, null, { color: 'blue', type: 'time' }, null],
    [{ color: 'green', type: 'ice' }, null, { color: 'green', type: 'ice' }, null, { color: 'yellow', type: 'time' }, null, { color: 'yellow', type: 'time' }, null]
  ]
};

// ---------- Chapter 3: 翠葉の迷宮 ----------

const ch03Stage01: StageDefinition = {
  id: 'ch03_stage01', title: '', chapter: 3,
  boardWidth: 8, boardHeight: 6, timeLimitSec: 140, missPenaltySec: 2, hintCount: 2,
  tilesLayout: [
    [{ color: 'red', type: 'ice' }, null, null, { color: 'red', type: 'ice' }, null, 'blue', null, 'blue'],
    [null, null, { color: null, type: 'block' }, null, null, { color: null, type: 'block' }, null, null],
    ['green', null, null, 'green', null, { color: 'yellow', type: 'ice' }, null, { color: 'yellow', type: 'ice' }],
    [null, null, { color: null, type: 'block' }, null, null, { color: null, type: 'block' }, null, null],
    [{ color: 'red', type: 'ice' }, null, { color: 'red', type: 'ice' }, null, 'blue', null, 'blue', null],
    ['green', null, 'green', null, 'yellow', null, 'yellow', null]
  ],
  blockReleaseRule: { type: 'afterPairs', count: 3 }
};

const ch03Stage02: StageDefinition = {
  id: 'ch03_stage02', title: '', chapter: 3,
  boardWidth: 8, boardHeight: 6, timeLimitSec: 130, missPenaltySec: 2, hintCount: 2,
  tilesLayout: [
    [{ color: 'blue', type: 'ice' }, null, null, { color: 'blue', type: 'ice' }, { color: null, type: 'block' }, { color: 'red', type: 'ice' }, null, { color: 'red', type: 'ice' }],
    [null, null, null, null, null, null, null, null],
    [{ color: 'green', type: 'ice' }, null, null, { color: 'green', type: 'ice' }, { color: null, type: 'block' }, { color: 'yellow', type: 'ice' }, null, { color: 'yellow', type: 'ice' }],
    [null, null, null, null, null, null, null, null],
    [{ color: 'blue', type: 'ice' }, null, { color: 'blue', type: 'ice' }, null, { color: 'red', type: 'time' }, null, { color: 'red', type: 'time' }, null],
    ['green', null, 'green', null, { color: 'yellow', type: 'time' }, null, { color: 'yellow', type: 'time' }, null]
  ],
  blockReleaseRule: { type: 'afterPairs', count: 4 }
};

const ch03Stage03: StageDefinition = {
  id: 'ch03_stage03', title: '', chapter: 3,
  boardWidth: 8, boardHeight: 6, timeLimitSec: 110, missPenaltySec: 2, hintCount: 1,
  tilesLayout: [
    [{ color: 'blue', type: 'ice' }, null, null, { color: 'blue', type: 'ice' }, null, { color: 'red', type: 'ice' }, null, { color: 'red', type: 'ice' }],
    [null, { color: null, type: 'block' }, null, null, null, null, { color: null, type: 'block' }, null],
    [{ color: 'green', type: 'ice' }, null, null, { color: 'green', type: 'ice' }, null, { color: 'yellow', type: 'ice' }, null, { color: 'yellow', type: 'ice' }],
    [null, { color: null, type: 'block' }, null, null, null, null, { color: null, type: 'block' }, null],
    [{ color: 'blue', type: 'time' }, null, { color: 'blue', type: 'time' }, null, { color: 'red', type: 'time' }, null, { color: 'red', type: 'time' }, null],
    [{ color: 'green', type: 'time' }, null, { color: 'green', type: 'time' }, null, { color: 'yellow', type: 'time' }, null, { color: 'yellow', type: 'time' }, null]
  ],
  blockReleaseRule: { type: 'afterPairs', count: 4 }
};

// ---------- Chapter 4: 連鎖の宮殿 ----------

const ch04Stage01: StageDefinition = {
  id: 'ch04_stage01', title: '', chapter: 4,
  boardWidth: 8, boardHeight: 6, timeLimitSec: 130, missPenaltySec: 1, hintCount: 3,
  tilesLayout: [
    [{ color: 'red', type: 'linked', linkGroupId: 'lg1' }, null, null, { color: 'red', type: 'linked', linkGroupId: 'lg1' }, null, { color: 'blue', type: 'linked', linkGroupId: 'lg2' }, null, { color: 'blue', type: 'linked', linkGroupId: 'lg2' }],
    [null, null, null, null, null, null, null, null],
    [{ color: 'red', type: 'linked', linkGroupId: 'lg1' }, null, null, { color: 'red', type: 'linked', linkGroupId: 'lg1' }, null, { color: 'blue', type: 'linked', linkGroupId: 'lg2' }, null, { color: 'blue', type: 'linked', linkGroupId: 'lg2' }],
    [null, null, null, null, null, null, null, null],
    ['green', null, null, 'green', null, 'yellow', null, 'yellow'],
    ['green', null, 'green', null, 'yellow', null, 'yellow', null]
  ]
};

const ch04Stage02: StageDefinition = {
  id: 'ch04_stage02', title: '', chapter: 4,
  boardWidth: 8, boardHeight: 6, timeLimitSec: 130, missPenaltySec: 1, hintCount: 2,
  tilesLayout: [
    [{ color: 'red', type: 'linked', linkGroupId: 'lg1' }, null, null, { color: 'red', type: 'linked', linkGroupId: 'lg1' }, null, { color: 'blue', type: 'ice' }, null, { color: 'blue', type: 'ice' }],
    [null, null, null, null, null, null, null, null],
    [{ color: 'red', type: 'linked', linkGroupId: 'lg1' }, null, null, { color: 'red', type: 'linked', linkGroupId: 'lg1' }, null, { color: 'blue', type: 'ice' }, null, { color: 'blue', type: 'ice' }],
    [null, null, null, null, null, null, null, null],
    [{ color: 'green', type: 'linked', linkGroupId: 'lg2' }, null, null, { color: 'green', type: 'linked', linkGroupId: 'lg2' }, null, { color: 'yellow', type: 'ice' }, null, { color: 'yellow', type: 'ice' }],
    [{ color: 'green', type: 'linked', linkGroupId: 'lg2' }, null, { color: 'green', type: 'linked', linkGroupId: 'lg2' }, null, 'yellow', null, 'yellow', null]
  ]
};

const ch04Stage03: StageDefinition = {
  id: 'ch04_stage03', title: '', chapter: 4,
  boardWidth: 8, boardHeight: 6, timeLimitSec: 120, missPenaltySec: 2, hintCount: 2,
  tilesLayout: [
    [{ color: 'red', type: 'linked', linkGroupId: 'lg1' }, null, null, { color: 'red', type: 'linked', linkGroupId: 'lg1' }, null, { color: 'blue', type: 'linked', linkGroupId: 'lg2' }, null, { color: 'blue', type: 'linked', linkGroupId: 'lg2' }],
    [null, null, null, null, null, null, null, null],
    [{ color: 'red', type: 'linked', linkGroupId: 'lg1' }, null, null, { color: 'red', type: 'linked', linkGroupId: 'lg1' }, null, { color: 'blue', type: 'linked', linkGroupId: 'lg2' }, null, { color: 'blue', type: 'linked', linkGroupId: 'lg2' }],
    [null, null, null, null, null, null, null, null],
    [{ color: 'green', type: 'time' }, null, { color: 'green', type: 'time' }, null, { color: 'yellow', type: 'time' }, null, { color: 'yellow', type: 'time' }, null],
    [{ color: 'green', type: 'time' }, null, { color: 'green', type: 'time' }, null, { color: 'yellow', type: 'time' }, null, { color: 'yellow', type: 'time' }, null]
  ]
};

// ---------- Chapter 5: 混沌の頂点 ----------

const ch05Stage01: StageDefinition = {
  id: 'ch05_stage01', title: '', chapter: 5,
  boardWidth: 8, boardHeight: 6, timeLimitSec: 150, missPenaltySec: 2, hintCount: 2,
  tilesLayout: [
    [{ color: 'red', type: 'linked', linkGroupId: 'lg1' }, null, null, { color: 'red', type: 'linked', linkGroupId: 'lg1' }, null, { color: 'blue', type: 'ice' }, null, { color: 'blue', type: 'ice' }],
    [null, null, { color: null, type: 'block' }, null, null, null, { color: null, type: 'block' }, null],
    [{ color: 'red', type: 'linked', linkGroupId: 'lg1' }, null, null, { color: 'red', type: 'linked', linkGroupId: 'lg1' }, null, { color: 'blue', type: 'ice' }, null, { color: 'blue', type: 'ice' }],
    [null, null, { color: null, type: 'block' }, null, null, null, { color: null, type: 'block' }, null],
    [{ color: 'green', type: 'time' }, null, { color: 'green', type: 'time' }, null, { color: 'yellow', type: 'ice' }, null, { color: 'yellow', type: 'ice' }, null],
    [{ color: 'green', type: 'time' }, null, { color: 'green', type: 'time' }, null, { color: 'yellow', type: 'time' }, null, { color: 'yellow', type: 'time' }, null]
  ],
  blockReleaseRule: { type: 'afterPairs', count: 3 }
};

const ch05Stage02: StageDefinition = {
  id: 'ch05_stage02', title: '', chapter: 5,
  boardWidth: 8, boardHeight: 6, timeLimitSec: 140, missPenaltySec: 2, hintCount: 1,
  tilesLayout: [
    [{ color: 'red', type: 'ice' }, null, null, { color: 'red', type: 'ice' }, { color: null, type: 'block' }, { color: 'blue', type: 'linked', linkGroupId: 'lg1' }, null, { color: 'blue', type: 'linked', linkGroupId: 'lg1' }],
    [null, null, null, null, null, null, null, null],
    [{ color: 'green', type: 'linked', linkGroupId: 'lg2' }, null, null, { color: 'green', type: 'linked', linkGroupId: 'lg2' }, { color: null, type: 'block' }, { color: 'blue', type: 'linked', linkGroupId: 'lg1' }, null, { color: 'blue', type: 'linked', linkGroupId: 'lg1' }],
    [null, null, null, null, null, null, null, null],
    [{ color: 'green', type: 'linked', linkGroupId: 'lg2' }, null, null, { color: 'green', type: 'linked', linkGroupId: 'lg2' }, null, { color: 'yellow', type: 'time' }, null, { color: 'yellow', type: 'time' }],
    [{ color: 'red', type: 'ice' }, null, { color: 'red', type: 'ice' }, null, { color: 'yellow', type: 'time' }, null, { color: 'yellow', type: 'time' }, null]
  ],
  blockReleaseRule: { type: 'afterPairs', count: 3 }
};

const ch05Stage03: StageDefinition = {
  id: 'ch05_stage03', title: '', chapter: 5,
  boardWidth: 8, boardHeight: 6, timeLimitSec: 130, missPenaltySec: 3, hintCount: 1,
  tilesLayout: [
    [{ color: 'red', type: 'linked', linkGroupId: 'lg1' }, null, null, { color: 'red', type: 'linked', linkGroupId: 'lg1' }, null, { color: 'blue', type: 'linked', linkGroupId: 'lg2' }, null, { color: 'blue', type: 'linked', linkGroupId: 'lg2' }],
    [null, { color: null, type: 'block' }, null, null, { color: null, type: 'block' }, null, null, null],
    [{ color: 'red', type: 'linked', linkGroupId: 'lg1' }, null, null, { color: 'red', type: 'linked', linkGroupId: 'lg1' }, null, { color: 'blue', type: 'linked', linkGroupId: 'lg2' }, null, { color: 'blue', type: 'linked', linkGroupId: 'lg2' }],
    [null, { color: null, type: 'block' }, null, null, { color: null, type: 'block' }, null, null, null],
    [{ color: 'green', type: 'ice' }, null, { color: 'green', type: 'ice' }, null, { color: 'yellow', type: 'time' }, null, { color: 'yellow', type: 'time' }, null],
    [{ color: 'green', type: 'ice' }, null, { color: 'green', type: 'ice' }, null, { color: 'yellow', type: 'time' }, null, { color: 'yellow', type: 'time' }, null]
  ],
  blockReleaseRule: { type: 'afterPairs', count: 3 }
};

// ---------- テスト ----------

const ALL_STAGES = [
  ch02Stage01, ch02Stage02, ch02Stage03,
  ch03Stage01, ch03Stage02, ch03Stage03,
  ch04Stage01, ch04Stage02, ch04Stage03,
  ch05Stage01, ch05Stage02, ch05Stage03
];

describe('Phase 2 ギミックステージ バリデーション', () => {
  for (const stage of ALL_STAGES) {
    it(`${stage.id}: 解が存在する`, () => {
      expect(StageValidator.hasSolution(stage)).toBe(true);
    });
  }

  it('全ステージの色付きタイル数が偶数', () => {
    for (const stage of ALL_STAGES) {
      let count = 0;
      for (const row of (stage.tilesLayout ?? [])) {
        for (const cell of row) {
          if (cell === null) continue;
          if (typeof cell === 'string') { count++; continue; }
          if (cell.type !== 'block') count++;
        }
      }
      expect(count % 2, `${stage.id}: tile count ${count} is odd`).toBe(0);
    }
  });
});
