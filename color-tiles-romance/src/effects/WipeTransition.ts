/**
 * WipeTransition.ts
 * シナリオ間遷移アニメーション集。
 *
 * | type    | 演出                              | 用途                     |
 * |---------|-----------------------------------|--------------------------|
 * | wipe    | 斜めカーテンが左→右へスウィープ   | 通常遷移（デフォルト）   |
 * | sparkle | 黄金の輝点が画面を覆うグリッター  | ご褒美シナリオなど       |
 * | cloud   | 白い雲ブロブがゆったり横切る      | 回想・夢想シーン         |
 *
 * すべての遷移で onCovered() は画面が完全に覆われた瞬間に同期で呼ばれる。
 *
 * 使用例:
 *   await sceneTransition('cloud', () => {
 *     destroyOldScene();
 *     setupNewScene();
 *   });
 */

export type TransitionType = 'wipe' | 'sparkle' | 'cloud';

/**
 * シーン遷移アニメーションを再生する。
 * @param type    遷移タイプ
 * @param onCovered 画面が完全に覆われたタイミングで呼ばれるコールバック（同期）
 * @returns アニメーション完了時に resolve される Promise
 */
export function sceneTransition(type: TransitionType, onCovered: () => void): Promise<void> {
  if (type === 'sparkle') return sparkleTransitionImpl(onCovered);
  if (type === 'cloud')   return cloudTransitionImpl(onCovered);
  return wipeTransitionImpl(onCovered);
}

/** 後方互換エクスポート */
export function wipeTransition(onCovered: () => void): Promise<void> {
  return wipeTransitionImpl(onCovered);
}

// ─────────────────────────────────────────────────────────────────────────────
// 共通ヘルパー
// ─────────────────────────────────────────────────────────────────────────────

function makeCanvas(): [HTMLCanvasElement, CanvasRenderingContext2D, number, number] {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const canvas = document.createElement('canvas');
  canvas.width  = W;
  canvas.height = H;
  canvas.style.cssText = [
    'position:fixed', 'inset:0',
    'width:100%', 'height:100%',
    'z-index:9999', 'pointer-events:none',
  ].join(';');
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx, W, H];
}

function easeOutCubic(t: number):  number { return 1 - (1 - t) ** 3; }
function easeInCubic(t: number):   number { return t ** 3; }
function easeInOutSine(t: number): number { return -(Math.cos(Math.PI * t) - 1) / 2; }

// ─────────────────────────────────────────────────────────────────────────────
// wipe ― 斜めカーテン（短縮: 260 + 240 ms）
// ─────────────────────────────────────────────────────────────────────────────

/** ワイプパネル上を流れる輝点パーティクル */
interface Sparkle {
  ox: number; oy: number;
  vx: number; vy: number;
  life: number; size: number;
}

function wipeTransitionImpl(onCovered: () => void): Promise<void> {
  return new Promise((resolve) => {
    const [canvas, ctx, W, H] = makeCanvas();
    const SLANT        = Math.round(H * 0.28);
    const PHASE_IN_MS  = 260;
    const PHASE_OUT_MS = 240;

    const sparkles: Sparkle[] = [];

    function spawnSparkles(etx: number, ebx: number): void {
      const count = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < count; i++) {
        const ry = Math.random();
        sparkles.push({
          ox: etx + (ebx - etx) * ry, oy: ry * H,
          vx: (Math.random() - 0.3) * 3,
          vy: (Math.random() - 0.5) * 3,
          life: 1.0, size: 1.5 + Math.random() * 2.5,
        });
      }
    }

    function updateSparkles(dt: number): void {
      for (let i = sparkles.length - 1; i >= 0; i--) {
        const s = sparkles[i]!;
        s.ox += s.vx; s.oy += s.vy;
        s.life -= dt * 4;
        if (s.life <= 0) sparkles.splice(i, 1);
      }
    }

    function drawSparkles(): void {
      for (const s of sparkles) {
        const r = s.size * s.life;
        const g = ctx.createRadialGradient(s.ox, s.oy, 0, s.ox, s.oy, r * 2.5);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.4, '#ffd060');
        g.addColorStop(1, 'rgba(255,180,60,0)');
        ctx.save();
        ctx.globalAlpha = Math.max(0, s.life);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(s.ox, s.oy, r * 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    function drawPhaseIn(rtx: number, rbx: number): void {
      const g = ctx.createLinearGradient(rtx - 160, 0, rtx + 20, 0);
      g.addColorStop(0,    '#16093a');
      g.addColorStop(0.65, '#2d1260');
      g.addColorStop(0.88, '#5a2495');
      g.addColorStop(1,    '#7b3bb0');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-10, -10); ctx.lineTo(rtx, -10);
      ctx.lineTo(rbx, H + 10); ctx.lineTo(-10, H + 10);
      ctx.closePath(); ctx.fill();

      const sg = ctx.createLinearGradient(rtx - 18, 0, rbx + 6, H);
      sg.addColorStop(0,    'rgba(255,220,140,0)');
      sg.addColorStop(0.35, 'rgba(255,240,180,0.65)');
      sg.addColorStop(0.5,  'rgba(255,255,255,0.9)');
      sg.addColorStop(0.65, 'rgba(255,220,140,0.55)');
      sg.addColorStop(1,    'rgba(255,200,100,0)');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.moveTo(rtx - 18, -10); ctx.lineTo(rtx + 6, -10);
      ctx.lineTo(rbx + 6, H + 10); ctx.lineTo(rbx - 18, H + 10);
      ctx.closePath(); ctx.fill();
    }

    function drawPhaseOut(ltx: number, lbx: number): void {
      const g = ctx.createLinearGradient(ltx - 20, 0, ltx + 160, 0);
      g.addColorStop(0,    '#7b3bb0');
      g.addColorStop(0.12, '#5a2495');
      g.addColorStop(0.35, '#2d1260');
      g.addColorStop(1,    '#16093a');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(ltx, -10); ctx.lineTo(W + 10, -10);
      ctx.lineTo(W + 10, H + 10); ctx.lineTo(lbx, H + 10);
      ctx.closePath(); ctx.fill();

      const sg = ctx.createLinearGradient(ltx - 6, 0, lbx + 18, H);
      sg.addColorStop(0,    'rgba(255,200,100,0)');
      sg.addColorStop(0.35, 'rgba(255,220,140,0.55)');
      sg.addColorStop(0.5,  'rgba(255,255,255,0.9)');
      sg.addColorStop(0.65, 'rgba(255,240,180,0.65)');
      sg.addColorStop(1,    'rgba(255,220,140,0)');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.moveTo(ltx - 6, -10); ctx.lineTo(ltx + 18, -10);
      ctx.lineTo(lbx + 18, H + 10); ctx.lineTo(lbx - 6, H + 10);
      ctx.closePath(); ctx.fill();
    }

    let phase: 1 | 2 = 1;
    let phaseStart = performance.now();
    let coveredCalled = false;
    let lastTime = performance.now();
    let spawnAccum = 0;

    function frame(now: number): void {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      ctx.clearRect(0, 0, W, H);
      updateSparkles(dt);

      if (phase === 1) {
        const t = Math.min((now - phaseStart) / PHASE_IN_MS, 1);
        const eased = easeOutCubic(t);
        const rbx = eased * (W + SLANT) - SLANT;
        const rtx = rbx - SLANT;
        drawPhaseIn(rtx, rbx);
        drawSparkles();
        spawnAccum += dt;
        if (spawnAccum > 0.025 && rbx > -SLANT && rbx < W + SLANT) {
          spawnAccum = 0; spawnSparkles(rtx, rbx);
        }
        if (t >= 1) {
          if (!coveredCalled) { coveredCalled = true; onCovered(); }
          phase = 2; phaseStart = now;
        }
      } else {
        const t = Math.min((now - phaseStart) / PHASE_OUT_MS, 1);
        const eased = easeInCubic(t);
        const lbx = eased * (W + SLANT) - SLANT;
        const ltx = lbx - SLANT;
        if (lbx < W + SLANT) {
          drawPhaseOut(ltx, lbx);
          drawSparkles();
          spawnAccum += dt;
          if (spawnAccum > 0.025 && lbx > -SLANT && lbx < W + SLANT) {
            spawnAccum = 0; spawnSparkles(ltx, lbx);
          }
        }
        if (t >= 1) { canvas.remove(); resolve(); return; }
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// sparkle ― 黄金グリッター（320 + 280 ms）
// ─────────────────────────────────────────────────────────────────────────────

function sparkleTransitionImpl(onCovered: () => void): Promise<void> {
  return new Promise((resolve) => {
    const [canvas, ctx, W, H] = makeCanvas();
    const PHASE_IN_MS  = 320;
    const PHASE_OUT_MS = 280;

    // 7×6 グリッドに輝点を配置（わずかにジッター付き）
    const COLS = 7, ROWS = 6;
    const cellW = W / COLS, cellH = H / ROWS;
    const maxR  = Math.sqrt(cellW ** 2 + cellH ** 2) * 1.2; // 隣接セルと重複して隙間なく覆う

    const circles = Array.from({ length: COLS * ROWS }, (_, i) => ({
      x: (i % COLS + 0.5 + (Math.random() - 0.5) * 0.55) * cellW,
      y: (Math.floor(i / COLS) + 0.5 + (Math.random() - 0.5) * 0.55) * cellH,
    }));

    function draw(progress: number): void {
      ctx.clearRect(0, 0, W, H);
      const r = maxR * progress;
      if (r <= 0) return;
      for (const c of circles) {
        const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r);
        g.addColorStop(0,    'rgba(255,255,220,1)');
        g.addColorStop(0.3,  'rgba(255,220,100,0.97)');
        g.addColorStop(0.65, 'rgba(210,150, 30,0.6)');
        g.addColorStop(1,    'rgba(160, 90,  0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    let phase: 1 | 2 = 1;
    let phaseStart = performance.now();
    let coveredCalled = false;

    function frame(now: number): void {
      if (phase === 1) {
        const t = Math.min((now - phaseStart) / PHASE_IN_MS, 1);
        draw(easeInOutSine(t));
        if (t >= 1) {
          if (!coveredCalled) { coveredCalled = true; onCovered(); }
          phase = 2; phaseStart = now;
        }
      } else {
        const t = Math.min((now - phaseStart) / PHASE_OUT_MS, 1);
        draw(1 - easeInOutSine(t));
        if (t >= 1) { canvas.remove(); resolve(); return; }
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// cloud ― 白い夢幻ブロブ・回想シーン用（420 + 380 ms）
// ─────────────────────────────────────────────────────────────────────────────

interface CloudPuff { dx: number; dy: number; r: number }
interface CloudBlob { cy: number; puffs: CloudPuff[] }

function cloudTransitionImpl(onCovered: () => void): Promise<void> {
  return new Promise((resolve) => {
    const [canvas, ctx, W, H] = makeCanvas();
    const PHASE_IN_MS  = 420;
    const PHASE_OUT_MS = 380;

    // 7 個の雲ブロブを垂直方向に均等配置（各ブロブは大きな円の集合）
    const clouds: CloudBlob[] = Array.from({ length: 7 }, (_, i) => {
      const cy     = (i + 0.5) / 7 * H + (Math.random() - 0.5) * H * 0.07;
      const baseR  = H * (0.22 + Math.random() * 0.12);
      const nPuffs = 3 + Math.floor(Math.random() * 3);
      return {
        cy,
        puffs: Array.from({ length: nPuffs }, (__, j) => ({
          dx: (j - (nPuffs - 1) / 2) * baseR * 0.65,
          dy: (Math.random() - 0.5) * baseR * 0.28,
          r:  baseR * (0.75 + Math.random() * 0.45),
        })),
      };
    });

    function draw(progress: number, phase: 1 | 2): void {
      ctx.clearRect(0, 0, W, H);

      // ベースの白フィル（全面カバーを保証する）
      // phase1: progress 0.5 → 1.0 で opacity 0 → 0.97
      // phase2: progress 0 → 1 で opacity 0.97 → 0
      const baseAlpha = phase === 1
        ? Math.max(0, (progress - 0.5) * 2) * 0.97
        : (1 - progress) * 0.97;
      if (baseAlpha > 0) {
        ctx.fillStyle = `rgba(246,244,255,${baseAlpha.toFixed(3)})`;
        ctx.fillRect(0, 0, W, H);
      }

      // 雲ブロブを左から右へ流す
      // phase1: centerX が W * -0.30 → W * 0.55 へ
      // phase2: centerX が W *  0.55 → W * 1.40 へ（画面外へ抜ける）
      const centerX = phase === 1
        ? W * (-0.30 + 0.85 * progress)
        : W * ( 0.55 + 0.85 * progress);

      for (const cloud of clouds) {
        for (const puff of cloud.puffs) {
          const px = centerX + puff.dx;
          const py = cloud.cy + puff.dy;
          const r  = puff.r;
          const g  = ctx.createRadialGradient(px, py, 0, px, py, r);
          g.addColorStop(0,   'rgba(255,254,255,0.98)');
          g.addColorStop(0.5, 'rgba(242,238,255,0.88)');
          g.addColorStop(1,   'rgba(220,215,248,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(px, py, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    let phase: 1 | 2 = 1;
    let phaseStart = performance.now();
    let coveredCalled = false;

    function frame(now: number): void {
      if (phase === 1) {
        const t = Math.min((now - phaseStart) / PHASE_IN_MS, 1);
        draw(easeOutCubic(t), 1);
        if (t >= 1) {
          if (!coveredCalled) { coveredCalled = true; onCovered(); }
          phase = 2; phaseStart = now;
        }
      } else {
        const t = Math.min((now - phaseStart) / PHASE_OUT_MS, 1);
        draw(easeInCubic(t), 2);
        if (t >= 1) { canvas.remove(); resolve(); return; }
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
}
