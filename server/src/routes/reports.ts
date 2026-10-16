import { Router, Request, Response } from 'express';
import { Report } from '../models/Report';
import { User } from '../models/User';
import { authRequired, adminRequired, AuthRequest } from '../middleware/auth';

const router = Router();

/** 提交举报（登录用户） */
router.post('/', authRequired, async (req: AuthRequest, res: Response) => {
  const b = (req.body || {}) as {
    type?: string; targetId?: string; comicId?: string; comicTitle?: string;
    chapterId?: string; chapterTitle?: string; reason?: string; detail?: string;
  };
  const reason = String(b.reason || '').trim();
  if (!reason) return res.status(400).json({ message: '请填写举报理由' });
  const types = ['comic', 'chapter', 'comment', 'other'];
  const type = types.includes(String(b.type)) ? (b.type as string) : 'other';

  const reporter = await User.findById(req.userId).select('nickname username').lean();
  const created = await Report.create({
    type,
    targetId: String(b.targetId || '').slice(0, 64),
    comicId: String(b.comicId || '').slice(0, 64),
    comicTitle: String(b.comicTitle || '').slice(0, 120),
    chapterId: String(b.chapterId || '').slice(0, 64),
    chapterTitle: String(b.chapterTitle || '').slice(0, 120),
    reporter: req.userId,
    reporterName: reporter?.nickname || reporter?.username || '匿名用户',
    reason: reason.slice(0, 120),
    detail: String(b.detail || '').slice(0, 1000),
    status: 'pending',
  });
  return res.json({ ok: true, id: String(created._id) });
});

/** 举报列表（仅管理员） */
router.get('/', adminRequired, async (req: Request, res: Response) => {
  const status = String(req.query.status || '').trim();
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const filter: Record<string, unknown> = {};
  if (status === 'pending' || status === 'resolved') filter.status = status;

  const [items, total, pending, resolved] = await Promise.all([
    Report.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Report.countDocuments(filter),
    Report.countDocuments({ status: 'pending' }),
    Report.countDocuments({ status: 'resolved' }),
  ]);
  return res.json({
    items: items.map((r) => ({
      _id: String(r._id),
      type: r.type,
      targetId: r.targetId,
      comicId: r.comicId,
      comicTitle: r.comicTitle,
      chapterId: r.chapterId,
      chapterTitle: r.chapterTitle,
      reporterName: r.reporterName,
      reason: r.reason,
      detail: r.detail,
      status: r.status,
      resolvedAt: r.resolvedAt,
      createdAt: r.createdAt,
    })),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    pending,
    resolved,
  });
});

/** 更新举报状态（仅管理员）：标记已处理 / 重新打开 */
router.patch('/:id', adminRequired, async (req: Request, res: Response) => {
  const status = String((req.body || {}).status || '');
  if (status !== 'pending' && status !== 'resolved') {
    return res.status(400).json({ message: 'status 非法' });
  }
  const updated = await Report.findByIdAndUpdate(
    req.params.id,
    { $set: { status, resolvedAt: status === 'resolved' ? new Date() : null } },
    { new: true },
  ).lean();
  if (!updated) return res.status(404).json({ message: '举报不存在' });
  return res.json({ ok: true });
});

/** 删除举报（仅管理员） */
router.delete('/:id', adminRequired, async (req: Request, res: Response) => {
  await Report.deleteOne({ _id: req.params.id });
  return res.json({ ok: true });
});

export default router;
