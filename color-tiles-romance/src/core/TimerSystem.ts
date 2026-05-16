/**
 * 制限時間管理
 * 仕様書 §2.3 / §6.3
 *
 * - ステージ開始時に start(sec)
 * - 1秒ごとに onTick リスナーが呼ばれる
 * - add / subtract で時間を変動可能（コンボボーナス、誤クリックペナルティ）
 * - freeze で一時停止（みおスキル）
 */

type TickListener = (remainSec: number) => void;
type TimeUpListener = () => void;

export class TimerSystem {
  private remainSec = 0;
  private running = false;
  private tickInterval: number | null = null;
  private freezeTimeout: number | null = null;

  private tickListeners: TickListener[] = [];
  private timeUpListeners: TimeUpListener[] = [];

  /** 残り時間を秒単位で取得 */
  get remain(): number {
    return this.remainSec;
  }

  /** 動作中か */
  get isRunning(): boolean {
    return this.running;
  }

  /** タイマー開始 */
  start(sec: number): void {
    this.stop();
    this.remainSec = sec;
    this.running = true;
    this.notifyTick();

    this.tickInterval = window.setInterval(() => {
      if (!this.running) return;
      this.remainSec = Math.max(0, this.remainSec - 1);
      this.notifyTick();
      if (this.remainSec === 0) {
        this.stop();
        this.notifyTimeUp();
      }
    }, 1000);
  }

  /** タイマーを完全に止める（クリア / ゲームオーバー時） */
  stop(): void {
    this.running = false;
    if (this.tickInterval !== null) {
      window.clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    if (this.freezeTimeout !== null) {
      window.clearTimeout(this.freezeTimeout);
      this.freezeTimeout = null;
    }
  }

  /** 一時停止（ポーズメニュー等） */
  pause(): void {
    this.running = false;
  }

  /** 再開 */
  resume(): void {
    if (this.tickInterval !== null) {
      this.running = true;
    }
  }

  /** ボーナス時間を加算 */
  add(sec: number): void {
    this.remainSec += sec;
    this.notifyTick();
  }

  /** 時間を減算（誤クリックペナルティ等） */
  subtract(sec: number): void {
    this.remainSec = Math.max(0, this.remainSec - sec);
    this.notifyTick();
    if (this.remainSec === 0 && this.running) {
      this.stop();
      this.notifyTimeUp();
    }
  }

  /**
   * 一定時間タイマーを止める（みおスキル「静寂の凍結」）。
   * 解除されると自動的に running に戻る。
   */
  freeze(durationMs: number): void {
    if (!this.running) return;
    this.running = false;
    if (this.freezeTimeout !== null) {
      window.clearTimeout(this.freezeTimeout);
    }
    this.freezeTimeout = window.setTimeout(() => {
      this.freezeTimeout = null;
      // tickInterval が生きていれば再開
      if (this.tickInterval !== null && this.remainSec > 0) {
        this.running = true;
      }
    }, durationMs);
  }

  // ---------- リスナー ----------

  onTick(cb: TickListener): void {
    this.tickListeners.push(cb);
    // 既にタイマーが動いている場合は即時通知（start後にリスナー登録するケースに対応）
    if (this.running || this.tickInterval !== null) {
      cb(this.remainSec);
    }
  }

  onTimeUp(cb: TimeUpListener): void {
    this.timeUpListeners.push(cb);
  }

  private notifyTick(): void {
    for (const cb of this.tickListeners) cb(this.remainSec);
  }

  private notifyTimeUp(): void {
    for (const cb of this.timeUpListeners) cb();
  }
}
