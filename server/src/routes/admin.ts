import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { Comic } from '../models/Comic';
import { Setting } from '../models/Setting';
import { adminRequired, AuthRequest } from '../middleware/auth';

const router = Router();

const PICKS_KEY = 'editorPicks';

async function getPicks(): Promise<string[]> {
  const doc = await Setting.findOne({ key: PICKS_KEY }).lean();
  const v = doc?.value;
  return Array.isArray(v) ? (v as string[]).filter((x) => typeof x === 'string') : [];
}

/** 编辑推荐列表（有序）：返回按存储顺序展开的漫画 */
router.get('/recommend', adminRequired, async (_req: AuthRequest, res: Response) => {
  const ids = await getPicks();
  const items = ids.length
    ? await Comic.find({ _id: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) }, deleted: { $ne: true } }).lean()
    : [];
  const byId = new Map(items.map((c) => [String(c._id), c]));
  // 按存储顺序返回，剔除已被删除/无效的
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as typeof items;
  res.json({ items: ordered });
});

/** 保存编辑推荐列表（有序 id 数组） */
router.put('/recommend', adminRequired, async (req: AuthRequest, res: Response) => {
  const ids = Array.isArray(req.body?.ids) ? (req.body.ids as string[]).filter((x) => mongoose.isValidObjectId(String(x))) : [];
  const unique = Array.from(new Set(ids.map(String))).slice(0, 12);
  await Setting.updateOne({ key: PICKS_KEY }, { $set: { value: unique } }, { upsert: true });
  const items = unique.length
    ? await Comic.find({ _id: { $in: unique.map((id) => new mongoose.Types.ObjectId(id)) }, deleted: { $ne: true } }).lean()
    : [];
  const byId = new Map(items.map((c) => [String(c._id), c]));
  const ordered = unique.map((id) => byId.get(id)).filter(Boolean) as typeof items;
  res.json({ items: ordered });
});

export default router;
