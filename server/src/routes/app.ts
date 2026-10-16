import { Router, Request, Response } from 'express';
import { config } from '../config';

const router = Router();

interface LatestInfo {
  version: string;
  url: string;
  notes: string;
}

/**
 * 最新版本信息（供前端“检查更新”比较）。
 * 优先级：远程 manifest（APP_UPDATE_MANIFEST_URL）> 静态环境变量 > 空（视为无更新）。
 */
router.get('/latest', async (_req: Request, res: Response) => {
  let info: LatestInfo = {
    version: config.latestVersion,
    url: config.updateUrl,
    notes: config.updateNotes,
  };

  if (config.updateManifestUrl) {
    try {
      const r = await fetch(config.updateManifestUrl, { headers: { Accept: 'application/json' } });
      if (r.ok) {
        const j = (await r.json()) as Partial<LatestInfo>;
        info = {
          version: String(j.version || info.version || ''),
          url: String(j.url || info.url || ''),
          notes: String(j.notes || info.notes || ''),
        };
      }
    } catch {
      /* 远程 manifest 不可用时回退到本地配置 */
    }
  }

  res.json(info);
});

export default router;
