import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { User } from '../models/User';

export interface AuthRequest extends Request {
  userId?: string;
}

export function signToken(userId: string): string {
  return jwt.sign({ uid: userId }, config.jwtSecret, { expiresIn: '30d' });
}

export async function authRequired(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    return res.status(401).json({ message: '请先登录' });
  }
  try {
    const payload = jwt.verify(token, config.jwtSecret) as { uid: string };
    const user = await User.findById(payload.uid).lean();
    if (!user) return res.status(401).json({ message: '账号不存在' });
    req.userId = String(user._id);
    return next();
  } catch {
    return res.status(401).json({ message: '登录已失效，请重新登录' });
  }
}

export async function authOptional(req: AuthRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (token) {
    try {
      const payload = jwt.verify(token, config.jwtSecret) as { uid: string };
      req.userId = payload.uid;
    } catch {
      req.userId = undefined;
    }
  }
  next();
}

/** 管理员校验：需登录且 role=admin，否则 403 */
export async function adminRequired(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ message: '请先登录' });
  try {
    const payload = jwt.verify(token, config.jwtSecret) as { uid: string };
    const user = await User.findById(payload.uid).lean();
    if (!user) return res.status(401).json({ message: '账号不存在' });
    if (user.role !== 'admin') return res.status(403).json({ message: '需要管理员权限' });
    req.userId = String(user._id);
    return next();
  } catch {
    return res.status(401).json({ message: '登录已失效，请重新登录' });
  }
}

/** 在线判定阈值：最近 N 毫秒内有活动即视为「在线」 */
export const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;

/** 写入 lastActiveAt 的节流间隔，避免每个请求都写库 */
const ACTIVITY_THROTTLE_MS = 60 * 1000;
const activityCache = new Map<string, number>();

/**
 * 全局活动埋点：任何携带有效 token 的请求都会（节流地）刷新该用户的 lastActiveAt，
 * 用于在「用户管理」中展示在线状态。无 token 或非法 token 直接跳过，不影响业务。
 */
export async function trackActivity(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return next();
  try {
    const payload = jwt.verify(token, config.jwtSecret) as { uid: string };
    const uid = payload.uid;
    const now = Date.now();
    const last = activityCache.get(uid) || 0;
    if (now - last > ACTIVITY_THROTTLE_MS) {
      activityCache.set(uid, now);
      await User.updateOne({ _id: uid }, { $set: { lastActiveAt: new Date() } }).catch(() => {});
    }
  } catch {
    /* 非法 / 过期 token 忽略，不刷新 */
  }
  next();
}
