import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { Comment } from '../models/Comment';
import { Comic } from '../models/Comic';
import { User } from '../models/User';
import { authRequired, authOptional, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', authOptional, async (req: AuthRequest, res: Response) => {
  const comicId = String(req.query.comicId || '');
  if (!mongoose.isValidObjectId(comicId)) return res.json({ items: [] });
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  // 顶层评论 + 其回复，前端据此组装楼中楼
  const top = await Comment.find({ comic: comicId, parent: null }).sort({ createdAt: -1 }).limit(limit).lean();
  const topIds = top.map((c) => c._id);
  const replies = topIds.length
    ? await Comment.find({ comic: comicId, parent: { $in: topIds } }).sort({ createdAt: 1 }).lean()
    : [];
  const uid = req.userId;
  const items = [...top, ...replies].map((c) => {
    const { likedBy, ...rest } = c as unknown as { likedBy?: Array<{ toString(): string }> } & Record<string, unknown>;
    const liked = !!uid && Array.isArray(likedBy) && likedBy.some((id) => String(id) === String(uid));
    return { ...rest, liked };
  });
  res.json({ items });
});

router.post('/', authRequired, async (req: AuthRequest, res: Response) => {
  const { comicId, content, score, parent, replyToName } = req.body || {};
  if (!mongoose.isValidObjectId(String(comicId))) {
    return res.status(400).json({ message: '漫画 ID 不合法' });
  }
  const text = String(content || '').trim();
  if (!text) return res.status(400).json({ message: '评论内容不能为空' });
  const parentId = parent && mongoose.isValidObjectId(String(parent)) ? new mongoose.Types.ObjectId(String(parent)) : null;

  const user = await User.findById(req.userId).lean();
  const doc = await Comment.create({
    comic: comicId,
    user: req.userId,
    nickname: user?.nickname || user?.username || '匿名漫迷',
    content: text.slice(0, 500),
    score: Math.min(10, Math.max(0, Number(score) || 8)),
    parent: parentId,
    replyToName: parentId ? String(replyToName || '').slice(0, 24) : '',
  });

  // 重算评分（仅统计顶层评论，回复不计入均分）
  const agg = await Comment.aggregate([
    { $match: { comic: new mongoose.Types.ObjectId(String(comicId)), parent: null } },
    { $group: { _id: '$comic', avg: { $avg: '$score' }, count: { $sum: 1 } } },
  ]);
  if (agg.length) {
    // 评分重算不更新 updatedAt（「更新」排序只反映新增抓取/章节更新）
    await Comic.updateOne(
      { _id: comicId },
      { $set: { rating: Number(agg[0].avg.toFixed(1)) || 8, ratingCount: agg[0].count } },
      { timestamps: false },
    );
  }

  res.json({ item: doc });
});

router.post('/:id/like', authRequired, async (req: AuthRequest, res: Response) => {
  const comment = await Comment.findById(req.params.id);
  if (!comment) return res.status(404).json({ message: '评论不存在' });
  const uid = req.userId as string;
  const already = comment.likedBy.some((id) => String(id) === String(uid));
  if (already) {
    comment.likedBy = comment.likedBy.filter((id) => String(id) !== String(uid));
    comment.likes = Math.max(0, comment.likes - 1);
  } else {
    comment.likedBy.push(new mongoose.Types.ObjectId(uid));
    comment.likes += 1;
  }
  await comment.save();
  res.json({ likes: comment.likes, liked: !already });
});

router.delete('/:id', authRequired, async (req: AuthRequest, res: Response) => {
  const comment = await Comment.findById(req.params.id).select('user').lean();
  if (!comment) return res.json({ ok: true });
  const isOwner = String(comment.user) === String(req.userId);
  let isAdmin = false;
  if (!isOwner) {
    const me = await User.findById(req.userId).select('role').lean();
    isAdmin = me?.role === 'admin';
  }
  if (!isOwner && !isAdmin) return res.status(403).json({ message: '只能删除自己的评论' });
  await Comment.deleteOne({ _id: req.params.id });
  // 级联删除该评论下的回复
  await Comment.deleteMany({ parent: req.params.id });
  res.json({ ok: true });
});

export default router;
