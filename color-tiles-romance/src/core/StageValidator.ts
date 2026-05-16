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
    const board = this.layoutToBoard(stage.tilesLayout);
    return this.dfs(board, new Set());
  }

  /**
   * デバッグ用：解（消去手順）を1つ返す。
   * 見つからなければ null。
   */
  static findSolution(stage: StageDefinition): string[] | null {
    const board = this.layoutToBoard(stage.tilesLayout);
    const path: string[] = [];
    return this.dfs(board, new Set(), path) ? path : null;
  }

  /**
   * バックトラックで全消去ルートを探索。
   * memo は「同じ盤面状態を再探索しない」ための簡易メモ化。
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
    const pairs = checker.findAllValidPairs();
    if (pairs.length === 0) return false;

    for (const pair of pairs) {
      // 消去をシミュレート
      const a = board[pair.a.y][pair.a.x];
      const b = board[pair.b.y][pair.b.x];
      board[pair.a.y][pair.a.x] = null;
      board[pair.b.y][pair.b.x] = null;
      path?.push(`(${pair.a.x},${pair.a.y})-(${pair.b.x},${pair.b.y})`);

      if (this.dfs(board, memo, path)) return true;

      // 巻き戻し
      board[pair.a.y][pair.a.x] = a;
      board[pair.b.y][pair.b.x] = b;
      path?.pop();
    }

    return false;
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

  /** 盤面状態の文字列キー（メモ化用） */
  private static boardKey(board: (Tile | null)[][]): string {
    return board
      .map((row) =>
        row.map((t) => (t === null ? '.' : (t.color ?? '#'))).join('')
      )
      .join('|');
  }
}
