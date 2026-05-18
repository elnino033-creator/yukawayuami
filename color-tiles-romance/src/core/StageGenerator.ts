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
  /**
   * true のとき「dense戦略」を使用:
   * nullスパンの端点を優先してペアを配置し、密度を最大化する。
   * 最終章の高難易度ステージ向け。
   */
  dense?: boolean;
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
