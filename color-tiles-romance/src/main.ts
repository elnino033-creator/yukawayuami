/**
 * Color Tiles Romance - Phase 1 エントリポイント
 * SceneManager を使ってタイトル画面から起動する。
 */
import './style.css';
import { BgmManager } from '@/audio/BgmManager';
import { SceneManager } from '@/scenes/SceneManager';

async function main() {
  await BgmManager.init();
  const appContainer = document.getElementById('app');
  if (!appContainer) {
    throw new Error('#app element not found');
  }

  // コンテナをフルスクリーンに設定
  // style.css の #app に display:flex / padding / gap が残っているため全てリセットする
  appContainer.style.cssText = [
    'width:100vw;height:100vh;',
    'overflow:hidden;',
    'position:fixed;top:0;left:0;',
    'display:block;',   // flex を無効化
    'padding:0;',       // padding をリセット
    'gap:0;',           // gap をリセット
  ].join('');

  const manager = new SceneManager(appContainer);
  await manager.start();
}

main().catch((e) => {
  console.error('[main] Fatal error:', e);
  const err = document.createElement('div');
  err.style.cssText = 'color:red;padding:20px;font-family:monospace;white-space:pre;';
  err.textContent = `Fatal error: ${e?.message ?? e}`;
  document.body.appendChild(err);
});
