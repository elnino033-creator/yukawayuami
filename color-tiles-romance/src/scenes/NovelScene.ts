/**
 * NovelScene.ts
 * ScenarioPlayer をラップして、シナリオJSONのロードと再生を行うシーン。
 * ログ・セーブ/ロード・スキップ/早送り/オートのUI（DOMオーバーレイ）を提供する。
 */

import { ScenarioPlayer } from '@/novel/ScenarioPlayer';
import type { ScenarioStep } from '@/novel/ScenarioPlayer';
import type { ScenarioContext } from '@/store/progressStore';
import { SceneSaveStore } from '@/store/sceneSaveStore';
import type { ScenarioSaveData } from '@/store/sceneSaveStore';
import { DebugMode } from '@/debug/DebugMode';

export class NovelScene {
  private container: HTMLElement;
  private scenarioId: string;
  private context: ScenarioContext;
  private onEnd: () => void;
  private player: ScenarioPlayer | null = null;
  /** このシナリオが終了したあとに起動すべきステージID（セーブ/タイトルLOAD用） */
  private nextStageId: string | undefined = undefined;
  /** nextStageId と対になるシナリオ種別（'pre' / 'post'） */
  private scenarioContinueRole: 'pre' | 'post' | undefined = undefined;

  // DOM overlay elements
  private overlayEl: HTMLDivElement | null = null;
  private logPanelEl: HTMLDivElement | null = null;
  private saveLoadPanelEl: HTMLDivElement | null = null;

  // Button active states
  private isAutoActive = false;
  private isFFActive = false;

  constructor(
    container: HTMLElement,
    scenarioId: string,
    context: ScenarioContext,
    onEnd: () => void
  ) {
    this.container = container;
    this.scenarioId = scenarioId;
    this.context = context;
    this.onEnd = onEnd;
  }

  async start(): Promise<void> {
    const steps = await this.loadScenario();

    this.player = new ScenarioPlayer(this.container, this.context);
    this.player.setScenarioId(this.scenarioId);
    this.player.loadScenario(steps);
    this.player.onScenarioEnd(() => {
      this.removeOverlay();
      this.onEnd();
    });

    this.buildOverlay();
    await this.player.start();
  }

  /**
   * シナリオセーブデータから状態を復元してシナリオを再開する（タイトル画面LOADから呼ばれる）。
   * @param save ロードするセーブデータ
   */
  async startFromSave(save: ScenarioSaveData): Promise<void> {
    // セーブ時のシナリオJSONをロード
    let steps: ScenarioStep[];
    try {
      const url = `${import.meta.env.BASE_URL}data/scenarios/${save.scenarioId}.json`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      steps = await res.json() as ScenarioStep[];
    } catch {
      // ロード失敗時は onEnd（タイトルへ）を呼ぶ
      this.onEnd();
      return;
    }

    this.player = new ScenarioPlayer(this.container, this.context);
    this.player.setScenarioId(save.scenarioId);
    this.player.loadScenario(steps);
    this.player.onScenarioEnd(() => {
      this.removeOverlay();
      this.onEnd();
    });

    this.buildOverlay();

    // 保存された状態を復元する（flags・readLines も context を通じて反映される）
    this.player.restoreState({
      stepIndex: save.stepIndex,
      bgKey: save.bgKey,
      bgmKey: save.bgmKey,
      characters: save.characters,
      currentName: save.currentName,
      displayedText: save.displayedText,
      flags: save.flags,
      readLines: save.readLines,
      awaitingChoice: save.awaitingChoice,
      pendingChoices: save.pendingChoices,
      choiceContextName: save.choiceContextName,
      choiceContextBody: save.choiceContextBody,
    });

    this.isAutoActive = false;
    this.isFFActive = false;

    await this.player.startFromRestored();
  }

  /**
   * シナリオ終了後の継続先をセットする（タイトルLOADからの正しい遷移先判定に使用）。
   * - role === 'pre': preScenario として起動 → GOODルート後にパズルへ（既読マーク付き）
   * - role === 'post': postScenario / flashback → GOODルート後に次ステージへ（既読マーク不要）
   * @param role シナリオ種別
   * @param stageId 終了後に起動するステージID
   */
  setScenarioContinue(role: 'pre' | 'post', stageId: string): void {
    this.scenarioContinueRole = role;
    this.nextStageId = stageId;
  }

  destroy(): void {
    this.removeOverlay();
    if (this.player) {
      this.player.destroy();
      this.player = null;
    }
  }

  // ---------- Overlay UI ----------

  private buildOverlay(): void {
    // Wrapper: makes container a positioned parent
    this.container.style.position = 'relative';

    // Control bar
    const bar = document.createElement('div');
    bar.style.cssText = `
      position: absolute; bottom: calc(26% + 4px); right: 8px; display: flex; gap: 5px; z-index: 10;
      user-select: none; pointer-events: auto;
    `;
    bar.innerHTML = this.controlBarHTML();
    this.container.appendChild(bar);
    this.overlayEl = bar;

    this.attachControlBarEvents(bar);

    // Log panel
    this.logPanelEl = this.createLogPanel();
    this.container.appendChild(this.logPanelEl);

    // Save/Load panel
    this.saveLoadPanelEl = this.createSaveLoadPanel();
    this.container.appendChild(this.saveLoadPanelEl);
  }

  private controlBarHTML(): string {
    const btn = (id: string, label: string, title: string) =>
      `<button id="${id}" title="${title}" style="${this.btnStyle()}">${label}</button>`;
    const parts = [
      btn('btn-log', 'LOG', 'ログを表示'),
      btn('btn-save', 'SAVE', 'セーブ'),
      btn('btn-load', 'LOAD', 'ロード'),
      `<span style="border-left:1px solid rgba(255,255,255,0.2);margin:0 2px;"></span>`,
      btn('btn-skip', 'SKIP', '既読スキップ'),
      btn('btn-ff', '▶▶', '早送り'),
      btn('btn-auto', 'AUTO', 'オート'),
    ];
    if (DebugMode.isActive()) {
      parts.push(`<span style="border-left:1px solid rgba(255,100,100,0.4);margin:0 2px;"></span>`);
      parts.push(btn('btn-debug-end', '→END', 'シナリオ強制終了（デバッグ）'));
    }
    return parts.join('');
  }

  private btnStyle(active = false): string {
    return [
      `background:${active ? 'rgba(180,140,255,0.85)' : 'rgba(20,20,40,0.78)'}`,
      `color:${active ? '#fff' : '#c8c0e8'}`,
      'border:1px solid rgba(180,140,255,0.4)',
      'border-radius:4px',
      'padding:4px 9px',
      'font-size:11px',
      'font-family:sans-serif',
      'cursor:pointer',
      'line-height:1.4',
      'transition:background 0.15s',
    ].join(';');
  }

  private attachControlBarEvents(bar: HTMLDivElement): void {
    const getBtn = (id: string) => bar.querySelector<HTMLButtonElement>(`#${id}`)!;

    getBtn('btn-log').addEventListener('click', () => this.openLog());

    getBtn('btn-save').addEventListener('click', () => {
      this.showSaveLoadPanel('save');
    });

    getBtn('btn-load').addEventListener('click', () => {
      this.showSaveLoadPanel('load');
    });

    getBtn('btn-skip').addEventListener('click', () => {
      this.showSkipConfirm(bar);
    });

    const ffBtn = getBtn('btn-ff');
    ffBtn.addEventListener('click', () => {
      this.isFFActive = !this.isFFActive;
      if (this.isFFActive) this.isAutoActive = false;
      this.player?.setFastForward(this.isFFActive);
      this.syncButtonStates(bar);
    });

    const autoBtn = getBtn('btn-auto');
    autoBtn.addEventListener('click', () => {
      this.isAutoActive = !this.isAutoActive;
      if (this.isAutoActive) this.isFFActive = false;
      this.player?.setAutoMode(this.isAutoActive);
      this.syncButtonStates(bar);
    });

    if (DebugMode.isActive()) {
      const debugEndBtn = bar.querySelector<HTMLButtonElement>('#btn-debug-end');
      if (debugEndBtn) {
        debugEndBtn.addEventListener('click', () => {
          this.player?.forceEnd();
        });
      }
    }
  }

  private syncButtonStates(bar: HTMLDivElement): void {
    const ff = bar.querySelector<HTMLButtonElement>('#btn-ff');
    const auto = bar.querySelector<HTMLButtonElement>('#btn-auto');
    if (ff) ff.style.cssText = this.btnStyle(this.isFFActive);
    if (auto) auto.style.cssText = this.btnStyle(this.isAutoActive);
  }

  // ---------- Skip Confirm Dialog ----------

  private showSkipConfirm(bar: HTMLDivElement): void {
    const dialog = document.createElement('div');
    dialog.style.cssText = [
      'position:absolute',
      'inset:0',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'z-index:40',
      'background:rgba(0,0,0,0.55)',
    ].join(';');

    dialog.innerHTML = `
      <div style="
        background:rgba(16,12,36,0.97);
        border:1px solid rgba(180,140,255,0.5);
        border-radius:10px;
        padding:28px 32px;
        text-align:center;
        font-family:sans-serif;
        color:#e0dcf0;
        min-width:260px;
      ">
        <div style="font-size:15px;margin-bottom:20px;line-height:1.6;">
          次のシーン・選択肢へ飛びますか？
        </div>
        <div style="display:flex;gap:12px;justify-content:center;">
          <button id="skip-yes" style="${this.btnStyle(true)}padding:7px 24px;font-size:13px;">はい</button>
          <button id="skip-no"  style="${this.btnStyle()}padding:7px 24px;font-size:13px;">いいえ</button>
        </div>
      </div>
    `;

    this.container.appendChild(dialog);

    dialog.querySelector('#skip-yes')!.addEventListener('click', () => {
      dialog.remove();
      if (this.player) {
        this.isAutoActive = false;
        this.isFFActive = false;
        this.syncButtonStates(bar);
        this.player.setSkipMode(true);
      }
    });

    dialog.querySelector('#skip-no')!.addEventListener('click', () => {
      dialog.remove();
    });
  }

  // ---------- Log Panel ----------

  private createLogPanel(): HTMLDivElement {
    const panel = document.createElement('div');
    panel.style.cssText = [
      'position:absolute',
      'inset:0',
      'background:rgba(8,8,24,0.93)',
      'display:none',
      'flex-direction:column',
      'z-index:30',
      'font-family:sans-serif',
      'color:#e0dcf0',
    ].join(';');
    panel.innerHTML = `
      <div style="display:flex;align-items:center;padding:10px 16px;border-bottom:1px solid rgba(180,140,255,0.25);gap:8px;">
        <span style="font-size:14px;font-weight:bold;flex:1;">バックログ</span>
        <button id="log-close" style="${this.btnStyle()}">✕ 閉じる</button>
      </div>
      <div id="log-entries" style="flex:1;overflow-y:auto;padding:14px 18px;display:flex;flex-direction:column;gap:12px;"></div>
    `;
    panel.querySelector('#log-close')!.addEventListener('click', () => { panel.style.display = 'none'; });
    return panel;
  }

  private openLog(): void {
    if (!this.logPanelEl || !this.player) return;
    const entries = this.player.getLog();
    const entriesEl = this.logPanelEl.querySelector<HTMLDivElement>('#log-entries')!;
    entriesEl.innerHTML = entries.map(e => `
      <div style="line-height:1.6;">
        ${e.name ? `<div style="font-size:12px;font-weight:bold;color:#b49fff;margin-bottom:3px;">${e.name}</div>` : ''}
        <div style="font-size:14px;">${e.body.replace(/\n/g, '<br>')}</div>
      </div>
    `).join('<hr style="border-color:rgba(180,140,255,0.15);margin:2px 0;">');
    this.logPanelEl.style.display = 'flex';
    // Scroll to bottom
    setTimeout(() => {
      if (this.logPanelEl) {
        const el = this.logPanelEl.querySelector<HTMLDivElement>('#log-entries')!;
        el.scrollTop = el.scrollHeight;
      }
    }, 50);
  }

  // ---------- Save / Load Panel ----------

  private createSaveLoadPanel(): HTMLDivElement {
    const panel = document.createElement('div');
    panel.style.cssText = [
      'position:absolute',
      'inset:0',
      'background:rgba(8,8,24,0.93)',
      'display:none',
      'flex-direction:column',
      'z-index:30',
      'font-family:sans-serif',
      'color:#e0dcf0',
    ].join(';');
    panel.innerHTML = `
      <div style="display:flex;align-items:center;padding:10px 16px;border-bottom:1px solid rgba(180,140,255,0.25);gap:8px;">
        <span id="sl-title" style="font-size:14px;font-weight:bold;flex:1;">セーブ</span>
        <button id="sl-close" style="${this.btnStyle()}">✕ 閉じる</button>
      </div>
      <div id="sl-slots" style="flex:1;overflow-y:auto;padding:16px 18px;display:flex;flex-direction:column;gap:10px;"></div>
    `;
    panel.querySelector('#sl-close')!.addEventListener('click', () => { panel.style.display = 'none'; });
    return panel;
  }

  private showSaveLoadPanel(mode: 'save' | 'load'): void {
    if (!this.saveLoadPanelEl) return;
    const title = this.saveLoadPanelEl.querySelector<HTMLElement>('#sl-title')!;
    title.textContent = mode === 'save' ? 'セーブ' : 'ロード';

    const slotsEl = this.saveLoadPanelEl.querySelector<HTMLDivElement>('#sl-slots')!;
    const saves = SceneSaveStore.getAll();
    slotsEl.innerHTML = '';

    for (let i = 0; i < 3; i++) {
      const save = saves[i];
      const slotEl = document.createElement('div');
      slotEl.style.cssText = [
        'display:flex',
        'align-items:center',
        'gap:12px',
        'padding:12px 16px',
        'background:rgba(40,30,70,0.7)',
        'border:1px solid rgba(180,140,255,0.3)',
        'border-radius:6px',
        save || mode === 'save' ? 'cursor:pointer' : 'cursor:default',
      ].join(';');

      if (save) {
        slotEl.innerHTML = `
          <div style="flex:1;">
            <div style="font-size:12px;color:#b49fff;margin-bottom:4px;">スロット ${i + 1}</div>
            <div style="font-size:13px;">${save.previewText || '(テキストなし)'}</div>
            <div style="font-size:11px;color:#888;margin-top:3px;">${new Date(save.savedAt).toLocaleString('ja-JP')}</div>
          </div>
          ${mode === 'save' ? '<span style="font-size:11px;color:#f88;">上書き</span>' : ''}
        `;
      } else {
        slotEl.innerHTML = `<div style="flex:1;color:#666;">スロット ${i + 1} — 空き</div>`;
      }

      if (mode === 'save') {
        slotEl.addEventListener('click', () => this.executeSave(i));
      } else if (mode === 'load' && save) {
        slotEl.addEventListener('click', () => { void this.executeLoad(save); });
      }

      slotsEl.appendChild(slotEl);
    }

    this.saveLoadPanelEl.style.display = 'flex';
  }

  private executeSave(slot: number): void {
    if (!this.player) return;
    const state = this.player.getState();
    const save: ScenarioSaveData = {
      ...state,
      slot,
      savedAt: new Date().toISOString(),
      // シナリオ継続情報を保持する（タイトルLOADからの正しい遷移先判定に使用）
      nextStageId: this.nextStageId,
      scenarioRole: this.scenarioContinueRole,
    };
    SceneSaveStore.set(slot, save);
    if (this.saveLoadPanelEl) {
      this.saveLoadPanelEl.style.display = 'none';
    }
    this.showToast('セーブしました');
  }

  private async executeLoad(save: ScenarioSaveData): Promise<void> {
    if (!this.player) return;
    if (this.saveLoadPanelEl) this.saveLoadPanelEl.style.display = 'none';

    // Reload the scenario JSON
    let steps: ScenarioStep[];
    try {
      const url = `${import.meta.env.BASE_URL}data/scenarios/${save.scenarioId}.json`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      steps = await res.json() as ScenarioStep[];
    } catch {
      this.showToast('ロードに失敗しました');
      return;
    }

    // Destroy old player, create new one
    this.player.destroy();
    this.player = new ScenarioPlayer(this.container, this.context);
    this.player.setScenarioId(save.scenarioId);
    this.player.loadScenario(steps);
    this.player.onScenarioEnd(() => {
      this.removeOverlay();
      this.onEnd();
    });

    // Restore visual state
    this.player.restoreState({
      stepIndex: save.stepIndex,
      bgKey: save.bgKey,
      bgmKey: save.bgmKey,
      characters: save.characters,
      currentName: save.currentName,
      displayedText: save.displayedText,
      flags: save.flags,
      readLines: save.readLines,
      // 選択肢待機中のセーブを正しく復元する
      awaitingChoice: save.awaitingChoice,
      pendingChoices: save.pendingChoices,
      choiceContextName: save.choiceContextName,
      choiceContextBody: save.choiceContextBody,
    });

    // ロードしたセーブのシナリオ継続情報に更新する
    // （別スロットをロードした場合に、次のセーブが正しい情報を引き継ぐよう保持）
    this.nextStageId = save.nextStageId;
    this.scenarioContinueRole = save.scenarioRole;

    // Reset button states
    this.isAutoActive = false;
    this.isFFActive = false;
    if (this.overlayEl) this.syncButtonStates(this.overlayEl);

    // Start render loop without advancing to next step
    await this.player.startFromRestored();
  }

  private showToast(msg: string): void {
    const toast = document.createElement('div');
    toast.textContent = msg;
    toast.style.cssText = [
      'position:absolute',
      'bottom:80px',
      'left:50%',
      'transform:translateX(-50%)',
      'background:rgba(80,60,140,0.92)',
      'color:#fff',
      'padding:8px 20px',
      'border-radius:20px',
      'font-size:13px',
      'font-family:sans-serif',
      'z-index:50',
      'pointer-events:none',
    ].join(';');
    this.container.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
  }

  private removeOverlay(): void {
    this.overlayEl?.remove(); this.overlayEl = null;
    this.logPanelEl?.remove(); this.logPanelEl = null;
    this.saveLoadPanelEl?.remove(); this.saveLoadPanelEl = null;
  }

  // ---------- Scenario Loading ----------

  private async loadScenario(): Promise<ScenarioStep[]> {
    try {
      const url = `${import.meta.env.BASE_URL}data/scenarios/${this.scenarioId}.json`;
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`[NovelScene] scenario not found: ${this.scenarioId}, using fallback`);
        return this.fallbackScenario();
      }
      return await res.json() as ScenarioStep[];
    } catch (e) {
      console.error('[NovelScene] failed to load scenario:', e);
      return this.fallbackScenario();
    }
  }

  private fallbackScenario(): ScenarioStep[] {
    return [
      { bg: 'classroom.png' },
      { chara: { id: 'akari', expr: 'normal', pos: 'center' } },
      { text: { name: 'あかり', body: 'あれ……シナリオファイルが見つかりませんでした。' }, id: 'fallback_01' },
      { text: { name: 'あかり', body: 'でも、ゲームは続けられます。ステージへ進みましょう！' }, id: 'fallback_02' }
    ];
  }
}
