/**
 * WipeTransition.ts
 * シナリオ間遷移用のワイプアニメーション。
 *
 * 斜めエッジのカーテンパネルが左から右へスウィープし、
 * 画面を覆った瞬間にシーン切替コールバックを呼び出す。
 * パネルはそのまま右へ抜けて新シーンを露出する。
 *
 * 使用例:
 *   await wipeTransition(() => {
 *     // 画面が完全に覆われたタイミングで実行される
 *     destroyOldScene();
 *     setupNewScene();
 *   });
 */

/** ワイプパネル上を流れる輝点パーティクル */
interface Sparkle {
  /** パネル先端エッジ上のY座標（0〜1正規化） */
  ry: number;
  /** エッジからの横オフセット（ピクセル） */
  ox: number;
  /** エッジからの縦オフセット（ピクセル） */
  oy: number;
  /** 速度 */
  vx: number;
  vy: number;
  /** 残存ライフ（1.0 → 0.0） */
  life: number;
  /** 初期サイズ */
  size: number;
}

/**
 * ワイプトランジションを再生する。
 * @param onCovered 画面が完全に覆われたタイミングで呼ばれるコールバック（同期）
 * @returns アニメーション完了時に resolve される Promise
 */
export function wipeTransition(onCovered: () => void): Promise<void> {
  return new Promise((resolve) => {
    const W = window.innerWidth;
    const H = window.innerHeight;

    /** カーテンパネルの斜めエッジ傾き量（px）。大きいほど急角度 */
    const SLANT = Math.round(H * 0.28);
    /** フェーズ1（カバー）の所要時間 ms */
    const PHASE_IN_MS = 380;
    /** フェーズ2（リバール）の所要時間 ms */
    const PHASE_OUT_MS = 360;

    // ── Canvas オーバーレイ作成 ──────────────────────────────────────
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    canvas.style.cssText = [
      'position:fixed', 'inset:0',
      'width:100%', 'height:100%',
      'z-index:9999',
      'pointer-events:none',
    ].join(';');
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d')!;

    // ── パーティクル管理 ──────────────────────────────────────────────
    const sparkles: Sparkle[] = [];

    function spawnSparkles(edgeTopX: number, edgeBottomX: number): void {
      // エッジに沿って数個生成
      const count = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < count; i++) {
        const ry = Math.random();
        const ex = edgeTopX + (edgeBottomX - edgeTopX) * ry; // edge X at this Y
        const ey = ry * H;
        sparkles.push({
          ry, ox: ex, oy: ey,
          vx: (Math.random() - 0.3) * 3,
          vy: (Math.random() - 0.5) * 3,
          life: 1.0,
          size: 1.5 + Math.random() * 3,
        });
      }
    }

    function updateSparkles(dt: number): void {
      for (let i = sparkles.length - 1; i >= 0; i--) {
        const s = sparkles[i]!;
        s.ox += s.vx;
        s.oy += s.vy;
        s.life -= dt * 3.5;
        if (s.life <= 0) sparkles.splice(i, 1);
      }
    }

    function drawSparkles(): void {
      for (const s of sparkles) {
        const alpha = Math.max(0, s.life);
        const r = s.size * s.life;
        ctx.save();
        ctx.globalAlpha = alpha;
        // 輝点（内側白 → 外側金）
        const grad = ctx.createRadialGradient(s.ox, s.oy, 0, s.ox, s.oy, r * 2.5);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.4, '#ffd060');
        grad.addColorStop(1, 'rgba(255,180,60,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(s.ox, s.oy, r * 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // ── パネル描画ヘルパー ─────────────────────────────────────────────

    /**
     * フェーズ1: 左側からパネルが覆ってくる。
     * rightTopX / rightBottomX = 先端エッジの上端・下端のX座標。
     */
    function drawPhaseIn(rightTopX: number, rightBottomX: number): void {
      // パネル本体
      const grad = ctx.createLinearGradient(rightTopX - 160, 0, rightTopX + 20, 0);
      grad.addColorStop(0, '#16093a');
      grad.addColorStop(0.65, '#2d1260');
      grad.addColorStop(0.88, '#5a2495');
      grad.addColorStop(1, '#7b3bb0');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(-10, -10);
      ctx.lineTo(rightTopX, -10);
      ctx.lineTo(rightBottomX, H + 10);
      ctx.lineTo(-10, H + 10);
      ctx.closePath();
      ctx.fill();

      // 先端エッジのシマー（明るい縦ライン）
      const shimmerGrad = ctx.createLinearGradient(rightTopX - 18, 0, rightBottomX + 6, H);
      shimmerGrad.addColorStop(0, 'rgba(255,220,140,0)');
      shimmerGrad.addColorStop(0.35, 'rgba(255,240,180,0.65)');
      shimmerGrad.addColorStop(0.5, 'rgba(255,255,255,0.9)');
      shimmerGrad.addColorStop(0.65, 'rgba(255,220,140,0.55)');
      shimmerGrad.addColorStop(1, 'rgba(255,200,100,0)');
      ctx.fillStyle = shimmerGrad;
      ctx.beginPath();
      ctx.moveTo(rightTopX - 18, -10);
      ctx.lineTo(rightTopX + 6, -10);
      ctx.lineTo(rightBottomX + 6, H + 10);
      ctx.lineTo(rightBottomX - 18, H + 10);
      ctx.closePath();
      ctx.fill();
    }

    /**
     * フェーズ2: パネルが右へ抜けていく。
     * leftTopX / leftBottomX = 後端エッジの上端・下端のX座標。
     */
    function drawPhaseOut(leftTopX: number, leftBottomX: number): void {
      const grad = ctx.createLinearGradient(leftTopX - 20, 0, leftTopX + 160, 0);
      grad.addColorStop(0, '#7b3bb0');
      grad.addColorStop(0.12, '#5a2495');
      grad.addColorStop(0.35, '#2d1260');
      grad.addColorStop(1, '#16093a');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(leftTopX, -10);
      ctx.lineTo(W + 10, -10);
      ctx.lineTo(W + 10, H + 10);
      ctx.lineTo(leftBottomX, H + 10);
      ctx.closePath();
      ctx.fill();

      // 後端エッジのシマー
      const shimmerGrad = ctx.createLinearGradient(leftTopX - 6, 0, leftBottomX + 18, H);
      shimmerGrad.addColorStop(0, 'rgba(255,200,100,0)');
      shimmerGrad.addColorStop(0.35, 'rgba(255,220,140,0.55)');
      shimmerGrad.addColorStop(0.5, 'rgba(255,255,255,0.9)');
      shimmerGrad.addColorStop(0.65, 'rgba(255,240,180,0.65)');
      shimmerGrad.addColorStop(1, 'rgba(255,220,140,0)');
      ctx.fillStyle = shimmerGrad;
      ctx.beginPath();
      ctx.moveTo(leftTopX - 6, -10);
      ctx.lineTo(leftTopX + 18, -10);
      ctx.lineTo(leftBottomX + 18, H + 10);
      ctx.lineTo(leftBottomX - 6, H + 10);
      ctx.closePath();
      ctx.fill();
    }

    // ── イージング ────────────────────────────────────────────────────
    function easeOutCubic(t: number): number {
      return 1 - Math.pow(1 - t, 3);
    }
    function easeInCubic(t: number): number {
      return t * t * t;
    }

    // ── アニメーションループ ──────────────────────────────────────────
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
        const elapsed = now - phaseStart;
        const t = Math.min(elapsed / PHASE_IN_MS, 1);
        const eased = easeOutCubic(t);

        // 先端エッジ：右端 = -SLANT〜(W+SLANT)
        const rightBottomX = eased * (W + SLANT) - SLANT;
        const rightTopX = rightBottomX - SLANT;

        drawPhaseIn(rightTopX, rightBottomX);
        drawSparkles();

        // スパークル生成（エッジが画面内にあるとき）
        spawnAccum += dt;
        if (spawnAccum > 0.025 && rightBottomX > -SLANT && rightBottomX < W + SLANT) {
          spawnAccum = 0;
          spawnSparkles(rightTopX, rightBottomX);
        }

        if (t >= 1) {
          // 画面が完全に覆われた
          if (!coveredCalled) {
            coveredCalled = true;
            onCovered();
          }
          phase = 2;
          phaseStart = now;
        }
      } else {
        const elapsed = now - phaseStart;
        const t = Math.min(elapsed / PHASE_OUT_MS, 1);
        const eased = easeInCubic(t);

        // 後端エッジ：左端 = -SLANT〜(W+SLANT)
        const leftBottomX = eased * (W + SLANT) - SLANT;
        const leftTopX = leftBottomX - SLANT;

        if (leftBottomX < W + SLANT) {
          drawPhaseOut(leftTopX, leftBottomX);
          drawSparkles();

          spawnAccum += dt;
          if (spawnAccum > 0.025 && leftBottomX > -SLANT && leftBottomX < W + SLANT) {
            spawnAccum = 0;
            spawnSparkles(leftTopX, leftBottomX);
          }
        }

        if (t >= 1) {
          canvas.remove();
          resolve();
          return;
        }
      }

      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  });
}
