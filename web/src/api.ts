import type {
  Comic,
  ComicBridge,
  ChapterPayload,
  CommentItem,
  HistoryItem,
  HomeData,
  Paged,
  ShelfItem,
  UserInfo,
} from './types';

export const API_ORIGIN: string =
  (typeof window !== 'undefined' && window.comic?.serverOrigin) || 'http://127.0.0.1:9527';

export const bridge: ComicBridge | undefined = typeof window !== 'undefined' ? window.comic : undefined;

const TOKEN_KEY = 'zj_token';

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setToken(token: string): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function assetUrl(url: string): string {
  if (!url) return '';
  if (/^(https?:|data:|comicimg:|blob:)/.test(url)) return url;
  return `${API_ORIGIN}${url.startsWith('/') ? url : `/${url}`}`;
}

/**
 * 阅读器页图 URL。
 * MangaDex at-home 图片节点有防盗链（无 mangadex Referer 会 404），浏览器 <img> 无法伪造，
 * 故远程页图统一走服务端 /media/img 代理同源返回；本地 SVG 占位页仍走原样。
 */
export function pageImageUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('/')) return assetUrl(url);
  return `${API_ORIGIN}/media/img?u=${encodeURIComponent(url)}`;
}

/** 请求超时（ms）：防止上游无响应时界面永久卡在 loading */
const REQUEST_TIMEOUT = 30000;

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT);
  try {
    const res = await fetch(`${API_ORIGIN}${path}`, { ...init, headers, signal: ctrl.signal });
    if (!res.ok) {
      let message = `请求失败(${res.status})`;
      try {
        const data = (await res.json()) as { message?: string };
        if (data?.message) message = data.message;
      } catch {
        /* ignore */
      }
      throw new Error(message);
    }
    return (await res.json()) as T;
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw new Error('请求超时，请稍后重试');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  health: () => request<{ ok: boolean }>('/api/health'),

  meta: () =>
    request<{ categories: string[]; regions: string[]; hotKeywords: string[] }>('/api/comics/meta'),
  home: () => request<HomeData>('/api/comics/home'),
  list: (params: Record<string, string | number | undefined>) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') q.set(k, String(v));
    });
    return request<Paged<Comic>>(`/api/comics?${q.toString()}`);
  },
  rank: (type: string, region?: string) =>
    request<{ items: Comic[] }>(`/api/comics/rank?type=${type}${region ? `&region=${region}` : ''}`),
  suggest: (q: string) => request<{ items: Comic[] }>(`/api/comics/suggest?q=${encodeURIComponent(q)}`),
  detail: (id: string) =>
    request<{
      comic: Comic;
      chapters: ChapterItem[];
      commentCount: number;
      inShelf: boolean;
      shelfStatus: string | null;
      shelfProgress: ShelfItem | null;
    }>(`/api/comics/${id}`),
  chapters: (id: string, page = 1, limit = 100, order: 'asc' | 'desc' = 'asc') =>
    request<Paged<ChapterItem>>(`/api/comics/${id}/chapters?page=${page}&limit=${limit}&order=${order}`),
  chapter: (chapterId: string) => request<ChapterPayload>(`/api/comics/chapter/${chapterId}`),

  login: (username: string, password: string) =>
    request<{ token: string; user: UserInfo }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  register: (username: string, password: string, nickname?: string) =>
    request<{ token: string; user: UserInfo }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, nickname }),
    }),
  me: () => request<{ user: UserInfo }>('/api/auth/me'),
  updateProfile: (data: { nickname?: string; avatar?: string }) =>
    request<{ user: UserInfo }>('/api/auth/profile', { method: 'PATCH', body: JSON.stringify(data) }),

  shelf: (status?: string) =>
    request<{ items: ShelfItem[] }>(`/api/bookshelf${status ? `?status=${status}` : ''}`),
  addShelf: (comicId: string, status = 'want') =>
    request<{ item: ShelfItem; added: boolean }>('/api/bookshelf', {
      method: 'POST',
      body: JSON.stringify({ comicId, status }),
    }),
  updateShelf: (
    comicId: string,
    data: { status?: string; lastChapterId?: string | null; lastChapterIndex?: number; lastPage?: number; progress?: number },
  ) =>
    request<{ item: ShelfItem }>(`/api/bookshelf/${comicId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  removeShelf: (comicId: string) => request<{ ok: boolean }>(`/api/bookshelf/${comicId}`, { method: 'DELETE' }),
  deleteComic: (comicId: string) => request<{ ok: boolean }>(`/api/comics/${comicId}`, { method: 'DELETE' }),
  related: (comicId: string) => request<{ items: Comic[] }>(`/api/comics/${comicId}/related`),
  resume: (comicId: string) =>
    request<{ chapterId: string | null; page: number; status: string }>(`/api/bookshelf/${comicId}/resume`),

  history: (limit = 20) => request<{ items: HistoryItem[] }>(`/api/history?limit=${limit}`),
  saveHistory: (data: { comicId: string; chapterId?: string | null; chapterIndex: number; page: number }) =>
    request<{ item: HistoryItem }>('/api/history', { method: 'POST', body: JSON.stringify(data) }),

  comments: (comicId: string, limit = 20) =>
    request<{ items: CommentItem[] }>(`/api/comments?comicId=${comicId}&limit=${limit}`),
  addComment: (comicId: string, content: string, score = 8, opts: { parent?: string; replyToName?: string } = {}) =>
    request<{ item: CommentItem }>('/api/comments', {
      method: 'POST',
      body: JSON.stringify({ comicId, content, score, parent: opts.parent, replyToName: opts.replyToName }),
    }),
  likeComment: (id: string) => request<{ likes: number; liked: boolean }>(`/api/comments/${id}/like`, { method: 'POST' }),
  deleteComment: (id: string) => request<{ ok: boolean }>(`/api/comments/${id}`, { method: 'DELETE' }),

  appLatest: () => request<{ version: string; url: string; notes: string }>('/api/app/latest'),

  comicSources: () =>
    request<{
      items: Array<{ key: string; name: string; desc: string; supportsSearch: boolean }>;
    }>('/api/comics/sources'),
  fetchComics: (count: number, source = 'mangadex') =>
    request<{ started: boolean; running?: boolean }>('/api/comics/fetch', {
      method: 'POST',
      body: JSON.stringify({ count, source }),
    }),
  fetchByTitle: (title: string, source = 'mangadex') =>
    request<{ started: boolean; running?: boolean }>('/api/comics/fetch', {
      method: 'POST',
      body: JSON.stringify({ title, source }),
    }),
  /** 按书名搜索候选（不入库），供用户挑选后精确抓取 */
  searchFetchCandidates: (title: string, source = 'baozimh') =>
    request<{ items: Array<{ slug: string; title: string; cover?: string; exists?: boolean }> }>(
      '/api/comics/fetch-search',
      { method: 'POST', body: JSON.stringify({ title, source }) },
    ),
  /** 按候选 slug 精确抓取入库 */
  fetchBySlug: (slug: string, source = 'baozimh') =>
    request<{ started: boolean; running?: boolean }>('/api/comics/fetch', {
      method: 'POST',
      body: JSON.stringify({ slug, source }),
    }),
  fetchStatus: () =>
    request<{
      running: boolean;
      target: number;
      added: number;
      skipped: number;
      chapters: number;
      current: string;
      done: boolean;
      items: Array<{ title: string; status: 'fetching' | 'done' | 'skipped'; chapters: number }>;
      error?: string;
    }>('/api/comics/fetch-status'),
  refreshChapters: (id: string) =>
    request<{ started: boolean; running?: boolean }>(`/api/comics/${id}/refresh-chapters`, { method: 'POST' }),
  refreshStatus: () =>
    request<{
      running: boolean;
      comicId: string;
      phase: 'fetching' | 'saving' | 'done';
      fetched: number;
      added: number;
      total: number;
      error?: string;
    }>('/api/comics/refresh-status'),

  // 举报反馈
  createReport: (data: {
    type: 'comic' | 'chapter' | 'comment' | 'other';
    reason: string;
    detail?: string;
    targetId?: string;
    comicId?: string;
    comicTitle?: string;
    chapterId?: string;
    chapterTitle?: string;
  }) => request<{ ok: boolean; id: string }>('/api/reports', { method: 'POST', body: JSON.stringify(data) }),
  reports: (params: { status?: string; page?: number; limit?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.status) q.set('status', params.status);
    q.set('page', String(params.page || 1));
    q.set('limit', String(params.limit || 20));
    return request<{
      items: Array<import('./types').ReportItem>;
      total: number;
      page: number;
      limit: number;
      totalPages: number;
      pending: number;
      resolved: number;
    }>(`/api/reports?${q.toString()}`);
  },
  setReportStatus: (id: string, status: 'pending' | 'resolved') =>
    request<{ ok: boolean }>(`/api/reports/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  deleteReport: (id: string) => request<{ ok: boolean }>(`/api/reports/${id}`, { method: 'DELETE' }),

  // 功能反馈
  createFeedback: (data: { category?: 'bug' | 'suggest' | 'praise' | 'other'; content: string; contact?: string }) =>
    request<{ ok: boolean; id: string }>('/api/feedback', { method: 'POST', body: JSON.stringify(data) }),
  myFeedback: () =>
    request<{ items: Array<import('./types').FeedbackItem> }>('/api/feedback/mine'),
  feedbackList: (params: { status?: string; category?: string; page?: number; limit?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.status) q.set('status', params.status);
    if (params.category) q.set('category', params.category);
    q.set('page', String(params.page || 1));
    q.set('limit', String(params.limit || 20));
    return request<{
      items: Array<import('./types').FeedbackItem>;
      total: number;
      page: number;
      limit: number;
      totalPages: number;
      pending: number;
      replied: number;
      resolved: number;
    }>(`/api/feedback?${q.toString()}`);
  },
  replyFeedback: (id: string, data: { status?: 'pending' | 'replied' | 'resolved'; reply?: string }) =>
    request<{ ok: boolean }>(`/api/feedback/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteFeedback: (id: string) => request<{ ok: boolean }>(`/api/feedback/${id}`, { method: 'DELETE' }),

  // 用户管理（管理员）
  users: (params: { q?: string; page?: number; limit?: number; online?: boolean } = {}) => {
    const q = new URLSearchParams();
    if (params.q) q.set('q', params.q);
    if (params.online) q.set('online', '1');
    q.set('page', String(params.page || 1));
    q.set('limit', String(params.limit || 20));
    return request<{
      items: import('./types').UserItem[];
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    }>(`/api/users?${q.toString()}`);
  },
  setUserRole: (id: string, role: 'admin' | 'user') =>
    request<{ user: import('./types').UserItem }>(`/api/users/${id}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),
  deleteUser: (id: string) => request<{ ok: boolean }>(`/api/users/${id}`, { method: 'DELETE' }),

  // 编辑推荐（管理员）
  adminRecommend: () => request<{ items: Comic[] }>(`/api/admin/recommend`),
  saveRecommend: (ids: string[]) =>
    request<{ items: Comic[] }>(`/api/admin/recommend`, {
      method: 'PUT',
      body: JSON.stringify({ ids }),
    }),
};

export interface ChapterItem {
  _id: string;
  index: number;
  title: string;
  pageCount: number;
  releasedAt?: string;
}
