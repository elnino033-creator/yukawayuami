/**
 * SoundEngine.ts
 * Web Audio API を使った効果音エンジン。
 * 全音はオシレータ/バッファで合成するため、ファイル不要。
 * AudioContext はオートプレイポリシー回避のため最初のユーザー操作時に初期化される。
 */

export class SoundEngine {
  private ctx: AudioContext | null = null;

  /** AudioContext を遅延初期化する */
  private getCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    return this.ctx;
  }

  /**
   * 短いクリック音（タイル選択）
   */
  playClick(): void {
    const ctx = this.getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.06);

    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.08);
  }

  /**
   * 心地よいチャイム音（タイルペアマッチ成功）
   */
  playMatch(): void {
    const ctx = this.getCtx();
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99]; // C5 E5 G5

    for (let i = 0; i < notes.length; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(notes[i]!, now + i * 0.07);

      gain.gain.setValueAtTime(0, now + i * 0.07);
      gain.gain.linearRampToValueAtTime(0.25, now + i * 0.07 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.35);

      osc.start(now + i * 0.07);
      osc.stop(now + i * 0.07 + 0.36);
    }
  }

  /**
   * 短いブザー音（間違いクリック）
   */
  playMiss(): void {
    const ctx = this.getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.18);

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.2);
  }

  /**
   * 氷タイルにヒビが入る音
   */
  playIceCrack(): void {
    const ctx = this.getCtx();
    const bufSize = Math.floor(ctx.sampleRate * 0.12);
    const buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    // ホワイトノイズをベースにしたクリスプなクラック音
    for (let i = 0; i < bufSize; i++) {
      const t = i / bufSize;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3);
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(2000, ctx.currentTime);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    gain.gain.setValueAtTime(0.5, ctx.currentTime);

    source.start(ctx.currentTime);
    source.stop(ctx.currentTime + 0.12);
  }

  /**
   * 上昇アルペジオのファンファーレ（ステージクリア）
   */
  playClear(): void {
    const ctx = this.getCtx();
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6

    for (let i = 0; i < notes.length; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(notes[i]!, now + i * 0.12);

      gain.gain.setValueAtTime(0, now + i * 0.12);
      gain.gain.linearRampToValueAtTime(0.3, now + i * 0.12 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.5);

      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.51);
    }

    // 最終和音
    const chordNotes = [523.25, 659.25, 783.99];
    const chordStart = now + 0.55;
    for (const freq of chordNotes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, chordStart);

      gain.gain.setValueAtTime(0.2, chordStart);
      gain.gain.exponentialRampToValueAtTime(0.001, chordStart + 0.8);

      osc.start(chordStart);
      osc.stop(chordStart + 0.81);
    }
  }

  /**
   * 下降トーン（ゲームオーバー）
   */
  playGameOver(): void {
    const ctx = this.getCtx();
    const now = ctx.currentTime;
    const notes = [392, 349.23, 311.13, 261.63]; // G4 F4 Eb4 C4

    for (let i = 0; i < notes.length; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(notes[i]!, now + i * 0.2);

      gain.gain.setValueAtTime(0.25, now + i * 0.2);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.2 + 0.35);

      osc.start(now + i * 0.2);
      osc.stop(now + i * 0.2 + 0.36);
    }
  }

  /**
   * チクタク音（残り10秒）
   */
  playTimeLow(): void {
    const ctx = this.getCtx();
    const now = ctx.currentTime;

    for (let i = 0; i < 2; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'square';
      osc.frequency.setValueAtTime(i === 0 ? 900 : 700, now + i * 0.1);

      gain.gain.setValueAtTime(0.08, now + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.06);

      osc.start(now + i * 0.1);
      osc.stop(now + i * 0.1 + 0.07);
    }
  }
}

/** シングルトンインスタンス */
export const soundEngine = new SoundEngine();
