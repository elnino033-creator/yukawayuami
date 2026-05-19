/**
 * SeManager.ts
 * Web Audio API を使ってSEをプログラム生成する。外部ファイル不要。
 */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  return ctx;
}

/** ホワイトノイズバッファを生成する */
function makeNoiseBuffer(ac: AudioContext, durationSec: number): AudioBuffer {
  const sampleRate = ac.sampleRate;
  const length = Math.ceil(sampleRate * durationSec);
  const buffer = ac.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

/**
 * ガラスが割れる音:
 * ホワイトノイズ + 急速にデチューンするオシレータで構成
 */
function playGlassShatter(ac: AudioContext): void {
  const now = ac.currentTime;

  // ノイズバースト
  const noiseSource = ac.createBufferSource();
  noiseSource.buffer = makeNoiseBuffer(ac, 0.4);

  const noiseGain = ac.createGain();
  noiseGain.gain.setValueAtTime(0.6, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

  const bpf = ac.createBiquadFilter();
  bpf.type = 'bandpass';
  bpf.frequency.value = 4000;
  bpf.Q.value = 0.5;

  noiseSource.connect(bpf);
  bpf.connect(noiseGain);
  noiseGain.connect(ac.destination);
  noiseSource.start(now);
  noiseSource.stop(now + 0.4);

  // 高音のクリック（割れた瞬間）
  for (let i = 0; i < 4; i++) {
    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(3000 - i * 400, now + i * 0.02);
    osc.frequency.exponentialRampToValueAtTime(200, now + i * 0.02 + 0.15);

    const oscGain = ac.createGain();
    oscGain.gain.setValueAtTime(0.3, now + i * 0.02);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.02 + 0.15);

    osc.connect(oscGain);
    oscGain.connect(ac.destination);
    osc.start(now + i * 0.02);
    osc.stop(now + i * 0.02 + 0.15);
  }
}

/** 登録済みSEの生成関数マップ */
const SE_GENERATORS: Record<string, (ac: AudioContext) => void> = {
  se_glass_shatter: playGlassShatter,
};

/**
 * SEを再生する。
 * @param seId SE識別子（例: "se_glass_shatter"）
 */
export function playSe(seId: string): void {
  const ac = getCtx();
  if (!ac) return;

  // AudioContext がサスペンド中の場合は resume してから再生
  const doPlay = () => {
    const gen = SE_GENERATORS[seId];
    if (gen) {
      gen(ac);
    }
  };

  if (ac.state === 'suspended') {
    ac.resume().then(doPlay).catch(() => {});
  } else {
    doPlay();
  }
}
