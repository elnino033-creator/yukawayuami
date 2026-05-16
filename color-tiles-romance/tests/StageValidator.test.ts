import { describe, it, expect } from 'vitest';
import { StageValidator } from '@/core/StageValidator';
import type { StageDefinition } from '@/types';

const baseStage: Omit<StageDefinition, 'tilesLayout' | 'boardWidth' | 'boardHeight'> = {
  id: 'test',
  title: 'test',
  chapter: 0,
  timeLimitSec: 60,
  missPenaltySec: 0,
  hintCount: 3,
  blockReleaseRule: { type: 'never' }
};

describe('StageValidator', () => {
  it('単純な水平ペアの解を見つける', () => {
    const stage: StageDefinition = {
      ...baseStage,
      boardWidth: 4,
      boardHeight: 1,
      tilesLayout: [['red', null, null, 'red']]
    };
    expect(StageValidator.hasSolution(stage)).toBe(true);
  });

  it('解のない盤面で false を返す', () => {
    // 隣接2タイルで色違い：間に空マスがないからクリックできない
    const stage: StageDefinition = {
      ...baseStage,
      boardWidth: 2,
      boardHeight: 1,
      tilesLayout: [['red', 'blue']]
    };
    expect(StageValidator.hasSolution(stage)).toBe(false);
  });

  it('複数ペアの解探索：順番が問題になるケース', () => {
    // 正しい順番で消さないと壁になる配置
    const stage: StageDefinition = {
      ...baseStage,
      boardWidth: 5,
      boardHeight: 3,
      tilesLayout: [
        ['red',   null, null, null, 'red'  ],
        [null,    null, null, null, null   ],
        ['blue',  null, null, null, 'blue' ]
      ]
    };
    expect(StageValidator.hasSolution(stage)).toBe(true);
  });

  it('ブロックがあっても解判定はOK', () => {
    const stage: StageDefinition = {
      ...baseStage,
      boardWidth: 5,
      boardHeight: 1,
      tilesLayout: [
        ['red', null, { type: 'block', color: null }, null, 'red']
      ]
    };
    // blockが間にあると red が結べない → 解なし
    expect(StageValidator.hasSolution(stage)).toBe(false);
  });

  it('findSolution が消去手順を返す', () => {
    const stage: StageDefinition = {
      ...baseStage,
      boardWidth: 4,
      boardHeight: 1,
      tilesLayout: [['red', null, null, 'red']]
    };
    const solution = StageValidator.findSolution(stage);
    expect(solution).not.toBeNull();
    expect(solution?.length).toBe(1);
  });
});
