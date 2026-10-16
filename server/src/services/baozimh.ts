/**
 * 包子漫画（baozimh.org）数据源。
 *
 * 链路（2026-10 实测）：
 *  搜索      GET /s?q=关键词                 -> /manga-<slug>/ 链接
 *  发现      首页 /                          -> /manga/<slug>/ 链接
 *  漫画详情  章节列表由 apikk API 提供：
 *            GET https://v2.apikk.top/api/manga/get?mid=<mid>
 *            -> 标题/封面/desc/status/章节数组（每章含 slug=阅读页尾、id=章节API id）
 *            ※ 该 API 固定返回「前20+后20」章，中间需前端加载更多，无公开分页参数
 *  章节页    GET /manga/<slug>/<chSlug>       -> #chapterContent 的 data-ms / data-cs
 *  取图      GET https://v2.apikk.top/api/v2/chapter/getinfo?m=<ms>&c=<cs>
 *            -> data.info.images.images（加密串，需前端解码器解成相对路径）
 *  解码      站点 /assets/runtime/chapter-decoder.js 提供 window.__cimg.r(blob)
 *            （obfuscator 打包，本服务在 vm 沙箱里运行它还原图片相对路径）
 *  图片 CDN  *.6wm.top（t-nd3/c-nd3 等线路），防盗链 Referer 需为 baozimh.org
 */
import * as vm from 'vm';
import { webcrypto } from 'crypto';
import { REGIONS } from '../constants';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36';
const BASE = 'https://baozimh.org';
const API = 'https://v2.apikk.top';
const CDN_HOST = 'https://t-nd3-1.6wm.top';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 通用带超时/重试的抓取（仅 BAOZIMH 主站） */
async function get(url: string, referer = `${BASE}/`): Promise<string> {
  for (let i = 0; i < 3; i += 1) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Referer: referer }, signal: ctrl.signal });
      if (r.ok) {
        const t = await r.text();
        if (t.length > 1000 || i === 2) return t;
      }
    } catch {
      /* 重试 */
    } finally {
      clearTimeout(timer);
    }
    await sleep(700 * (i + 1));
  }
  return '';
}

/** 通用 JSON 抓取（apikk API，独立 host，带超时） */
async function getJson(url: string, referer = `${BASE}/`): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, Referer: referer, Accept: 'application/json' },
      signal: ctrl.signal,
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface BaozimhChapter {
  id: string;
  /** 阅读页路径尾：<mangaSlug>/<chSlug>，拼接进 sourceId */
  path: string;
  title: string;
  order: number;
}

/** 包子漫画地区编码 -> 本应用地区名（接口不返回地区，需从详情页 manga-genre 链接解析） */
const BAOZI_REGION_CODES: Record<string, string> = {
  cn: '国漫', jp: '日漫', kr: '韩漫', us: '美漫', en: '美漫', hk: '国漫', tw: '国漫',
};

/** 从详情页 HTML 解析地区：匹配 /manga-genre/<code>（国漫/日漫…），识别不到归为「其他」 */
function extractRegion(html: string, regionLabels: Set<string>): string {
  const re = /href="\/manga-genre\/([\w\-]+)"[^>]*>\s*<span>\s*([^<]+?)\s*<\/span>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const code = m[1];
    const label = m[2].trim();
    if (BAOZI_REGION_CODES[code]) return BAOZI_REGION_CODES[code];
    if (regionLabels.has(label)) return label;
  }
  return '其他';
}

/** 从详情页提取作者：优先 JSON-LD 的 author(Person).name，其次「作者：xxx」链接文本 */
function extractAuthor(html: string): string {
  // 1) JSON-LD 结构化数据（author 为 Person 数组，含作者/绘术）
  const ld = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/);
  if (ld) {
    try {
      const j = JSON.parse(ld[1].trim());
      const list = Array.isArray(j?.author) ? j.author : j?.author ? [j.author] : [];
      const names = list
        .map((a: any) => (typeof a === 'string' ? a : a && a.name))
        .map((s: any) => (s ? String(s).trim() : ''))
        .filter(Boolean);
      if (names.length) return names.join('、');
    } catch {
      /* JSON 解析失败则走下面的兜底 */
    }
  }
  // 2) 兜底：「作者」后面的 /manga-author/ 链接文本
  const ai = html.indexOf('作者');
  if (ai >= 0) {
    const m2 = html.slice(ai, ai + 600).match(/manga-author\/[^">]*"[^>]*>([^<]+)</);
    if (m2 && m2[1].trim()) return m2[1].trim();
  }
  return '佚名';
}

/** 从详情页 JSON-LD 提取题材（genre 数组），失败返回空数组 */
function extractGenres(html: string): string[] {
  const ld = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/);
  if (!ld) return [];
  try {
    const j = JSON.parse(ld[1].trim());
    const list: unknown[] = Array.isArray(j?.genre) ? (j.genre as unknown[]) : j?.genre ? [j.genre] : [];
    const names = list.map((s) => String(s ?? '').trim()).filter((s) => s.length > 0);
    return [...new Set(names)];
  } catch {
    return [];
  }
}

export interface BaozimhComic {
  slug: string;
  mid: string;
  title: string;
  cover: string;
  description: string;
  author: string;
  /** 解析出的地区（国漫/日漫/韩漫/美漫/其他） */
  region: string;
  /** 原始 status：0=连载，其它=完结 */
  statusRaw: number;
  tags: string[];
  chapters: BaozimhChapter[];
}

export interface BaozimhSearchResult {
  slug: string;
  title: string;
  cover: string;
}

/** 搜索漫画，返回 {slug, title, cover} 列表（不导入，供前端挑选） */
export async function baozimhSearch(keyword: string, limit = 10): Promise<BaozimhSearchResult[]> {
  const html = await get(`${BASE}/s?q=${encodeURIComponent(keyword)}`);
  const seen = new Set<string>();
  const results: BaozimhSearchResult[] = [];
  // 卡片结构：<a href="/manga/<slug>"> <img class="card" src="封面"> … 标题文本 </a>
  for (const m of html.matchAll(/<a[^>]*href="\/manga\/([\w\-]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const slug = m[1];
    if (seen.has(slug)) continue;
    seen.add(slug);
    const inner = m[2];
    const imgTag = (inner.match(/<img[^>]*>/g) || []).find((t) => /class="[^"]*\bcard\b/.test(t)) || '';
    const cover = (imgTag.match(/src="([^"]+)"/) || [])[1] || '';
    const title = inner
      .replace(/<img[^>]*>/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || slug;
    results.push({ slug, title, cover });
  }
  return results.slice(0, limit);
}

/** 非漫画路径（站点导航/栏目），需从漫画链接中排除 */
const NON_MANGA_SLUG = /^(newss|hots|manga|dayup|search|donate|user|privacy|dmca|manga-genre|manga-tag)$/;

/** 从列表页 HTML 提取去重后的漫画 slug */
function extractSlugs(html: string): string[] {
  return [...new Set([...html.matchAll(/href="\/manga\/([\w\-]+)"/g)].map((m) => m[1]))].filter(
    (s) => !NON_MANGA_SLUG.test(s),
  );
}

/* 候选来源：首页 / 最新 / 每日更新 / 热门 / 地区分类，随后翻页，最后关键词搜索。
   站点首页仅约 47 部，抓完即失效，必须靠后续来源持续供给新候选。 */
const LIST_PATHS = [
  '/', '/newss', '/dayup', '/manga-genre/hots',
  '/manga-genre/cn', '/manga-genre/jp', '/manga-genre/kr',
];
const PAGE_BASES = [
  '/manga-genre/cn', '/manga-genre/jp', '/manga-genre/kr', '/manga-genre/hots', '/newss',
];
const SEARCH_KEYWORDS = [
  '热血', '恋爱', '玄幻', '修真', '悬疑', '搞笑', '校园', '科幻', '奇幻', '冒险',
  '治愈', '日常', '都市', '推理', '战斗', '青春', '古风', '竞技', '甜宠', '运动',
];

/**
 * 候选漫画 slug 流：按「列表页 → 翻页 → 关键词搜索」逐页产出，**按需拉取**。
 * 调用方边消费边判断去重，遇到重复会继续向下一页要候选，因此不会因首页抓空而提前结束。
 */
export async function* baozimhCandidates(): AsyncGenerator<string> {
  const seen = new Set<string>();
  const harvest = (html: string): string[] => {
    const fresh: string[] = [];
    for (const s of extractSlugs(html)) {
      if (seen.has(s)) continue;
      seen.add(s);
      fresh.push(s);
    }
    return fresh;
  };
  for (const p of LIST_PATHS) {
    for (const s of harvest(await get(`${BASE}${p}`))) yield s;
  }
  for (const base of PAGE_BASES) {
    for (const page of [2, 3, 4, 5]) {
      for (const s of harvest(await get(`${BASE}${base}/page/${page}`))) yield s;
    }
  }
  for (const kw of SEARCH_KEYWORDS) {
    for (const s of harvest(await get(`${BASE}/s?q=${encodeURIComponent(kw)}`))) yield s;
  }
}

/** 最近更新/发现：取前 limit 个候选（基于候选流） */
export async function baozimhDiscover(limit = 20): Promise<string[]> {
  const out: string[] = [];
  for await (const s of baozimhCandidates()) {
    out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}

/** 仅取漫画详情页 HTML（轻量去重用：只解析 data-mid，不再拉体积很大的章节列表） */
export async function baozimhPage(slug: string): Promise<string> {
  return get(`${BASE}/manga/${slug}`);
}

/** 从详情页 HTML 提取 mangaId */
export function baozimhMidFromHtml(html: string): string | null {
  return (html.match(/data-mid="([^"]+)"/) || [])[1] || null;
}

/** 漫画详情 + 章节列表（mode=all 全量）。preHtml 可传入已抓取的详情页，避免重复请求。 */
export async function baozimhComic(slug: string, preHtml?: string): Promise<BaozimhComic | null> {
  const html = preHtml ?? (await get(`${BASE}/manga/${slug}`));
  const mid = baozimhMidFromHtml(html);
  if (!mid) return null;

  // mode=all：返回全部章节（「查看全部章节」/chapterlist 页所用的接口）。
  // 不带 mode 时该 API 只返回前20+后20章，中间会缺失导致顺序看起来断裂。
  const j = await getJson(`${API}/api/manga/get?mid=${mid}&mode=all`, `${BASE}/chapterlist/${slug}`);
  const d = j?.data;
  if (!d) return null;

  const title = (d.title as string) || (html.match(/<title>([^<]*)<\/title>/) || [])[1]?.replace(/-包子漫畫$/, '') || slug;
  const cover = (d.cover as string) || (html.match(/<meta property="og:image" content="([^"]+)"/) || [])[1] || '';
  const description = (d.desc as string) || (html.match(/<meta property="og:description" content="([^"]*)"/) || [])[1] || '';
  const statusRaw = Number(d.status ?? 0);
  // 题材：接口 tagsM 形如 { data: [{ attributes: { name } }] }，兼容字符串/扁平结构
  const rawTags: any[] = Array.isArray(d.tagsM) ? d.tagsM : Array.isArray(d.tagsM?.data) ? d.tagsM.data : [];
  const parsedTags = [
    ...new Set(
      rawTags
        .map((t: any) => (typeof t === 'string' ? t : t?.attributes?.name || t?.name || ''))
        .map((s: any) => String(s).trim())
        .filter(Boolean),
    ),
  ];
  // 题材：优先 JSON-LD genre（更完整），其次接口 tagsM
  const genres = extractGenres(html);
  const tags = genres.length ? genres : parsedTags;
  const region = extractRegion(html, REGION_LABELS);
  const author = extractAuthor(html);
  const rawChapters: any[] = Array.isArray(d.chapters) ? d.chapters : [];
  const chapters: BaozimhChapter[] = rawChapters
    .map((c: any) => ({
    id: String(c.id),
    path: `${slug}/${c.attributes.slug}`,
    title: c.attributes?.title || `第${c.attributes?.order}话`,
    order: Number(c.attributes?.order) || 0,
  }))
    .sort((a, b) => a.order - b.order);

  return {
    slug, mid, title, cover, description, author, region, statusRaw, tags, chapters,
  };
}

/** 本应用支持的全部地区标签（用于详情页标签回退匹配） */
const REGION_LABELS = new Set<string>([...REGIONS]);

/* --------------------- 按 mid 列出全量章节（刷新章节用） --------------------- */

export interface BaozimhRawChapter {
  id: string;
  title: string;
  pages: number;
}

/**
 * 按 mangaId 列出全部章节（mode=all）。
 * 返回的 id 与入库时的章节 sourceId 格式一致（baozimh:<slug>/<chSlug>），便于刷新时按 id 去重。
 */
export async function baozimhChapters(mid: string): Promise<BaozimhRawChapter[]> {
  const j = await getJson(`${API}/api/manga/get?mid=${mid}&mode=all`, `${BASE}/chapterlist/`);
  const d = j?.data;
  if (!d || !Array.isArray(d.chapters)) return [];
  const mangaSlug = String(d.slug || '');
  const list: Array<{ id: string; title: string; pages: number; order: number }> = d.chapters.map((c: any) => ({
    id: `baozimh:${mangaSlug}/${c.attributes.slug}`,
    title: String(c.attributes?.title || `第${c.attributes?.order}话`),
    pages: 0,
    order: Number(c.attributes?.order) || 0,
  }));
  return list
    .sort((a, b) => a.order - b.order)
    .map(({ id, title, pages }) => ({ id, title, pages }));
}

/* ----------------------------- 图片解码器（vm 沙箱） ----------------------------- */

type DecodeFn = (blob: string) => any[] | Promise<any[]>;
let decodeFn: DecodeFn | null = null;
let decodeFailedAt = 0;

async function buildDecoder(): Promise<DecodeFn> {
  const code = await get(`${BASE}/assets/runtime/chapter-decoder.js`, `${BASE}/`);
  if (!code) throw new Error('baozimh 解码脚本获取失败');
  const win: any = {};
  const loc = {
    hostname: 'baozimh.org', host: 'baozimh.org', protocol: 'https:',
    href: 'https://baozimh.org/', origin: 'https://baozimh.org',
  };
  win.location = loc;
  const sandbox: any = {
    window: win, self: win, location: loc,
    document: {
      location: loc, querySelector: () => null,
      createElement: () => ({ dataset: {}, style: {}, setAttribute() {}, appendChild() {} }),
      head: { appendChild() {} }, addEventListener() {}, getElementById: () => null,
    },
    console: { log() {}, warn() {}, error() {}, debug() {} },
    atob: (s: string) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s: string) => Buffer.from(s, 'binary').toString('base64'),
    TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, Promise, Math, Date, JSON,
    parseInt, parseFloat, isNaN, String, Number, Object, Array, Error, RegExp,
    navigator: { userAgent: UA }, setTimeout, clearTimeout,
  };
  sandbox.crypto = (globalThis as any).crypto || webcrypto;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { timeout: 8000 });
  const cimg = win.__cimg;
  if (!cimg || typeof cimg.r !== 'function') throw new Error('baozimh 解码器未就绪');
  return (blob: string) => {
    const out = cimg.r(blob);
    return out && (out as any).then ? (out as any).then((x: any) => x) : out;
  };
}

async function getDecoder(): Promise<DecodeFn> {
  if (decodeFn) return decodeFn;
  if (decodeFailedAt && Date.now() - decodeFailedAt < 300000) throw new Error('baozimh 解码器暂不可用');
  try {
    decodeFn = await buildDecoder();
    return decodeFn;
  } catch (e) {
    decodeFailedAt = Date.now();
    throw e;
  }
}

export interface BaozimhPagesResult {
  pages: string[];
  locked: boolean;
}

/** 章节全部页图 URL。path = <mangaSlug>/<chSlug> */
export async function baozimhChapterPages(path: string): Promise<BaozimhPagesResult> {
  const html = await get(`${BASE}/manga/${path}`);
  const cc = (html.match(/id="chapterContent"[^>]*>/) || [])[0] || '';
  const ms = (cc.match(/data-ms="([^"]*)"/) || [])[1];
  const cs = (cc.match(/data-cs="([^"]*)"/) || [])[1];
  if (!ms || !cs) return { pages: [], locked: false };

  const j = await getJson(`${API}/api/v2/chapter/getinfo?m=${ms}&c=${cs}`, `${BASE}/manga/${path}`);
  const blob: unknown = j?.data?.info?.images?.images;
  if (!blob || typeof blob !== 'string') return { pages: [], locked: false };

  let decoded: any[];
  try {
    decoded = await getDecoder().then((fn) => fn(blob));
  } catch {
    return { pages: [], locked: false };
  }
  if (!Array.isArray(decoded)) return { pages: [], locked: false };

  const pages: string[] = [];
  for (const it of decoded) {
    const u = it && (it.url as string);
    if (!u) continue;
    pages.push(u.startsWith('http') ? u : `${CDN_HOST}${u}`);
  }
  return { pages, locked: false };
}

export const BAOZIMH_CDN = CDN_HOST;

/**
 * 在搜索结果里挑与关键词最匹配的一项（标题/关键词互为子串为强匹配，否则按字符重合度）。
 */
export function pickBestMatch(keyword: string, results: BaozimhSearchResult[]): BaozimhSearchResult | null {
  const k = (keyword || '').trim();
  if (!k || !results.length) return null;
  const kChars = new Set(k.split(''));
  let best: BaozimhSearchResult | null = null;
  let bestScore = 0;
  for (const r of results) {
    const t = r.title;
    let score = 0;
    if (t.includes(k) || k.includes(t)) score = 1;
    else {
      let hit = 0;
      const tChars = new Set(t.split(''));
      for (const ch of kChars) if (tChars.has(ch)) hit += 1;
      score = kChars.size ? hit / kChars.size : 0;
    }
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  if (best && (best.title.includes(k) || k.includes(best.title) || bestScore >= 0.6)) return best;
  return null;
}
