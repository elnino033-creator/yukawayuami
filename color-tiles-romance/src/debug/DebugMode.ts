/**
 * DebugMode.ts
 * URL パラメータ ?debug=1 でデバッグモードを有効化するユーティリティ。
 */
export const DebugMode = {
  /** デバッグモードが有効かどうかを返す */
  isActive(): boolean {
    try {
      return new URLSearchParams(window.location.search).get('debug') === '1';
    } catch {
      return false;
    }
  },
};
