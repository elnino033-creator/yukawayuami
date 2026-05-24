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
  /** 十字消し回数（4タイル以上を同時消去） */
  crossCount: number;
  /** T字消し回数（3タイルを同時消去） */
  tShapeCount: number;
}

type EngineEvent =
  | { type: 'tilesRemoved'; tiles: Tile[]; bonusSec?: number }
  | { type: 'iceCracked'; tiles: Tile[] }
  | { type: 'miss'; clickPoint: { x: number; y: number }; penaltySec: number }
  | { type: 'shuffle' }
  | { type: 'blocksReleased'; tiles: Tile[] }
  | { type: 'bombExploded'; tile: Tile; penaltySec: number }
  | { type: 'specialTrigger'; effect: import('@/types').SpecialEventDef['effect']; cutIn?: import('@/types').SpecialEventDef['cutIn'] }
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
  /** 十字消し回数 */
  private crossCount = 0;
  /** T字消し回数 */
  private tShapeCount = 0;
  private hintRemain = 0;
  private missPenaltySec = 0;
  private bombPenaltySec = 20;
  private bombInitialCountdown = 15;
  private blockRule: BlockReleaseRule = { type: 'never' };
  private blocksReleased = false;
  private startedAtMs = 0;
  private bombTickSkip = false;
  private specialEventDef: import('@/types').SpecialEventDef | null = null;
  private specialEventFired = false;
  private originalBlocks: Tile[] = [];
  private specialEventHalfwayThreshold = 0;
  private iceClearedCount = 0;

  private listeners: EventListener[] = [];
  /** 時間制限（秒）。0 = 無制限 */
  private timeLimitSec = 0;

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
    this.crossCount = 0;
    this.tShapeCount = 0;
    this.hintRemain = stage.hintCount;
    this.missPenaltySec = stage.missPenaltySec;
    this.bombPenaltySec = stage.bombPenaltySec ?? 20;
    this.bombInitialCountdown = stage.bombCountdown ?? 15;
    this.blockRule = stage.blockReleaseRule ?? { type: 'never' };
    this.blocksReleased = false;
    this.startedAtMs = Date.now();
    this.timeLimitSec = stage.timeLimitSec;
    this.specialEventDef = stage.specialEvent ?? null;
    this.specialEventFired = false;
    this.iceClearedCount = 0;

    // ブロック初期位置を記録（restoreBlocks用）
    this.originalBlocks = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const t = this.board[y][x];
        if (t && t.type === 'block') this.originalBlocks.push({ ...t });
      }
    }

    // whenBlocksHalfway 用: 初期 blockReleaseRule.count の半分を記録
    this.specialEventHalfwayThreshold = 0;
    if (
      stage.specialEvent?.trigger.type === 'whenBlocksHalfway' &&
      stage.blockReleaseRule?.type === 'afterPairs'
    ) {
      this.specialEventHalfwayThreshold = Math.floor(stage.blockReleaseRule.count / 2);
    }

    // 爆弾タイルの初期カウントダウンをセット
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const t = this.board[y][x];
        if (t && t.type === 'bomb') t.countdown = this.bombInitialCountdown;
      }
    }

    if (stage.timeLimitSec > 0) {
      this.timer.start(stage.timeLimitSec);
      this.timer.onTimeUp(() => this.emit({ type: 'gameOver' }));
    } else {
      // 時間無制限：ダミー値でタイマーを起動して isRunning=true を維持する。
      // onTimeUp を登録しないのでゲームオーバーは発生しない。
      this.timer.start(86400);
    }

    // 1秒ごとに爆弾カウントダウンを減算（最初のtick=開始直後はスキップ）
    this.bombTickSkip = true;
    this.timer.onTick(() => {
      if (this.bombTickSkip) { this.bombTickSkip = false; return; }
      this.tickBombs();
    });
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

  /** 爆弾タイルのカウントダウンを1秒減算し、0になったら爆発させる（タイルは残る） */
  private tickBombs(): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const t = this.board[y][x];
        if (!t || t.type !== 'bomb') continue;
        t.countdown = (t.countdown ?? 1) - 1;
        if (t.countdown <= 0) {
          // タイルは盤上に残す（消去はプレイヤーがマッチで行う）
          t.countdown = this.bombInitialCountdown; // カウントダウンをリセット
          this.timer.subtract(this.bombPenaltySec);
          this.emit({ type: 'bombExploded', tile: t, penaltySec: this.bombPenaltySec });
        }
      }
    }
  }

  /** ブロック解除まで残り何ペア必要か（afterPairs ルール時のみ。解除済み or 対象外は null） */
  get blockRemainingCount(): number | null {
    if (this.blocksReleased) return null;
    const rule = this.blockRule;
    if (rule.type !== 'afterPairs') return null;
    return Math.max(0, rule.count - this.pairsCleared);
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
    this.checkSpecialEvent();

    this.emit({ type: 'tilesRemoved', tiles: removed, bonusSec });

    // 隣接する氷タイルを処理
    this.checkAdjacentIce(removed);

    // 障害ブロック解除条件チェック
    this.checkBlockRelease();

    // クリア判定
    if (this.isCleared()) {
      this.timer.stop();
      // 時間制限ありのみタイムボーナスを加算
      if (this.timeLimitSec > 0) this.score += this.timer.remain * 10;
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
    // 十字消し・T字消しボーナス（同時消去タイル数で判定）
    if (allRemoved.length >= 4) {
      this.crossCount++;
      this.score += 300; // 十字消しボーナス
    } else if (allRemoved.length === 3) {
      this.tShapeCount++;
      this.score += 150; // T字消しボーナス
    }
    this.pairsCleared += pairsThisClick;
    this.iceClearedCount += allRemoved.filter(t => t.type === 'ice').length;
    this.checkSpecialEvent();

    if (allRemoved.length > 0) {
      this.emit({ type: 'tilesRemoved', tiles: allRemoved, bonusSec });
      this.checkAdjacentIce(allRemoved);
    }
    this.checkBlockRelease();

    if (this.isCleared()) {
      this.timer.stop();
      // 時間制限ありのみタイムボーナスを加算
      if (this.timeLimitSec > 0) this.score += this.timer.remain * 10;
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
    this.iceClearedCount += [a, b].filter(t => t.type === 'ice').length;
    this.checkSpecialEvent();

    this.emit({ type: 'tilesRemoved', tiles: [a, b], bonusSec });

    // 隣接する氷タイルを処理
    this.checkAdjacentIce([a, b]);

    // 障害ブロック解除条件チェック
    this.checkBlockRelease();

    // クリア判定
    if (this.isCleared()) {
      this.timer.stop();
      // タイムボーナス・各種ボーナスを最終スコアに反映
      if (this.timeLimitSec > 0) this.score += this.timer.remain * 10;
      if (this.hintUsed === 0) this.score += 1000;
      if (this.missCount === 0) this.score += 500;
      this.emit({ type: 'cleared' });
    } else if (this.isStuck()) {
      this.timer.stop();
      setTimeout(() => this.emit({ type: 'gameOver' }), 1500);
    }

    return { type: 'success', removed: [a, b], bonusSec };
  }

  /** 特殊イベントトリガーを確認し、条件を満たしたら発火する */
  private checkSpecialEvent(): void {
    if (this.specialEventFired || !this.specialEventDef) return;
    const def = this.specialEventDef;

    let shouldFire = false;
    switch (def.trigger.type) {
      case 'afterPairs':
        shouldFire = this.pairsCleared >= def.trigger.count;
        break;
      case 'afterIceCleared':
        shouldFire = this.iceClearedCount >= def.trigger.count;
        break;
      case 'whenIceRemaining': {
        let iceCount = 0;
        for (let y = 0; y < this.height; y++) {
          for (let x = 0; x < this.width; x++) {
            const t = this.board[y][x];
            if (t && t.type === 'ice') iceCount++;
          }
        }
        shouldFire = iceCount <= def.trigger.count;
        break;
      }
      case 'whenBlocksHalfway':
        shouldFire = !this.blocksReleased &&
          this.specialEventHalfwayThreshold > 0 &&
          this.pairsCleared >= this.specialEventHalfwayThreshold;
        break;
    }

    if (shouldFire) {
      this.specialEventFired = true;
      this.emit({ type: 'specialTrigger', effect: def.effect, cutIn: def.cutIn });
    }
  }

  /** ランダムなノーマルタイルをbombタイルに変換する */
  transformTilesToBombs(count: number): void {
    const candidates: Tile[] = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const t = this.board[y][x];
        if (t && t.type === 'normal') candidates.push(t);
      }
    }
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    for (const t of candidates.slice(0, count)) {
      t.type = 'bomb';
      t.countdown = this.bombInitialCountdown;
    }
  }

  /** ランダムなノーマルタイルをひびあり氷タイルに変換する */
  addIceTiles(count: number): void {
    // 1枚ずつ判定・変換する（複数同時変換による負荷を防ぐ）
    for (let i = 0; i < count; i++) {
      // 変換のたびに色カウントを再集計（前の変換で状態が変わっている可能性）
      const colorCounts = new Map<string, number>();
      for (let y = 0; y < this.height; y++) {
        for (let x = 0; x < this.width; x++) {
          const t = this.board[y][x];
          if (t && t.color && t.type !== 'block') {
            colorCounts.set(t.color, (colorCounts.get(t.color) ?? 0) + 1);
          }
        }
      }

      const candidates: Tile[] = [];
      for (let y = 0; y < this.height; y++) {
        for (let x = 0; x < this.width; x++) {
          const t = this.board[y][x];
          if (!t || t.type !== 'normal' || !t.color) continue;
          // 同色タイルが自分以外に1枚以上必要（ヒビ後にマッチできる）
          if ((colorCounts.get(t.color) ?? 0) < 2) continue;
          // 4方向に「消去可能な隣接タイル」が1枚以上必要（氷をヒビ入れできる）
          // 条件: 非null・非block・normal状態の氷でない（=消去可能なタイル）
          const hasMatchableNeighbor = (
            [
              [x - 1, y], [x + 1, y],
              [x, y - 1], [x, y + 1]
            ] as [number, number][]
          ).some(([nx, ny]) => {
            if (nx < 0 || ny < 0 || nx >= this.width || ny >= this.height) return false;
            const n = this.board[ny][nx];
            return n !== null && n.type !== 'block' &&
              !(n.type === 'ice' && n.state === 'normal');
          });
          if (!hasMatchableNeighbor) continue;
          candidates.push(t);
        }
      }

      if (candidates.length === 0) return; // 残り枚数に関わらず不発

      // ランダムに1枚選んで変換
      const idx = Math.floor(Math.random() * candidates.length);
      const chosen = candidates[idx];
      chosen.type = 'ice';
      chosen.state = 'normal';
    }
  }

  /** ブロックタイルを初期位置に復活させ、解除条件を更新する */
  restoreBlocksSpecial(newReleaseCount?: number): void {
    for (const block of this.originalBlocks) {
      if (this.board[block.y][block.x] === null) {
        this.board[block.y][block.x] = { ...block, state: 'normal' };
      }
    }
    this.blocksReleased = false;
    if (newReleaseCount !== undefined) {
      this.blockRule = { type: 'afterPairs', count: newReleaseCount };
    }
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
      hintUsed: this.hintUsed,
      crossCount: this.crossCount,
      tShapeCount: this.tShapeCount
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
