const { dm5ChapterPages } = require('./server/dist/services/dm5.js');
(async () => {
  for (const cid of ['1280853', '1280927']) {
    const label = cid === '1280853' ? '免费第1话' : 'VIP第61话';
    try {
      const p = await dm5ChapterPages(cid);
      console.log(`${label} cid=${cid}: ${p.length} 页`);
      if (p.length) console.log('  首页:', p[0].slice(0, 90));
    } catch (e) { console.log(`${label} 抛错:`, e.message); }
  }
})();
