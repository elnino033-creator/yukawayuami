import type { LayoutCell } from '@/types';

export interface StageGenerationParams {
  seed: number;
  targetPairs: number;
  colors?: string[];
  /** 0-1: タイルをランダムに氷タイルへ変換する確率 */
  iceChance?: number;
  /** 0-1: タイルをランダムにタイムタイルへ変換する確率 */
  timeTileChance?: number;
  /** nullセルに配置する障害ブロック数 */
  blockCount?: number;
}

const DEFAULT_COLORS = ['red', 'blue', 'green', 'yellow', 'purple'];

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
 * アルゴリズム（正確には「コリドークリア保証ペア配置法」）:
 *   1. 空ボードにペアを1組ずつ配置する。
 *      新しいペア (A, B) を配置するとき、A-B間のコリドー（同行 or 同列内で
 *      A〜Bを結ぶセル列）に既存タイルが存在しないことを要求する。
 *   2. 解手順は「配置の逆順」になる。
 *      配置順 1,2,...,N に対して解順 N,N-1,...,1 で必ず全ペアが消える。
 *
 * 証明の要点: ペアKを配置した時点でそのコリドーは空。
 * 後から配置されたペアK+1..Nを先に消せばコリドーが復活し、Kが消せる。
 * これを帰納的に繰り返すと全ペアが消える。
 */
export class StageGenerator {
  static generate(
    boardWidth: number,
    boardHeight: number,
    params: StageGenerationParams
  ): LayoutCell[][] {
    const rng = new SeededRng(params.seed);
    const colors = params.colors ?? DEFAULT_COLORS;
    const { targetPairs, iceChance = 0, timeTileChance = 0, blockCount = 0 } = params;

    // Phase 1: 空ボードに通常タイルペアを配置
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
        pair = this.pickPair(raw[row], rng);
        if (!pair) continue;
        raw[row][pair[0]] = colors[colorIdx % colors.length];
        raw[row][pair[1]] = colors[colorIdx % colors.length];
      } else {
        const col = rng.int(boardWidth);
        const colSlice = raw.map(r => r[col]);
        pair = this.pickPair(colSlice, rng);
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
          result[y][x] = { color, type: 'ice' };
        } else if (r < iceChance + timeTileChance) {
          result[y][x] = { color, type: 'time' };
        }
      }
    }

    // Phase 3: 障害ブロックをランダムなnullセルに配置
    if (blockCount > 0) {
      const empties: Array<[number, number]> = [];
      for (let y = 0; y < boardHeight; y++) {
        for (let x = 0; x < boardWidth; x++) {
          if (result[y][x] === null) empties.push([y, x]);
        }
      }
      // 部分Fisher-Yates: 後ろからblockCount個を選ぶ
      const take = Math.min(blockCount, empties.length);
      for (let i = empties.length - 1; i >= empties.length - take; i--) {
        const j = rng.int(i + 1);
        [empties[i], empties[j]] = [empties[j], empties[i]];
      }
      for (let i = empties.length - take; i < empties.length; i++) {
        const [y, x] = empties[i];
        result[y][x] = { color: null, type: 'block' } as LayoutCell;
      }
    }

    return result;
  }

  /**
   * 1Dライン内のnullスパン（連続null区間）から有効なペア (a, b) をランダムに選ぶ。
   *
   * 有効条件:
   *   - line[a] === null, line[b] === null
   *   - a+1〜b-1 もすべてnull（コリドークリア）
   *   - b - a >= 2（間に少なくとも1つのnullセル＝クリックポイントが存在する）
   *
   * 実装: 各nullスパン内の全ペアを列挙して一様ランダムに選ぶ。
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
        // スパン長 >= 2 の場合のみペアを生成（b-a>=2 を満たすには最低3セル必要）
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
}
