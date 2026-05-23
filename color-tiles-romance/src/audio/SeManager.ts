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
 * アセットフォルダ内の SE ファイルを HTML Audio で再生する。
 * @param filename       public/assets/se/ 以下のファイル名（例: "se_cutin.mp3"）
 * @param volume         再生音量（0.0〜1.0、デフォルト 0.8）
 * @param durationRatio  再生時間の割合（0.0〜1.0）。指定した場合、ファイル全長 × この値 の秒数で停止する。
 *                       例: 0.5 で前半半分のみ再生。省略時はファイル末尾まで再生。
 */
export function playSeFile(filename: string, volume = 0.8, durationRatio?: number): void {
  const base = import.meta.env.BASE_URL ?? '/';
  const audio = new Audio(`${base}assets/se/${encodeURIComponent(filename)}`);
  audio.volume = Math.min(1, Math.max(0, volume));

  if (durationRatio !== undefined && durationRatio > 0 && durationRatio < 1) {
    // メタデータ読み込み後に実際の長さを取得し、指定割合で停止
    const onMeta = () => {
      audio.removeEventListener('loadedmetadata', onMeta);
      const stopAt = audio.duration * durationRatio;
      const remaining = (stopAt - audio.currentTime) * 1000;
      if (remaining > 0) {
        setTimeout(() => {
          audio.pause();
          audio.currentTime = 0;
        }, remaining);
      }
    };
    audio.addEventListener('loadedmetadata', onMeta);
  }

  audio.play().catch(() => {});
}

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
