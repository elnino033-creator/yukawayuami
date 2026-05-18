import type { Tile, MatchResult, HintResult } from '@/types';

/**
 * 直線判定エンジン
 *
 * 仕様書 §2.1 / §6.3 に基づく実装。
 *
 * 「空マスをクリックすると、その点を通る水平/垂直の直線上で
 *  両側にある最寄りの同色タイル同士が消える」というルールを判定する。
 *
 * 計算量は O(width + height)。
 */
export class LineChecker {
  /**
   * board[y][x] でアクセス。null は空マス。
   */
  constructor(public board: (Tile | null)[][]) {}

  /** 盤面の幅 */
  get width(): number {
    return this.board[0]?.length ?? 0;
  }

  /** 盤面の高さ */
  get height(): number {
    return this.board.length;
  }

  /**
   * 空マス (cx, cy) をクリックされた時、消えるペアを返す。
   * 見つからなければ null。
   */
  checkClick(cx: number, cy: number): MatchResult | null {
    const all = this.checkClickAll(cx, cy);
    return all.length > 0 ? all[0] : null;
  }

  /**
   * 空マス (cx, cy) をクリックされた時、消えるペアをすべて返す。
   * 水平・垂直の両方が成立する場合は2件（交点同時消し）。
   */
  checkClickAll(cx: number, cy: number): MatchResult[] {
    if (!this.isInBounds(cx, cy)) return [];
    if (this.board[cy][cx] !== null) return [];

    const results: MatchResult[] = [];

    // 水平方向
    const left = this.scanLeft(cx, cy);
    const right = this.scanRight(cx, cy);
    if (this.canPair(left, right)) {
      results.push({ a: left!, b: right!, direction: 'horizontal' });
    }

    // 垂直方向
    const up = this.scanUp(cx, cy);
    const down = this.scanDown(cx, cy);
    if (this.canPair(up, down)) {
      results.push({ a: up!, b: down!, direction: 'vertical' });
    }

    return results;
  }

  /**
   * 残された全タイルから消去可能なペアを1組探して返す。
   * ヒント表示・詰み判定の両方で使用する。
   */
  findAnyValidPair(): HintResult | null {
    // 空マスを総当たりで checkClick する。
    // 盤面が小さい（最大12×8）ので O(W*H*(W+H)) でも十分速い。
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.board[y][x] !== null) continue;
        const match = this.checkClick(x, y);
        if (match) {
          return { a: match.a, b: match.b, clickPoint: { x, y } };
        }
      }
    }
    return null;
  }

  /**
   * 盤面のすべての消去可能ペア（重複なし）を返す。
   * StageValidator から利用される。
   */
  findAllValidPairs(): MatchResult[] {
    const seen = new Set<string>();
    const results: MatchResult[] = [];

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.board[y][x] !== null) continue;
        const match = this.checkClick(x, y);
        if (!match) continue;

        // 同じペアを2回数えないために、両端のタイル座標で識別
        const key = this.pairKey(match.a, match.b);
        if (seen.has(key)) continue;
        seen.add(key);
        results.push(match);
      }
    }

    return results;
  }

  /** 2つのタイルが「同色マッチ可能」か判定 */
  private canPair(a: Tile | null, b: Tile | null): boolean {
    if (!a || !b) return false;
    if (a === b) return false;
    if (a.color === null || b.color === null) return false; // ブロック
    if (a.color !== b.color) return false;

    // ペア固定タイルのチェック
    if (a.type === 'paired' || b.type === 'paired') {
      if (a.pairId !== b.pairId) return false;
    }

    return true;
  }

  // ---------- 走査 ----------

  private scanLeft(cx: number, cy: number): Tile | null {
    for (let x = cx - 1; x >= 0; x--) {
      const t = this.board[cy][x];
      if (t !== null) return t;
    }
    return null;
  }

  private scanRight(cx: number, cy: number): Tile | null {
    for (let x = cx + 1; x < this.width; x++) {
      const t = this.board[cy][x];
      if (t !== null) return t;
    }
    return null;
  }

  private scanUp(cx: number, cy: number): Tile | null {
    for (let y = cy - 1; y >= 0; y--) {
      const t = this.board[y][cx];
      if (t !== null) return t;
    }
    return null;
  }

  private scanDown(cx: number, cy: number): Tile | null {
    for (let y = cy + 1; y < this.height; y++) {
      const t = this.board[y][cx];
      if (t !== null) return t;
    }
    return null;
  }

  // ---------- ユーティリティ ----------

  private isInBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  private pairKey(a: Tile, b: Tile): string {
    // 順序を正規化してキーを作る
    const [first, second] =
      a.y < b.y || (a.y === b.y && a.x < b.x) ? [a, b] : [b, a];
    return `${first.x},${first.y}-${second.x},${second.y}`;
  }
}
