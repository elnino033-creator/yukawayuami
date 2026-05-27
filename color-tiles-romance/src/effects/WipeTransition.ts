/**
 * WipeTransition.ts
 * シナリオ間遷移アニメーション集。
 *
 * | type    | 演出                              | 用途                          |
 * |---------|-----------------------------------|-------------------------------|
 * | wipe    | 斜めカーテンが左→右へスウィープ   | 通常遷移（デフォルト）        |
 * | sparkle | 黄金の輝点が画面を覆うグリッター  | ご褒美シナリオなど            |
 * | cloud   | 白い雲ブロブがゆったり横切る      | 回想・夢想シーン              |
 * | dark    | 暗い curtain が上から下へ落下     | 5章・BAD END などシリアスシーン|
 *
 * すべての遷移で onCovered() は画面が完全に覆われた瞬間に同期で呼ばれる。
 */

export type TransitionType = 'wipe' | 'sparkle' | 'cloud' | 'dark';

/**
 * シーン遷移アニメーションを再生する。
 * @param type    遷移タイプ
 * @param onCovered 画面が完全に覆われたタイミングで呼ばれるコールバック（同期）
 * @returns アニメーション完了時に resolve される Promise
 */
export function sceneTransition(type: TransitionType, onCovered: () => void): Promise<void> {
  if (type === 'sparkle') return sparkleTransitionImpl(onCovered);
  if (type === 'cloud')   return cloudTransitionImpl(onCovered);
  if (type === 'dark')    return darkTransitionImpl(onCovered);
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
// wipe ― 斜めカーテン 1パス通過（400 ms）
//
// パネルが左端から右端まで1回だけ通過する。
// 画面が完全に覆われた瞬間（通過の中盤）に onCovered() を呼ぶ。
// ─────────────────────────────────────────────────────────────────────────────

interface Sparkle {
  ox: number; oy: number;
  vx: number; vy: number;
  life: number; size: number;
}

function wipeTransitionImpl(onCovered: () => void): Promise<void> {
  return new Promise((resolve) => {
    const [canvas, ctx, W, H] = makeCanvas();
    const SLANT       = Math.round(H * 0.28);
    const PANEL_W     = W + SLANT * 2;          // 画面を確実に覆える幅
    const START_LB    = -(PANEL_W + 10);        // leading edge が -10 から始まる
    const END_LB      = W + SLANT + 10;         // trailing edge が W+10 で退場完了
    const COVER_LB    = -SLANT;                 // trailing が -SLANT になると全面カバー
    const TOTAL_MS    = 400;

    const sparkles: Sparkle[] = [];
    let coveredCalled = false;
    const startTime = performance.now();
    let lastTime = startTime;
    let spawnAccum = 0;

    function spawnSparkles(rtx: number, rbx: number): void {
      const count = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < count; i++) {
        const ry = Math.random();
        sparkles.push({
          ox: rtx + (rbx - rtx) * ry, oy: ry * H,
          vx: (Math.random() - 0.3) * 3, vy: (Math.random() - 0.5) * 3,
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

    /** trailing edge = leftBottom を基準にパネルを描画 */
    function drawPanel(leftBottom: number): void {
      const rightBottom = leftBottom + PANEL_W;
      const leftTop     = leftBottom - SLANT;
      const rightTop    = rightBottom - SLANT;

      // パネル本体（trailing → leading 方向でグラデーション）
      const grad = ctx.createLinearGradient(leftTop, 0, rightTop, 0);
      grad.addColorStop(0,    '#7b3bb0');
      grad.addColorStop(0.06, '#5a2495');
      grad.addColorStop(0.22, '#2d1260');
      grad.addColorStop(0.78, '#16093a');
      grad.addColorStop(0.90, '#2d1260');
      grad.addColorStop(0.96, '#5a2495');
      grad.addColorStop(1,    '#7b3bb0');
      ctx.fillStyle = grad;

      ctx.beginPath();
      ctx.moveTo(leftTop,    -10);
      ctx.lineTo(rightTop,   -10);
      ctx.lineTo(rightBottom, H + 10);
      ctx.lineTo(leftBottom,  H + 10);
      ctx.closePath();
      ctx.fill();

      // 先端（leading/right）エッジのシマー
      const sg = ctx.createLinearGradient(rightTop - 18, 0, rightBottom + 6, H);
      sg.addColorStop(0,    'rgba(255,220,140,0)');
      sg.addColorStop(0.35, 'rgba(255,240,180,0.65)');
      sg.addColorStop(0.5,  'rgba(255,255,255,0.9)');
      sg.addColorStop(0.65, 'rgba(255,220,140,0.55)');
      sg.addColorStop(1,    'rgba(255,200,100,0)');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.moveTo(rightTop - 18, -10);
      ctx.lineTo(rightTop +  6, -10);
      ctx.lineTo(rightBottom + 6, H + 10);
      ctx.lineTo(rightBottom - 18, H + 10);
      ctx.closePath();
      ctx.fill();
    }

    function frame(now: number): void {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      ctx.clearRect(0, 0, W, H);
      updateSparkles(dt);

      const t          = Math.min((now - startTime) / TOTAL_MS, 1);
      const eased      = easeInOutSine(t);
      const leftBottom = START_LB + (END_LB - START_LB) * eased;
      const rightBottom = leftBottom + PANEL_W;
      const rightTop    = rightBottom - SLANT;

      drawPanel(leftBottom);
      drawSparkles();

      // 画面が完全に覆われた瞬間に onCovered を呼ぶ
      if (!coveredCalled && leftBottom >= COVER_LB) {
        coveredCalled = true;
        onCovered();
      }

      // leading edge が画面内にある間スパークルを生成
      spawnAccum += dt;
      if (spawnAccum > 0.025 && rightBottom > -10 && rightBottom < W + SLANT * 2) {
        spawnAccum = 0;
        spawnSparkles(rightTop, rightBottom);
      }

      if (t >= 1) { canvas.remove(); resolve(); return; }
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

    const COLS = 7, ROWS = 6;
    const cellW = W / COLS, cellH = H / ROWS;
    const maxR  = Math.sqrt(cellW ** 2 + cellH ** 2) * 1.2;

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

      const baseAlpha = phase === 1
        ? Math.max(0, (progress - 0.5) * 2) * 0.97
        : (1 - progress) * 0.97;
      if (baseAlpha > 0) {
        ctx.fillStyle = `rgba(246,244,255,${baseAlpha.toFixed(3)})`;
        ctx.fillRect(0, 0, W, H);
      }

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

// ─────────────────────────────────────────────────────────────────────────────
// dark ― 暗い curtain が上から落下（300 + 280 ms）5章・BAD END用
// ─────────────────────────────────────────────────────────────────────────────

function darkTransitionImpl(onCovered: () => void): Promise<void> {
  return new Promise((resolve) => {
    const [canvas, ctx, W, H] = makeCanvas();
    const PHASE_IN_MS  = 300;
    const PHASE_OUT_MS = 280;
    const DRIP_AMP     = 28; // ドリップ振れ幅の最大値 (px)

    /**
     * 複数周波数の sin 合成による不規則な底辺エッジ。
     * 戻り値は baseY からの実際の Y 座標。
     */
    function dripY(x: number, baseY: number): number {
      return baseY
        + Math.sin(x / W * Math.PI *  4.6       ) * 14
        + Math.sin(x / W * Math.PI *  9.3 + 1.1 ) *  8
        + Math.sin(x / W * Math.PI * 17.1 + 2.5 ) *  4;
    }

    /** topY から bottomEdge まで暗いカーテンを描画する */
    function drawCurtain(topY: number, bottomEdge: number): void {
      // カーテン本体（上→下グラデーション）
      const grad = ctx.createLinearGradient(0, topY, 0, bottomEdge);
      grad.addColorStop(0,    '#040008');
      grad.addColorStop(0.75, '#0d000f');
      grad.addColorStop(0.93, '#200010');
      grad.addColorStop(1,    '#380015');

      ctx.beginPath();
      ctx.moveTo(-10, topY);
      ctx.lineTo(W + 10, topY);
      // 底辺を右→左に波形で描く
      for (let x = W + 10; x >= -10; x -= 3) {
        ctx.lineTo(x, dripY(x, bottomEdge));
      }
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // 底辺の赤い輝線（陰気な光彩）
      ctx.save();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = 'rgba(200,30,50,0.72)';
      ctx.shadowColor  = 'rgba(255,50,70,0.85)';
      ctx.shadowBlur   = 10;
      ctx.beginPath();
      ctx.moveTo(-10, dripY(-10, bottomEdge));
      for (let x = -10; x <= W + 10; x += 3) {
        ctx.lineTo(x, dripY(x, bottomEdge));
      }
      ctx.stroke();
      ctx.restore();
    }

    let phase: 1 | 2 = 1;
    let phaseStart = performance.now();
    let coveredCalled = false;

    function frame(now: number): void {
      ctx.clearRect(0, 0, W, H);

      if (phase === 1) {
        const t     = Math.min((now - phaseStart) / PHASE_IN_MS, 1);
        const eased = easeOutCubic(t);
        // 底辺が画面上端より少し上から画面下端より少し下まで降下
        // dripY の最小値（山の高い方）＝ baseY − 26px なので +30px で確実にカバー
        const bottomEdge = eased * (H + DRIP_AMP + 30) - DRIP_AMP;
        drawCurtain(-10, bottomEdge);

        if (t >= 1) {
          if (!coveredCalled) { coveredCalled = true; onCovered(); }
          phase = 2; phaseStart = now;
        }
      } else {
        const t     = Math.min((now - phaseStart) / PHASE_OUT_MS, 1);
        const eased = easeInCubic(t);
        // カーテン全体が下方向へ退場
        const shift = eased * (H + DRIP_AMP + 30);
        drawCurtain(-10 + shift, H + DRIP_AMP + 20 + shift);

        if (t >= 1) { canvas.remove(); resolve(); return; }
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
}
