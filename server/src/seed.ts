import mongoose from 'mongoose';
import { Comic } from './models/Comic';
import { Chapter } from './models/Chapter';
import { Comment } from './models/Comment';
import { SEED_COMICS, CHAPTER_SUBTITLES } from './data/comics';
import { getCrawledComics } from './data/crawled';
import { buildCoverUrl, buildBannerUrl } from './services/media';
import { localizeComic } from './services/translate';

/** 统一后的种子数据结构：优先使用爬虫抓到的真实漫画，缺失字段回退到内置数据 */
interface SeedItem {
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
  recommend: number;
  /** MangaDex 漫画 ID */
  sourceId?: string;
  /** 远程封面 URL（空则回退到动态生成的 SVG） */
  cover?: string;
  banner?: string;
  /** MangaDex 章节列表（有则页图走网络） */
  chapters?: Array<{ id: string; title: string; pages: number }>;
}

function buildSeedItems(): { items: SeedItem[]; fromCrawler: boolean } {
  const crawled = getCrawledComics();
  if (!crawled.length) return { items: SEED_COMICS, fromCrawler: false };

  const items: SeedItem[] = crawled.map((c, i) => ({
    title: c.title,
    author: c.author || '佚名',
    description: c.description || '暂无简介',
    region: c.region,
    status: c.status,
    categories: c.categories?.length ? c.categories : ['热血'],
    tags: c.tags?.length ? c.tags : [],
    rating: Number(c.rating) || 8,
    views: Number(c.views) || 1000 + i * 37,
    chapterCount: Math.max(1, Number(c.chapterCount) || 20),
    recommend: 100 - i,
    sourceId: c.sourceId,
    cover: c.cover || '',
    banner: c.banner || '',
    chapters: c.chapters || [],
  }));
  return { items, fromCrawler: true };
}

function rngFactory(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashCode(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const DEMO_COMMENTS = [
  '剧情节奏太舒服了，一口气追完！',
  '画风稳定，分镜很有电影感，强推。',
  '这本真的被低估了，评论区人好少。',
  '作者更新很勤，追更完全没有压力。',
  '看完最新一话我整个人都坐直了。',
  '人物塑造很立体，反派也不是工具人。',
  '适合深夜慢慢看，很治愈。',
];

export async function seedDatabase(options: { force?: boolean } = {}): Promise<void> {
  const count = await Comic.estimatedDocumentCount();
  if (count > 0 && !options.force) {
    console.log('[seed] 数据库已有数据，跳过初始化');
    return;
  }

  const { items: seedItems, fromCrawler } = buildSeedItems();
  console.log(
    fromCrawler
      ? `[seed] 使用爬虫数据（${seedItems.length} 部真实漫画）`
      : `[seed] 未找到爬虫数据，使用内置演示数据（${seedItems.length} 部）`,
  );
  await Promise.all([
    Comic.deleteMany({}),
    Chapter.deleteMany({}),
    Comment.deleteMany({}),
  ]);

  for (const item of seedItems) {
    // 英译中：非中文标题/简介先转成中文再入库（未配置 LLM 则原样保留）
    const loc = await localizeComic(item.title, item.description);
    const title = loc.title || item.title;
    const description = loc.description || item.description;
    const rng = rngFactory(hashCode(title));
    const created = await Comic.create({
      title,
      author: item.author,
      description,
      region: item.region,
      status: item.status,
      categories: item.categories,
      tags: item.tags,
      rating: item.rating,
      ratingCount: Math.round(200 + rng() * 4000),
      views: item.views,
      favorites: Math.round(item.views / 60),
      chapterCount: item.chapterCount,
      latestChapter: `第${item.chapterCount}话`,
      recommend: item.recommend,
      sourceId: item.sourceId || '',
    });

    const comicId = String(created._id);
    // 有远程封面就用远程 URL，否则退回动态生成的 SVG
    await Comic.updateOne(
      { _id: created._id },
      {
        $set: {
          cover: item.cover || buildCoverUrl(comicId, item.title, item.author),
          banner: item.banner || buildBannerUrl(comicId, item.title),
        },
      },
    );

    const chapters = [];
    const now = Date.now();
    if (item.chapters && item.chapters.length) {
      // 爬虫数据：直接用 MangaDex 章节 ID，页图按需从网上取
      item.chapters.forEach((c, i) => {
        chapters.push({
          comic: created._id,
          index: i + 1,
          title: c.title,
          pageCount: c.pages || 20,
          sourceId: c.id,
          sourcePages: [],
          releasedAt: new Date(now - (item.chapters!.length - i) * 86400000),
        });
      });
    } else {
      // 内置演示数据：生成章节，页图用动态 SVG 占位
      for (let i = 1; i <= item.chapterCount; i += 1) {
        const sub = i % 7 === 0 ? ` ${CHAPTER_SUBTITLES[Math.floor(rng() * CHAPTER_SUBTITLES.length)]}` : '';
        chapters.push({
          comic: created._id,
          index: i,
          title: `第${i}话${sub}`,
          pageCount: 10 + Math.floor(rng() * 12),
          releasedAt: new Date(now - (item.chapterCount - i) * 86400000 - Math.floor(rng() * 6) * 3600000),
        });
      }
    }
    await Chapter.insertMany(chapters);

    const commentCount = 3 + Math.floor(rng() * 5);
    const comments = [];
    for (let i = 0; i < commentCount; i += 1) {
      comments.push({
        comic: created._id,
        user: new mongoose.Types.ObjectId(),
        nickname: ['漫迷小帧', '深夜追更党', '阿宅本人', '橘子汽水', '路人甲'][i % 5],
        content: DEMO_COMMENTS[Math.floor(rng() * DEMO_COMMENTS.length)],
        score: Math.round((item.rating + (rng() - 0.5) * 1.2) * 10) / 10,
        likes: Math.floor(rng() * 260),
        createdAt: new Date(now - Math.floor(rng() * 20) * 86400000),
      });
    }
    await Comment.insertMany(comments);
    console.log(`[seed] 《${title}》 章节 ${item.chapterCount} 话`);
  }

  console.log('[seed] 完成');
}
