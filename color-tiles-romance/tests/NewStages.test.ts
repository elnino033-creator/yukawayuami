/**
 * Phase 1 で追加したステージのバリデーションテスト。
 * StageValidator.hasSolution() で全ステージに解が存在することを確認する。
 */
import { describe, it, expect } from 'vitest';
import type { StageDefinition } from '../src/types';
import { StageValidator } from '../src/core/StageValidator';

// ---------- ステージ定義インライン（fetchを使わずテスト） ----------

const ch00Prologue: StageDefinition = {
  id: 'ch00_prologue',
  title: 'プロローグ：色彩の塔の招待',
  chapter: 0,
  boardWidth: 6,
  boardHeight: 4,
  timeLimitSec: 90,
  missPenaltySec: 0,
  hintCount: 3,
  tilesLayout: [
    ['red',   null, 'red',   'blue',  null, 'blue' ],
    ['green', null, 'green', 'red',   null, 'red'  ],
    ['blue',  null, 'blue',  'green', null, 'green'],
    [null,    null, null,    null,    null, null   ]
  ],
  blockReleaseRule: { type: 'never' }
};

const ch01Stage02: StageDefinition = {
  id: 'ch01_stage02',
  title: '第1章 ステージ2',
  chapter: 1,
  boardWidth: 8,
  boardHeight: 6,
  timeLimitSec: 100,
  missPenaltySec: 1,
  hintCount: 3,
  tilesLayout: [
    ['red',    null, 'red',    'blue',   null, 'blue',   null, null],
    ['green',  null, 'green',  'yellow', null, 'yellow', null, null],
    ['blue',   null, 'blue',   'red',    null, 'red',    null, null],
    ['yellow', null, 'yellow', 'green',  null, 'green',  null, null],
    ['red',    null, 'red',    'blue',   null, 'blue',   null, null],
    ['green',  null, 'green',  'yellow', null, 'yellow', null, null]
  ],
  blockReleaseRule: { type: 'never' }
};

const ch01Stage03: StageDefinition = {
  id: 'ch01_stage03',
  title: '第1章 ステージ3',
  chapter: 1,
  boardWidth: 8,
  boardHeight: 6,
  timeLimitSec: 110,
  missPenaltySec: 1,
  hintCount: 3,
  tilesLayout: [
    [null, 'red',    null, 'red',    null, 'blue',   null, 'blue'  ],
    [null, 'green',  null, 'green',  null, 'yellow', null, 'yellow'],
    ['red',  null, 'red',  null, 'blue',   null, 'blue',   null    ],
    ['green',null, 'green',null, 'yellow', null, 'yellow', null    ],
    [null, 'blue',   null, 'blue',   null, 'red',    null, 'red'   ],
    [null, 'yellow', null, 'yellow', null, 'green',  null, 'green' ]
  ],
  blockReleaseRule: { type: 'never' }
};

const ch01Stage04: StageDefinition = {
  id: 'ch01_stage04',
  title: '第1章 ステージ4',
  chapter: 1,
  boardWidth: 8,
  boardHeight: 6,
  timeLimitSec: 110,
  missPenaltySec: 1,
  hintCount: 3,
  tilesLayout: [
    ['red',    null, 'red',    null, 'yellow', null, 'yellow', null],
    ['blue',   null, 'blue',   null, 'green',  null, 'green',  null],
    [null, 'yellow', null, 'yellow', null, 'red',    null, 'red'   ],
    [null, 'green',  null, 'green',  null, 'blue',   null, 'blue'  ],
    ['red',    null, 'red',    null, 'blue',   null, 'blue',   null],
    ['green',  null, 'green',  null, 'yellow', null, 'yellow', null]
  ],
  blockReleaseRule: { type: 'never' }
};

const ch01Stage05: StageDefinition = {
  id: 'ch01_stage05',
  title: '第1章 ステージ5',
  chapter: 1,
  boardWidth: 8,
  boardHeight: 6,
  timeLimitSec: 120,
  missPenaltySec: 1,
  hintCount: 3,
  tilesLayout: [
    ['yellow', null, 'yellow', 'green',  null, 'green',  null, null],
    ['red',    null, 'red',    'blue',   null, 'blue',   null, null],
    ['green',  null, 'green',  'red',    null, 'red',    null, null],
    ['blue',   null, 'blue',   'yellow', null, 'yellow', null, null],
    ['red',    null, 'red',    'green',  null, 'green',  null, null],
    ['blue',   null, 'blue',   'yellow', null, 'yellow', null, null]
  ],
  blockReleaseRule: { type: 'never' }
};

// ---------- テスト ----------

describe('Phase 1 新ステージ バリデーション', () => {
  it('ch00_prologue: 解が存在する', () => {
    expect(StageValidator.hasSolution(ch00Prologue)).toBe(true);
  });

  it('ch00_prologue: タイル数が偶数である', () => {
    let count = 0;
    for (const row of (ch00Prologue.tilesLayout ?? [])) {
      for (const cell of row) { if (cell !== null) count++; }
    }
    expect(count % 2).toBe(0);
  });

  it('ch01_stage02: 解が存在する', () => {
    expect(StageValidator.hasSolution(ch01Stage02)).toBe(true);
  });

  it('ch01_stage03: 解が存在する', () => {
    expect(StageValidator.hasSolution(ch01Stage03)).toBe(true);
  });

  it('ch01_stage04: 解が存在する', () => {
    expect(StageValidator.hasSolution(ch01Stage04)).toBe(true);
  });

  it('ch01_stage05: 解が存在する', () => {
    expect(StageValidator.hasSolution(ch01Stage05)).toBe(true);
  });

  it('全ステージのタイル数が偶数', () => {
    const stages = [ch00Prologue, ch01Stage02, ch01Stage03, ch01Stage04, ch01Stage05];
    for (const stage of stages) {
      let count = 0;
      for (const row of (stage.tilesLayout ?? [])) {
        for (const cell of row) { if (cell !== null) count++; }
      }
      expect(count % 2, `${stage.id} tile count ${count} is odd`).toBe(0);
    }
  });
});
