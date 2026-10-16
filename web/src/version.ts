declare const __APP_VERSION__: string;

/**
 * 应用版本号（单一来源：根 package.json 的 version，由 Vite 在构建时注入）。
 * 运行中优先使用 Electron 桥返回的 appVersion，见 Mine 页展示。
 */
export const APP_VERSION: string =
  typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__ ? __APP_VERSION__ : '0.0.0-dev';

/** 展示用版本标签：优先 Electron 桥（运行时），回退到构建注入版本。 */
export function versionLabel(bridgeAppVersion?: string): string {
  return bridgeAppVersion || APP_VERSION;
}

/** 语义化版本比较：latest 是否比 current 更新。 */
export function isNewer(latest: string, current: string): boolean {
  const parse = (v: string): number[] =>
    v
      .replace(/^v/i, '')
      .split('.')
      .map((n) => parseInt(n, 10) || 0);
  const a = parse(latest || '');
  const b = parse(current || '');
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const d = (a[i] || 0) - (b[i] || 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

export interface ReleaseHighlight {
  title: string;
  desc: string;
}

/**
 * 当前版本「重要功能」清单，用于「版本信息」弹窗展示。
 * 直接在数组中增删条目即可，弹窗会自动统计条数（RELEASE_HIGHLIGHTS.length）。
 */
export const RELEASE_HIGHLIGHTS: ReleaseHighlight[] = [
  { title: '多数据源聚合', desc: '对接 MangaDex、动漫屋、包子漫画等公开数据源，一键检索' },
  { title: '多种阅读模式', desc: '卷轴（条漫）、翻页、日漫右到左，自适应宽度 / 高度 / 原图' },
  { title: '书架与进度同步', desc: '想看 / 追更 / 看完 / 搁置分类，自动记忆阅读进度' },
  { title: '全局搜索与排行', desc: '按关键字、分类、地区检索，支持热门 / 最新排行榜' },
  { title: '评论与互动', desc: '漫画评论、评分、点赞，支持回复与楼中楼' },
  { title: '意见反馈通道', desc: '问题反馈 / 功能建议 / 夸夸，官方直收并支持回复' },
  { title: '深色 / 浅色主题', desc: '一键切换外观，阅读器背景与独立窗口可自定义' },
  { title: '后台管理工具', desc: '反馈处理、用户管理、漫画导入、编辑推荐（仅管理员）' },
];
