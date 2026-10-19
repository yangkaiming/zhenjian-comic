import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 单一版本来源：根 package.json 的 version（与 Electron app.getVersion() 保持一致）。
// 改版本号只需改根 package.json 的 "version" 字段。
const appVersion = (
  JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf-8')) as {
    version: string;
  }
).version;

export default defineConfig({
  base: './',
  plugins: [react()],
  // 将版本号注入前端（dev 与 build 均生效），供无 Electron 桥时回退展示
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
    // 生产构建压缩（缩短标识符），并显式关闭 sourcemap，避免源码映射随包分发
    minify: 'esbuild',
    sourcemap: false,
  },
});
