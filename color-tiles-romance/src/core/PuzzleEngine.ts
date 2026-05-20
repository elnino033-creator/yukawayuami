import type {
  StageDefinition,
  Tile,
  LayoutCell,
  ClickResult,
  HintResult,
  BlockReleaseRule
} from '@/types';
import { LineChecker } from './LineChecker';
import { TimerSystem } from './TimerSystem';

/** スコア情報 */
export interface ScoreSnapshot {
  score: number;
  combo: number;
  maxCombo: number;
  pairsCleared: number;
  missCount: number;
  hintUsed: number;
}

type EngineEvent =
  | { type: 'tilesRemoved'; tiles: Tile[]; bonusSec?: number }
  | { type: 'iceCracked'; tiles: Tile[] }
  | { type: 'miss'; clickPoint: { x: number; y: number }; penaltySec: number }
  | { type: 'shuffle' }
  | { type: 'blocksReleased'; tiles: Tile[] }
  | { type: 'cleared' }
  | { type: 'gameOver' };

type EventListener = (e: EngineEvent) => void;

/**
 * パズル全体の状態と振る舞いを管理する。
 * 仕様書 §6.3 B.
 */
export class PuzzleEngine {
  board: (Tile | null)[][] = [];
  width = 0;
  height = 0;

  private checker!: LineChecker;
  readonly timer = new TimerSystem();

  private score = 0;
  private combo = 0;
  private maxCombo = 0;
  private lastClearAt = 0;
  private pairsCleared = 0;
  private missCount = 0;
  private hintUsed = 0;
  private hintRemain = 0;
  private missPenaltySec = 0;
  private blockRule: BlockReleaseRule = { type: 'never' };
  private blocksReleased = false;
  private startedAtMs = 0;

  private listeners: EventListener[] = [];

  /** コンボ継続の判定窓（ms）*/
  static readonly COMBO_WINDOW_MS = 3000;

  /**
   * ステージをロードして開始する。
   */
  loadStage(stage: StageDefinition): void {
    this.board = this.layoutToBoard(stage.tilesLayout ?? []);
    this.width = stage.boardWidth;
    this.height = stage.boardHeight;
    this.checker = new LineChecker(this.board);

    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.lastClearAt = 0;
    this.pairsCleared = 0;
    this.missCount = 0;
    this.hintUsed = 0;
    this.hintRemain = stage.hintCount;
    this.missPenaltySec = stage.missPenaltySec;
    this.blockRule = stage.blockReleaseRule ?? { type: 'never' };
    this.blocksReleased = false;
    this.startedAtMs = Date.now();

    this.timer.start(stage.timeLimitSec);
    this.timer.onTimeUp(() => this.emit({ type: 'gameOver' }));
  }

  /**
   * 空マス (cx, cy) のクリック処理。
   * 交点では水平・垂直同時消し（最大4タイル）が発生する。
   */
  onCellClick(cx: number, cy: number): ClickResult {
    if (!this.timer.isRunning) return { type: 'noop' };
    if (cx < 0 || cy < 0 || cx >= this.width || cy >= this.height) {
      return { type: 'noop' };
    }
    if (this.board[cy][cx] !== null) {
      return { type: 'noop' }; // タイル上のクリックは無効
    }

    const matches = this.checker.checkClickAll(cx, cy);
    if (matches.length === 0) {
      // 誤クリック
      this.missCount++;
      this.combo = 0;
      if (this.missPenaltySec > 0) {
        this.timer.subtract(this.missPenaltySec);
      }
      this.emit({
        type: 'miss',
        clickPoint: { x: cx, y: cy },
        penaltySec: this.missPenaltySec
      });
      return { type: 'miss' };
    }

    // 交点同時消し（水平+垂直の両マッチ）または単一マッチ
    if (matches.length === 1) {
      const { a, b } = matches[0];
      if (a.type === 'linked' && b.type === 'linked' && a.linkGroupId && a.linkGroupId === b.linkGroupId) {
        return this.handleLinkedChainRemoval(a, b);
      }
      return this.applyRemoval(a, b);
    }

    // 2マッチ（交点同時消し）: 最大4タイルを一括処理
    return this.applyMultiRemoval(matches);
  }

  /**
   * 消去されたタイルに隣接する normal 状態の氷タイルを cracked に変える。
   * cracked になった氷タイルは次のターンから通常タイルと同様にマッチ可能になる。
   */
  private checkAdjacentIce(removedTiles: Tile[]): void {
    const toCrack: Tile[] = [];
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const removed of removedTiles) {
      for (const [dx, dy] of dirs) {
        const nx = removed.x + dx;
        const ny = removed.y + dy;
        if (nx < 0 || ny < 0 || nx >= this.width || ny >= this.height) continue;
        const neighbor = this.board[ny][nx];
        if (!neighbor || neighbor.type !== 'ice' || neighbor.state !== 'normal') continue;
        if (!toCrack.includes(neighbor)) toCrack.push(neighbor);
      }
    }
    if (toCrack.length > 0) {
      for (const t of toCrack) t.state = 'cracked';
      this.emit({ type: 'iceCracked', tiles: toCrack });
    }
  }

  /**
   * 連結タイルがマッチした際の処理。
   * 同じ linkGroupId を持つタイルをすべて盤面から一括消去する。
   * スコア・コンボ・時間ボーナスは applyRemoval と同様のロジックで計算する。
   */
  private handleLinkedChainRemoval(a: Tile, _b: Tile): ClickResult {
    const now = Date.now();

    // コンボ判定
    if (now - this.lastClearAt <= PuzzleEngine.COMBO_WINDOW_MS) {
      this.combo++;
    } else {
      this.combo = 1;
    }
    this.lastClearAt = now;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;

    // グループ全体を収集して削除
    const groupId = a.linkGroupId!;
    const removed: Tile[] = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const t = this.board[y][x];
        if (t && t.linkGroupId === groupId) {
          removed.push(t);
          this.board[y][x] = null;
        }
      }
    }

    // 時間タイル相当の bonus（linked グループ内の time タイルも考慮）
    const bonusSec = 0;
    if (bonusSec > 0) this.timer.add(bonusSec);

    // スコア加算（ペア1組分 + グループ追加タイル分）
    this.score += 100;
    if (this.combo >= 2) this.score += this.combo * 50;

    this.pairsCleared++;

    this.emit({ type: 'tilesRemoved', tiles: removed, bonusSec });

    // 隣接する氷タイルを処理
    this.checkAdjacentIce(removed);

    // 障害ブロック解除条件チェック
    this.checkBlockRelease();

    // クリア判定
    if (this.isCleared()) {
      this.timer.stop();
      this.score += this.timer.remain * 10;
      if (this.hintUsed === 0) this.score += 1000;
      if (this.missCount === 0) this.score += 500;
      this.emit({ type: 'cleared' });
    } else if (this.isStuck()) {
      this.timer.stop();
      setTimeout(() => this.emit({ type: 'gameOver' }), 1500);
    }

    return { type: 'success', removed, bonusSec };
  }

  /**
   * 交点・T字・L字同時消し：複数マッチを一括処理する。
   *
   * 各マッチが参照するタイルを位置キーで重複排除してから消去するため、
   * T字（3方向）などで同一タイルが複数マッチに登場しても正しく1回だけ消える。
   */
  private applyMultiRemoval(matches: import('@/types').MatchResult[]): ClickResult {
    const now = Date.now();

    if (now - this.lastClearAt <= PuzzleEngine.COMBO_WINDOW_MS) {
      this.combo++;
    } else {
      this.combo = 1;
    }
    this.lastClearAt = now;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;

    // 全マッチのタイルを位置キーで重複排除して収集
    const tileMap = new Map<string, Tile>();
    for (const match of matches) {
      for (const tile of [match.a, match.b]) {
        const key = `${tile.x},${tile.y}`;
        if (!tileMap.has(key)) {
          const t = this.board[tile.y]?.[tile.x];
          if (t) tileMap.set(key, t);
        }
      }
    }

    const allRemoved: Tile[] = [];
    const cracked: Tile[] = [];
    let bonusSec = 0;

    for (const tile of tileMap.values()) {
      // 氷タイル: normal 状態ならヒビを入れるだけ（消去しない）
      if (tile.type === 'ice' && tile.state === 'normal') {
        tile.state = 'cracked';
        cracked.push(tile);
        continue;
      }

      if (tile.type === 'time') bonusSec += 10;
      this.board[tile.y][tile.x] = null;
      allRemoved.push(tile);
    }

    if (cracked.length > 0) this.emit({ type: 'iceCracked', tiles: cracked });

    if (bonusSec > 0) this.timer.add(bonusSec);

    const pairsThisClick = Math.floor(allRemoved.length / 2);
    this.score += 100 * pairsThisClick;
    if (this.combo >= 2) this.score += this.combo * 50;
    this.pairsCleared += pairsThisClick;

    if (allRemoved.length > 0) {
      this.emit({ type: 'tilesRemoved', tiles: allRemoved, bonusSec });
      this.checkAdjacentIce(allRemoved);
    }
    this.checkBlockRelease();

    if (this.isCleared()) {
      this.timer.stop();
      this.score += this.timer.remain * 10;
      if (this.hintUsed === 0) this.score += 1000;
      if (this.missCount === 0) this.score += 500;
      this.emit({ type: 'cleared' });
    } else if (this.isStuck()) {
      this.timer.stop();
      setTimeout(() => this.emit({ type: 'gameOver' }), 1500);
    }

    return { type: 'success', removed: allRemoved, bonusSec };
  }

  private applyRemoval(a: Tile, b: Tile): ClickResult {
    const now = Date.now();

    // コンボ判定
    if (now - this.lastClearAt <= PuzzleEngine.COMBO_WINDOW_MS) {
      this.combo++;
    } else {
      this.combo = 1;
    }
    this.lastClearAt = now;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;

    // 時間タイル：消去で +10秒
    let bonusSec = 0;
    if (a.type === 'time') bonusSec += 10;
    if (b.type === 'time') bonusSec += 10;

    if (bonusSec > 0) this.timer.add(bonusSec);

    // 盤面から削除
    this.board[a.y][a.x] = null;
    this.board[b.y][b.x] = null;

    // スコア加算
    this.score += 100; // ペア消去基本点
    if (this.combo >= 2) this.score += this.combo * 50;

    this.pairsCleared++;

    this.emit({ type: 'tilesRemoved', tiles: [a, b], bonusSec });

    // 隣接する氷タイルを処理
    this.checkAdjacentIce([a, b]);

    // 障害ブロック解除条件チェック
    this.checkBlockRelease();

    // クリア判定
    if (this.isCleared()) {
      this.timer.stop();
      // タイムボーナス・各種ボーナスを最終スコアに反映
      this.score += this.timer.remain * 10;
      if (this.hintUsed === 0) this.score += 1000;
      if (this.missCount === 0) this.score += 500;
      this.emit({ type: 'cleared' });
    } else if (this.isStuck()) {
      this.timer.stop();
      setTimeout(() => this.emit({ type: 'gameOver' }), 1500);
    }

    return { type: 'success', removed: [a, b], bonusSec };
  }

  /** 障害ブロックの解除条件を確認 */
  private checkBlockRelease(): void {
    if (this.blocksReleased) return;

    const rule = this.blockRule;
    let shouldRelease = false;

    switch (rule.type) {
      case 'never':
        return;
      case 'afterPairs':
        if (this.pairsCleared >= rule.count) shouldRelease = true;
        break;
      case 'afterTime': {
        const elapsedSec = (Date.now() - this.startedAtMs) / 1000;
        if (elapsedSec >= rule.sec) shouldRelease = true;
        break;
      }
      case 'onLastTile':
        // 最後の色付きタイルが消えるのと同時：クリア後に解除
        return;
    }

    if (shouldRelease) this.releaseBlocks();
  }

  private releaseBlocks(): void {
    const released: Tile[] = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const t = this.board[y][x];
        if (t && t.type === 'block') {
          released.push(t);
          this.board[y][x] = null;
        }
      }
    }
    this.blocksReleased = true;
    if (released.length > 0) {
      this.emit({ type: 'blocksReleased', tiles: released });
    }
  }

  /** クリア判定：色付きタイルが残っていないこと */
  isCleared(): boolean {
    for (const row of this.board) {
      for (const t of row) {
        if (t === null) continue;
        if (t.type === 'block') continue;
        return false;
      }
    }
    return true;
  }

  /** 詰み判定 */
  isStuck(): boolean {
    return this.checker.findAnyValidPair() === null && !this.isCleared();
  }

  /** 残タイルをシャッフル（詰み時の救済） */
  shuffle(): void {
    const tiles: Tile[] = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const t = this.board[y][x];
        if (t !== null && t.type !== 'block') {
          tiles.push(t);
        }
      }
    }

    // タイル配列をシャッフル
    for (let i = tiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
    }

    // シャッフルした順に空きマスへ詰めなおす（既存の位置を順に保ちつつ色だけ入れ替え）
    let idx = 0;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const cur = this.board[y][x];
        if (cur === null || cur.type === 'block') continue;
        const placed = tiles[idx++];
        this.board[y][x] = { ...placed, x, y };
      }
    }

    this.emit({ type: 'shuffle' });

    // シャッフル後も詰みが続くなら再試行（最大5回まで、無限再帰を防ぐ）
    let retries = 0;
    while (this.isStuck() && !this.isCleared() && retries < 5) {
      retries++;
      // 再シャッフル（エミットなし）
      const tiles2: Tile[] = [];
      for (let y = 0; y < this.height; y++) {
        for (let x = 0; x < this.width; x++) {
          const t = this.board[y][x];
          if (t !== null && t.type !== 'block') tiles2.push(t);
        }
      }
      for (let i = tiles2.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [tiles2[i], tiles2[j]] = [tiles2[j], tiles2[i]];
      }
      let idx2 = 0;
      for (let y = 0; y < this.height; y++) {
        for (let x = 0; x < this.width; x++) {
          const cur = this.board[y][x];
          if (cur === null || cur.type === 'block') continue;
          this.board[y][x] = { ...tiles2[idx2++], x, y };
        }
      }
    }
  }

  /** ヒント取得 */
  hint(): HintResult | null {
    if (this.hintRemain <= 0) return null;
    const result = this.checker.findAnyValidPair();
    if (!result) return null;
    this.hintRemain--;
    this.hintUsed++;
    this.timer.subtract(5); // ヒント使用ペナルティ
    return result;
  }

  // ---------- ゲッター ----------

  get hintsRemaining(): number {
    return this.hintRemain;
  }

  getScoreSnapshot(): ScoreSnapshot {
    return {
      score: this.score,
      combo: this.combo,
      maxCombo: this.maxCombo,
      pairsCleared: this.pairsCleared,
      missCount: this.missCount,
      hintUsed: this.hintUsed
    };
  }

  /** プレビュー用：空マス (cx, cy) で消えるすべてのマッチを返す */
  previewClickAll(cx: number, cy: number) {
    return this.checker.checkClickAll(cx, cy);
  }

  // ---------- イベント ----------

  on(listener: EventListener): void {
    this.listeners.push(listener);
  }

  private emit(e: EngineEvent): void {
    for (const l of this.listeners) l(e);
  }

  // ---------- 変換 ----------

  private layoutToBoard(layout: LayoutCell[][]): (Tile | null)[][] {
    return layout.map((row, y) =>
      row.map((cell, x) => {
        if (cell === null) return null;
        if (typeof cell === 'string') {
          return {
            x,
            y,
            color: cell,
            type: 'normal' as const,
            state: 'normal' as const
          };
        }
        return {
          x,
          y,
          color: cell.color,
          type: cell.type ?? 'normal',
          state: 'normal' as const,
          pairId: cell.pairId,
          linkGroupId: cell.linkGroupId
        };
      })
    );
  }
}
