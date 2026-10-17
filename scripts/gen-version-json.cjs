/**
 * 生成 version.json（数组，最新版本在最前；用于上传到腾讯云 COS，供 App 启动时检查更新）。
 *
 * 流程：
 *   1. 先从 COS 拉取线上 version.json（APP_UPDATE_MANIFEST_URL，读 .env.prod / .env）作为历史清单，
 *      拉取失败才回退到本地 version.json——保证以线上为准，不会丢别人已发布的版本。
 *   2. 把「当前 package.json 版本 + 构建时间 + 更新说明 + 下载地址」作为新项插到最前面，
 *      并按 version 去重（同版本覆盖、保留历史版本）。服务端 /api/app/latest 取数组第一项作为最新版本。
 *
 * 更新说明(notes)为「分组」结构：[{ title, items }]（如 新增功能 / Bug 修复）。
 * 取值优先级：
 *   1. release-notes.md / RELEASE_NOTES.md（markdown，用 ## 标题分组，- 列条目；最高优先）
 *   2. 自动从 web/src/version.ts 的 RELEASE_HIGHLIGHTS 生成（归到「重要功能」组）
 *   3. 占位文案
 *
 * 用法：npm run version:json   → 在项目根生成/更新 version.json，
 * 编辑 notes/url 后上传到 COS，并把该文件永久地址填到 .env.prod 的 APP_UPDATE_MANIFEST_URL。
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'version.json');
const pkg = require(path.join(ROOT, 'package.json'));

const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const buildTime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

/** 去掉行首的列表符号/序号 */
const cleanItem = (l) => l.replace(/^\s*(?:[-*+•·]|\d+[.、)])\s*/, '').trim();

/** 解析 markdown：## 标题作为分组，列表行作为条目；无标题则归入默认组 */
function parseSections(text) {
  const sections = [];
  let cur = null;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const h = raw.match(/^\s*#{1,6}\s*(.+?)\s*$/);
    if (h) {
      cur = { title: h[1].trim(), items: [] };
      sections.push(cur);
      continue;
    }
    const item = cleanItem(raw);
    if (item) {
      if (!cur) {
        cur = { title: '更新内容', items: [] };
        sections.push(cur);
      }
      cur.items.push(item);
    }
  }
  return sections.filter((s) => s.items.length > 0);
}

/** 从 web/src/version.ts 的 RELEASE_HIGHLIGHTS 提取条目 */
function highlights() {
  try {
    const src = fs.readFileSync(path.join(ROOT, 'web/src/version.ts'), 'utf8');
    const block = src.match(/RELEASE_HIGHLIGHTS[^=]*=\s*\[([\s\S]*?)\];/);
    if (!block) return [];
    const re = /title:\s*['"]([^'"]*)['"]\s*,\s*desc:\s*['"]([^'"]*)['"]/g;
    const out = [];
    let m;
    while ((m = re.exec(block[1]))) out.push(`${m[1]}：${m[2]}`);
    return out;
  } catch {
    return [];
  }
}

/** 从 .env.prod / .env 读取 COS 上的 version.json 地址 */
function readManifestUrl() {
  for (const f of ['.env.prod', '.env']) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*APP_UPDATE_MANIFEST_URL\s*=\s*(.*)$/);
      if (m) return m[1].trim().replace(/^["']|["']$/g, '');
    }
  }
  return process.env.APP_UPDATE_MANIFEST_URL || '';
}

/** 读取本地 version.json 作为历史清单（兼容旧的对象/字符串 notes 格式） */
function readLocalExisting() {
  try {
    const raw = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    if (Array.isArray(raw)) return raw.filter((e) => e && typeof e === 'object');
    if (raw && typeof raw === 'object' && raw.version) return [raw];
  } catch {
    /* 没有或读不到旧文件则从空数组开始 */
  }
  return [];
}

/** 拉取 COS 上的 version.json 作为历史清单；失败/未配置则回退本地文件 */
async function fetchExisting() {
  const url = readManifestUrl();
  if (url) {
    try {
      const r = await fetch(url, { headers: { Accept: 'application/json' } });
      if (r.ok) {
        // 容错：去掉尾随逗号再解析，避免线上文件多个逗号导致整体读取失败
        const raw = JSON.parse((await r.text()).replace(/,\s*([\]}])/g, '$1'));
        const arr = Array.isArray(raw) ? raw : raw && raw.version ? [raw] : [];
        const list = arr.filter((e) => e && typeof e === 'object' && e.version);
        if (list.length) {
          console.log('[version] 已从 COS 拉取', list.length, '个历史版本：', list.map((e) => e.version).join(', '));
          return list;
        }
        console.log('[version] COS 上无有效版本，改用本地 version.json');
      } else {
        console.log('[version] COS 返回 HTTP', r.status, '，改用本地 version.json');
      }
    } catch (e) {
      console.log('[version] 拉取 COS 失败，改用本地 version.json：', e.message);
    }
  } else {
    console.log('[version] 未配置 APP_UPDATE_MANIFEST_URL，使用本地 version.json');
  }
  return readLocalExisting();
}

(async () => {
  // notes 优先级：release-notes.md(分组) > RELEASE_HIGHLIGHTS > 占位
  let notes;
  let mdText = '';
  for (const f of ['release-notes.md', 'RELEASE_NOTES.md']) {
    const p = path.join(ROOT, f);
    if (fs.existsSync(p)) {
      mdText = fs.readFileSync(p, 'utf8').trim();
      break;
    }
  }
  if (mdText) {
    notes = parseSections(mdText);
  } else {
    const hl = highlights();
    notes = hl.length ? [{ title: '重要功能', items: hl }] : '请填写本次更新说明（每行一条）';
  }

  const existing = await fetchExisting();

  const entry = {
    version: pkg.version,
    buildTime,
    notes,
    url: '请填写新版本下载地址',
  };

  // 新版本置顶，并按 version 去重（同版本用新的覆盖，历史版本保留）
  const list = [entry, ...existing.filter((e) => e.version !== entry.version)];

  fs.writeFileSync(OUT, JSON.stringify(list, null, 2) + '\n', 'utf8');
  const noteCount = Array.isArray(notes) ? notes.reduce((n, s) => n + s.items.length, 0) : 0;
  console.log('[version] 已生成 version.json →', OUT);
  console.log('[version] 共', list.length, '个版本，最新：', entry.version, '| buildTime =', buildTime);
  if (Array.isArray(notes)) console.log('[version] notes 分组：', notes.map((s) => `${s.title}(${s.items.length})`).join('、'));
  console.log('[version] 请编辑 notes / url 后上传到 COS，并将永久地址填入 .env.prod 的 APP_UPDATE_MANIFEST_URL');
})();
