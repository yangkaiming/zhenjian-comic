import { app, BrowserWindow, ipcMain, screen, shell, dialog } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';

const IS_DEV = !!process.env.ELECTRON_DEV_URL;
const DEV_URL = process.env.ELECTRON_DEV_URL || 'http://localhost:5173';

/**
 * 数据环境：已打包 = 线上库（读 resources/.env.prod 里的 MONGODB_URI_PROD），
 * 开发态 = 测试库（读项目根 .env 的 MONGODB_URI）。需在加载服务端配置之前设置。
 */
if (app.isPackaged && !process.env.COMIC_DATA_ENV) {
  process.env.COMIC_DATA_ENV = 'prod';
}

loadEnvFile(path.join(__dirname, '..', '.env'));

function loadEnvFile(file: string): void {
  try {
    const text = fs.readFileSync(file, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      let value = m[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (process.env[m[1]] === undefined) process.env[m[1]] = value;
    }
  } catch {
    /* 没有 .env 文件则忽略 */
  }
}

function paths() {
  const root = path.join(__dirname, '..');
  if (app.isPackaged) {
    const res = process.resourcesPath;
    return {
      root: res,
      envFile: path.join(res, '.env'),
      envProdFile: path.join(res, '.env.prod'),
      // 运行期窗口图标：打包时由 extraResources 复制到 resources/icon.png
      iconFile: path.join(res, 'icon.png'),
      serverCwd: path.join(res, 'server'),
      serverDist: path.join(res, 'server', 'dist', 'index.js'),
      serverSrc: path.join(res, 'server', 'src', 'index.ts'),
    };
  }
  return {
    root,
    envFile: path.join(root, '.env'),
    envProdFile: path.join(root, '.env.prod'),
    iconFile: path.join(root, 'build', 'assets', 'icon-256.png'),
    serverCwd: path.join(root, 'server'),
    serverDist: path.join(root, 'server', 'dist', 'index.js'),
    serverSrc: path.join(root, 'server', 'src', 'index.ts'),
  };
}

/**
 * 窗口图标：Windows 下frameless 窗口不显示原生标题栏图标，
 * 任务栏/Alt-Tab 依赖 exe 内嵌图标（由 package.json的 win.icon 决定），
 * 这里显式指定可覆盖开发态与 Linux/macOS 的表现。
 */
function windowIcon(): Electron.BrowserWindowConstructorOptions['icon'] {
  const file = paths().iconFile;
  return fs.existsSync(file) ? file : undefined;
}

let mainWindow: BrowserWindow | null = null;
let serverProcess: ChildProcess | null = null;
/** 独立弹窗（反馈处理 / 用户管理等）的引用集合：必须保留引用，否则会被 GC 回收导致窗口瞬间关闭 */
const childWindows: BrowserWindow[] = [];
/** 按路由索引的弹窗：同一路由只开一个，重复打开时聚焦已有窗口 */
const popupWindows = new Map<string, BrowserWindow>();

/** 窗口状态：最大化 / 全屏，广播给渲染层 */
interface WinState {
  maximized: boolean;
  fullscreen: boolean;
}

let winState: WinState = { maximized: false, fullscreen: false };
/** 我们自己执行最大化前的窗口位置，用于异常状态下还原 */
let restoreBounds: Electron.Rectangle | null = null;

function currentWinState(): WinState {
  if (!mainWindow) return { maximized: false, fullscreen: false };
  return { maximized: mainWindow.isMaximized(), fullscreen: mainWindow.isFullScreen() };
}

function emitWinState(): void {
  winState = currentWinState();
  // 广播给所有窗口（含独立弹窗），按各自窗口状态更新标题栏
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('win:state', currentWinStateOf(w));
  }
}

/** 取指定窗口的最大化/全屏状态（避免依赖全局 mainWindow） */
function currentWinStateOf(w: BrowserWindow): WinState {
  return { maximized: w.isMaximized(), fullscreen: w.isFullScreen() };
}

/** 视觉上是否已最大化（兼容 isMaximized 与实际尺寸不一致的情况） */
function isVisuallyMaximized(w: BrowserWindow): boolean {
  if (w.isFullScreen()) return false;
  if (w.isMaximized()) return true;
  const area = screen.getDisplayMatching(w.getBounds()).workArea;
  const b = w.getBounds();
  return b.width >= area.width - 2 && b.height >= area.height - 2;
}

function toggleMaximize(w: BrowserWindow): void {
  if (!w) return;
  if (isVisuallyMaximized(w)) {
    if (w.isMaximized()) {
      w.unmaximize();
    } else if (restoreBounds) {
      w.setBounds(restoreBounds);
    } else {
      w.unmaximize();
    }
    restoreBounds = null;
  } else {
    restoreBounds = w.getBounds();
    w.maximize();
  }
  emitWinState();
}

const PORT = Number(process.env.PORT || 9527);
const SERVER_ORIGIN = `http://127.0.0.1:${PORT}`;

async function waitForServer(timeoutMs = 45000): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${SERVER_ORIGIN}/api/health`, { signal: AbortSignal.timeout(1500) });
      if (res.ok) return true;
    } catch {
      /* 继续重试 */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

/** 返回 true 表示服务端由本进程负责，需要等待健康检查 */
async function startBackend(): Promise<boolean> {
  const p = paths();
  const shouldSpawn = process.env.SPAWN_SERVER !== 'false';
  if (!shouldSpawn) {
    console.log('[app] 跳过内置服务端（SPAWN_SERVER=false），使用外部服务');
    return false;
  }

  process.env.PORT = String(PORT);

  if (!IS_DEV && fs.existsSync(p.serverDist)) {
    // 生产模式：直接在主进程内加载编译后的服务端
    try {
      const mod = require(p.serverDist) as { startServer?: () => Promise<unknown> };
      if (typeof mod.startServer === 'function') {
        await mod.startServer();
        console.log('[app] 服务端已在主进程内启动');
        return true;
      }
    } catch (err) {
      console.error('[app] 内置服务端加载失败:', err);
    }
  }

  // 开发模式：用 tsx 启动 TS 源码，便于热重载
  const binName = process.platform === 'win32' ? 'tsx.cmd' : 'tsx';
  const tsxBin = path.join(p.root, 'node_modules', '.bin', binName);
  const cmd = fs.existsSync(tsxBin) ? tsxBin : 'npx';
  const args = fs.existsSync(tsxBin) ? [p.serverSrc] : ['tsx', p.serverSrc];

  serverProcess = spawn(cmd, args, {
    cwd: p.serverCwd,
    env: process.env,
    windowsHide: true,
  });
  serverProcess.stdout?.on('data', (d) => process.stdout.write(`[server] ${d}`));
  serverProcess.stderr?.on('data', (d) => process.stderr.write(`[server] ${d}`));
  serverProcess.on('exit', (code) => console.log(`[server] 退出，code=${code}`));
  console.log('[app] 服务端子进程已启动');
  return true;
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1020,
    minHeight: 640,
    frame: false,
    backgroundColor: '#16151d',
    show: false,
    autoHideMenuBar: true,
    icon: windowIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      sandbox: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  // 窗口状态变化时广播给渲染层（resize 也监听，覆盖系统 snap 等漏报情况）
  for (const evt of ['maximize', 'unmaximize', 'restore', 'enter-full-screen', 'leave-full-screen', 'resize']) {
    mainWindow.on(evt as 'maximize', () => emitWinState());
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) void shell.openExternal(url);
    return { action: 'deny' };
  });

  // 生产模式直接访问内置服务端托管的同源前端资源（避免 file:// 的 CSP/CORS 限制）
  void mainWindow.loadURL(IS_DEV ? DEV_URL : SERVER_ORIGIN);

  // 调试模式：开发模式（IS_DEV）或未打包或显式 COMIC_DEBUG=true 时，默认打开 DevTools。
  // 生产环境（已打包且未显式开启）绝不自动打开，避免泄漏内部信息与影响体验。
  const debug = IS_DEV || !app.isPackaged || process.env.COMIC_DEBUG === 'true';
  if (debug) {
    // 直接打开，不等待 did-finish-load（避免该事件在部分环境下不触发导致 DevTools 没弹出）
    mainWindow.webContents.openDevTools();
    // 允许通过 F12 / Ctrl+Shift+I 在运行时切换 DevTools
    mainWindow.webContents.on('before-input-event', (_e, input) => {
      if (input.key === 'F12' || (input.control && input.shift && (input.key === 'I' || input.key === 'i'))) {
        if (mainWindow?.webContents.isDevToolsOpened()) mainWindow.webContents.closeDevTools();
        else mainWindow?.webContents.openDevTools();
      }
    });
  }
}

function registerIpc(): void {
  // 取触发事件对应的窗口（兼容主窗口与独立弹窗）
  const senderWindow = (e: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent): BrowserWindow | null =>
    BrowserWindow.fromWebContents(e.sender) || mainWindow;

  ipcMain.on('win:minimize', (e) => senderWindow(e)?.minimize());
  ipcMain.on('win:maximize', (e) => {
    const w = senderWindow(e);
    if (w) toggleMaximize(w);
  });
  ipcMain.on('win:close', (e) => senderWindow(e)?.close());
  ipcMain.handle('win:state', (e) => currentWinStateOf(senderWindow(e) || (mainWindow as BrowserWindow)));
  ipcMain.handle('win:fullscreen', (e, flag: boolean) => {
    const w = senderWindow(e);
    if (!w) return false;
    w.setFullScreen(!!flag);
    emitWinState();
    return w.isFullScreen();
  });
  /** 全屏切换：进得去也出得来 */
  ipcMain.handle('win:toggleFullscreen', (e) => {
    const w = senderWindow(e);
    if (!w) return false;
    w.setFullScreen(!w.isFullScreen());
    emitWinState();
    return w.isFullScreen();
  });
  ipcMain.handle('win:bg', (e, color: string) => {
    senderWindow(e)?.setBackgroundColor(color || '#14131a');
  });

  /** 打开独立管理窗口（如反馈处理、用户管理），同源加载指定路由并标记 popup 以隐藏侧边栏 */
  ipcMain.handle('win:open', (_e, route: string) => {
    // 同一路由已开窗口：聚焦 / 还原已有窗口，避免重复打开
    const existing = popupWindows.get(route);
    if (existing && !existing.isDestroyed()) {
      if (existing.isMinimized()) existing.restore();
      existing.focus();
      return true;
    }
    const base = IS_DEV ? DEV_URL : SERVER_ORIGIN;
    const target = `${base}/#${route}?popup=1`;
    // 窗口标题与入口名保持一致（既用于自定义标题栏，也用于系统任务栏/预览）
    const POPUP_TITLES: Record<string, string> = {
      '/admin/reports': '反馈处理',
      '/admin/users': '用户管理',
      '/admin/fetch': '漫画导入',
      '/admin/recommend': '编辑推荐',
      '/admin/feedback': '用户反馈',
      '/feedback': '意见反馈',
    };
    const popupTitle = POPUP_TITLES[route] || '帧间漫画';
    // 尺寸与主窗口保持一致
    const mb = mainWindow && !mainWindow.isDestroyed() ? mainWindow.getBounds() : null;
    const child = new BrowserWindow({
      width: mb?.width || 1080,
      height: mb?.height || 720,
      minWidth: 820,
      minHeight: 540,
      frame: false,
      backgroundColor: '#16151d',
      show: false,
      center: true,
      autoHideMenuBar: true,
      title: popupTitle,
      icon: windowIcon(),
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        sandbox: false,
      },
    });
    child.once('ready-to-show', () => child.show());
    void child.loadURL(target);
    child.on('closed', () => {
      const i = childWindows.indexOf(child);
      if (i >= 0) childWindows.splice(i, 1);
      if (popupWindows.get(route) === child) popupWindows.delete(route);
    });
    childWindows.push(child);
    popupWindows.set(route, child);
    const debug = IS_DEV || !app.isPackaged || process.env.COMIC_DEBUG === 'true';
    if (debug) child.webContents.openDevTools();
    return true;
  });

  /** 保存阅读器图片：带 mangadex Referer 取图，弹保存对话框写盘（绕过防盗链） */
  ipcMain.handle('img:save', async (_e, args: { url: string; filename: string }) => {
    try {
      const url = String(args?.url || '');
      if (!/^https?:\/\//i.test(url)) return { ok: false, error: '非法图片地址' };
      // 带 mangadex Referer 取图；at-home 节点偶发 404，重试几次
      let buf: Buffer | null = null;
      let lastStatus = 0;
      for (let attempt = 0; attempt < 3 && !buf; attempt += 1) {
        try {
          const res = await fetch(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ZhenjianComic/1.0',
              Referer: 'https://mangadex.org/',
            },
          });
          lastStatus = res.status;
          if (res.ok) buf = Buffer.from(await res.arrayBuffer());
        } catch {
          /* 重试 */
        }
        if (!buf) await new Promise((r) => setTimeout(r, 600));
      }
      if (!buf) return { ok: false, error: `下载失败(${lastStatus})` };
      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow!, {
        defaultPath: args.filename || 'image.jpg',
        filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }],
      });
      if (canceled || !filePath) return { ok: false, error: '已取消' };
      fs.writeFileSync(filePath, buf);
      return { ok: true, path: filePath };
    } catch (err) {
      return { ok: false, error: (err as Error).message || '保存失败' };
    }
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    // 线上配置优先，随后再补开发配置（loadEnvFile 只填补未定义项，不会覆盖）
    loadEnvFile(paths().envProdFile);
    loadEnvFile(paths().envFile);
    registerIpc();

    process.env.COMIC_SERVER_ORIGIN = SERVER_ORIGIN;
    process.env.COMIC_APP_VERSION = app.getVersion();

    const owned = await startBackend();
    const ok = owned ? await waitForServer() : true;
    if (!ok) {
      const isProdData = String(process.env.COMIC_DATA_ENV || '').toLowerCase() === 'prod';
      dialog.showErrorBox(
        '服务端启动失败',
        isProdData
          ? `无法启动内置服务端 ${SERVER_ORIGIN}。\n\n当前为线上数据环境，请检查网络能否访问云端 MongoDB，\n以及 .env.prod 中的 MONGODB_URI_PROD 是否正确、\n云数据库 IP 白名单是否已放行本机出口 IP。`
          : `无法连接到本地服务端 ${SERVER_ORIGIN}。\n\n请确认 MongoDB 已启动（默认 mongodb://127.0.0.1:27017），\n或修改项目根目录 .env 中的 MONGODB_URI 后重试。\n\n可使用项目内 docker-compose.yml 快速启动数据库：docker compose up -d`,
      );
    }

    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (serverProcess) serverProcess.kill();
    app.quit();
  });
}
