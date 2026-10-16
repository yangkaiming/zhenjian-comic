/**
 * 清理「只有一章」的漫画数据：漫画本体 + 其全部章节一并删除，
 * 并级联清理关联记录（评论含楼中楼回复、阅读历史、书架记录），避免残留脏数据。
 *
 * 判定以 Chapter 集合中该漫画的实际章节文档数为准（= 1），
 * 不依赖可能与实际不一致的 Comic.chapterCount 字段。
 *
 * 用法：
 *   npm run purge:single           # 预览清单，确认后删除
 *   npm run purge:single -- --dry  # 只统计不删库
 *   npm run purge:single -- --yes  # 跳过确认直接删除
 */
import mongoose from 'mongoose';
import { createInterface } from 'node:readline/promises';
import { config } from '../config';
import { BookShelf } from '../models/BookShelf';
import { Chapter } from '../models/Chapter';
import { Comic } from '../models/Comic';
import { Comment } from '../models/Comment';
import { History } from '../models/History';

/** 预览清单最多打印多少条 */
const PREVIEW_LIMIT = 30;

async function main() {
  const dry = process.argv.includes('--dry');
  const skipConfirm = process.argv.includes('--yes');

  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000 });

  // 生产环境属破坏性操作，必须显式加--yes 才放行
  if (config.isProdData && !dry && !skipConfirm) {
    console.error('[purge] 线上数据环境下禁止交互式删除，请显式加 --yes 确认。');
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`[purge] 目标数据库：${config.isProdData ? '线上库' : '测试库'}`);

  // 按章节表实际数量分组，筛出章节数 = 1 的漫画 id
  const groups = await Chapter.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
    { $group: { _id: '$comic', count: { $sum: 1 } } },
    { $match: { count: 1 } },
  ]);
  const comicIds = groups.map((g) => g._id);

  if (comicIds.length === 0) {
    console.log('[purge] 未发现章节数为 1 的漫画，无需清理');
    await mongoose.disconnect();
    return;
  }

  const targets = await Comic.find({ _id: { $in: comicIds } }, { title: 1, chapterCount: 1, views: 1 })
    .lean()
    .sort({ views: -1 });

  // 章节还在但漫画本体已缺失的孤儿数据（历史上被手工删过漫画）
  const foundIds = new Set(targets.map((t) => String(t._id)));
  const orphanIds = comicIds.filter((id) => !foundIds.has(String(id)));

  const chapterTotal = await Chapter.countDocuments({ comic: { $in: comicIds } });
  const commentTotal = await Comment.countDocuments({ comic: { $in: comicIds } });
  const historyTotal = await History.countDocuments({ comic: { $in: comicIds } });
  const shelfTotal = await BookShelf.countDocuments({ comic: { $in: comicIds } });

  console.log(`[purge] 待清理漫画 ${comicIds.length} 部（其中漫画本体已缺失的孤儿章节 ${orphanIds.length} 部）`);
  console.log(`[purge] 关联数据：章节 ${chapterTotal} 条、评论 ${commentTotal} 条、历史 ${historyTotal} 条、书架 ${shelfTotal} 条`);
  targets.slice(0, PREVIEW_LIMIT).forEach((t, i) => {
    console.log(`  ${String(i + 1).padStart(3)}. ${t.title}（章节字段 ${t.chapterCount} / 浏览 ${t.views}）`);
  });
  if (targets.length > PREVIEW_LIMIT) console.log(`  ... 其余 ${targets.length - PREVIEW_LIMIT} 部省略`);

  if (dry) {
    console.log('[purge] dry-run 完成，未删除任何数据');
    await mongoose.disconnect();
    return;
  }

  if (!skipConfirm) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(`确认删除以上 ${comicIds.length} 部漫画及其章节/关联数据？输入 yes 继续：`);
    rl.close();
    if (answer.trim().toLowerCase() !== 'yes') {
      console.log('[purge] 已取消，未删除任何数据');
      await mongoose.disconnect();
      return;
    }
  }

  // 楼中楼回复与顶层评论同属一个 comic，按 comic 删除即可一并清掉
  const delChapters = await Chapter.deleteMany({ comic: { $in: comicIds } });
  const delComments = await Comment.deleteMany({ comic: { $in: comicIds } });
  const delHistory = await History.deleteMany({ comic: { $in: comicIds } });
  const delShelf = await BookShelf.deleteMany({ comic: { $in: comicIds } });
  const delComics = await Comic.deleteMany({ _id: { $in: comicIds } });

  console.log(
    `[purge] 完成：删除漫画 ${delComics.deletedCount} 部、章节 ${delChapters.deletedCount} 条、` +
      `评论 ${delComments.deletedCount} 条、历史 ${delHistory.deletedCount} 条、书架 ${delShelf.deletedCount} 条`,
  );
  console.log(`[purge] 当前剩余漫画 ${await Comic.countDocuments({})} 部`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error('[purge] 失败:', (e as Error).message);
  process.exit(1);
});