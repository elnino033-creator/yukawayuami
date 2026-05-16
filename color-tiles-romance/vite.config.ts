import { defineConfig } from 'vite';
import path from 'path';

// GitHub Pages デプロイ時はリポジトリ名を base に設定する。
// 環境変数 VITE_BASE が指定されていればそれを使用。
// 例: VITE_BASE=/color-tiles-romance/ npm run build
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  test: {
    globals: true,
    environment: 'jsdom'
  }
});
