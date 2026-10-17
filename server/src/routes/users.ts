import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { User } from '../models/User';
import { Comment } from '../models/Comment';
import { BookShelf } from '../models/BookShelf';
import { History } from '../models/History';
import { adminRequired, AuthRequest, ONLINE_THRESHOLD_MS } from '../middleware/auth';

const router = Router();

function publicUser(u: {
  _id: unknown;
  username: string;
  nickname: string;
  avatar: string;
  role: string;
  createdAt?: Date;
  lastActiveAt?: Date;
  lastLoginAt?: Date;
}) {
  const lastActive = u.lastActiveAt ? new Date(u.lastActiveAt) : null;
  const online = !!lastActive && Date.now() - lastActive.getTime() < ONLINE_THRESHOLD_MS;
  return {
    id: String(u._id),
    username: u.username,
    nickname: u.nickname || u.username,
    avatar: u.avatar || '',
    role: u.role === 'admin' ? 'admin' : 'user',
    createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : '',
    lastActiveAt: lastActive ? lastActive.toISOString() : '',
    lastLoginAt: u.lastLoginAt ? new Date(u.lastLoginAt).toISOString() : '',
    online,
  };
}

/** 用户列表（管理员）：支持按用户名/昵称搜索，分页 */
router.get('/', adminRequired, async (req: AuthRequest, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const q = String(req.query.q || '').trim();
  const filter: Record<string, unknown> = {};
  if (q) {
    filter.$or = [
      { username: { $regex: q, $options: 'i' } },
      { nickname: { $regex: q, $options: 'i' } },
    ];
  }
  const onlineOnly = req.query.online === '1' || req.query.online === 'true';
  if (onlineOnly) {
    // 仅返回最近 ONLINE_THRESHOLD_MS 内有活动的用户
    filter.lastActiveAt = { $gte: new Date(Date.now() - ONLINE_THRESHOLD_MS) };
  }
  const total = await User.countDocuments(filter);
  const docs = await User.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();
  res.json({
    items: docs.map(publicUser),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});

/** 修改用户角色（管理员）：禁止把自己降级为普通用户，避免锁死管理员 */
router.patch('/:id/role', adminRequired, async (req: AuthRequest, res: Response) => {
  const role = String(req.body?.role || '');
  if (role !== 'admin' && role !== 'user') return res.status(400).json({ message: '角色不合法' });
  if (String(req.params.id) === String(req.userId) && role !== 'admin') {
    return res.status(400).json({ message: '不能取消自己的管理员权限' });
  }
  const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true }).lean();
  if (!user) return res.status(404).json({ message: '用户不存在' });
  res.json({ user: publicUser(user) });
});

/** 删除用户（管理员）：级联清理其评论、书架、历史；禁止删除自己 */
router.delete('/:id', adminRequired, async (req: AuthRequest, res: Response) => {
  if (String(req.params.id) === String(req.userId)) {
    return res.status(400).json({ message: '不能删除当前登录的账号' });
  }
  const user = await User.findById(req.params.id);
  if (!user) return res.json({ ok: true });
  await User.deleteOne({ _id: req.params.id });
  await Comment.deleteMany({ user: req.params.id });
  await BookShelf.deleteMany({ user: req.params.id });
  await History.deleteMany({ user: req.params.id });
  res.json({ ok: true });
});

export default router;
