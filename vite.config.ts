/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages のプロジェクトページ(https://<user>.github.io/romaji-typing/)配下で配信する。
  // 開発サーバーと preview の URL も同じパスになる。
  base: '/romaji-typing/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
  },
});
