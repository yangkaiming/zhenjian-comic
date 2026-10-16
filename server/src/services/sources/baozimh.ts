/**
 * 包子漫画（baozimh.org）数据源：中文漫画站（国漫）。
 * 抓取与取图逻辑见 services/baozimh.ts；阅读时章节 sourceId 形如 baozimh:<mangaSlug>/<chSlug>。
 */
import { Comic } from '../../models/Comic';
import { Chapter } from '../../models/Chapter';
import { baozimhCandidates, baozimhComic, baozimhMidFromHtml, baozimhPage, baozimhSearch, pickBestMatch } from '../baozimh';
import {
  beginFetchProgress,
  bumpFetch,
  fetchItemDone,
  fetchItemStart,
  finishFetchProgress,
  getFetchProgress,
} from '../importer';
import type { ComicSource, FetchResult, SourceCandidate } from './types';

function cleanDesc(text: string): string {
  const t = (text || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  return t.length > 160 ? `${t.slice(0, 157).trimEnd()}…` : t;
}

/** 导入一个 baozimh 漫画（含章节）。preHtml 为已抓取的详情页，可避免重复请求 */
async function importOne(slug: string, preHtml?: string): Promise<'added' | 'skipped'> {
  const comic = await baozimhComic(slug, preHtml);
  if (!comic || !comic.chapters.length) return 'skipped';

  const idx = fetchItemStart(comic.title);
  bumpFetch(0, 0, 0, `抓取《${comic.title}》…`);
  const cats = comic.tags.length ? comic.tags.slice(0, 6) : ['热血'];
  const now = Date.now();
  const created = await Comic.create({
    title: comic.title,
    author: comic.author || '佚名',
    description: cleanDesc(comic.description) || '暂无简介',
    region: comic.region || '其他',
    status: comic.statusRaw === 0 ? '连载' : '完结',
    categories: cats,
    tags: cats,
    rating: Number((6 + Math.random() * 4).toFixed(1)),
    ratingCount: 200 + Math.floor(Math.random() * 1800),
    views: 1000 + Math.floor(Math.random() * 9000),
    favorites: 10 + Math.floor(Math.random() * 300),
    chapterCount: comic.chapters.length,
    latestChapter: comic.chapters[comic.chapters.length - 1].title,
    recommend: 50,
    sourceId: `baozimh:${comic.mid}`,
    cover: comic.cover,
    banner: comic.cover,
  });
  await Chapter.insertMany(
    comic.chapters.map((c, i) => ({
      comic: created._id,
      index: i + 1,
      title: c.title,
      pageCount: 0,
      sourceId: `baozimh:${c.path}`,
      sourcePages: [],
      releasedAt: new Date(now - (comic.chapters.length - i) * 86400000),
    })),
  );
  fetchItemDone(idx, 'done', comic.chapters.length, comic.title);
  bumpFetch(1, 0, comic.chapters.length);
  return 'added';
}

async function importBaozimh(count: number): Promise<FetchResult> {
  if (getFetchProgress().running) {
    const p = getFetchProgress();
    return { added: p.added, skipped: p.skipped, chapters: p.chapters };
  }
  beginFetchProgress(count, '发现候选中…');
  let added = 0;
  let skipped = 0;
  try {
    const existing = await Comic.find({ sourceId: { $ne: '' } }, { sourceId: 1 }).lean();
    const existSrc = new Set(existing.map((c) => c.sourceId));
    // 候选按需供给：遇到已入库的会继续向下一个列表页/关键词取新候选，
    // 不会像原来那样把首页抓完就结束（首页仅约 47 部，很快会全部重复）。
    for await (const slug of baozimhCandidates()) {
      if (added >= count) break;
      // 只取详情页拿 mid 做去重（不拉章节列表），已入库的直接跳过
      const html = await baozimhPage(slug);
      const mid = baozimhMidFromHtml(html);
      if (!mid) {
        skipped += 1;
        continue;
      }
      if (existSrc.has(`baozimh:${mid}`)) {
        skipped += 1;
        continue;
      }
      // 复用上面已抓的详情页，只补一次章节列表接口
      const r = await importOne(slug, html);
      if (r === 'added') {
        added += 1;
        existSrc.add(`baozimh:${mid}`);
      } else skipped += 1;
      await new Promise((res) => setTimeout(res, 400));
    }
    finishFetchProgress();
  } catch (e) {
    finishFetchProgress((e as Error).message);
  }
  return { added, skipped, chapters: getFetchProgress().chapters };
}

async function importBaozimhByTitle(title: string, limit = 5): Promise<FetchResult> {
  if (getFetchProgress().running) {
    const p = getFetchProgress();
    return { added: p.added, skipped: p.skipped, chapters: p.chapters };
  }
  beginFetchProgress(limit, `搜索《${title}》…`);
  let added = 0;
  let skipped = 0;
  try {
    const results = await baozimhSearch(title, Math.max(limit, 5));
    const best = pickBestMatch(title, results);
    if (!best) {
      finishFetchProgress(`未找到与「${title}」匹配的漫画`);
      return { added: 0, skipped: 0, chapters: 0 };
    }
    const existing = await Comic.find({ sourceId: { $ne: '' } }, { sourceId: 1 }).lean();
    const existSrc = new Set(existing.map((c) => c.sourceId));
    const html = await baozimhPage(best.slug);
    const mid = baozimhMidFromHtml(html);
    if (!mid || existSrc.has(`baozimh:${mid}`)) {
      finishFetchProgress(`《${best.title}》已存在或无法抓取`);
      return { added: 0, skipped: 1, chapters: 0 };
    }
    const r = await importOne(best.slug, html);
    if (r === 'added') added += 1;
    else skipped += 1;
    finishFetchProgress();
  } catch (e) {
    finishFetchProgress((e as Error).message);
  }
  return { added, skipped, chapters: getFetchProgress().chapters };
}

/** 按 slug 精确抓取入库（前端在候选列表中选中某本后调用） */
async function importBaozimhBySlug(slug: string, title?: string): Promise<FetchResult> {
  if (getFetchProgress().running) {
    const p = getFetchProgress();
    return { added: p.added, skipped: p.skipped, chapters: p.chapters };
  }
  beginFetchProgress(1, title ? `抓取《${title}》…` : '抓取中…');
  let added = 0;
  let skipped = 0;
  try {
    const existing = await Comic.find({ sourceId: { $ne: '' } }, { sourceId: 1 }).lean();
    const existSrc = new Set(existing.map((c) => c.sourceId));
    const html = await baozimhPage(slug);
    const mid = baozimhMidFromHtml(html);
    if (!mid || existSrc.has(`baozimh:${mid}`)) {
      finishFetchProgress('该漫画已存在或无法抓取');
      return { added: 0, skipped: 1, chapters: 0 };
    }
    const r = await importOne(slug, html);
    if (r === 'added') added += 1;
    else skipped += 1;
    finishFetchProgress();
  } catch (e) {
    finishFetchProgress((e as Error).message);
  }
  return { added, skipped, chapters: getFetchProgress().chapters };
}

export const baozimhSource: ComicSource = {
  info: {
    key: 'baozimh',
    name: '包子漫画',
    desc: '中文漫画站（国漫）；章节取图经解码，部分章节可能不可用',
    supportsSearch: true,
  },
  fetchByCount: (count) => importBaozimh(count),
  fetchByTitle: (title, limit) => importBaozimhByTitle(title, limit),
  // 只搜索候选，不入库；前端展示列表让用户挑选
  searchTitles: async (title, limit = 12) => {
    const list = await baozimhSearch(title, Math.max(limit, 5));
    // 用本地已有标题判断「已入库」，避免为标记而额外请求每个候选详情页
    const existTitles = new Set(
      (await Comic.find({}, { title: 1 }).lean()).map((c) => String(c.title || '').trim()),
    );
    return list.slice(0, limit).map<SourceCandidate>((r) => ({
      slug: r.slug,
      title: r.title,
      cover: r.cover,
      exists: existTitles.has(r.title),
    }));
  },
  fetchBySlug: (slug) => importBaozimhBySlug(slug),
};
