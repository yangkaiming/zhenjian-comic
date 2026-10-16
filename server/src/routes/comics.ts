import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { Comic } from '../models/Comic';
import { Chapter } from '../models/Chapter';
import { Comment } from '../models/Comment';
import { BookShelf } from '../models/BookShelf';
import { Setting } from '../models/Setting';
import { authOptional, authRequired, adminRequired, AuthRequest } from '../middleware/auth';
import { CATEGORIES, REGIONS, HOT_KEYWORDS } from '../constants';
import { buildPageUrl } from '../services/media';
import { fetchChapterPages } from '../services/mangadex';
import { dm5ChapterPages } from '../services/dm5';
import { baozimhChapterPages } from '../services/baozimh';
import { getFetchProgress, getRefreshProgress, refreshChapters } from '../services/importer';
import { availableSources, getSource } from '../services/sources';

const router = Router();

/** 可用数据源列表（“我的”页数据源下拉框） */
router.get('/sources', authRequired, (_req: Request, res: Response) => {
  res.json({ items: availableSources() });
});

/** 按书名搜索候选（不入库）：前端展示列表，由用户选中后再抓取 */
router.post('/fetch-search', adminRequired, async (req: AuthRequest, res: Response) => {
  const body = (req.body || {}) as { title?: string; source?: string; limit?: number };
  const title = String(body.title || '').trim();
  if (!title) return res.status(400).json({ message: '请输入书名' });
  const key = String(body.source || '').trim();
  const source = key ? getSource(key) : getSource('baozimh');
  if (!source) return res.status(400).json({ message: `未知数据源：${body.source}` });
  if (!source.searchTitles) {
    return res.status(400).json({ message: `数据源「${source.info.name}」不支持搜索候选` });
  }
  try {
    const items = await source.searchTitles(title, Math.min(20, Math.max(1, Number(body.limit) || 12)));
    res.json({ items, source: source.info.key });
  } catch (e) {
    res.status(502).json({ message: `搜索失败：${(e as Error).message}` });
  }
});

/** 抓取新漫画入库 —— “我的”页用。传 count 按条数、传 title 按书名、传 slug 精确抓取候选、source 选数据源。后台执行，进度见 /fetch-status */
router.post('/fetch', adminRequired, async (req: AuthRequest, res: Response) => {
  if (getFetchProgress().running) return res.json({ started: false, running: true });
  const body = (req.body || {}) as { count?: number; title?: string; slug?: string; source?: string; scope?: string };
  const title = String(body.title || '').trim();
  const slug = String(body.slug || '').trim();
  // 未传 source 用默认源；传了但不存在则报错（不静默回退，避免抓错源）
  const key = String(body.source || '').trim();
  const source = key ? getSource(key) : getSource('mangadex');
  if (!source) return res.status(400).json({ message: `未知数据源：${body.source}` });
  if (slug) {
    if (!source.fetchBySlug) {
      return res.status(400).json({ message: `数据源「${source.info.name}」不支持按候选抓取` });
    }
    void source.fetchBySlug(slug).catch(() => undefined);
  } else if (title) {
    if (!source.info.supportsSearch) {
      return res.status(400).json({ message: `数据源「${source.info.name}」不支持按书名抓取` });
    }
    void source.fetchByTitle(title).catch(() => undefined);
  } else {
    const scope = body.scope === 'jp' || body.scope === 'cn' ? body.scope : 'all';
    void source.fetchByCount(Number(body.count) || 20, { scope }).catch(() => undefined);
  }
  res.json({ started: true, source: source.info.key });
});

/** 抓取进度查询（前端轮询） */
router.get('/fetch-status', authRequired, (_req: Request, res: Response) => {
  res.json(getFetchProgress());
});

/** 刷新某漫画章节（抓取最新，增量入目录）—— 详情页用。后台执行，进度见 /refresh-status */
router.post('/:id/refresh-chapters', adminRequired, async (req: AuthRequest, res: Response) => {
  if (getRefreshProgress().running) return res.json({ started: false, running: true });
  void refreshChapters(req.params.id).catch(() => undefined);
  res.json({ started: true });
});

/** 章节刷新进度查询（详情页轮询） */
router.get('/refresh-status', authRequired, (_req: Request, res: Response) => {
  res.json(getRefreshProgress());
});

/**
 * 删除漫画（仅管理员）：**真删除**。
 * 漫画本体与其全部章节从数据库移除；书架记录保留并写入标题/封面快照，
 * 使其他用户仍能在书架看到「已被删除」蒙层，且只能执行「移出书架」。
 */
router.delete('/:id', adminRequired, async (req: Request, res: Response) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: '漫画 ID 不合法' });
  }
  const comic = await Comic.findById(req.params.id).lean();
  if (!comic) return res.status(404).json({ message: '漫画不存在或已被删除' });

  // 书架记录留快照（漫画本体删除后仍可展示「已被删除」并允许移出书架）
  await BookShelf.updateMany(
    { comic: comic._id },
    { $set: { comicTitle: comic.title || '', comicCover: comic.cover || '' } },
  );
  await Chapter.deleteMany({ comic: comic._id });
  await Comic.deleteOne({ _id: comic._id });
  res.json({ ok: true });
});

const SORTS: Record<string, Record<string, 1 | -1>> = {
  hot: { views: -1 },
  new: { createdAt: -1 },
  rating: { rating: -1 },
  update: { updatedAt: -1 },
};

const PAGE_H = [1200, 1240, 1400, 1600, 2000];

function buildPages(comicId: string, title: string, chapterIndex: number, pageCount: number) {
  const pages = [];
  for (let i = 1; i <= pageCount; i += 1) {
    const seed = (chapterIndex * 31 + i * 17 + comicId.length) % PAGE_H.length;
    const h = PAGE_H[seed];
    pages.push({
      index: i,
      w: 800,
      h,
      url: buildPageUrl(comicId, chapterIndex, i, title, 800, h),
    });
  }
  return pages;
}

function toInt(v: unknown, def: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** 首页聚合：轮播 / 热门 / 推荐 / 最近更新 */
router.get('/home', async (_req: Request, res: Response) => {
  // 首页轮播仅取管理员「编辑推荐」有序列表；未配置则不展示轮播模块
  const picksDoc = await Setting.findOne({ key: 'editorPicks' }).lean();
  const pickIds = Array.isArray(picksDoc?.value) ? (picksDoc?.value as string[]).filter((x) => mongoose.isValidObjectId(String(x))) : [];
  let banners: Record<string, unknown>[] = [];
  if (pickIds.length) {
    const picked = await Comic.find({ _id: { $in: pickIds.map((id) => new mongoose.Types.ObjectId(id)) }, deleted: { $ne: true } }).lean();
    const byId = new Map(picked.map((c) => [String(c._id), c]));
    banners = pickIds.map((id) => byId.get(id)).filter(Boolean) as Record<string, unknown>[];
  }
  const [hot, recommend, latestChapters] = await Promise.all([
    Comic.find({ deleted: { $ne: true } }).sort({ views: -1 }).limit(12).lean(),
    Comic.find({ deleted: { $ne: true } }).sort({ rating: -1, favorites: -1 }).limit(12).lean(),
    Chapter.find().sort({ releasedAt: -1 }).limit(60).populate('comic').lean(),
  ]);

  const seen = new Set<string>();
  const latest: Array<Record<string, unknown>> = [];
  for (const ch of latestChapters) {
    const comic = ch.comic as unknown as ({ _id: mongoose.Types.ObjectId } & { deleted?: boolean }) | null;
    if (!comic || comic.deleted) continue;
    const key = String(comic._id);
    if (seen.has(key)) continue;
    seen.add(key);
    latest.push({
      comic,
      chapter: { _id: String(ch._id), index: ch.index, title: ch.title, releasedAt: ch.releasedAt },
    });
    if (latest.length >= 12) break;
  }

  res.json({ banners, hot, recommend, latest, categories: CATEGORIES });
});

/** 漫画列表（支持搜索 / 筛选 / 排序 / 分页） */
router.get('/', async (req: Request, res: Response) => {
  const q = String(req.query.q || '').trim();
  const category = String(req.query.category || '').trim();
  const region = String(req.query.region || '').trim();
  const status = String(req.query.status || '').trim();
  const sort = String(req.query.sort || 'hot');
  const page = toInt(req.query.page, 1, 1, 500);
  const limit = toInt(req.query.limit, 24, 1, 60);

  const filter: Record<string, unknown> = { deleted: { $ne: true } };
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ title: rx }, { author: rx }, { tags: rx }, { description: rx }];
  }
  if (category) filter.categories = category;
  if (region) filter.region = region;
  if (status) filter.status = status;

  const [items, total] = await Promise.all([
    Comic.find(filter).sort(SORTS[sort] || SORTS.hot).skip((page - 1) * limit).limit(limit).lean(),
    Comic.countDocuments(filter),
  ]);

  res.json({ items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) });
});

/** 元数据：分类 / 地区 / 热搜 */
router.get('/meta', (_req: Request, res: Response) => {
  res.json({ categories: CATEGORIES, regions: REGIONS, hotKeywords: HOT_KEYWORDS });
});

/** 搜索建议 */
router.get('/suggest', async (req: Request, res: Response) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ items: [] });
  const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const items = await Comic.find({ title: rx, deleted: { $ne: true } }).sort({ views: -1 }).limit(10).select('title author cover region status').lean();
  return res.json({ items });
});

/** 排行榜 */
router.get('/rank', async (req: Request, res: Response) => {
  const type = String(req.query.type || 'hot');
  const region = String(req.query.region || '').trim();
  const limit = toInt(req.query.limit, 20, 1, 60);
  const filter: Record<string, unknown> = { deleted: { $ne: true } };
  if (region) filter.region = region;
  const items = await Comic.find(filter).sort(SORTS[type] || SORTS.hot).limit(limit).lean();
  res.json({ items, type });
});

/** 漫画详情 */
router.get('/:id', authOptional, async (req: AuthRequest, res: Response) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: '漫画 ID 不合法' });
  }
  const comic = await Comic.findById(req.params.id).lean();
  if (!comic) return res.status(404).json({ message: '漫画不存在或已被删除' });

  const [chapters, commentCount, shelf] = await Promise.all([
    Chapter.find({ comic: comic._id }).sort({ index: 1 }).select('index title pageCount releasedAt').lean(),
    Comment.countDocuments({ comic: comic._id }),
    req.userId
      ? BookShelf.findOne({ user: req.userId, comic: comic._id }).lean()
      : Promise.resolve(null),
  ]);

  // 浏览量是计数变化，不更新 updatedAt（否则「更新」排序会被浏览行为顶乱）
  await Comic.updateOne({ _id: comic._id }, { $inc: { views: 1 } }, { timestamps: false });

  return res.json({
    comic,
    chapters,
    commentCount,
    inShelf: !!shelf,
    shelfStatus: shelf?.status || null,
    shelfProgress: shelf || null,
  });
});

/** 章节列表（分页，供目录加载更多） */
router.get('/:id/chapters', async (req: Request, res: Response) => {
  const page = toInt(req.query.page, 1, 1, 500);
  const limit = toInt(req.query.limit, 100, 1, 500);
  const order = String(req.query.order || 'asc') === 'desc' ? -1 : 1;
  const [items, total] = await Promise.all([
    Chapter.find({ comic: req.params.id }).sort({ index: order }).skip((page - 1) * limit).limit(limit).select('index title pageCount releasedAt').lean(),
    Chapter.countDocuments({ comic: req.params.id }),
  ]);
  res.json({ items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) });
});

/** 相关推荐：同题材或同作者的其它漫画（排除自身），按评分/人气取前 N */
router.get('/:id/related', async (req: Request, res: Response) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.json({ items: [] });
  const comic = await Comic.findById(req.params.id).select('categories author').lean();
  if (!comic) return res.json({ items: [] });
  const or: Record<string, unknown>[] = [];
  const cats = (comic.categories || []).slice(0, 3);
  if (cats.length) or.push({ categories: { $in: cats } });
  if (comic.author && comic.author !== '佚名') or.push({ author: comic.author });
  if (!or.length) return res.json({ items: [] });
  const items = await Comic.find({ _id: { $ne: comic._id }, deleted: { $ne: true }, $or: or })
    .sort({ rating: -1, views: -1 })
    .limit(12)
    .lean();
  res.json({ items });
});

/** 章节详情（含页面图） */
router.get('/chapter/:chapterId', async (req: Request, res: Response) => {
  if (!mongoose.isValidObjectId(req.params.chapterId)) {
    return res.status(400).json({ message: '章节 ID 不合法' });
  }
  const chapter = await Chapter.findById(req.params.chapterId).lean();
  if (!chapter) return res.status(404).json({ message: '章节不存在' });
  const comic = await Comic.findById(chapter.comic).lean();
  if (!comic) return res.status(404).json({ message: '漫画不存在' });

  const [prev, next] = await Promise.all([
    Chapter.findOne({ comic: chapter.comic, index: chapter.index - 1 }).select('_id index title').lean(),
    Chapter.findOne({ comic: chapter.comic, index: chapter.index + 1 }).select('_id index title').lean(),
  ]);

  let pages: Array<{ index: number; w: number; h: number; url: string }> = [];
  let remote = false;
  let locked = false;

  if (chapter.sourceId) {
    // 有数据源章节 ID：页图走网络（URL 会缓存进库，避免重复请求）
    try {
      let urls = chapter.sourcePages || [];
      let freshLocked = false;
      if (!urls.length) {
        if (chapter.sourceId.startsWith('dm5:')) {
          const r = await dm5ChapterPages(chapter.sourceId.slice(4));
          urls = r.pages;
          freshLocked = r.locked;
        } else if (chapter.sourceId.startsWith('baozimh:')) {
          const r = await baozimhChapterPages(chapter.sourceId.slice('baozimh:'.length));
          urls = r.pages;
          freshLocked = r.locked;
        } else {
          urls = await fetchChapterPages(chapter.sourceId);
        }
        await Chapter.updateOne({ _id: chapter._id }, { $set: { sourcePages: urls } });
      }
      pages = urls.map((url, i) => ({ index: i + 1, w: 800, h: 1200, url }));
      remote = true;
      locked = freshLocked;
    } catch (err) {
      console.warn(`[comics] 章节 ${chapter._id} 远程页图获取失败:`, (err as Error).message);
    }
  }

  // 远程拿不到且非付费锁定时，退回动态生成的 SVG 占位页
  if (!pages.length && !locked) {
    pages = buildPages(String(comic._id), comic.title, chapter.index, chapter.pageCount);
  }

  res.json({
    chapter: {
      _id: String(chapter._id),
      index: chapter.index,
      title: chapter.title,
      pageCount: pages.length,
      pages,
      prevId: prev ? String(prev._id) : null,
      nextId: next ? String(next._id) : null,
      locked,
    },
    comic: {
      _id: String(comic._id),
      title: comic.title,
      author: comic.author,
      cover: comic.cover,
      chapterCount: comic.chapterCount,
    },
    remote,
  });
});

export default router;
