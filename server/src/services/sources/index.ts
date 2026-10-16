/**
 * 数据源注册表。
 *
 * 如何新增一个数据源（以 XXX 站为例）：
 *   1. 新建 server/src/services/sources/xxx.ts，实现 ComicSource：
 *        export const xxxSource: ComicSource = {
 *          info: { key: 'xxx', name: 'XXX 漫画', desc: '…', supportsSearch: true },
 *          fetchByCount: (count, opts) => yourImport(count, opts),
 *          fetchByTitle: (title, limit) => yourImportByTitle(title, limit),
 *        };
 *      （抓取引擎可参考 importer.ts：发现候选 → 章节入库 → 进度单例）
 *   2. 在下方 registerSource(xxxSource) 注册。
 *   3. 完成——前端下拉框与 /api/comics/fetch 的 source 参数自动生效，无需改前端。
 */
import { mangadexSource } from './mangadex';
import { dm5Source } from './dm5';
import { baozimhSource } from './baozimh';
import type { ComicSource, FetchOptions, FetchResult, SourceInfo } from './types';

const REGISTRY = new Map<string, ComicSource>();

/** 注册数据源（key 重复会覆盖） */
export function registerSource(source: ComicSource): void {
  REGISTRY.set(source.info.key, source);
}

/** 取数据源；不存在返回 undefined */
export function getSource(key: string): ComicSource | undefined {
  return REGISTRY.get(key);
}

/** 全部可用数据源（供下拉框） */
export function availableSources(): SourceInfo[] {
  return [...REGISTRY.values()].map((s) => s.info);
}

// ---- 内置数据源注册 ----
registerSource(mangadexSource);
registerSource(dm5Source);
registerSource(baozimhSource);

export type { ComicSource, FetchOptions, FetchResult, SourceInfo };
