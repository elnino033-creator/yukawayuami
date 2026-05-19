/**
 * BgmManager.ts
 * アプリ全体で BGM を一元管理するシングルトン。
 *
 * ScenarioPlayer と PuzzleScene の両方がこのモジュールを通して BGM を操作する。
 * 新しい BGM を再生するたびに前の音声が自動停止するため、
 * シーン切替時の "BGM 漏れ" が原理的に発生しない。
 *
 * BGM キー → ファイル名のマッピングは public/data/bgm_map.json で管理する。
 * init() を呼んで JSON をロードしてから play() を使う。
 */

class BgmManagerClass {
  private current: HTMLAudioElement | null = null;
  private currentKey = '';
  private map: Record<string, string> = {};

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
   * BGM を再生する。前の音声は自動停止。
   * @param keyOrFile BGM マップのキー（例: "bgm_mysterious_wind"）または直接ファイル名
   * @param volume 音量 0〜1（省略時 0.4）
   */
  play(keyOrFile: string, volume = 0.4): void {
    const filename = this.map[keyOrFile] ?? keyOrFile;
    const url = `${import.meta.env.BASE_URL}assets/bgm/${encodeURIComponent(filename)}`;

    // 同じファイルが既に再生中なら何もしない
    if (this.currentKey === filename && this.current && !this.current.paused) return;

    this.stop();
    const audio = new Audio(url);
    audio.loop = true;
    audio.volume = volume;
    audio.play().catch(() => {});
    this.current = audio;
    this.currentKey = filename;
  }

  /**
   * 現在再生中の BGM を停止する。
   */
  stop(): void {
    if (this.current) {
      this.current.pause();
      this.current.src = '';
      this.current = null;
      this.currentKey = '';
    }
  }
}

export const BgmManager = new BgmManagerClass();
