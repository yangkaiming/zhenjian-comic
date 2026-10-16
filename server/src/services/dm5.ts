/**
 * 动漫屋（dm5.com）数据抓取。
 *
 * 链路（2026-10 实测）：
 *  搜索     GET /search?title=关键词         -> /manhua-<slug>/ 链接（dm5 自带搜索较模糊）
 *  漫画页   GET /manhua-<slug>/              -> DM5_COMIC_MID、标题、封面、章节列表（#chapterlistload，静态约前 290 话）
 *  章节页   GET /m<cid>/                     -> DM5_CID/DM5_MID/DM5_IMAGE_COUNT/DM5_VIEWSIGN(_DT)
 *  取图     GET /chapterfun.ashx?<签名>       -> packer 混淆 JS，解包得图片 URL 数组（按页扫描后去重排序）
 *  图片 CDN *.cdndm5.com 防盗链：Referer 必须是章节页 /m<cid>/（见 media.ts 代理）
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36';
const BASE = 'https://www.dm5.com';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 单次请求超时：防止 dm5 无响应时把服务端章节接口挂死 */
const FETCH_TIMEOUT = 10000;

async function get(url: string, referer = `${BASE}/`): Promise<string> {
  for (let i = 0; i < 3; i += 1) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Referer: referer }, signal: ctrl.signal });
      if (r.ok) {
        const t = await r.text();
        // dm5 偶发返回精简页（无 DM5_COMIC_MID），只要含关键标记或最后一次尝试就采用
        if (t.includes('DM5_COMIC_MID') || t.length > 100000 || i === 2) return t;
      }
    } catch {
      /* 重试 */
    } finally {
      clearTimeout(timer);
    }
    await sleep(800 * (i + 1));
  }
  return '';
}

/** 搜索结果里的导航链接，需剔除 */
const NAV_SLUGS = new Set([
  'new', 'rank', 'list', 'jp', 'comment', 'update', 'category', 'vip', 'comic',
  'manhua', 'home', 'search', 'comichistory', 'banben-days', 'gengxin', 'paihang',
]);

/** 应用分类体系里的中文题材 */
const CN_GENRES = [
  '热血', '冒险', '搞笑', '恋爱', '奇幻', '推理', '科幻', '治愈', '古风', '校园',
  '都市', '战斗', '竞技', '悬疑', '日常', '音乐', '美食', '职场', '历史', '神鬼',
];

/** 从漫画页提取中文题材（页面本身就是中文，直接命中分类体系） */
function pickGenres(html: string): string[] {
  const m = html.match(/类型[：:][\s\S]{0,240}?<\/(?:p|div)>/);
  if (!m) return ['热血'];
  const found = CN_GENRES.filter((g) => m[0].includes(g));
  return found.length ? found.slice(0, 3) : ['热血'];
}

export interface Dm5Comic {
  slug: string;
  mid: string;
  title: string;
  cover: string;
  description: string;
  author: string;
  /** completed=完结，其它按连载 */
  status: string;
  /** 中文题材（已映射到应用分类体系） */
  genres: string[];
  chapters: Array<{ cid: string; title: string }>;
}

export interface Dm5SearchResult {
  slug: string;
  title: string;
}

/** 搜索漫画，返回 {slug, title} 列表（dm5 自带搜索较模糊，调用方需自行挑最佳匹配） */
export async function dm5Search(keyword: string, limit = 10): Promise<Dm5SearchResult[]> {
  const html = await get(`${BASE}/search?title=${encodeURIComponent(keyword)}`);
  const i = html.indexOf('mh-list');
  const seg = i >= 0 ? html.slice(i, i + 12000) : '';
  const seen = new Set<string>();
  const results: Dm5SearchResult[] = [];
  for (const m of seg.matchAll(/<a[^>]*href="\/manhua-([\w\-]+)\/"[^>]*>([\s\S]*?)<\/a>/g)) {
    const slug = m[1];
    if (NAV_SLUGS.has(slug) || seen.has(slug)) continue;
    seen.add(slug);
    const title = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    results.push({ slug, title });
  }
  return results.slice(0, limit);
}

/**
 * 在搜索结果里挑与关键词最匹配的一项。
 * 规则：标题/关键词互为子串视为强匹配；否则按中文字符重合度打分，>=0.6 才采纳。
 * dm5 搜索较模糊，匹配不上返回 null，避免抓错漫画（如把山海逆战当别的漫画）。
 */
export function pickBestMatch(keyword: string, results: Dm5SearchResult[]): Dm5SearchResult | null {
  const k = (keyword || '').trim();
  if (!k || !results.length) return null;
  const kChars = new Set(k.split(''));
  let best: Dm5SearchResult | null = null;
  let bestScore = 0;
  for (const r of results) {
    const t = r.title;
    let score = 0;
    if (t.includes(k) || k.includes(t)) score = 1;
    else {
      let hit = 0;
      const tChars = new Set(t.split(''));
      for (const ch of kChars) if (tChars.has(ch)) hit += 1;
      score = kChars.size ? hit / kChars.size : 0;
    }
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  if (best && (best.title.includes(k) || k.includes(best.title) || bestScore >= 0.6)) return best;
  return null;
}

/** 最近更新（按条数抓取时的发现源） */
export async function dm5Discover(limit = 20): Promise<string[]> {
  const html = await get(`${BASE}/manhua-new/`);
  const slugs = [...new Set([...html.matchAll(/href="\/manhua-([\w\-]+)\/"/g)].map((m) => m[1]))].filter(
    (s) => !NAV_SLUGS.has(s),
  );
  return slugs.slice(0, limit);
}

/** 漫画详情 + 章节列表（默认取前 maxChapters 话，静态页约前 290 话） */
export async function dm5Comic(slug: string, maxChapters = 120): Promise<Dm5Comic | null> {
  const html = await get(`${BASE}/manhua-${slug}/`);
  const mid = (html.match(/DM5_COMIC_MID\s*=\s*(\d+)/) || [])[1];
  if (!mid) return null;
  const title = (html.match(/DM5_COMIC_MNAME="([^"]*)"/) || [])[1] || slug;
  // 封面：页面里路径含 /<mid>/ 的第一张 cdndm5 图即本漫画封面（推荐位是其它漫画的 mid）
  const cover =
    (html.match(new RegExp(`(https?://[a-z0-9]+\\.cdndm5\\.com/[^"'\\s]*/${mid}/[^"'\\s]+\\.jpg)`)) || [])[1] || '';
  const description = (html.match(/<meta content="([^"]*)" name="Description"/) || [])[1] || '';
  // 简介：meta 里是“动漫屋提供XX漫画…XX漫画简介：真正的简介…”，截取“漫画简介：”之后
  const introMatch = description.match(/漫画简介：(.+)$/);
  const intro = (introMatch ? introMatch[1] : description).replace(/&[a-z]+;/g, '');
  const author = (html.match(/<p class="subtitle">作者：<a[^>]*>([^<]+)<\/a>/) || [])[1] || '佚名';
  const status = (html.match(/状态：<span>([^<]+)<\/span>/) || [])[1] || '';
  const genres = pickGenres(html);

  // 章节列表在 #chapterlistload 区块内（升序）
  const start = html.indexOf('id="chapterlistload"');
  const block = start >= 0 ? html.slice(start, start + 500000) : '';
  const seen = new Set<string>();
  const chapters: Array<{ cid: string; title: string }> = [];
  for (const m of block.matchAll(/href="(\/m(\d+)\/)"[^>]*title="([^"]*)"/g)) {
    const cid = m[2];
    if (seen.has(cid)) continue;
    seen.add(cid);
    chapters.push({ cid, title: (m[3] || '').trim() || `第${chapters.length + 1}话` });
  }
  return { slug, mid, title, cover, description: intro, author, status, genres, chapters: chapters.slice(0, maxChapters) };
}

export interface Dm5PagesResult {
  pages: string[];
  /** 是否为付费/锁定章节（dm5 不公开页图，无法抓取） */
  locked: boolean;
}

/** 章节全部页图 URL（按页扫描 chapterfun.ashx，解包去重后按文件名序号排序） */
export async function dm5ChapterPages(cid: string): Promise<Dm5PagesResult> {
  const html = await get(`${BASE}/m${cid}/`);
  // 付费章节：页面带 #view-chapterpay-btn 且不含 VIEWSIGN，dm5 不公开页图
  const locked = html.includes('view-chapterpay-btn');
  const sign = (html.match(/DM5_VIEWSIGN="([0-9a-f]+)"/) || [])[1];
  const dt = (html.match(/DM5_VIEWSIGN_DT="([^"]+)"/) || [])[1];
  const mid = (html.match(/DM5_MID=(\d+)/) || [])[1];
  const count = Number((html.match(/DM5_IMAGE_COUNT=(\d+)/) || [])[1] || 0);
  if (!sign || !dt || !mid || !count) return { pages: [], locked };

  const all: string[] = [];
  // 限制上限，避免异常页数把整章抓取拖死
  const max = Math.min(count, 250);
  for (let page = 1; page <= max; page += 1) {
    const qs = new URLSearchParams({
      cid, page: String(page), key: '', language: '1', gtk: '6',
      _cid: cid, _mid: mid, _dt: dt, _sign: sign,
    });
    // 逐页请求：失败即跳过，不重试（外层已按页循环），单页最多 8s
    const body = await getOnce(`${BASE}/chapterfun.ashx?${qs}`, `${BASE}/m${cid}-p${page}/`);
    if (!body) continue;
    try {
      // 响应是 packer 混淆 JS，赋值给局部变量 d
      // eslint-disable-next-line no-new-func
      const fn = new Function(`${body}; return typeof d !== 'undefined' ? d : [];`);
      const arr = fn();
      if (Array.isArray(arr)) all.push(...arr.filter((u) => typeof u === 'string'));
    } catch {
      /* 单页解包失败跳过 */
    }
  }
  // 去重 + 按文件名序号排序（如 /34/33991/518896/14_4664.jpg -> 14）
  const uniq = [...new Set(all)];
  uniq.sort((a, b) => {
    const na = Number((a.match(/\/(\d+)_[\w]+\.jpg/) || [])[1] || 0);
    const nb = Number((b.match(/\/(\d+)_[\w]+\.jpg/) || [])[1] || 0);
    return na - nb;
  });
  return { pages: uniq, locked: false };
}

/** 单次请求（不重试，短超时）：用于逐页 chapterfun，失败即跳过，避免把整章拖死 */
async function getOnce(url: string, referer = `${BASE}/`): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Referer: referer }, signal: ctrl.signal });
    if (!r.ok) return '';
    return await r.text();
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}
