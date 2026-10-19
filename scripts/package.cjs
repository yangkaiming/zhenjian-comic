/**
 * 统一打包入口。
 *
 * 原则：绝不修改 server/node_modules（不删、不剪枝、不还原）。
 * 体积优化改由 package.json 中 extraResources 的 filter 在「拷贝时排除」
 * devDependencies / 缓存 / 自引用链接，打包完你的开发环境原样不动。
 *
 * 用法：
 *   node scripts/package.cjs            # electron-builder --dir（win-unpacked）
 *   node scripts/package.cjs --installer # electron-builder（NSIS 安装包）
 */
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const INSTALLER = process.argv.includes('--installer');
const MIRROR = 'https://cdn.npmmirror.com/binaries/electron-builder-binaries/';

function step(name, cmd, args, opts = {}) {
  console.log(`\n── ${name} ──`);
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: true, ...opts });
  return r.status === 0;
}

let ok = step('build', 'npm', ['run', 'build']);
// 打包时压缩/混淆产物，降低源码被直接阅读的风险（仅影响 dist 流程，不波及日常 build 调试）
if (ok) ok = step('minify (压缩混淆产物)', 'node', ['scripts/minify.cjs']);
if (ok) {
  const env = {
    ...process.env,
    ELECTRON_BUILDER_BINARIES_MIRROR: MIRROR,
    // 默认 7z 最高压缩(-mx=9) 要十几分钟；降到 1 约 1 分钟出包（体积略大）
    ELECTRON_BUILDER_COMPRESSION_LEVEL: process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL || '1',
  };
  const args = INSTALLER ? [] : ['--dir'];
  ok = step('electron-builder', 'npx', ['electron-builder', ...args], { env });
}
if (ok) ok = step('patch:icon (写入 exe 图标)', 'npm', ['run', 'patch:icon']);

process.exit(ok ? 0 : 1);