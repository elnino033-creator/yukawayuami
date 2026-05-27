/**
 * SoundEngine.ts
 * Web Audio API を使った効果音エンジン。
 * 全音はオシレータ/バッファで合成するため、ファイル不要。
 * AudioContext はオートプレイポリシー回避のため最初のユーザー操作時に初期化される。
 */

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private volume = 1.0;

  /** AudioContext を遅延初期化する */
  private getCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    return this.ctx;
  }

  /** マスターゲインノードを取得する（遅延初期化） */
  private getMasterGain(): GainNode {
    const ctx = this.getCtx();
    if (!this.masterGain) {
      this.masterGain = ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.volume, ctx.currentTime);
      this.masterGain.connect(ctx.destination);
    }
    return this.masterGain;
  }

  /**
   * SE全体の音量を設定する（0.0 – 1.0）。
   * SaveStore.settings.seVolume と連動させる。
   * @param v 音量値（0.0 – 1.0）
   */
  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
  }

  /**
   * 短いクリック音（タイル選択）
   */
  playClick(): void {
    const ctx = this.getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(this.getMasterGain());

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
      gain.connect(this.getMasterGain());

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
    gain.connect(this.getMasterGain());

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
    gain.connect(this.getMasterGain());

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
      gain.connect(this.getMasterGain());

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
      gain.connect(this.getMasterGain());

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
      gain.connect(this.getMasterGain());

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
      gain.connect(this.getMasterGain());

      osc.type = 'square';
      osc.frequency.setValueAtTime(i === 0 ? 900 : 700, now + i * 0.1);

      gain.gain.setValueAtTime(0.08, now + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.06);

      osc.start(now + i * 0.1);
      osc.stop(now + i * 0.1 + 0.07);
    }
  }

  /**
   * ワイプトランジション効果音（ぴろぴろりん）
   * 上昇アルペジオ ＋ クリアなベル。シナリオ間遷移時に再生する。
   * タイミングはワイプアニメーション（フェーズ1: 260ms）と同期している。
   */
  playWipe(): void {
    const ctx = this.getCtx();
    const now = ctx.currentTime;

    // ぴろぴろ：上昇アルペジオ（sine 波、高音域 A5→C#6→E6→A6）
    const arpeggioNotes = [880, 1108.73, 1318.51, 1760]; // A5 C#6 E6 A6
    for (let i = 0; i < arpeggioNotes.length; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(this.getMasterGain());

      osc.type = 'sine';
      osc.frequency.setValueAtTime(arpeggioNotes[i]!, now + i * 0.048);

      gain.gain.setValueAtTime(0, now + i * 0.048);
      gain.gain.linearRampToValueAtTime(0.14, now + i * 0.048 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.048 + 0.16);

      osc.start(now + i * 0.048);
      osc.stop(now + i * 0.048 + 0.17);
    }

    // りん：クリアなベル（triangle 波、E7 高音）
    const bellStart = now + 0.22;
    const bellOsc = ctx.createOscillator();
    const bellGain = ctx.createGain();
    bellOsc.connect(bellGain);
    bellGain.connect(this.getMasterGain());

    bellOsc.type = 'triangle';
    bellOsc.frequency.setValueAtTime(2637.02, bellStart); // E7
    bellGain.gain.setValueAtTime(0, bellStart);
    bellGain.gain.linearRampToValueAtTime(0.18, bellStart + 0.015);
    bellGain.gain.exponentialRampToValueAtTime(0.001, bellStart + 0.48);

    bellOsc.start(bellStart);
    bellOsc.stop(bellStart + 0.49);
  }

  /**
   * ダークシーン遷移効果音（ずんっ）
   * 低音の不穏な和音 ＋ 上から下への下降スウィープ。
   * dark トランジション（5章・BAD END など）に合わせた重厚な音。
   */
  playDark(): void {
    const ctx = this.getCtx();
    const now = ctx.currentTime;

    // 低音の不穏な短和音（D2, F2, Ab2）
    const chordNotes = [73.42, 87.31, 103.83]; // D2, F2, Ab2
    for (const freq of chordNotes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(this.getMasterGain());

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.055, now + 0.07);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.52);

      osc.start(now);
      osc.stop(now + 0.53);
    }

    // 上から下への下降スウィープ（C5 → D3）
    const swOsc = ctx.createOscillator();
    const swGain = ctx.createGain();
    swOsc.connect(swGain);
    swGain.connect(this.getMasterGain());

    swOsc.type = 'sine';
    swOsc.frequency.setValueAtTime(523.25, now);               // C5
    swOsc.frequency.exponentialRampToValueAtTime(146.83, now + 0.38); // D3
    swGain.gain.setValueAtTime(0, now);
    swGain.gain.linearRampToValueAtTime(0.05, now + 0.04);
    swGain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);

    swOsc.start(now);
    swOsc.stop(now + 0.49);
  }

  /**
   * 回想・夢想シーン遷移効果音（ふわりん）
   * ソフトな C メジャーコード ＋ 高音ハーモニクス。
   * cloud トランジション（回想シーン）に合わせた穏やかな音。
   */
  playDream(): void {
    const ctx = this.getCtx();
    const now = ctx.currentTime;

    // C メジャーコード（C4, E4, G4）を柔らかく
    const chordNotes = [261.63, 329.63, 392.0]; // C4 E4 G4
    for (const freq of chordNotes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(this.getMasterGain());

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.065, now + 0.22);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.70);

      osc.start(now);
      osc.stop(now + 0.71);
    }

    // 高音シマー（G6）を重ねる
    const shimOsc = ctx.createOscillator();
    const shimGain = ctx.createGain();
    shimOsc.connect(shimGain);
    shimGain.connect(this.getMasterGain());

    shimOsc.type = 'sine';
    shimOsc.frequency.setValueAtTime(1568.0, now); // G6
    shimGain.gain.setValueAtTime(0, now);
    shimGain.gain.linearRampToValueAtTime(0.045, now + 0.08);
    shimGain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

    shimOsc.start(now);
    shimOsc.stop(now + 0.56);
  }
}

/** シングルトンインスタンス */
export const soundEngine = new SoundEngine();
