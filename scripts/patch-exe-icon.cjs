/**
 * 给已打包的 exe 补写 Windows 图标与版本信息。
 *
 * 背景：electron-builder 通过 winCodeSign 包里的 rcedit 修改 exe 资源，
 * 但 winCodeSign-2.6.0.7z 内含 macOS 的符号链接（darwin/10.12/lib/*.dylib），
 * Windows 非管理员账户解压时会报「无法创建符号链接」→ 7za 退出码 2 →
 * app-builder 判定解压失败 → 整个 rcedit 步骤被跳过，exe 保持 Electron 默认图标。
 *
 * 本脚本绕开 electron-builder 的解压流程：
 *   1. 优先复用 electron-builder 缓存里已解压好的 rcedit
 *   2. 找不到则从 npmmirror 下载 winCodeSign，并排除 darwin 目录解压
 *   3. 用 rcedit 写入图标 + 版本信息
 *
 * 用法：node scripts/patch-exe-icon.cjs [exe路径]
 * 注意：写入前必须先退出正在运行的「帧间漫画」，否则 exe 被占用会写入失败。
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const https = require('node:https');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const PRODUCT = pkg.build?.productName || pkg.name;
const VERSION = pkg.version || '1.0.0';
const ICON = path.join(ROOT, pkg.build?.win?.icon || 'build/icon.ico');

const MIRROR =
  process.env.ELECTRON_BUILDER_BINARIES_MIRROR ||
  'https://registry.npmmirror.com/-/binary/electron-builder-binaries/';
const WCS_VERSION = '2.6.0';
const CACHE_DIR = path.join(os.homedir(), 'AppData', 'Local', 'electron-builder', 'Cache', 'winCodeSign');

/** 目标 exe：优先取 release/win-unpacked，否则回退到 nsis 安装包（dist:installer） */
function resolveExe() {
  const arg = process.argv[2];
  if (arg) return path.resolve(ROOT, arg);
  const unpacked = path.join(ROOT, 'release', 'win-unpacked');
  if (fs.existsSync(unpacked)) {
    const exes = fs.readdirSync(unpacked).filter((f) => f.toLowerCase().endsWith('.exe'));
    if (exes.length) return path.join(unpacked, exes[0]);
  }
  const rel = path.join(ROOT, 'release');
  if (fs.existsSync(rel)) {
    const setup = fs.readdirSync(rel).find((f) => /setup.*\.exe$/i.test(f));
    if (setup) return path.join(rel, setup);
  }
  throw new Error('未找到打包产物 exe，请先执行 npm run dist');
}

/** 在 electron-builder 缓存里找已解压的 rcedit，取最新的一个 */
function findCachedRcedit() {
  if (!fs.existsSync(CACHE_DIR)) return null;
  const candidates = [];
  for (const name of fs.readdirSync(CACHE_DIR)) {
    const p = path.join(CACHE_DIR, name, 'rcedit-x64.exe');
    if (fs.existsSync(p)) {
      candidates.push({ p, mtime: fs.statSync(p).mtimeMs });
    }
  }
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates.length ? candidates[0].p : null;
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          fs.rmSync(dest, { force: true });
          download(res.headers.location, dest).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          file.close();
          fs.rmSync(dest, { force: true });
          reject(new Error(`下载失败 HTTP ${res.statusCode}: ${url}`));
          return;
        }
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve(dest)));
      })
      .on('error', (e) => {
        file.close();
        fs.rmSync(dest, { force: true });
        reject(e);
      });
  });
}

/** 从镜像取 winCodeSign 并解压（排除含符号链接的 darwin 目录） */
async function fetchRcedit() {
  const sevenZip = path.join(ROOT, 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe');
  if (!fs.existsSync(sevenZip)) {
    throw new Error('未找到 node_modules/7zip-bin 下的 7za.exe，无法解压');
  }
  const url = `${MIRROR}winCodeSign-${WCS_VERSION}/winCodeSign-${WCS_VERSION}.7z`;
  const tmpDir = path.join(ROOT, 'node_modules', '.cache', 'wcs-patch');
  fs.mkdirSync(tmpDir, { recursive: true });
  const archive = path.join(tmpDir, `winCodeSign-${WCS_VERSION}.7z`);

  console.log(`[icon] 缓存里没有 rcedit，从镜像下载：${url}`);
  await download(url, archive);

  const outDir = path.join(tmpDir, 'extracted');
  fs.rmSync(outDir, { recursive: true, force: true });
  // -x!darwin 排除符号链接所在目录，避免非管理员权限下解压失败
  execFileSync(sevenZip, ['x', archive, `-o${outDir}`, '-bd', '-y', '-x!darwin'], { stdio: 'inherit' });

  const found = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name === 'rcedit-x64.exe') found.push(full);
    }
  })(outDir);

  if (!found.length) throw new Error('解压完成但未找到 rcedit-x64.exe');
  return found[0];
}

async function main() {
  const exe = resolveExe();
  if (!fs.existsSync(exe)) throw new Error(`exe 不存在：${exe}`);
  if (!fs.existsSync(ICON)) throw new Error(`图标不存在：${ICON}`);

  let rcedit = findCachedRcedit();
  if (rcedit) {
    console.log(`[icon] 复用缓存中的 rcedit：${rcedit}`);
  } else {
    rcedit = await fetchRcedit();
  }

  const args = [
    exe,
    '--set-icon', ICON,
    '--set-version-string', 'ProductName', PRODUCT,
    '--set-version-string', 'FileDescription', PRODUCT,
    '--set-version-string', 'CompanyName', PRODUCT,
    '--set-file-version', VERSION,
    '--set-product-version', VERSION,
  ];

  try {
    execFileSync(rcedit, args, { stdio: 'inherit' });
  } catch (e) {
    console.error('[icon] 写入失败。最常见原因：应用正在运行，exe 被占用。');
    console.error('[icon] 请退出「帧间漫画」后重新执行本命令。');
    process.exit(1);
  }

  const size = (fs.statSync(exe).size / 1048576).toFixed(1);
  console.log(`[icon] 完成 → ${path.basename(exe)}（${size} MB）`);
}

main().catch((e) => {
  console.error(`[icon] ${e.message}`);
  process.exit(1);
});
