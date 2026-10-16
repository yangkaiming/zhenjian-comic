/**
 * 动漫屋（dm5.com）数据源：中文漫画站，国漫/日漫/韩漫均为中文页。
 * 抓取与取图逻辑见 services/dm5.ts；阅读时章节 sourceId 形如 dm5:<cid>。
 */
import { Comic } from '../../models/Comic';
import { Chapter } from '../../models/Chapter';
import { dm5Comic, dm5Discover, dm5Search, pickBestMatch } from '../dm5';
import {
  beginFetchProgress,
  bumpFetch,
  fetchItemDone,
  fetchItemStart,
  finishFetchProgress,
  getFetchProgress,
} from '../importer';
import type { ComicSource, FetchResult } from './types';

function cleanDesc(text: string): string {
  const t = (text || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  return t.length > 160 ? `${t.slice(0, 157).trimEnd()}…` : t;
}

/** 导入一个 dm5 漫画（含章节） */
async function importOne(slug: string): Promise<'added' | 'skipped'> {
  const comic = await dm5Comic(slug);
  if (!comic || !comic.chapters.length) return 'skipped';

  const idx = fetchItemStart(comic.title);
  bumpFetch(0, 0, 0, `抓取《${comic.title}》…`);
  const cats = comic.genres.length ? comic.genres : ['热血'];
  const now = Date.now();
  const created = await Comic.create({
    title: comic.title,
    author: comic.author || '佚名',
    description: cleanDesc(comic.description) || '暂无简介',
    region: '国漫', // dm5 页面不暴露地区，统一按国漫归类（内容均为中文）
    status: comic.status === 'completed' ? '完结' : '连载',
    categories: cats,
    tags: cats,
    rating: 8,
    ratingCount: 200,
    views: 1000,
    favorites: 10,
    chapterCount: comic.chapters.length,
    latestChapter: comic.chapters[comic.chapters.length - 1].title,
    recommend: 50,
    sourceId: `dm5:${comic.mid}`,
    cover: comic.cover,
    banner: comic.cover,
  });
  await Chapter.insertMany(
    comic.chapters.map((c, i) => ({
      comic: created._id,
      index: i + 1,
      title: c.title,
      pageCount: 0,
      sourceId: `dm5:${c.cid}`,
      sourcePages: [],
      releasedAt: new Date(now - (comic.chapters.length - i) * 86400000),
    })),
  );
  fetchItemDone(idx, 'done', comic.chapters.length, comic.title);
  bumpFetch(1, 0, comic.chapters.length);
  return 'added';
}

async function importDm5(count: number): Promise<FetchResult> {
  if (getFetchProgress().running) {
    const p = getFetchProgress();
    return { added: p.added, skipped: p.skipped, chapters: p.chapters };
  }
  beginFetchProgress(count, '发现候选中…');
  let added = 0;
  let skipped = 0;
  try {
    const slugs = await dm5Discover(Math.max(count * 3, 20));
    const existing = await Comic.find({ sourceId: { $ne: '' } }, { sourceId: 1 }).lean();
    const existSrc = new Set(existing.map((c) => c.sourceId));
    for (const slug of slugs) {
      if (added >= count) break;
      // 先取详情判断是否已入库（避免重复抓章节）
      const probe = await dm5Comic(slug, 1);
      if (!probe) {
        skipped += 1;
        continue;
      }
      if (existSrc.has(`dm5:${probe.mid}`)) {
        skipped += 1;
        continue;
      }
      const r = await importOne(slug);
      if (r === 'added') added += 1;
      else skipped += 1;
      await new Promise((res) => setTimeout(res, 400));
    }
    finishFetchProgress();
  } catch (e) {
    finishFetchProgress((e as Error).message);
  }
  return { added, skipped, chapters: getFetchProgress().chapters };
}

async function importDm5ByTitle(title: string, limit = 5): Promise<FetchResult> {
  if (getFetchProgress().running) {
    const p = getFetchProgress();
    return { added: p.added, skipped: p.skipped, chapters: p.chapters };
  }
  beginFetchProgress(limit, `搜索《${title}》…`);
  let added = 0;
  let skipped = 0;
  try {
    const results = await dm5Search(title, Math.max(limit, 5));
    const best = pickBestMatch(title, results);
    if (!best) {
      finishFetchProgress(`未找到与「${title}」匹配的国漫`);
      return { added: 0, skipped: 0, chapters: 0 };
    }
    const existing = await Comic.find({ sourceId: { $ne: '' } }, { sourceId: 1 }).lean();
    const existSrc = new Set(existing.map((c) => c.sourceId));
    const probe = await dm5Comic(best.slug, 1);
    if (!probe || existSrc.has(`dm5:${probe.mid}`)) {
      finishFetchProgress(`《${best.title}》已存在或无法抓取`);
      return { added: 0, skipped: 1, chapters: 0 };
    }
    const r = await importOne(best.slug);
    if (r === 'added') added += 1;
    else skipped += 1;
    finishFetchProgress();
  } catch (e) {
    finishFetchProgress((e as Error).message);
  }
  return { added, skipped, chapters: getFetchProgress().chapters };
}

export const dm5Source: ComicSource = {
  info: {
    key: 'dm5',
    name: '动漫屋',
    desc: '中文漫画站：国漫/日漫/韩漫均为中文页',
    supportsSearch: true,
  },
  fetchByCount: (count) => importDm5(count),
  fetchByTitle: (title, limit) => importDm5ByTitle(title, limit),
};
