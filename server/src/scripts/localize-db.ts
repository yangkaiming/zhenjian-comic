/**
 * 存量漫画中文本地化：把数据库中非中文的标题/简介转换成中文。
 *  1) 先从 MangaDex 取中文备选（title.zh / altTitles[].zh / description.zh）——无需任何 Key；
 *  2) 仍非中文的走翻译：配置了 COMIC_TRANSLATE_* / OPENAI_* 用 LLM，否则用免费源（MyMemory）。
 *
 * 用法：
 *   npm run localize:db            # 正式执行
 *   npm run localize:db -- --dry   # 只统计不写库
 */
import mongoose from 'mongoose';
import { Comic } from '../models/Comic';
import { config } from '../config';
import { mdGet } from '../services/mangadex';
import { isChinese, isTranslateConfigured, localizeComic, pickZhDesc, pickZhTitle } from '../services/translate';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 与 importer 的 cleanDesc 保持一致：压缩空白并截断，避免简介过长撑爆详情页 */
function cleanDesc(text: string): string {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  return t.length > 160 ? `${t.slice(0, 157).trimEnd()}…` : t;
}

async function main() {
  const dry = process.argv.includes('--dry');
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000 });
  console.log(`[localize] 目标数据库：${config.isProdData ? '线上库' : '测试库'}`);
  console.log(
    `[localize] 翻译源：MangaDex 中文备选 + ${isTranslateConfigured() ? 'LLM + ' : ''}免费翻译（MyMemory）`,
  );

  const comics = await Comic.find({ sourceId: { $ne: '' } }, { title: 1, description: 1, sourceId: 1 }).lean();
  const need = comics.filter((c) => !isChinese(c.title) || !isChinese(c.description || ''));
  console.log(`[localize] 共 ${comics.length} 部，标题或简介非中文 ${need.length} 部${dry ? '（dry-run，不写库）' : ''}`);

  let mdFixed = 0;
  let trFixed = 0;
  let unchanged = 0;

  // MangaDex /manga 的 ids[] 单请求上限为 10，按 10 分批
  for (let i = 0; i < need.length; i += 10) {
    const batch = need.slice(i, i + 10);
    let data: any = null;
    for (let attempt = 0; attempt < 3 && !data; attempt += 1) {
      try {
        const r = await mdGet('/manga', { 'ids[]': batch.map((c) => c.sourceId) });
        if (r?.data?.length) data = r;
      } catch {
        /* 重试 */
      }
      if (!data) await sleep(1500 * (attempt + 1));
    }
    const byId = new Map<string, any>((data?.data || []).map((m: any) => [m.id, m.attributes]));

    for (const c of batch) {
      const attr = byId.get(String(c.sourceId));
      const zhT = attr ? pickZhTitle(attr) : '';
      const zhD = attr ? pickZhDesc(attr) : '';
      // 第一层：MangaDex 中文备选
      let title = zhT || c.title;
      let description = cleanDesc(zhD || c.description || '');
      const afterMd = { title, description };
      // 第二层：仍非中文 -> 翻译（有 Key 走 LLM，否则免费源 MyMemory）
      if (!isChinese(title) || !isChinese(description)) {
        const loc = await localizeComic(title, description);
        title = loc.title;
        description = cleanDesc(loc.description);
      }
      if (title === c.title && description === (c.description || '')) {
        unchanged += 1;
        continue;
      }
      if (!dry) {
        // 翻译不更新 updatedAt（「更新」排序只反映新增抓取/章节更新）
        await Comic.updateOne({ _id: c._id }, { $set: { title, description } }, { timestamps: false });
      }
      if (title !== afterMd.title || description !== afterMd.description) trFixed += 1;
      else mdFixed += 1;
    }

    if (i / 10 % 10 === 0) console.log(`[localize] 进度 ${Math.min(i + 10, need.length)}/${need.length}`);
    await sleep(1200); // 限流，避免触发 MangaDex 429
  }

  console.log(
    `[localize] 完成：MangaDex 备选修复 ${mdFixed} 部，翻译修复 ${trFixed} 部，仍为非中文 ${unchanged} 部${dry ? '（dry-run）' : ''}`,
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error('[localize] 失败:', (e as Error).message);
  process.exit(1);
});
