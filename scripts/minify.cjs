/**
 * 打包时产物混淆/压缩（防源码暴露）。
 *
 * 只对已编译产物做「单文件压缩」：使用 esbuild.transform(minify) 缩短标识符、
 * 去除空白与注释，**不**做 bundle，因此保留 require/import 模块结构，运行行为不变。
 * 覆盖目录：dist-electron（Electron 主进程 / preload）、server/dist（本地后端）。
 * 前端 web/dist 已由 Vite 在构建时压缩，这里不再处理。
 */
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const TARGETS = [
  path.join(ROOT, 'dist-electron'),
  path.join(ROOT, 'server', 'dist'),
];

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, acc);
    else if (entry.isFile() && p.endsWith('.js')) acc.push(p);
  }
  return acc;
}

(async () => {
  let count = 0;
  let skipped = 0;
  for (const root of TARGETS) {
    const files = walk(root);
    for (const file of files) {
      const rel = path.relative(ROOT, file);
      try {
        const code = fs.readFileSync(file, 'utf-8');
        if (!code.trim()) continue;
        const result = await esbuild.transform(code, {
          loader: 'js',
          minify: true,
          target: 'es2022',
          platform: 'node',
        });
        fs.writeFileSync(file, result.code);
        count += 1;
      } catch (e) {
        skipped += 1;
        console.warn(`[minify] 跳过 ${rel}: ${e.message}`);
      }
    }
  }
  console.log(`[minify] 已压缩 ${count} 个 JS 文件${skipped ? `，跳过 ${skipped} 个` : ''}`);
})();
