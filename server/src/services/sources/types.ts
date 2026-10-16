/**
 * 漫画数据源抽象。
 *
 * 新增一个数据源 = 实现 ComicSource 接口并在 sources/index.ts 里 registerSource()。
 * 前端「我的」页的数据源下拉框由 GET /api/comics/sources 动态驱动，注册后自动出现。
 */

export interface SourceInfo {
  /** 唯一键（如 'mangadex'），前端下拉框的 value */
  key: string;
  /** 展示名 */
  name: string;
  /** 一句话说明（下拉框 title 用） */
  desc: string;
  /** 是否支持按书名抓取 */
  supportsSearch: boolean;
}

export interface FetchResult {
  added: number;
  skipped: number;
  chapters: number;
}

/** 按书名搜索到的候选漫画（供前端展示列表、由用户选择后再抓取） */
export interface SourceCandidate {
  /** 源内唯一标识（baozimh 为 slug），抓取时原样回传给 fetchBySlug */
  slug: string;
  title: string;
  cover?: string;
  /** 本地库中是否已存在同名漫画（仅提示用，按标题比对） */
  exists?: boolean;
}

/** 源特定的抓取选项（可选字段，各源自行解释） */
export interface FetchOptions {
  /** MangaDex 专用：抓取范围 all=全部 / jp=日韩漫 / cn=国漫 */
  scope?: 'all' | 'jp' | 'cn';
}

export interface ComicSource {
  info: SourceInfo;
  /** 按条数抓取新漫画（含章节）入库；实时进度走各自的 progress 单例 */
  fetchByCount(count: number, opts?: FetchOptions): Promise<FetchResult>;
  /** 按书名抓取 */
  fetchByTitle(title: string, limit?: number): Promise<FetchResult>;
  /** 可选：只搜索候选、不入库，返回列表让用户挑选 */
  searchTitles?(title: string, limit?: number): Promise<SourceCandidate[]>;
  /** 可选：按 searchTitles 返回的 slug 精确抓取入库 */
  fetchBySlug?(slug: string): Promise<FetchResult>;
}
