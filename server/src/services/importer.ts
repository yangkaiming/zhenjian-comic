/**
 * 漫画导入器：直接从 MangaDex 抓取漫画元数据 + 全部章节并入库。
 * 供“我的”页按条数抓取、详情页刷新章节使用（成品应用无 Python 依赖，故在 Node 侧实现）。
 */

import { Comic } from '../models/Comic';
import { Chapter } from '../models/Chapter';
import { coverUrl, mdGet } from './mangadex';
import { localizeComic, pickZhDesc, pickZhTitle } from './translate';
import { baozimhChapters } from './baozimh';

const TAG_MAP: Record<string, string> = {
  Action: '热血', Adventure: '冒险', Comedy: '搞笑', Drama: '剧情', Fantasy: '奇幻',
  Horror: '悬疑', Mystery: '推理', Romance: '恋爱', 'Sci-Fi': '科幻', Sports: '运动',
  Supernatural: '奇幻', Isekai: '奇幻', 'Slice of Life': '治愈', Psychological: '悬疑',
  Mecha: '科幻', Cooking: '治愈', Music: '日常', Medical: '都市', 'Office Workers': '都市',
  'School Life': '校园', Delinquents: '校园', Historical: '古风', Military: '战斗',
  'Martial Arts': '热血', Samurai: '古风', Ninja: '热血', 'Video Games': '竞技',
  'Virtual Reality': '科幻', 'Post-Apocalyptic': '科幻', Survival: '悬疑', 'Time Travel': '科幻',
  Reincarnation: '奇幻', Ghosts: '悬疑', Vampires: '奇幻', Demons: '奇幻', Monsters: '奇幻',
  Animals: '治愈', Crossdressing: '搞笑', Gyaru: '恋爱',
};
const REGION_MAP: Record<string, string> = { zh: '国漫', 'zh-hk': '国漫', ja: '日漫', ko: '韩漫' };
const LANG_PREF = ['zh', 'zh-hk', 'zh-tw', 'en', 'ja-ro', 'ja', 'ko-ro', 'ko'];

function pickLang(d: unknown): string {
  if (!d || typeof d !== 'object') return '';
  const obj = d as Record<string, unknown>;
  for (const k of LANG_PREF) if (obj[k]) return String(obj[k]);
  for (const v of Object.values(obj)) if (v) return String(v);
  return '';
}

function cleanDesc(text: string): string {
  let t = (text || '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/<[^>]+>/g, '');
  t = t.replace(/\s+/g, ' ').trim();
  return t.length > 160 ? `${t.slice(0, 157).trimEnd()}…` : t;
}

interface RawChapter {
  id: string;
  title: string;
  pages: number;
}
interface RawManga {
  id: string;
  title: string;
  /** MangaDex 中文标题备选（title.zh / altTitles[].zh），入库前优先使用 */
  zhTitle: string;
  /** MangaDex 中文简介备选（description.zh），入库前优先使用 */
  zhDesc: string;
  author: string;
  description: string;
  originalLanguage: string;
  status: string;
  tags: string[];
  coverFile: string;
  group: string;
}

/** MangaDex /manga 条目 -> RawManga（附带中文备选） */
function mapRawManga(m: any, group: string): RawManga {
  const attr = m.attributes || {};
  const rels: any[] = m.relationships || [];
  let coverFile = '';
  let author = '佚名';
  for (const r of rels) {
    if (r.type === 'cover_art') coverFile = r.attributes?.fileName || '';
    else if (r.type === 'author') author = r.attributes?.name || '佚名';
  }
  const tags: string[] = [];
  for (const t of attr.tags || []) {
    const en = t.attributes?.name?.en;
    if (en) tags.push(en);
  }
  return {
    id: m.id,
    title: pickLang(attr.title),
    zhTitle: pickZhTitle(attr),
    zhDesc: pickZhDesc(attr),
    author,
    description: pickLang(attr.description),
    originalLanguage: attr.originalLanguage || 'ja',
    status: attr.status || 'ongoing',
    tags,
    coverFile,
    group,
  };
}

interface Plan {
  label: string;
  params: Record<string, unknown>;
  pages: number;
}

/** 抓取范围（“我的”页数据源下拉框） */
export type FetchScope = 'all' | 'jp' | 'cn';

const PLANS: Plan[] = [
  { label: 'hot', params: { order: { followedCount: 'desc' } }, pages: 3 },
  // 国漫同样要求 availableTranslatedLanguage=zh：MangaDex 上大量国漫只有英文译本，
  // 不过滤会把英文页图当国漫入库（阅读器里显示英文）
  { label: 'guoman', params: { originalLanguage: ['zh'], order: { followedCount: 'desc' } }, pages: 3 },
  { label: 'rating', params: { order: { rating: 'desc' } }, pages: 2 },
  { label: 'latest', params: { order: { latestUploadedChapter: 'desc' } }, pages: 2 },
];

function plansForScope(scope: FetchScope): Plan[] {
  if (scope === 'cn') return PLANS.filter((p) => p.label === 'guoman');
  if (scope === 'jp') return PLANS.filter((p) => p.label !== 'guoman');
  return PLANS;
}

async function searchPlan(plan: Plan, perPage: number): Promise<RawManga[]> {
  const out: RawManga[] = [];
  const order = plan.params.order as Record<string, string>;
  for (let page = 0; page < plan.pages; page += 1) {
    const params: Record<string, unknown> = {
      limit: perPage,
      offset: page * perPage,
      'includes[]': ['cover_art', 'author'],
      'contentRating[]': ['safe', 'suggestive'],
      hasAvailableChapters: 'true',
    };
    for (const [k, v] of Object.entries(order)) params[`order[${k}]`] = v;
    if (plan.params.originalLanguage) params['originalLanguage[]'] = plan.params.originalLanguage;
    if (!plan.params.skipLang) params['availableTranslatedLanguage[]'] = ['zh'];

    const data = await mdGet('/manga', params);
    const items: any[] = data?.data || [];
    for (const m of items) {
      if (!m?.id) continue;
      out.push(mapRawManga(m, plan.label));
    }
    if (items.length < perPage) break;
  }
  return out;
}

async function discover(scope: FetchScope = 'all'): Promise<RawManga[]> {
  const plans = plansForScope(scope);
  const perPlan = await Promise.all(plans.map((p) => searchPlan(p, 100)));
  const merged: RawManga[] = [];
  const seen = new Set<string>();
  const maxLen = Math.max(0, ...perPlan.map((l) => l.length));
  for (let i = 0; i < maxLen; i += 1) {
    for (const list of perPlan) {
      const m = list[i];
      if (m && m.id && !seen.has(m.id)) {
        seen.add(m.id);
        merged.push(m);
      }
    }
  }
  return merged;
}

async function chaptersAll(mangaId: string, onProgress?: (fetched: number) => void): Promise<RawChapter[]> {
  const out: RawChapter[] = [];
  const seen = new Set<string>();
  let offset = 0;
  const page = 500;
  const base: Record<string, unknown> = {
    'order[chapter]': 'asc',
    'contentRating[]': ['safe', 'suggestive'],
    // 只要中文章节：日漫取中文译本，国漫原版即中文。
    // MangaDex 上没有中文版的漫画会返回空，由调用方跳过，避免阅读器出现英文页图。
    'translatedLanguage[]': ['zh', 'zh-hk'],
  };

  for (;;) {
    let data: any;
    try {
      data = await mdGet(`/manga/${mangaId}/feed`, { ...base, limit: page, offset });
    } catch {
      break; // 触达 offset 上限等：保留已取到的章节
    }
    const items: any[] = data?.data || [];
    for (const ch of items) {
      const attr = ch.attributes || {};
      const num = attr.chapter;
      const key = num ? String(num) : `id:${ch.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const title = (attr.title || '').trim();
      const label = num && title && title !== num ? `第${num}话 ${title}` : num ? `第${num}话` : title || '全一话';
      out.push({ id: ch.id, title: label, pages: Number(attr.pages) || 0 });
    }
    onProgress?.(out.length);
    if (items.length < page || offset >= 5000) break;
    offset += page;
  }
  return out;
}

/**
 * 按漫画来源分派章节列表：刷新只走该漫画自己的来源，绝不跨源。
 * chaptersAll 仅支持 MangaDex（sourceId 即 MangaDex 漫画 id）；带前缀的走各自适配器。
 */
async function chaptersForComic(sourceId: string, onProgress?: (fetched: number) => void): Promise<RawChapter[]> {
  if (sourceId.startsWith('baozimh:')) {
    const chs = await baozimhChapters(sourceId.slice('baozimh:'.length));
    onProgress?.(chs.length);
    return chs;
  }
  if (sourceId.startsWith('dm5:')) {
    throw new Error('动漫屋来源暂不支持在线刷新章节（可删除后用数据源重新抓取）');
  }
  return chaptersAll(sourceId, onProgress); // MangaDex
}

async function fetchStats(ids: string[]): Promise<Record<string, any>> {
  const out: Record<string, any> = {};
  for (let i = 0; i < ids.length; i += 100) {
    try {
      const data = await mdGet('/statistics/manga', { 'manga[]': ids.slice(i, i + 100) });
      Object.assign(out, data?.statistics || {});
    } catch {
      /* 统计失败用默认评分 */
    }
  }
  return out;
}

function mapCats(tags: string[]): string[] {
  const cats: string[] = [];
  for (const en of tags) {
    const cn = TAG_MAP[en];
    if (cn && !cats.includes(cn)) cats.push(cn);
  }
  return cats.length ? cats.slice(0, 3) : ['热血'];
}

export interface FetchItem {
  title: string;
  status: 'fetching' | 'done' | 'skipped';
  chapters: number;
}

export interface FetchProgress {
  running: boolean;
  target: number;
  added: number;
  skipped: number;
  chapters: number;
  current: string;
  done: boolean;
  items: FetchItem[];
  error?: string;
}

let progress: FetchProgress = {
  running: false,
  target: 0,
  added: 0,
  skipped: 0,
  chapters: 0,
  current: '',
  done: true,
  items: [],
};

export function getFetchProgress(): FetchProgress {
  return { ...progress };
}

/* ------------------------------------------------------------------ */
/* 进度通道（供其它数据源复用同一套抓取进度，如 dm5 源）                  */
/* ------------------------------------------------------------------ */

/** 开始一批抓取（重置进度） */
export function beginFetchProgress(target: number, label: string): void {
  progress = {
    running: true, target, added: 0, skipped: 0, chapters: 0,
    current: label, done: false, items: [], error: undefined,
  };
}

/** 登记一个抓取项，返回其索引 */
export function fetchItemStart(title: string): number {
  progress.items.push({ title, status: 'fetching', chapters: 0 });
  return progress.items.length - 1;
}

/** 更新抓取项状态 */
export function fetchItemDone(index: number, status: 'done' | 'skipped', chapters: number, title?: string): void {
  const prev = progress.items[index];
  if (!prev) return;
  progress.items[index] = { title: title || prev.title, status, chapters };
}

/** 累加计数并更新当前描述 */
export function bumpFetch(added: number, skipped: number, chapters: number, current?: string): void {
  progress.added += added;
  progress.skipped += skipped;
  progress.chapters += chapters;
  if (current) progress.current = current;
}

/** 结束一批抓取 */
export function finishFetchProgress(error?: string): void {
  progress.running = false;
  progress.done = true;
  progress.error = error;
  progress.current = error
    ? `失败：${error}`
    : `完成：新增 ${progress.added} 部 / ${progress.chapters} 话${progress.skipped ? `，跳过 ${progress.skipped}` : ''}`;
}

/** 按条数抓取新漫画（含全部章节）入库；返回摘要。实时进度见 getFetchProgress()。 */
export async function importComics(
  count: number,
  opts: { candidates?: RawManga[]; poolSize?: number; label?: string; scope?: FetchScope } = {},
): Promise<{ added: number; skipped: number; chapters: number }> {
  if (progress.running) {
    return { added: progress.added, skipped: progress.skipped, chapters: progress.chapters };
  }
  const target = Math.max(1, Math.min(500, Math.floor(count || 20)));
  progress = { running: true, target, added: 0, skipped: 0, chapters: 0, current: opts.label || '发现候选中…', done: false, items: [], error: undefined };
  let added = 0;
  let skipped = 0;
  let chapters = 0;
  try {
    const candidates = opts.candidates ?? (await discover(opts.scope || 'all'));

    const existing = await Comic.find({}, { sourceId: 1, title: 1 }).lean();
    const existSrc = new Set(existing.map((c) => c.sourceId).filter(Boolean) as string[]);
    const existTitle = new Set(existing.map((c) => c.title));

    const fresh: RawManga[] = [];
    const seenTitle = new Set<string>();
    // 取足够大的候选池：enrich 会跳过无章节的，池子太小可能凑不满目标
    const poolSize = opts.poolSize ?? Math.max(target * 3, 40);
    for (const m of candidates) {
      if (!m.title) continue;
      if (existSrc.has(m.id) || existTitle.has(m.title) || seenTitle.has(m.title)) continue;
      seenTitle.add(m.title);
      fresh.push(m);
      if (fresh.length >= poolSize) break;
    }

    const statsMap = await fetchStats(fresh.map((m) => m.id));

    progress.current = '开始入库…';
    for (const m of fresh) {
      if (added >= target) break;
      const itemIndex = progress.items.length;
      progress.items.push({ title: m.title, status: 'fetching', chapters: 0 });
      progress.current = `抓取《${m.title}》…`;
      const chs = await chaptersAll(m.id);
      if (!chs.length) {
        skipped += 1;
        progress.skipped = skipped;
        progress.items[itemIndex] = { title: m.title, status: 'skipped', chapters: 0 };
        continue;
      }
      const st = statsMap[m.id] || {};
      const rating = st.rating || {};
      const score = rating.bayesian || rating.average;
      const follows = Number(st.follows) || 0;
      const cats = mapCats(m.tags);
      // 英译中：优先 MangaDex 中文备选，其次 LLM 翻译，最后保留原文
      const loc = await localizeComic(m.zhTitle || m.title, m.zhDesc || m.description);
      const now = Date.now();
      const created = await Comic.create({
        title: loc.title,
        author: m.author || '佚名',
        description: cleanDesc(loc.description) || '暂无简介',
        region: REGION_MAP[m.originalLanguage] || '日漫',
        status: m.status === 'completed' ? '完结' : '连载',
        categories: cats,
        tags: cats,
        rating: score ? Math.round(score * 10) / 10 : 8,
        ratingCount: 200,
        views: follows ? follows * 37 : 1000,
        favorites: follows ? Math.round(follows / 60) : 10,
        chapterCount: chs.length,
        latestChapter: chs[chs.length - 1].title,
        recommend: 50,
        sourceId: m.id,
        cover: coverUrl(m.id, m.coverFile, '.256'),
        banner: coverUrl(m.id, m.coverFile, '.512'),
      });
      await Chapter.insertMany(
        chs.map((c, i) => ({
          comic: created._id,
          index: i + 1,
          title: c.title,
          pageCount: c.pages || 20,
          sourceId: c.id,
          sourcePages: [],
          releasedAt: new Date(now - (chs.length - i) * 86400000),
        })),
      );
      added += 1;
      chapters += chs.length;
      progress.added = added;
      progress.skipped = skipped;
      progress.chapters = chapters;
      progress.items[itemIndex] = { title: loc.title, status: 'done', chapters: chs.length };
    }
    return { added, skipped, chapters };
  } catch (e) {
    progress.error = (e as Error).message;
    throw e;
  } finally {
    progress.running = false;
    progress.done = true;
    progress.current = progress.error ? `失败：${progress.error}` : `完成：新增 ${added} 部 / ${chapters} 话`;
  }
}

/** 按标题搜索漫画（用于“按书名抓取”）。 */
async function searchByTitle(title: string, limit: number): Promise<RawManga[]> {
  const data = await mdGet('/manga', {
    title,
    limit,
    'includes[]': ['cover_art', 'author'],
    'contentRating[]': ['safe', 'suggestive'],
    hasAvailableChapters: 'true',
    // 只要有中文章节的：避免把只有英文译本的漫画抓进来（阅读器会是英文页图）
    'availableTranslatedLanguage[]': ['zh'],
    'order[relevance]': 'desc',
  });
  const out: RawManga[] = [];
  for (const m of data?.data || []) {
    if (!m?.id) continue;
    out.push(mapRawManga(m, 'search'));
  }
  return out;
}

/** 按书名抓取：搜索匹配的漫画并导入（含全部章节）。 */
export async function importByTitle(title: string, limit = 20): Promise<{ added: number; skipped: number; chapters: number }> {
  if (progress.running) {
    return { added: progress.added, skipped: progress.skipped, chapters: progress.chapters };
  }
  const keyword = (title || '').trim();
  const target = Math.max(1, Math.min(500, Math.floor(limit || 20)));
  // 先进入“搜索中”，避免前端轮询误判为上一轮已结束
  progress = { running: true, target, added: 0, skipped: 0, chapters: 0, current: `搜索《${keyword}》…`, done: false, items: [], error: undefined };
  if (!keyword) {
    progress = { running: false, target, added: 0, skipped: 0, chapters: 0, current: '书名不能为空', done: true, items: [], error: '书名不能为空' };
    throw new Error('书名不能为空');
  }
  const candidates = await searchByTitle(keyword, Math.max(target * 2, 10));
  if (!candidates.length) {
    progress = { running: false, target, added: 0, skipped: 0, chapters: 0, current: '未找到匹配的漫画', done: true, items: [], error: undefined };
    return { added: 0, skipped: 0, chapters: 0 };
  }
  progress.running = false; // 让 importComics 接管并重新初始化进度
  return importComics(limit, { candidates, poolSize: candidates.length, label: `搜索《${keyword}》…` });
}

export interface RefreshProgress {
  running: boolean;
  comicId: string;
  /** fetching=获取章节中 / saving=更新目录中 / done=完成 */
  phase: 'fetching' | 'saving' | 'done';
  fetched: number;
  added: number;
  total: number;
  error?: string;
}

let refreshProgress: RefreshProgress = {
  running: false,
  comicId: '',
  phase: 'done',
  fetched: 0,
  added: 0,
  total: 0,
};

export function getRefreshProgress(): RefreshProgress {
  return { ...refreshProgress };
}

/** 刷新某漫画章节：抓取最新，增量并入目录。实时进度见 getRefreshProgress()。 */
export async function refreshChapters(comicId: string): Promise<{ added: number; total: number }> {
  if (refreshProgress.running) {
    return { added: refreshProgress.added, total: refreshProgress.total };
  }
  refreshProgress = { running: true, comicId, phase: 'fetching', fetched: 0, added: 0, total: 0, error: undefined };
  try {
    const comic = await Comic.findById(comicId);
    if (!comic) throw new Error('漫画不存在');
    if (!comic.sourceId) throw new Error('该漫画无数据源，无法刷新');

    const chs = await chaptersForComic(comic.sourceId, (n) => {
      refreshProgress.fetched = n;
    });
    if (!chs.length) throw new Error('未获取到章节');

    refreshProgress.phase = 'saving';
    const existing = await Chapter.find({ comic: comic._id }, { sourceId: 1, index: 1 }).lean();
    const have = new Set(existing.map((c) => c.sourceId).filter(Boolean) as string[]);
    let maxIndex = 0;
    for (const c of existing) if (c.index > maxIndex) maxIndex = c.index;

    const fresh = chs.filter((c) => !have.has(c.id));
    const latest = chs[chs.length - 1].title;
    if (fresh.length) {
      const now = Date.now();
      await Chapter.insertMany(
        fresh.map((c, i) => ({
          comic: comic._id,
          index: maxIndex + i + 1,
          title: c.title,
          pageCount: c.pages || 20,
          sourceId: c.id,
          sourcePages: [],
          releasedAt: new Date(now - (fresh.length - i) * 86400000),
        })),
      );
      await Comic.updateOne(
        { _id: comic._id },
        { $set: { chapterCount: maxIndex + fresh.length, latestChapter: latest } },
      );
    } else {
      await Comic.updateOne({ _id: comic._id }, { $set: { latestChapter: latest } });
    }
    refreshProgress.added = fresh.length;
    refreshProgress.total = maxIndex + fresh.length;
    return { added: fresh.length, total: maxIndex + fresh.length };
  } catch (e) {
    refreshProgress.error = (e as Error).message;
    throw e;
  } finally {
    refreshProgress.running = false;
    refreshProgress.phase = 'done';
  }
}
