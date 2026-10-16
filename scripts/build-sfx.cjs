/**
 * 生成「7z 自解压安装包」（单文件，双击即安装）。
 *
 * 为什么不走 electron-builder 的 NSIS：它对整个应用做 7z 最高压缩(-mx=9)，
 * 几百 MB 要压十几分钟。这里改用 NSIS 直接打包 win-unpacked（LZMA 压缩），
 * 体积小、几分钟出包，且完全不修改 server/node_modules。
 *
 * 编译后用 rcedit 强制给安装包写入自定义图标（NSIS 的 Icon 指令在精简版上不可靠）。
 *
 * 前置：先有 release/win-unpacked（npm run dist 会生成）。
 * 用法：npm run dist:sfx   （= npm run dist && 本脚本）
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function findInCache(cacheName, rel) {
  const base = path.join(process.env.LOCALAPPDATA || os.homedir(), 'electron-builder', 'Cache', cacheName);
  if (!fs.existsSync(base)) return null;
  for (const d of fs.readdirSync(base)) {
    const p = path.join(base, d, rel);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

const findMakensis = () => findInCache('nsis', path.join('Bin', 'makensis.exe'));
const findRcedit = () => findInCache('winCodeSign', 'rcedit-x64.exe');

if (!fs.existsSync(path.join(ROOT, 'release', 'win-unpacked'))) {
  console.error('[sfx] 未找到 release/win-unpacked，请先执行 npm run dist');
  process.exit(1);
}

const mk = findMakensis();
if (!mk) {
  console.error('[sfx] 未找到 makensis.exe（NSIS 编译器）。先跑一次 npm run dist 让 electron-builder 缓存 NSIS，再重试。');
  process.exit(1);
}

console.log('[sfx] 使用编译器:', mk);
const r = spawnSync(mk, ['/INPUTCHARSET', 'UTF8', path.join('build', 'sfx-installer.nsi')], {
  cwd: ROOT,
  stdio: 'inherit',
});
if (r.status === null || r.status !== 0) process.exit(r.status === null ? 1 : r.status);

// 给安装包写自定义图标
const releaseDir = path.join(ROOT, 'release');
const setup = fs.readdirSync(releaseDir).find((f) => /setup.*\.exe$/i.test(f));
const icon = path.join(ROOT, 'build', 'icon.ico');
if (setup && fs.existsSync(icon)) {
  const rc = findRcedit();
  if (rc) {
    console.log('[sfx] 写入安装包图标:', setup);
    spawnSync(rc, [path.join(releaseDir, setup), '--set-icon', icon], { stdio: 'inherit' });
  } else {
    console.warn('[sfx] 未找到 rcedit，跳过图标写入');
  }
} else {
  console.warn('[sfx] 未找到安装包或 icon.ico，跳过图标写入');
}