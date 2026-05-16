import { describe, it, expect } from 'vitest';
import { LineChecker } from '@/core/LineChecker';
import type { Tile } from '@/types';

function tile(x: number, y: number, color: string | null, type: Tile['type'] = 'normal'): Tile {
  return { x, y, color, type, state: 'normal' };
}

function buildBoard(rows: (Tile | null)[][]): (Tile | null)[][] {
  // x, y を再設定
  return rows.map((row, y) =>
    row.map((cell, x) => (cell ? { ...cell, x, y } : null))
  );
}

describe('LineChecker', () => {
  it('水平方向で同色タイルがマッチする', () => {
    const board = buildBoard([
      [tile(0, 0, 'red'), null, null, tile(3, 0, 'red')]
    ]);
    const checker = new LineChecker(board);
    const result = checker.checkClick(1, 0);
    expect(result).not.toBeNull();
    expect(result?.direction).toBe('horizontal');
    expect(result?.a.color).toBe('red');
    expect(result?.b.color).toBe('red');
  });

  it('垂直方向で同色タイルがマッチする', () => {
    const board = buildBoard([
      [tile(0, 0, 'blue')],
      [null],
      [null],
      [tile(0, 3, 'blue')]
    ]);
    const checker = new LineChecker(board);
    const result = checker.checkClick(0, 1);
    expect(result).not.toBeNull();
    expect(result?.direction).toBe('vertical');
  });

  it('色違いはマッチしない', () => {
    const board = buildBoard([
      [tile(0, 0, 'red'), null, tile(2, 0, 'blue')]
    ]);
    const checker = new LineChecker(board);
    expect(checker.checkClick(1, 0)).toBeNull();
  });

  it('間にタイルがあるとマッチしない（壁役）', () => {
    const board = buildBoard([
      [tile(0, 0, 'red'), null, tile(2, 0, 'green'), null, tile(4, 0, 'red')]
    ]);
    const checker = new LineChecker(board);
    // クリック点(1,0)の右側で最初に見つかるのはgreen
    expect(checker.checkClick(1, 0)).toBeNull();
    // クリック点(3,0)の左側で最初に見つかるのもgreen
    expect(checker.checkClick(3, 0)).toBeNull();
  });

  it('タイルの上をクリックしたら null を返す', () => {
    const board = buildBoard([
      [tile(0, 0, 'red'), null, tile(2, 0, 'red')]
    ]);
    const checker = new LineChecker(board);
    expect(checker.checkClick(0, 0)).toBeNull();
  });

  it('片側にタイルがなければマッチしない', () => {
    const board = buildBoard([
      [null, null, tile(2, 0, 'red')]
    ]);
    const checker = new LineChecker(board);
    expect(checker.checkClick(0, 0)).toBeNull();
  });

  it('色なし（block）はマッチに参加しない', () => {
    const board = buildBoard([
      [tile(0, 0, 'red', 'block'), null, tile(2, 0, 'red')]
    ]);
    // blockなので color は null と仮定して上書き
    board[0][0]!.color = null;
    const checker = new LineChecker(board);
    expect(checker.checkClick(1, 0)).toBeNull();
  });

  it('水平が成立しなければ垂直も評価される', () => {
    const board = buildBoard([
      [tile(0, 0, 'red'),    null,  tile(2, 0, 'blue')],
      [null,                 null,  null              ],
      [tile(0, 2, 'green'),  null,  tile(2, 2, 'red') ]
    ]);
    const checker = new LineChecker(board);
    // (1,0) は水平ではマッチしないが、垂直では…(1,0)の上下にタイルがないので不成立
    expect(checker.checkClick(1, 0)).toBeNull();
    // (2,1) は水平ではタイルがないのでスルー、垂直で blue↔red なので不成立
    expect(checker.checkClick(2, 1)).toBeNull();
  });

  it('findAnyValidPair が消去可能なペアを発見する', () => {
    const board = buildBoard([
      [tile(0, 0, 'red'), null, tile(2, 0, 'red')]
    ]);
    const checker = new LineChecker(board);
    const result = checker.findAnyValidPair();
    expect(result).not.toBeNull();
    expect(result?.clickPoint).toEqual({ x: 1, y: 0 });
  });

  it('findAnyValidPair が消去不能な盤面で null を返す', () => {
    const board = buildBoard([
      [tile(0, 0, 'red'), tile(1, 0, 'green')]
    ]);
    const checker = new LineChecker(board);
    expect(checker.findAnyValidPair()).toBeNull();
  });

  it('findAllValidPairs が同じペアを2回数えない', () => {
    const board = buildBoard([
      [tile(0, 0, 'red'), null, null, tile(3, 0, 'red')]
    ]);
    const checker = new LineChecker(board);
    const pairs = checker.findAllValidPairs();
    // (1,0), (2,0) どちらをクリックしても同じペアが消えるが、ペア数は1
    expect(pairs).toHaveLength(1);
  });
});
