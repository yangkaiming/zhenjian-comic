/**
 * 打包前清理 release/ 目录。
 *
 * 由 package.json 的 predist / predist:installer 自动触发，
 * 保证每次打包产物全新，不会残留上一次的 exe / 安装包
 * （残留旧产物曾导致「图标改了却不生效」的误判）。
 *
 * 跨平台，仅依赖 Node 内置模块。
 */
const fs = require('node:fs');
const path = require('node:path');

const target = path.resolve(process.cwd(), process.argv[2] || 'release');

if (!fs.existsSync(target)) {
  console.log(`[clean] ${path.basename(target)}/ 不存在，跳过清理`);
  process.exit(0);
}

try {
  fs.rmSync(target, { recursive: true, force: true });
  console.log(`[clean] ${path.basename(target)}/ 已清空`);
} catch (e) {
  console.error(`[clean] 清理 ${target} 失败：${e.message}`);
  console.error('[clean] 常见原因：应用仍在运行导致文件被占用，请退出「帧间漫画」后重试');
  process.exit(1);
}
