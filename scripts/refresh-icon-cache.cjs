/**
 * 刷新 Windows 资源管理器图标缓存。
 *
 * 背景：打包后的 exe 图标已更新（见 scripts/patch-exe-icon.cjs），
 * 但 Explorer 会按「文件路径」缓存图标，导致文件/桌面仍显示旧图标。
 * 此脚本关闭 explorer → 删除图标缓存数据库 → 重启 explorer，强制刷新。
 *
 * 仅 Windows 有效；其它平台直接提示跳过。
 * 用法：npm run refresh:icon
 */
const { execSync } = require('node:child_process');
const os = require('node:os');

if (os.platform() !== 'win32') {
  console.log('[icon-cache] 当前非 Windows 系统，无需刷新图标缓存，跳过。');
  process.exit(0);
}

const local = process.env.LOCALAPPDATA || os.homedir();

// 1) 关闭资源管理器（同时会关闭桌面/任务栏，重启后会恢复）
try {
  console.log('[icon-cache] 关闭资源管理器...');
  execSync('taskkill /f /im explorer.exe', { stdio: 'ignore' });
} catch {}

// 2) 删除图标缓存
const targets = [
  `"${local}\\IconCache.db"`,
  `"${local}\\Microsoft\\Windows\\Explorer\\iconcache*"`,
];
for (const t of targets) {
  try {
    execSync(`del /f /q ${t}`, { stdio: 'ignore' });
  } catch {}
}

// 3) 重启资源管理器
try {
  console.log('[icon-cache] 重启资源管理器...');
  execSync('cmd /c start "" explorer.exe', { stdio: 'ignore', shell: true });
} catch {}

console.log('[icon-cache] 完成。桌面 / 任务栏 / 文件图标应已刷新。');
console.log('[icon-cache] 若个别旧快捷方式仍显示旧图标，取消固定后重新固定即可；必要时重启电脑。');
