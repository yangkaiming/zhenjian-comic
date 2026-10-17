export interface Comic {
  _id: string;
  title: string;
  author: string;
  cover: string;
  banner?: string;
  description: string;
  region: string;
  status: string;
  categories: string[];
  tags: string[];
  rating: number;
  ratingCount?: number;
  views: number;
  favorites: number;
  chapterCount: number;
  latestChapter: string;
  recommend?: number;
  sourceId?: string;
  deleted?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Chapter {
  _id: string;
  index: number;
  title: string;
  pageCount: number;
  releasedAt?: string;
}

export interface PageImage {
  index: number;
  w: number;
  h: number;
  url: string;
}

export interface ChapterDetail {
  _id: string;
  index: number;
  title: string;
  pageCount: number;
  pages: PageImage[];
  prevId: string | null;
  nextId: string | null;
  /** 付费/锁定章节（数据源不公开页图，无法阅读） */
  locked?: boolean;
}

export interface ChapterPayload {
  chapter: ChapterDetail;
  comic: { _id: string; title: string; author: string; cover: string; chapterCount: number };
}

export interface ShelfItem {
  _id: string;
  comic: Comic;
  status: string;
  lastChapterIndex: number;
  lastPage: number;
  progress: number;
  updatedAt?: string;
}

export interface CommentItem {
  _id: string;
  comic: string;
  nickname: string;
  content: string;
  score: number;
  likes: number;
  /** 当前登录用户是否已点赞 */
  liked?: boolean;
  createdAt: string;
  /** 作者用户 id（用于判断可否删除：本人或管理员） */
  user?: string;
  /** 楼中楼：所属顶层评论 id（顶级为空） */
  parent?: string;
  /** 被回复者昵称 */
  replyToName?: string;
}

export interface HistoryItem {
  _id: string;
  comic: Comic;
  chapterIndex: number;
  page: number;
  updatedAt?: string;
}

export interface UserInfo {
  id: string;
  username: string;
  nickname: string;
  avatar: string;
  role?: 'admin' | 'user';
}

export interface ReportItem {
  _id: string;
  type: 'comic' | 'chapter' | 'comment' | 'other';
  targetId: string;
  comicId: string;
  comicTitle: string;
  chapterId: string;
  chapterTitle: string;
  reporterName: string;
  reason: string;
  detail: string;
  status: 'pending' | 'resolved';
  resolvedAt?: string | null;
  createdAt: string;
}

export interface UserItem {
  id: string;
  username: string;
  nickname: string;
  avatar: string;
  role: 'admin' | 'user';
  createdAt: string;
  /** 最近活跃时间（ISO 字符串），用于在线状态判断 */
  lastActiveAt?: string;
  /** 上次登录时间（ISO 字符串） */
  lastLoginAt?: string;
  /** 是否在线（最近 5 分钟内有活动） */
  online?: boolean;
}

export type FeedbackCategory = 'bug' | 'suggest' | 'praise' | 'other';
export type FeedbackStatus = 'pending' | 'replied' | 'resolved';

export interface FeedbackItem {
  _id: string;
  user?: string;
  username: string;
  category: FeedbackCategory;
  content: string;
  contact: string;
  status: FeedbackStatus;
  reply: string;
  repliedAt?: string | null;
  createdAt: string;
}

export interface HomeData {
  banners: Comic[];
  hot: Comic[];
  recommend: Comic[];
  latest: Array<{ comic: Comic; chapter: Chapter }>;
  categories: string[];
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

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
  setWindowBgColor?: (color: string) => Promise<void>;
  saveImage: (url: string, filename: string) => Promise<{ ok: boolean; path?: string; error?: string }>;
  onWinStateChange: (cb: (state: WinState) => void) => () => void;
  openWindow: (route: string) => void;
  /** 用系统默认浏览器打开外部链接（如更新下载页） */
  openExternal?: (url: string) => Promise<void>;
  /** 退出整个应用 */
  quitApp?: () => void;
}

declare global {
  interface Window {
    comic?: ComicBridge;
  }
}
