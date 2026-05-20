import type { LayoutCell } from '@/types';

export interface StageGenerationParams {
  seed: number;
  targetPairs: number;
  colors?: string[];
  /** 0-1: タイルをランダムに氷タイルへ変換する確率 */
  iceChance?: number;
  /** 0-1: タイルをランダムにタイムタイルへ変換する確率 */
  timeTileChance?: number;
  /** アクティブな経路マスに優先配置する障害ブロック数 */
  blockCount?: number;
  /**
   * true のとき「dense戦略」を使用:
   * nullスパンの端点を優先してペアを配置し、密度を最大化する。
   * 最終章の高難易度ステージ向け。
   */
  dense?: boolean;
  /**
   * ブロック配置後に保証する最小アクティブクリックポイント数。
   * blockReleaseRule.count と同値にするとちょうど良い。省略時は blockCount と同値。
   */
  minFreePairs?: number;
}

/** 全10色。chapterが上がるにつれて色が追加されていく */
const ALL_COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'cyan', 'teal', 'brown'];
const DEFAULT_COLORS = ALL_COLORS.slice(0, 5);

// ---------- Mulberry32 シード付き疑似乱数 ----------

class SeededRng {
  private s: number;
  constructor(seed: number) { this.s = seed >>> 0; }

  next(): number {
    this.s = (this.s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  }

  int(n: number): number { return Math.floor(this.next() * n); }
  bool(p: number): boolean { return this.next() < p; }
}

// ---------- ジェネレーター本体 ----------

/**
 * ランダムなタイルレイアウトを生成する。
 *
 * アルゴリズム（コリドークリア保証ペア配置法）:
 *   1. 空ボードにペアを1組ずつ配置。
 *      新ペア (A,B) の配置時、A-B間のコリドーに既存タイルが無いことを保証。
 *   2. 解手順 = 配置の逆順 で全ペアが消える（理論保証）。
 *
 * dense=true の場合:
 *   nullスパンの端点ペア (spanStart, spanEnd) を 70% の確率で優先使用。
 *   スパンを効率よく消費して密度を 70〜75% まで引き上げる。
 *
 * 障害ブロック配置（blockCount > 0 の場合）:
 *   ランダムな空マスではなく「現在マッチが成立する経路上のマス（ホットセル）」を
 *   優先的にブロックする。ただし「残存ホットセル >= minFreePairs」を保証し、
 *   条件を満たせない場合はそのマスへの配置を却下する。
 */
export class StageGenerator {
  static generate(
    boardWidth: number,
    boardHeight: number,
    params: StageGenerationParams
  ): LayoutCell[][] {
    const rng = new SeededRng(params.seed);
    const colors = params.colors ?? DEFAULT_COLORS;
    const { targetPairs, iceChance = 0, timeTileChance = 0, blockCount = 0, dense = false } = params;
    const minFreePairs = params.minFreePairs ?? blockCount;

    // Phase 1: ペアを順番に配置
    const raw: (string | null)[][] = Array.from({ length: boardHeight }, () =>
      Array<string | null>(boardWidth).fill(null)
    );

    let placed = 0;
    let colorIdx = 0;

    for (let attempt = 0; attempt < targetPairs * 200 && placed < targetPairs; attempt++) {
      const horiz = rng.bool(0.5);
      let pair: [number, number] | null;

      if (horiz) {
        const row = rng.int(boardHeight);
        pair = dense ? this.pickPairDense(raw[row], rng) : this.pickPair(raw[row], rng);
        if (!pair) continue;
        raw[row][pair[0]] = colors[colorIdx % colors.length];
        raw[row][pair[1]] = colors[colorIdx % colors.length];
      } else {
        const col = rng.int(boardWidth);
        const colSlice = raw.map(r => r[col]);
        pair = dense ? this.pickPairDense(colSlice, rng) : this.pickPair(colSlice, rng);
        if (!pair) continue;
        raw[pair[0]][col] = colors[colorIdx % colors.length];
        raw[pair[1]][col] = colors[colorIdx % colors.length];
      }

      colorIdx++;
      placed++;
    }

    // Phase 2: 氷・タイムタイルへのランダム変換
    const result: LayoutCell[][] = raw.map(row => [...row] as LayoutCell[]);

    for (let y = 0; y < boardHeight; y++) {
      for (let x = 0; x < boardWidth; x++) {
        const color = raw[y][x];
        if (!color) continue;
        const r = rng.next();
        if (r < iceChance) {
          // 隣接タイルがないと氷は永遠にヒビが入らず攻略不可になるためスキップ
          const hasAdjacentTile = [[-1,0],[1,0],[0,-1],[0,1]].some(([dx, dy]) => {
            const nx = x + dx, ny = y + dy;
            return nx >= 0 && ny >= 0 && nx < boardWidth && ny < boardHeight && raw[ny][nx] !== null;
          });
          if (hasAdjacentTile) {
            result[y][x] = { color, type: 'ice' };
          }
        } else if (r < iceChance + timeTileChance) {
          result[y][x] = { color, type: 'time' };
        }
      }
    }

    // Phase 3: 障害ブロックを「アクティブな経路マス（ホットセル）」に優先配置
    if (blockCount > 0) {
      const hotCells: Array<[number, number]> = [];
      const coldCells: Array<[number, number]> = [];

      for (let y = 0; y < boardHeight; y++) {
        for (let x = 0; x < boardWidth; x++) {
          if (result[y][x] !== null) continue;
          if (this.isHotCell(result, x, y, boardWidth, boardHeight)) {
            hotCells.push([y, x]);
          } else {
            coldCells.push([y, x]);
          }
        }
      }

      // ホットセルをシャッフル（多様性確保）
      for (let i = hotCells.length - 1; i > 0; i--) {
        const j = rng.int(i + 1);
        [hotCells[i], hotCells[j]] = [hotCells[j], hotCells[i]];
      }

      // ホットセルにブロックを1つずつ配置しながら「残存ホットセル >= minFreePairs」を保証
      const workBoard = result.map(row => [...row] as LayoutCell[]);
      let blocksPlaced = 0;

      for (const [y, x] of hotCells) {
        if (blocksPlaced >= blockCount) break;

        // 仮配置
        workBoard[y][x] = { color: null, type: 'block' } as LayoutCell;

        // 残存ホットセル数をカウント（minFreePairs 到達で早期打ち切り）
        let freeHot = 0;
        outer: for (let ry = 0; ry < boardHeight; ry++) {
          for (let rx = 0; rx < boardWidth; rx++) {
            if (workBoard[ry][rx] !== null) continue;
            if (this.isHotCell(workBoard, rx, ry, boardWidth, boardHeight)) {
              freeHot++;
              if (freeHot >= minFreePairs) break outer;
            }
          }
        }

        if (freeHot >= minFreePairs) {
          // 配置確定
          result[y][x] = { color: null, type: 'block' } as LayoutCell;
          blocksPlaced++;
        } else {
          // 攻略不可になるため却下、仮配置を取り消す
          workBoard[y][x] = null;
        }
      }

      // 不足分：コールドセル（非経路の空マス）から補充
      if (blocksPlaced < blockCount) {
        for (let i = coldCells.length - 1; i > 0; i--) {
          const j = rng.int(i + 1);
          [coldCells[i], coldCells[j]] = [coldCells[j], coldCells[i]];
        }
        for (const [y, x] of coldCells) {
          if (blocksPlaced >= blockCount) break;
          if (result[y][x] === null) {
            result[y][x] = { color: null, type: 'block' } as LayoutCell;
            blocksPlaced++;
          }
        }
      }
    }

    return result;
  }

  /**
   * 空マス (cx, cy) が現在いずれかのマッチを成立させる「経路上のマス」かどうかを判定。
   * ここにブロックを置くと、そのマッチが一時的に不能になる。
   */
  private static isHotCell(
    board: LayoutCell[][],
    cx: number,
    cy: number,
    _boardWidth: number,
    _boardHeight: number
  ): boolean {
    const L = this.scanRowColor(board[cy], cx - 1, -1);
    const R = this.scanRowColor(board[cy], cx + 1, 1);
    const U = this.scanColColor(board, cx, cy - 1, -1);
    const D = this.scanColColor(board, cx, cy + 1, 1);

    const match = (a: string | null, b: string | null) =>
      a !== null && b !== null && a === b;

    return (
      match(L, R) || match(U, D) ||
      match(U, L) || match(U, R) ||
      match(D, L) || match(D, R)
    );
  }

  /** 行を指定方向にスキャンし、最初に見つかった色付きタイルの色を返す。ブロックや端でnull。 */
  private static scanRowColor(row: LayoutCell[], startX: number, dx: number): string | null {
    for (let x = startX; x >= 0 && x < row.length; x += dx) {
      const cell = row[x];
      if (cell === null) continue; // 空マス：スキャン継続
      return this.cellColor(cell); // タイル（色付き or ブロック）：停止
    }
    return null;
  }

  /** 列を指定方向にスキャンし、最初に見つかった色付きタイルの色を返す。ブロックや端でnull。 */
  private static scanColColor(board: LayoutCell[][], cx: number, startY: number, dy: number): string | null {
    for (let y = startY; y >= 0 && y < board.length; y += dy) {
      const cell = board[y][cx];
      if (cell === null) continue;
      return this.cellColor(cell);
    }
    return null;
  }

  /** LayoutCell からタイル色を取得。ブロック（color:null）はnullを返す。 */
  private static cellColor(cell: LayoutCell): string | null {
    if (cell === null) return null;
    if (typeof cell === 'string') return cell;
    return (cell as { color: string | null }).color ?? null;
  }

  /**
   * 通常戦略: nullスパンから有効なペアをランダムに選ぶ。
   * 有効条件: 両端がnull、間もすべてnull、距離>=2。
   */
  private static pickPair(
    line: (string | null)[],
    rng: SeededRng
  ): [number, number] | null {
    const pairs: Array<[number, number]> = [];
    let spanStart = -1;

    for (let i = 0; i <= line.length; i++) {
      const isNull = i < line.length && line[i] === null;
      if (isNull && spanStart === -1) {
        spanStart = i;
      } else if (!isNull && spanStart !== -1) {
        const spanEnd = i - 1;
        for (let a = spanStart; a <= spanEnd - 2; a++) {
          for (let b = a + 2; b <= spanEnd; b++) {
            pairs.push([a, b]);
          }
        }
        spanStart = -1;
      }
    }

    if (pairs.length === 0) return null;
    return pairs[rng.int(pairs.length)];
  }

  /**
   * Dense戦略: スパンの端点ペア (spanStart, spanEnd) を 70% の確率で優先。
   * 残りのnullスパンを最大化し、高密度なボードを生成する。
   */
  private static pickPairDense(
    line: (string | null)[],
    rng: SeededRng
  ): [number, number] | null {
    const spans: Array<[number, number]> = [];
    let spanStart = -1;

    for (let i = 0; i <= line.length; i++) {
      const isNull = i < line.length && line[i] === null;
      if (isNull && spanStart === -1) {
        spanStart = i;
      } else if (!isNull && spanStart !== -1) {
        if (i - 1 - spanStart >= 2) spans.push([spanStart, i - 1]);
        spanStart = -1;
      }
    }

    if (spans.length === 0) return null;

    const [s, e] = spans[rng.int(spans.length)];

    // 70%の確率で端点ペア → スパンフラグメントを最小化して密度を上げる
    if (rng.bool(0.7)) return [s, e];

    // 30%はランダムペア（レイアウトの多様性を保つ）
    const pairs: Array<[number, number]> = [];
    for (let a = s; a <= e - 2; a++) {
      for (let b = a + 2; b <= e; b++) {
        pairs.push([a, b]);
      }
    }
    return pairs[rng.int(pairs.length)];
  }
}
