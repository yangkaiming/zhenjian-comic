import { Router, Request, Response } from 'express';
import { config } from '../config';

const router = Router();

interface NoteSection {
  title: string;
  items: string[];
}

interface VersionEntry {
  version: string;
  buildTime: string;
  notes: string | NoteSection[];
  url: string;
}

interface LatestInfo extends VersionEntry {
  /** 全部版本（最新在前），供前端「版本信息」切换查看 */
  versions: VersionEntry[];
}

/** 归一化单条 manifest 的 notes：数组→分组，字符串→原样，空→回退 */
function normalizeNotes(raw: unknown, fallback: string | NoteSection[]): string | NoteSection[] {
  if (Array.isArray(raw)) {
    const sections = raw
      .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
      .map((s) => ({
        title: String(s.title || '更新内容'),
        items: Array.isArray(s.items) ? s.items.map((x) => String(x)) : [],
      }))
      .filter((s) => s.items.length > 0);
    if (sections.length) return sections;
  } else if (typeof raw === 'string' && raw.trim()) {
    return raw;
  }
  return fallback;
}

/** 把一条原始 manifest 记录归一化为 VersionEntry */
function toVersionEntry(o: Record<string, unknown>, fallbackNotes: string | NoteSection[]): VersionEntry {
  return {
    version: String(o.version || ''),
    buildTime: String(o.buildTime || o.time || o.buildAt || ''),
    notes: normalizeNotes(o.notes ?? o.versionInfo ?? o.desc, fallbackNotes),
    url: String(o.url || ''),
  };
}

/**
 * 最新版本信息（供前端“检查更新”比较）+ 全部版本列表（供“版本信息”切换查看）。
 * 远程 manifest 为数组时最新版本放最前；字段兼容 notes/versionInfo/desc、buildTime/time/buildAt。
 */
router.get('/latest', async (_req: Request, res: Response) => {
  let latest: LatestInfo = {
    version: config.latestVersion,
    url: config.updateUrl,
    notes: config.updateNotes,
    buildTime: '',
    versions: [],
  };

  if (config.updateManifestUrl) {
    try {
      const r = await fetch(config.updateManifestUrl, { headers: { Accept: 'application/json' } });
      if (r.ok) {
        // 容错：先取文本并去掉对象/数组的尾随逗号再解析，
        // 避免手改 version.json 时多一个逗号导致整体 JSON 解析失败、更新检测静默失效
        const text = await r.text();
        const j = JSON.parse(text.replace(/,\s*([\]}])/g, '$1')) as unknown;
        const arr: unknown[] = Array.isArray(j) ? j : [j];
        const versions = arr
          .map((e) => toVersionEntry((e || {}) as Record<string, unknown>, ''))
          .filter((e) => e.version);
        if (versions.length) {
          latest = { ...versions[0], versions };
        }
      }
    } catch {
      /* 远程 manifest 不可用时回退到本地配置 */
    }
  }

  res.json(latest);
});

export default router;
