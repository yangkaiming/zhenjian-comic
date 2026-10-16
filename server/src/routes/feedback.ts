import { Router, Request, Response } from 'express';
import { Feedback, FeedbackCategory, FeedbackStatus } from '../models/Feedback';
import { User } from '../models/User';
import { authRequired, adminRequired, AuthRequest } from '../middleware/auth';

const router = Router();

const CATEGORIES: FeedbackCategory[] = ['bug', 'suggest', 'praise', 'other'];

/** 提交反馈（登录用户） */
router.post('/', authRequired, async (req: AuthRequest, res: Response) => {
  const b = (req.body || {}) as { category?: string; content?: string; contact?: string };
  const content = String(b.content || '').trim();
  if (!content) return res.status(400).json({ message: '请填写反馈内容' });
  const category = CATEGORIES.includes(b.category as FeedbackCategory)
    ? (b.category as FeedbackCategory)
    : 'other';

  const author = await User.findById(req.userId).select('nickname username').lean();
  const created = await Feedback.create({
    user: req.userId,
    username: author?.nickname || author?.username || '匿名用户',
    category,
    content: content.slice(0, 1000),
    contact: String(b.contact || '').trim().slice(0, 120),
    status: 'pending',
  });
  return res.json({ ok: true, id: String(created._id) });
});

/** 我提交过的反馈（登录用户） */
router.get('/mine', authRequired, async (req: AuthRequest, res: Response) => {
  const items = await Feedback.find({ user: req.userId }).sort({ createdAt: -1 }).limit(50).lean();
  return res.json({
    items: items.map((f) => ({
      _id: String(f._id),
      category: f.category,
      content: f.content,
      contact: f.contact,
      status: f.status,
      reply: f.reply || '',
      repliedAt: f.repliedAt,
      createdAt: f.createdAt,
    })),
  });
});

/** 反馈列表（仅管理员） */
router.get('/', adminRequired, async (req: Request, res: Response) => {
  const status = String(req.query.status || '').trim();
  const category = String(req.query.category || '').trim();
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const filter: Record<string, unknown> = {};
  if (status === 'pending' || status === 'replied' || status === 'resolved') filter.status = status;
  if (CATEGORIES.includes(category as FeedbackCategory)) filter.category = category;

  const [items, total, pending, replied, resolved] = await Promise.all([
    Feedback.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Feedback.countDocuments(filter),
    Feedback.countDocuments({ status: 'pending' }),
    Feedback.countDocuments({ status: 'replied' }),
    Feedback.countDocuments({ status: 'resolved' }),
  ]);
  return res.json({
    items: items.map((f) => ({
      _id: String(f._id),
      user: String(f.user),
      username: f.username,
      category: f.category,
      content: f.content,
      contact: f.contact,
      status: f.status,
      reply: f.reply || '',
      repliedAt: f.repliedAt,
      createdAt: f.createdAt,
    })),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    pending,
    replied,
    resolved,
  });
});

/** 处理反馈（仅管理员）：标记状态 / 回复 */
router.patch('/:id', adminRequired, async (req: Request, res: Response) => {
  const status = String((req.body || {}).status || '');
  const reply = String((req.body || {}).reply || '').trim();
  if (status && status !== 'pending' && status !== 'replied' && status !== 'resolved') {
    return res.status(400).json({ message: 'status 非法' });
  }
  const set: Record<string, unknown> = {};
  if (status) set.status = status;
  if (reply) {
    set.reply = reply.slice(0, 1000);
    set.repliedAt = new Date();
    if (!status) set.status = 'replied';
  }
  const updated = await Feedback.findByIdAndUpdate(req.params.id, { $set: set }, { new: true }).lean();
  if (!updated) return res.status(404).json({ message: '反馈不存在' });
  return res.json({ ok: true });
});

/** 删除反馈（仅管理员） */
router.delete('/:id', adminRequired, async (req: Request, res: Response) => {
  await Feedback.deleteOne({ _id: req.params.id });
  return res.json({ ok: true });
});

export default router;
