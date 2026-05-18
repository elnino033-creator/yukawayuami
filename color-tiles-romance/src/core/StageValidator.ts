import type { StageDefinition, Tile, LayoutCell } from '@/types';
import { LineChecker } from './LineChecker';

/**
 * ステージ定義に「全タイル消去ルートが少なくとも1つ存在する」ことを検証する。
 *
 * 仕様書 §2.5.4 で必須要件として明記。
 *
 * 注意：氷タイルや連結タイルなど、消去回数が単純でないギミックは
 *       Phase 0 では「消去対象になれば即消える」と仮定して近似検証する。
 *       本格的な検証は Phase 2 でギミック実装と同時に拡張すること。
 */
export class StageValidator {
  /**
   * ステージに解（全消去ルート）が存在するか確認。
   */
  static hasSolution(stage: StageDefinition): boolean {
    const board = this.layoutToBoard(stage.tilesLayout ?? []);
    return this.dfs(board, new Set());
  }

  /**
   * デバッグ用：解（消去手順）を1つ返す。
   * 見つからなければ null。
   */
  static findSolution(stage: StageDefinition): string[] | null {
    const board = this.layoutToBoard(stage.tilesLayout ?? []);
    const path: string[] = [];
    return this.dfs(board, new Set(), path) ? path : null;
  }

  /**
   * バックトラックで全消去ルートを探索。
   * memo は「同じ盤面状態を再探索しない」ための簡易メモ化。
   * 氷タイル・連結タイルのギミックを正しくシミュレートする。
   */
  private static dfs(
    board: (Tile | null)[][],
    memo: Set<string>,
    path?: string[]
  ): boolean {
    if (this.isCleared(board)) return true;

    const stateKey = this.boardKey(board);
    if (memo.has(stateKey)) return false;
    memo.add(stateKey);

    const checker = new LineChecker(board);
    const rawPairs = checker.findAllValidPairs();
    // canPair でさらにフィルタ（pairId チェックなど）
    const pairs = rawPairs.filter((p) => this.canPair(p.a, p.b));
    if (pairs.length === 0) return false;

    for (const pair of pairs) {
      // ギミックを考慮した消去シミュレート
      const next = this.applyPair(board, pair);
      path?.push(`(${pair.a.x},${pair.a.y})-(${pair.b.x},${pair.b.y})`);

      if (this.dfs(next, memo, path)) return true;

      path?.pop();
    }

    return false;
  }

  /**
   * ペア消去をシミュレートして新しい盤面を返す。
   * 氷タイル・連結タイルのギミックを考慮する。
   */
  private static applyPair(
    board: (Tile | null)[][],
    pair: { a: Tile; b: Tile }
  ): (Tile | null)[][] {
    const next = board.map((row) => [...row]);
    const a = next[pair.a.y][pair.a.x];
    const b = next[pair.b.y][pair.b.x];
    if (!a || !b) return next;

    // 氷タイル処理（cracked 状態のみマッチ可能。normal 状態は LineChecker が除外済み）
    if (a.type === 'ice' || b.type === 'ice') {
      const aReady = a.type !== 'ice' || a.state === 'cracked';
      const bReady = b.type !== 'ice' || b.state === 'cracked';
      if (aReady && bReady) {
        next[a.y][a.x] = null;
        next[b.y][b.x] = null;
        this.applyAdjacentIce(next, [a, b]);
      }
      return next;
    }

    // 連結タイル処理：同じ linkGroupId のタイルをすべて消去
    if (a.type === 'linked' && b.type === 'linked' && a.linkGroupId === b.linkGroupId) {
      const removed: Tile[] = [];
      for (let y = 0; y < next.length; y++) {
        for (let x = 0; x < next[y].length; x++) {
          const t = next[y][x];
          if (t && t.linkGroupId === a.linkGroupId) {
            removed.push(t);
            next[y][x] = null;
          }
        }
      }
      this.applyAdjacentIce(next, removed);
      return next;
    }

    // 通常消去
    next[a.y][a.x] = null;
    next[b.y][b.x] = null;
    this.applyAdjacentIce(next, [a, b]);
    return next;
  }

  /**
   * 消去されたタイルに隣接する normal 状態の氷タイルを cracked に変える。
   * cracked 状態の氷タイルは消去して連鎖的に処理する。
   */
  private static applyAdjacentIce(
    board: (Tile | null)[][],
    removedTiles: Tile[]
  ): void {
    const height = board.length;
    const width = board[0]?.length ?? 0;
    const dirs: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    const toCrack: Tile[] = [];
    const toMelt: Tile[] = [];

    for (const removed of removedTiles) {
      for (const [dx, dy] of dirs) {
        const nx = removed.x + dx;
        const ny = removed.y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const neighbor = board[ny][nx];
        if (!neighbor || neighbor.type !== 'ice') continue;
        if (neighbor.state === 'normal' && !toCrack.some((t) => t.x === nx && t.y === ny)) {
          toCrack.push(neighbor);
        } else if (neighbor.state === 'cracked' && !toMelt.some((t) => t.x === nx && t.y === ny)) {
          toMelt.push(neighbor);
        }
      }
    }

    for (const t of toCrack) {
      board[t.y][t.x] = { ...board[t.y][t.x]!, state: 'cracked' };
    }

    for (const t of toMelt) {
      board[t.y][t.x] = null;
    }

    if (toMelt.length > 0) {
      this.applyAdjacentIce(board, toMelt);
    }
  }

  /**
   * ペアとして消去できるか判定する（LineChecker.canPair と同等）。
   * pairId チェックなど StageValidator 独自のフィルタを含む。
   */
  private static canPair(a: Tile, b: Tile): boolean {
    if (a.color === null || b.color === null) return false;
    if (a.color !== b.color) return false;
    if (a.type === 'block' || b.type === 'block') return false;
    if (a.type === 'paired' && b.type === 'paired' && a.pairId !== b.pairId) return false;
    return true;
  }

  /** クリア判定：色付きタイルが残っていないか */
  private static isCleared(board: (Tile | null)[][]): boolean {
    for (const row of board) {
      for (const tile of row) {
        if (tile === null) continue;
        if (tile.type === 'block') continue; // ブロックは無視
        return false;
      }
    }
    return true;
  }

  /** レイアウト指定から内部 Tile 配列に変換 */
  private static layoutToBoard(layout: LayoutCell[][]): (Tile | null)[][] {
    return layout.map((row, y) =>
      row.map((cell, x) => this.cellToTile(cell, x, y))
    );
  }

  private static cellToTile(cell: LayoutCell, x: number, y: number): Tile | null {
    if (cell === null) return null;
    if (typeof cell === 'string') {
      return { x, y, color: cell, type: 'normal', state: 'normal' };
    }
    return {
      x,
      y,
      color: cell.color,
      type: cell.type ?? 'normal',
      state: 'normal',
      pairId: cell.pairId,
      linkGroupId: cell.linkGroupId
    };
  }

  /**
   * 盤面状態の文字列キー（メモ化用）。
   * 氷タイルの cracked 状態を区別するため、状態も含める。
   */
  private static boardKey(board: (Tile | null)[][]): string {
    return board
      .map((row) =>
        row
          .map((t) => {
            if (t === null) return '.';
            const base = t.color ?? '#';
            return t.state === 'cracked' ? base + '*' : base;
          })
          .join('')
      )
      .join('|');
  }
}
