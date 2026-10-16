import { Router, Request, Response } from 'express';
import { coverSvg, pageSvg, SVG_HEADERS } from '../utils/art';

const router = Router();

function num(v: unknown, def: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.round(n)));
}

router.get('/cover.svg', (req: Request, res: Response) => {
  const id = String(req.query.id || 'demo');
  const title = String(req.query.title || '帧间漫画').slice(0, 40);
  const author = String(req.query.author || '佚名').slice(0, 30);
  res.set(SVG_HEADERS);
  res.set('Cache-Control', 'public, max-age=86400');
  res.send(coverSvg(id, title, author));
});

router.get('/page.svg', (req: Request, res: Response) => {
  const id = String(req.query.id || 'demo');
  const title = String(req.query.title || '帧间漫画').slice(0, 40);
  const ch = num(req.query.ch, 1, 1, 9999);
  const p = num(req.query.p, 1, 1, 9999);
  const w = num(req.query.w, 800, 320, 2400);
  const h = num(req.query.h, 1200, 320, 4800);
  res.set(SVG_HEADERS);
  res.set('Cache-Control', 'public, max-age=86400');
  res.send(pageSvg(`${id}-${ch}`, title, `第${ch}话`, p, w, h));
});

const IMG_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36';
// 仅代理这些主机的图片，防止 /media/img 被当成开放代理（SSRF）
const ALLOWED_IMG_HOSTS = ['.mangadex.network', 'uploads.mangadex.org', '.cdndm5.com', '.6wm.top'];

/** 按目标主机推导防盗链 Referer（各图片站要求不同） */
function refererFor(target: URL): string {
  if (target.hostname.endsWith('.6wm.top')) {
    // 包子漫画图片 CDN 要求 Referer 为站点域名
    return 'https://baozimh.org/';
  }
  if (target.hostname.endsWith('.cdndm5.com')) {
    // dm5 图片 CDN 要求 Referer 为章节页：从 URL 路径 /<x>/<mid>/<cid>/<file> 或 cid 参数取章节 ID
    const cid = target.pathname.match(/\/\d+\/\d+\/(\d+)\//)?.[1] || target.searchParams.get('cid') || '';
    return cid ? `https://www.dm5.com/m${cid}/` : 'https://www.dm5.com/';
  }
  return 'https://mangadex.org/';
}

/**
 * 远程图片代理。
 * 各图片站均带防盗链（MangaDex at-home 要求 mangadex.org Referer；dm5 CDN 要求章节页 Referer），
 * 不带会返回 404，而浏览器 <img> 无法跨域伪造 Referer。因此由服务端代为取图并同源返回给前端。
 */
router.get('/img', async (req: Request, res: Response) => {
  const raw = String(req.query.u || '');
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return res.status(400).json({ message: 'bad url' });
  }
  if (target.protocol !== 'https:' || !ALLOWED_IMG_HOSTS.some((h) => target.hostname.endsWith(h))) {
    return res.status(403).json({ message: 'host not allowed' });
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    let upstream: Awaited<ReturnType<typeof fetch>>;
    try {
      upstream = await fetch(target.toString(), {
        headers: { 'User-Agent': IMG_UA, Referer: refererFor(target), Accept: 'image/*' },
        signal: ctrl.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      return res.status((err as Error).name === 'AbortError' ? 504 : 502).end();
    }
    clearTimeout(timer);
    if (!upstream.ok || !upstream.body) {
      return res.status(upstream.status || 502).end();
    }
    res.set('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
    res.set('Cache-Control', 'public, max-age=86400');
    const buf = Buffer.from(await upstream.arrayBuffer());
    return res.send(buf);
  } catch {
    return res.status(502).end();
  }
});

export default router;
