import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// 开发模式：vite 跑 5173，REST(/p) 与 WebSocket(/ws) 转发给本地代理服务（server/index.mjs，默认 8787）
// 生产模式：npm start 由 server/index.mjs 直接托管 dist 并提供 /p /ws
const PROXY_PORT = process.env.PROXY_PORT || '8787';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    port: 5173,
    proxy: {
      '/p': { target: `http://127.0.0.1:${PROXY_PORT}`, changeOrigin: false },
      '/ws': { target: `http://127.0.0.1:${PROXY_PORT}`, ws: true },
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1500,
  },
});
