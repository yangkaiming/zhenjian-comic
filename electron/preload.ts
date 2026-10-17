import { contextBridge, ipcRenderer } from 'electron';

export interface WinState {
  maximized: boolean;
  fullscreen: boolean;
}

export interface ComicBridge {
  serverOrigin: string;
  platform: string;
  appVersion: string;
  winMinimize: () => void;
  winMaximize: () => void;
  winClose: () => void;
  getWinState: () => Promise<WinState>;
  winSetFullScreen: (flag: boolean) => Promise<boolean>;
  toggleFullScreen: () => Promise<boolean>;
  setWindowBgColor: (color: string) => Promise<void>;
  saveImage: (url: string, filename: string) => Promise<{ ok: boolean; path?: string; error?: string }>;
  onWinStateChange: (cb: (state: WinState) => void) => () => void;
  openWindow: (route: string) => void;
  /** 用系统默认浏览器打开外部链接（如下载页） */
  openExternal: (url: string) => Promise<void>;
  /** 退出整个应用 */
  quitApp: () => void;
}

const api: ComicBridge = {
  serverOrigin: process.env.COMIC_SERVER_ORIGIN || 'http://127.0.0.1:9527',
  platform: process.platform,
  appVersion: process.env.COMIC_APP_VERSION || '1.0.0',

  winMinimize: () => ipcRenderer.send('win:minimize'),
  winMaximize: () => ipcRenderer.send('win:maximize'),
  winClose: () => ipcRenderer.send('win:close'),
  getWinState: () => ipcRenderer.invoke('win:state'),
  winSetFullScreen: (flag) => ipcRenderer.invoke('win:fullscreen', flag),
  toggleFullScreen: () => ipcRenderer.invoke('win:toggleFullscreen'),
  setWindowBgColor: (color) => ipcRenderer.invoke('win:bg', color),
  saveImage: (url, filename) => ipcRenderer.invoke('img:save', { url, filename }),
  openWindow: (route) => ipcRenderer.invoke('win:open', route),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  quitApp: () => ipcRenderer.send('app:quit'),

  onWinStateChange: (cb) => {
    const listener = (_e: unknown, state: WinState) => cb(state);
    ipcRenderer.on('win:state', listener);
    return () => ipcRenderer.removeListener('win:state', listener);
  },
};

contextBridge.exposeInMainWorld('comic', api);
