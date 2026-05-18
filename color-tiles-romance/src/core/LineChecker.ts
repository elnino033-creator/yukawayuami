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
   * - 水平直線マッチ (左+右)
   * - 垂直直線マッチ (上+下)
   * - L字コーナーマッチ (上+左 / 上+右 / 下+左 / 下+右)
   * 交点では最大2件（4タイル同時消し）が返る。
   */
  checkClickAll(cx: number, cy: number): MatchResult[] {
    if (!this.isInBounds(cx, cy)) return [];
    if (this.board[cy][cx] !== null) return [];

    const L = this.scanLeft(cx, cy);
    const R = this.scanRight(cx, cy);
    const U = this.scanUp(cx, cy);
    const D = this.scanDown(cx, cy);

    const results: MatchResult[] = [];
    const addedKeys = new Set<string>();

    const tryAdd = (a: Tile | null, b: Tile | null, dir: MatchResult['direction']) => {
      if (!this.canPair(a, b)) return;
      const key = this.pairKey(a!, b!);
      if (addedKeys.has(key)) return;
      addedKeys.add(key);
      results.push({ a: a!, b: b!, direction: dir });
    };

    // 直線マッチ
    tryAdd(L, R, 'horizontal');
    tryAdd(U, D, 'vertical');

    // L字マッチ（クリックセルをコーナーとして2方向のタイルをペアリング）
    tryAdd(U, L, 'corner');
    tryAdd(U, R, 'corner');
    tryAdd(D, L, 'corner');
    tryAdd(D, R, 'corner');

    return results;
  }

  /**
   * 残された全タイルから消去可能なペアを1組探して返す。
   * ヒント表示・詰み判定の両方で使用する。L字マッチも対象。
   */
  findAnyValidPair(): HintResult | null {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.board[y][x] !== null) continue;
        const matches = this.checkClickAll(x, y);
        if (matches.length > 0) {
          const m = matches[0];
          return { a: m.a, b: m.b, clickPoint: { x, y } };
        }
      }
    }
    return null;
  }

  /**
   * 盤面のすべての消去可能ペア（重複なし）を返す。
   * StageValidator から利用される。L字マッチも対象。
   */
  findAllValidPairs(): MatchResult[] {
    const seen = new Set<string>();
    const results: MatchResult[] = [];

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.board[y][x] !== null) continue;
        for (const match of this.checkClickAll(x, y)) {
          const key = this.pairKey(match.a, match.b);
          if (seen.has(key)) continue;
          seen.add(key);
          results.push(match);
        }
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
    if (a.type === 'ice' || b.type === 'ice') return false; // 氷は直接マッチ不可

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
