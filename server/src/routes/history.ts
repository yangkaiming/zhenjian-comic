import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { History } from '../models/History';
import { Chapter } from '../models/Chapter';
import { authRequired, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authRequired);

/** 阅读历史（按最近阅读排序） */
router.get('/', async (req: AuthRequest, res: Response) => {
  const limit = Math.min(60, Math.max(1, Number(req.query.limit) || 20));
  const items = await History.find({ user: req.userId })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .populate('comic')
    .lean();
  res.json({ items: items.filter((i) => i.comic) });
});

/** 上报阅读进度 */
router.post('/', async (req: AuthRequest, res: Response) => {
  const { comicId, chapterId, chapterIndex, page } = req.body || {};
  if (!mongoose.isValidObjectId(String(comicId))) {
    return res.status(400).json({ message: '漫画 ID 不合法' });
  }
  const update: Record<string, unknown> = {
    chapterIndex: Number(chapterIndex) || 0,
    page: Number(page) || 0,
  };
  if (chapterId && mongoose.isValidObjectId(String(chapterId))) {
    update.chapter = chapterId;
  } else {
    const ch = await Chapter.findOne({ comic: comicId, index: Number(chapterIndex) || 0 });
    update.chapter = ch ? ch._id : null;
  }

  const doc = await History.findOneAndUpdate(
    { user: req.userId, comic: comicId },
    { $set: update },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  res.json({ item: doc });
});

router.delete('/', async (req: AuthRequest, res: Response) => {
  await History.deleteMany({ user: req.userId });
  res.json({ ok: true });
});

export default router;
