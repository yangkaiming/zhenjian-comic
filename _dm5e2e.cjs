const mongoose = require('mongoose');
process.env.NODE_PATH = 'server/node_modules';
require('module').Module._initPaths();
const BASE = 'http://127.0.0.1:9599';

(async () => {
  await mongoose.connect('mongodb://127.0.0.1:27017/zhenjian-comic', { serverSelectionTimeoutMS: 5000 });
  const db = mongoose.connection.db;

  const token = (await (await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'demo', password: '123456' }),
  })).json()).token;
  const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  // 1) 数据源列表
  const s = await (await fetch(`${BASE}/api/comics/sources`, { headers: auth })).json();
  console.log('数据源:', s.items.map((x) => `${x.key}(${x.name})`).join(' | '));

  // 记录抓取前 dm5 漫画数
  const before = await db.collection('comics').countDocuments({ sourceId: /^dm5:/ });

  // 2) 用 dm5 源抓 1 部
  const r = await fetch(`${BASE}/api/comics/fetch`, {
    method: 'POST', headers: auth, body: JSON.stringify({ count: 1, source: 'dm5' }),
  });
  console.log('dm5 抓取启动:', r.status, JSON.stringify(await r.json()));
  for (let i = 0; i < 180; i += 1) {
    await new Promise((x) => setTimeout(x, 1000));
    const st = await (await fetch(`${BASE}/api/comics/fetch-status`, { headers: auth })).json();
    if (!st.running && st.done) break;
  }
  const st = await (await fetch(`${BASE}/api/comics/fetch-status`, { headers: auth })).json();
  console.log('抓取结果:', st.current);
  (st.items || []).forEach((it) => console.log(`  [${it.status}] ${it.title} (${it.chapters}话)`));

  // 3) 新入库的 dm5 漫画
  const fresh = await db.collection('comics').find({ sourceId: /^dm5:/ }, { sort: { _id: -1 }, limit: 1 }).project({ title: 1, sourceId: 1, cover: 1, chapterCount: 1 }).toArray();
  console.log('\n库内 dm5 漫画数:', await db.collection('comics').countDocuments({ sourceId: /^dm5:/ }));
  fresh.forEach((c) => console.log(`  《${c.title}》 ${c.chapterCount}话 cover=${c.cover ? c.cover.slice(0, 45) : '(空)'}`));
  if (!fresh.length) { await mongoose.disconnect(); return; }

  // 4) 读第一章 -> 页图
  const ch = await db.collection('chapters').findOne({ comic: fresh[0]._id }, { sort: { index: 1 } });
  const detail = await (await fetch(`${BASE}/api/comics/chapter/${ch._id}`, { headers: auth })).json();
  console.log(`\n章节: ${detail.chapter.title} | 页数: ${detail.chapter.pages.length} | remote: ${detail.remote}`);
  console.log('首页 URL:', (detail.chapter.pages[0]?.url || '').slice(0, 100));

  // 5) 经代理取图
  if (detail.chapter.pages[0]?.url) {
    const proxied = `${BASE}/media/img?u=${encodeURIComponent(detail.chapter.pages[0].url)}`;
    const img = await fetch(proxied, { headers: { Authorization: auth.Authorization } });
    const buf = Buffer.from(await img.arrayBuffer());
    console.log('代理出图:', img.status, img.headers.get('content-type'), buf.length, 'B', buf.slice(0, 4).toString('hex'));
  }
  console.log('库内 dm5 漫画数 before->after:', before, '->', await db.collection('comics').countDocuments({ sourceId: /^dm5:/ }));
  await mongoose.disconnect();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
