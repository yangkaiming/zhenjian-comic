import fs from 'node:fs';
import path from 'node:path';

export interface CrawledChapter {
  id: string;
  title: string;
  pages: number;
}

export interface CrawledComic {
  sourceId: string;
  title: string;
  author: string;
  description: string;
  region: string;
  status: string;
  categories: string[];
  tags: string[];
  rating: number;
  views: number;
  chapterCount: number;
  latestChapter?: string;
  /** 远程封面 URL（不落盘） */
  cover: string;
  /** 远程横幅 URL（不落盘） */
  banner: string;
  chapters?: CrawledChapter[];
}

/** 定位爬虫输出目录（开发 / 打包两种布局） */
export function crawledDir(): string | null {
  const candidates = [
    process.env.COMIC_DATA_DIR,
    path.resolve(__dirname, '../../../crawler/output'),
    path.resolve(process.cwd(), 'crawler/output'),
    path.resolve(process.cwd(), '../crawler/output'),
  ].filter(Boolean) as string[];

  for (const dir of candidates) {
    if (dir && fs.existsSync(path.join(dir, 'comics.json'))) return dir;
  }
  return null;
}

/** 读取爬虫抓到的漫画列表；没有则返回空数组（回退到内置演示数据） */
export function getCrawledComics(): CrawledComic[] {
  const dir = crawledDir();
  if (!dir) return [];
  try {
    const raw = fs.readFileSync(path.join(dir, 'comics.json'), 'utf8');
    const list = JSON.parse(raw) as CrawledComic[];
    if (!Array.isArray(list)) return [];
    return list.filter((c) => c && c.title);
  } catch (err) {
    console.warn('[data] 解析爬虫数据失败:', err);
    return [];
  }
}
