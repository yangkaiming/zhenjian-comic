import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { BookShelf } from '../models/BookShelf';
import { Comic } from '../models/Comic';
import { Chapter } from '../models/Chapter';
import { authRequired, AuthRequest } from '../middleware/auth';
import { SHELF_STATUS } from '../constants';

const router = Router();

router.use(authRequired);

/** 书架列表 */
router.get('/', async (req: AuthRequest, res: Response) => {
  const status = String(req.query.status || '').trim();
  const filter: Record<string, unknown> = { user: req.userId };
  if (status && SHELF_STATUS.includes(status as never)) filter.status = status;

  const rows = await BookShelf.find(filter).sort({ updatedAt: -1 }).lean();
  const ids = rows.map((r) => r.comic);
  const comics = ids.length ? await Comic.find({ _id: { $in: ids } }).lean() : [];
  const byId = new Map(comics.map((c) => [String(c._id), c]));

  // 漫画已被真删除：保留书架记录，返回占位漫画，前端展示「已被删除」且仅可移出书架
  const items = rows.map((r) => {
    const c = byId.get(String(r.comic));
    if (c && !c.deleted) return { ...r, comic: c };
    return {
      ...r,
      comic: {
        _id: String(r.comic),
        title: r.comicTitle || '该漫画已被删除',
        cover: r.comicCover || '',
        author: '',
        description: '',
        region: '',
        status: '',
        rating: 0,
        ratingCount: 0,
        views: 0,
        favorites: 0,
        chapterCount: 0,
        latestChapter: '',
        categories: [],
        tags: [],
        sourceId: '',
        deleted: true,
      },
    };
  });
  res.json({ items });
});

/** 加入 / 更新书架（upsert） */
router.post('/', async (req: AuthRequest, res: Response) => {
  const { comicId, status } = req.body || {};
  if (!mongoose.isValidObjectId(String(comicId))) {
    return res.status(400).json({ message: '漫画 ID 不合法' });
  }
  const comic = await Comic.findById(comicId);
  if (!comic) return res.status(404).json({ message: '漫画不存在' });

  const nextStatus = SHELF_STATUS.includes(status as never) ? String(status) : 'want';
  const existed = await BookShelf.findOne({ user: req.userId, comic: comicId });

  const doc = await BookShelf.findOneAndUpdate(
    { user: req.userId, comic: comicId },
    { $set: { status: nextStatus }, $setOnInsert: { lastChapterIndex: 0, lastPage: 0, progress: 0 } },
    { new: true, upsert: true },
  );

  if (!existed) {
    await Comic.updateOne({ _id: comicId }, { $inc: { favorites: 1 } }, { timestamps: false });
  }
  res.json({ item: doc, added: !existed });
});

/** 更新阅读进度 / 状态 */
router.patch('/:comicId', async (req: AuthRequest, res: Response) => {
  const { comicId } = req.params;
  const { status, lastChapterId, lastChapterIndex, lastPage, progress } = req.body || {};
  const update: Record<string, unknown> = {};
  if (SHELF_STATUS.includes(status as never)) update.status = String(status);
  if (lastChapterId !== undefined) update.lastChapterId = lastChapterId || null;
  if (lastChapterIndex !== undefined) update.lastChapterIndex = Number(lastChapterIndex) || 0;
  if (lastPage !== undefined) update.lastPage = Number(lastPage) || 0;
  if (progress !== undefined) update.progress = Math.min(100, Math.max(0, Number(progress) || 0));

  const doc = await BookShelf.findOneAndUpdate(
    { user: req.userId, comic: comicId },
    { $set: update },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  res.json({ item: doc });
});

/** 移出书架 */
router.delete('/:comicId', async (req: AuthRequest, res: Response) => {
  await BookShelf.deleteOne({ user: req.userId, comic: req.params.comicId });
  await Comic.updateOne({ _id: req.params.comicId }, { $inc: { favorites: -1 } }, { timestamps: false });
  res.json({ ok: true });
});

/** 继续阅读：返回上次进度对应的章节 */
router.get('/:comicId/resume', async (req: AuthRequest, res: Response) => {
  const shelf = await BookShelf.findOne({ user: req.userId, comic: req.params.comicId });
  if (!shelf) return res.json({ chapterId: null });
  let chapter = shelf.lastChapterId
    ? await Chapter.findById(shelf.lastChapterId)
    : await Chapter.findOne({ comic: req.params.comicId, index: shelf.lastChapterIndex });
  if (!chapter) chapter = await Chapter.findOne({ comic: req.params.comicId }).sort({ index: 1 });
  return res.json({
    chapterId: chapter ? String(chapter._id) : null,
    page: shelf.lastPage || 0,
    status: shelf.status,
  });
});

export default router;
