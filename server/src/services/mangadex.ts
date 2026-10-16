/**
 * MangaDex 服务：at-home 页图 + 元数据/章节/统计/封面的通用获取。
 */

const API = 'https://api.mangadex.org';
const UPLOADS = 'https://uploads.mangadex.org';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ZhenjianComic/1.0';

/** 章节 ID -> 页图 URL 列表（进程内缓存，避免重复请求） */
const cache = new Map<string, string[]>();
let lastCallAt = 0;

/** MangaDex 限制 5 请求/秒，这里做简单的节流 */
async function throttle(): Promise<void> {
  const wait = Math.max(0, 220 - (Date.now() - lastCallAt));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallAt = Date.now();
}

export async function fetchChapterPages(sourceId: string): Promise<string[]> {
  const hit = cache.get(sourceId);
  if (hit) return hit;

  await throttle();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  let res: Response;
  try {
    res = await fetch(`${API}/at-home/server/${sourceId}?forcePort443=true`, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: ctrl.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw new Error('MangaDex 连接超时');
    throw err;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new Error(`MangaDex at-home 返回 ${res.status}`);
  }

  const json = (await res.json()) as {
    baseUrl: string;
    chapter: { hash: string; data?: string[]; dataSaver?: string[] };
  };

  const base = (json.baseUrl || '').replace(/\/+$/, '');
  const hash = json.chapter?.hash || '';
  // 默认用压缩版（data-saver），体积约为原图的 1/4，阅读更流畅；
  // 需要原图画质时设置环境变量 MANGADEX_QUALITY=data
  const wantOriginal = process.env.MANGADEX_QUALITY === 'data';
  const files = wantOriginal
    ? json.chapter?.data || json.chapter?.dataSaver || []
    : json.chapter?.dataSaver?.length
      ? json.chapter.dataSaver
      : json.chapter?.data || [];
  if (!base || !hash || !files.length) {
    throw new Error('MangaDex 未返回页图');
  }

  const seg = !wantOriginal && json.chapter?.dataSaver?.length ? 'data-saver' : 'data';
  const urls = files.map((f) => `${base}/${seg}/${hash}/${f}`);
  cache.set(sourceId, urls);
  return urls;
}

/** 通用 GET（带节流）。params 支持数组（同名多值，如 manga[]/originalLanguage[]）。 */
export async function mdGet(path: string, params?: Record<string, unknown>): Promise<any> {
  await throttle();
  const url = new URL(API + path);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, String(x)));
      else if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: ctrl.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw new Error(`MangaDex ${path} 连接超时`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`MangaDex ${path} -> ${res.status}`);
  return res.json();
}

/** 拼接封面 URL（只存 URL，不下载）。 */
export function coverUrl(mangaId: string, fileName: string, size = '.256'): string {
  if (!fileName) return '';
  return size
    ? `${UPLOADS}/covers/${mangaId}/${fileName}${size}.jpg`
    : `${UPLOADS}/covers/${mangaId}/${fileName}`;
}
