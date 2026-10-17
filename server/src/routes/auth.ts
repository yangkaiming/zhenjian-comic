import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models/User';
import { signToken, authRequired, AuthRequest } from '../middleware/auth';

const router = Router();

function publicUser(u: { _id: unknown; username: string; nickname: string; avatar: string; role?: string }) {
  return {
    id: String(u._id),
    username: u.username,
    nickname: u.nickname || u.username,
    avatar: u.avatar || '',
    role: u.role === 'admin' ? 'admin' : 'user',
  };
}

router.post('/register', async (req: Request, res: Response) => {
  const rawUsername = req.body?.username;
  const { password, nickname } = req.body || {};
  if (!rawUsername || !password) {
    return res.status(400).json({ message: '用户名和密码不能为空' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ message: '密码至少 6 位' });
  }
  const username = String(rawUsername).trim();
  if (!username) {
    return res.status(400).json({ message: '用户名不能为空' });
  }
  // 大小写不敏感查重，避免 "User" 与 "user" 被当成不同用户名
  const exists = await User.findOne({
    username: { $regex: new RegExp(`^${escapeRegExp(username)}$`, 'i') },
  });
  if (exists) return res.status(409).json({ message: '该用户名已存在' });

  try {
    const user = await User.create({
      username,
      password: bcrypt.hashSync(String(password), 8),
      nickname: String(nickname || username),
    });
    return res.json({ token: signToken(String(user._id)), user: publicUser(user) });
  } catch (err: any) {
    // 兜底：唯一索引冲突（如并发注册、trim 后与已存在用户重复）
    if (err?.code === 11000) {
      return res.status(409).json({ message: '该用户名已存在' });
    }
    throw err;
  }
});

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

router.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body || {};
  const user = await User.findOne({ username: String(username || '') });
  if (!user) return res.status(401).json({ message: '账号不存在' });
  const ok = bcrypt.compareSync(String(password || ''), user.password);
  if (!ok) return res.status(401).json({ message: '密码错误' });
  // 记录上次登录时间（不影响返回，失败也不阻断登录）
  try {
    await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
  } catch {
    /* 忽略 */
  }
  return res.json({ token: signToken(String(user._id)), user: publicUser(user) });
});

router.get('/me', authRequired, async (req: AuthRequest, res: Response) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ message: '账号不存在' });
  return res.json({ user: publicUser(user) });
});

router.patch('/profile', authRequired, async (req: AuthRequest, res: Response) => {
  const { nickname, avatar } = req.body || {};
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ message: '账号不存在' });
  if (nickname) user.nickname = String(nickname).slice(0, 24);
  if (avatar !== undefined) user.avatar = String(avatar);
  await user.save();
  return res.json({ user: publicUser(user) });
});

export default router;
