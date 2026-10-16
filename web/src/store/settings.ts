import { create } from 'zustand';

export type ReaderMode = 'scroll' | 'page' | 'manga';
export type ReaderFit = 'width' | 'height' | 'origin' | 'custom';
/** 应用主题：切换整个 Electron 窗口的外观 */
export type AppTheme = 'dark' | 'light';
/** 阅读器背景：theme=跟随应用主题，其余为固定背景色 */
export type ReaderBg = 'theme' | 'black' | 'dark' | 'sepia' | 'white';

export const READER_BG_KEYS: ReaderBg[] = ['theme', 'black', 'dark', 'sepia', 'white'];

export const READER_BG_LABELS: Array<[ReaderBg, string]> = [
  ['theme', '跟随主题'],
  ['black', '纯黑'],
  ['dark', '深灰'],
  ['sepia', '护眼'],
  ['white', '白色'],
];

export const READER_BG_COLORS: Record<Exclude<ReaderBg, 'theme'>, string> = {
  black: '#000000',
  dark: '#1b1b22',
  sepia: '#e9dfc7',
  white: '#ffffff',
};

export interface ReaderSettings {
  mode: ReaderMode;
  fit: ReaderFit;
  /** 自定义尺寸百分比（fit=custom 时生效），50~300 */
  customScale: number;
  theme: AppTheme;
  brightness: number;
  gap: boolean;
  readerBg: ReaderBg;
}

const KEY = 'zj_reader_settings';

const DEFAULT: ReaderSettings = {
  mode: 'scroll',
  fit: 'custom',
  customScale: 50,
  theme: 'dark',
  brightness: 100,
  gap: false,
  readerBg: 'theme',
};

function load(): ReaderSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ReaderSettings> & { bg?: string };
      // 兼容旧版：原来的 bg=dark 视作深色主题，其余视作浅色主题
      const theme: AppTheme = parsed.theme === 'light' || parsed.theme === 'dark'
        ? parsed.theme
        : parsed.bg === 'dark'
          ? 'dark'
          : 'light';
      const fit: ReaderFit = (['width', 'height', 'origin', 'custom'] as ReaderFit[]).includes(parsed.fit as ReaderFit)
        ? (parsed.fit as ReaderFit)
        : DEFAULT.fit;
      const customScale = Number(parsed.customScale);
      return {
        ...DEFAULT,
        ...parsed,
        fit,
        theme,
        customScale: Number.isFinite(customScale) ? Math.min(300, Math.max(50, Math.round(customScale))) : DEFAULT.customScale,
        readerBg: READER_BG_KEYS.includes(parsed.readerBg as ReaderBg) ? (parsed.readerBg as ReaderBg) : 'theme',
      };
    }
  } catch {
    /* ignore */
  }
  return DEFAULT;
}

interface SettingsState extends ReaderSettings {
  hydrate: () => void;
  update: (patch: Partial<ReaderSettings>) => void;
  toggleTheme: () => void;
}

export const useSettings = create<SettingsState>((set, get) => ({
  ...load(),
  hydrate() {
    set({ ...load() });
  },
  update(patch) {
    set(patch);
    const s = get();
    localStorage.setItem(
      KEY,
      JSON.stringify({ mode: s.mode, fit: s.fit, customScale: s.customScale, theme: s.theme, brightness: s.brightness, gap: s.gap, readerBg: s.readerBg }),
    );
  },
  toggleTheme() {
    get().update({ theme: get().theme === 'dark' ? 'light' : 'dark' });
  },
}));

/** 主题对应的窗口背景色，用于同步 Electron 窗口底色 */
export const THEME_WINDOW_BG: Record<AppTheme, string> = {
  dark: '#14131a',
  light: '#f7f6fa',
};
