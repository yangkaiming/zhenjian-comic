/** 清理：删除阅读器内容非中文的国漫（先备份清单，再删漫画/章节/书架/评论）。 */
const fs = require('fs');
const mongoose = require('mongoose');

const UA = 'ZhenjianComic/1.0';
const ZH = new Set(['zh', 'zh-hk', 'zh-tw']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function feedZhTotal(mid) {
  const url = `https://api.mangadex.org/manga/${mid}/feed?limit=1&translatedLanguage[]=zh&translatedLanguage[]=zh-hk&translatedLanguage[]=zh-tw`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (r.status === 200) return (await r.json()).total || 0;
      if (r.status === 429) { await sleep(3000 * (attempt + 1)); continue; }
      return -1; // 查询失败
    } catch {
      await sleep(1500);
    }
  }
  return -1;
}

async function chapterLang(cid) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const r = await fetch(`https://api.mangadex.org/chapter/${cid}`, { headers: { 'User-Agent': UA } });
      if (r.status === 200) {
        const j = await r.json();
        return (j.data && j.data.attributes && j.data.attributes.translatedLanguage) || null;
      }
      if (r.status === 429) { await sleep(3000 * (attempt + 1)); continue; }
      return null;
    } catch {
      await sleep(1500);
    }
  }
  return null;
}

(async () => {
  await mongoose.connect('mongodb://127.0.0.1:27017/zhenjian-comic', { serverSelectionTimeoutMS: 5000 });
  const db = mongoose.connection.db;
  const guoman = await db.collection('comics').find({ region: '国漫' }).project({ title: 1, sourceId: 1 }).toArray();
  console.log('国漫总数:', guoman.length);

  const toDelete = [];
  const keep = [];
  const unknown = [];
  for (let i = 0; i < guoman.length; i += 1) {
    const c = guoman[i];
    let isChinese = false;
    if (c.sourceId) {
      const zhTotal = await feedZhTotal(c.sourceId);
      if (zhTotal < 0) { unknown.push(c.title); isChinese = true; /* 查不到就保守保留 */ }
      else if (zhTotal > 0) {
        // 有中文版：抽验实际存入章节的语言（首/中/尾）
        const chs = await db.collection('chapters').find({ comic: c._id }).project({ sourceId: 1 }).sort({ index: 1 }).toArray();
        const picks = [chs[0], chs[Math.floor(chs.length / 2)], chs[chs.length - 1]].filter(Boolean);
        isChinese = true;
        for (const ch of picks) {
          if (!ch.sourceId) continue;
          const lang = await chapterLang(ch.sourceId);
          if (lang && !ZH.has(lang)) { isChinese = false; break; }
          await sleep(300);
        }
      }
    } else {
      unknown.push(`${c.title}(无 sourceId)`);
      isChinese = true;
    }
    (isChinese ? keep : toDelete).push(c);
    if ((i + 1) % 30 === 0) console.log(`  检查进度 ${i + 1}/${guoman.length}`);
    await sleep(250);
  }

  console.log(`\n保留（中文）: ${keep.length} 部`);
  console.log(`删除（非中文）: ${toDelete.length} 部`);
  if (unknown.length) console.log(`未能确认(保守保留): ${unknown.length} 部 -> ${unknown.slice(0, 5).join(' | ')}`);

  if (!toDelete.length) { await mongoose.disconnect(); return; }

  // 备份
  const backup = toDelete.map((c) => ({ title: c.title, sourceId: c.sourceId, _id: String(c._id) }));
  fs.writeFileSync('crawler/output/deleted-guoman-backup.json', JSON.stringify(backup, null, 2), 'utf-8');
  console.log('已备份清单 -> crawler/output/deleted-guoman-backup.json');

  const ids = toDelete.map((c) => c._id);
  const r1 = await db.collection('comics').deleteMany({ _id: { $in: ids } });
  const r2 = await db.collection('chapters').deleteMany({ comic: { $in: ids } });
  const r3 = await db.collection('bookshelves').deleteMany({ comic: { $in: ids } }).catch(() => ({ deletedCount: 0 }));
  const r4 = await db.collection('comments').deleteMany({ comic: { $in: ids } }).catch(() => ({ deletedCount: 0 }));
  console.log(`删除结果: 漫画 ${r1.deletedCount} | 章节 ${r2.deletedCount} | 书架 ${r3.deletedCount || 0} | 评论 ${r4.deletedCount || 0}`);
  const remain = await db.collection('comics').countDocuments();
  console.log('库内剩余漫画:', remain);
  await mongoose.disconnect();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
