/**
 * BgmManager.ts
 * アプリ全体で BGM を一元管理するシングルトン。
 *
 * ScenarioPlayer と PuzzleScene の両方がこのモジュールを通して BGM を操作する。
 * play() で新しい BGM を指定すると前の音声が自動停止するため、
 * シーン切替時の "BGM 漏れ" が原理的に発生しない。
 *
 * 同じファイルを再生中・一時停止中どちらの状態でも play() を呼んでも
 * 曲の頭から再生しなおさない（継続 or 再開）。
 *
 * BGM キー → ファイル名のマッピングは public/data/bgm_map.json で管理する。
 * init() を呼んで JSON をロードしてから play() を使う。
 */

class BgmManagerClass {
  private current: HTMLAudioElement | null = null;
  /** 現在ロード済みのファイル名（一時停止中も保持） */
  private currentKey = '';
  private map: Record<string, string> = {};
  /** デフォルト音量（SaveStore.settings.bgmVolume と連動） */
  private defaultVolume = 0.4;
  /** 自動再生ブロック時の「次の操作で再開」リスナーが登録済みか */
  private unlockArmed = false;

  /**
   * public/data/bgm_map.json を読み込む。
   * アプリ起動時に一度だけ呼ぶこと。
   */
  async init(): Promise<void> {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}data/bgm_map.json`);
      if (res.ok) {
        this.map = await res.json() as Record<string, string>;
      }
    } catch {
      console.warn('[BgmManager] bgm_map.json の読み込みに失敗しました');
    }
  }

  /**
   * BGM の基準音量を設定する（0.0 – 1.0）。
   * SaveStore.settings.bgmVolume と連動させる。
   * 現在再生中の音声にも即時反映される。
   * @param v 音量値（0.0 – 1.0）
   */
  setVolume(v: number): void {
    this.defaultVolume = Math.max(0, Math.min(1, v));
    if (this.current) {
      this.current.volume = this.defaultVolume;
    }
  }

  /**
   * BGM を再生する。
   * - 同じファイルが再生中 → 音量だけ更新（頭から再生しない）
   * - 同じファイルが一時停止中 → 続きから再開（頭から再生しない）
   * - 別のファイル → 前の音声を停止して新しく再生
   * @param keyOrFile BGM マップのキー（例: "bgm_mysterious_wind"）または直接ファイル名
   * @param volume 音量 0〜1（省略時は setVolume で設定した値 or 0.4）
   */
  play(keyOrFile: string, volume?: number): void {
    const vol = volume ?? this.defaultVolume;
    const filename = this.map[keyOrFile] ?? keyOrFile;

    if (this.currentKey === filename && this.current) {
      // 同じファイル：一時停止中なら続きから再開、再生中は音量だけ更新
      this.current.volume = vol;
      if (this.current.paused) {
        this.playCurrentWithUnlock();
      }
      return;
    }

    // 別のファイル：前の音声を完全に解放して新しく再生
    if (this.current) {
      this.current.pause();
      this.current.src = '';
      this.current = null;
    }
    const url = `${import.meta.env.BASE_URL}assets/bgm/${encodeURIComponent(filename)}`;
    const audio = new Audio(url);
    audio.loop = true;
    audio.volume = vol;
    this.current = audio;
    this.currentKey = filename;
    this.playCurrentWithUnlock();
  }

  /**
   * 現在の BGM を再生する。自動再生がブロック／中断されて play() が reject した場合は、
   * 次のユーザー操作（タップ等）で自動的に再開するようリスナーを登録する。
   *
   * 早送り（タイマー進行）からパズルへ遷移したときなど、ユーザー操作を伴わずに
   * play() が呼ばれると iOS Safari 等の自動再生ポリシーで再生がブロックされるため。
   */
  private playCurrentWithUnlock(): void {
    const audio = this.current;
    if (!audio) return;
    audio.play().catch(() => this.armUnlock());
  }

  /** 次のユーザー操作で現在の BGM の再生を再試行するワンショットリスナーを登録する */
  private armUnlock(): void {
    if (this.unlockArmed) return;
    this.unlockArmed = true;
    const resume = () => {
      this.unlockArmed = false;
      document.removeEventListener('pointerdown', resume);
      document.removeEventListener('touchend', resume);
      document.removeEventListener('click', resume);
      document.removeEventListener('keydown', resume);
      if (this.current && this.current.paused) {
        this.current.play().catch(() => {});
      }
    };
    document.addEventListener('pointerdown', resume);
    document.addEventListener('touchend', resume);
    document.addEventListener('click', resume);
    document.addEventListener('keydown', resume);
  }

  /**
   * 現在の BGM を一時停止する。
   * currentKey は保持するため、次回 play() で同じファイルを指定すると続きから再開する。
   * シーン間の BGM 継続を意図している場合は stop() を呼ばないこと。
   */
  stop(): void {
    if (this.current) {
      this.current.pause();
      // currentKey は保持（次に同じファイルをplay()したとき再スタートを防ぐ）
    }
  }

  /**
   * 現在ロード済み（再生中 or 一時停止中）の BGM ファイル名を返す。
   * 何も再生していない場合は空文字列を返す。
   * ScenarioPlayer がセーブデータに BGM キーを記録するために使用する。
   */
  getCurrentKey(): string {
    return this.currentKey;
  }

  /**
   * BGM を完全に停止してリソースを解放する。
   * 明示的に無音にしたいとき（エンドロールなど）に使用する。
   * stop() と違い currentKey もリセットするため、次回 play() は必ず頭から開始する。
   */
  forceStop(): void {
    if (this.current) {
      this.current.pause();
      this.current.src = '';
      this.current = null;
    }
    this.currentKey = '';
  }
}

export const BgmManager = new BgmManagerClass();
