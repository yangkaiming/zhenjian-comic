import { coverSvg, pageSvg, SVG_HEADERS } from '../utils/art';

export function buildCoverUrl(comicId: string, title: string, author: string): string {
  const q = new URLSearchParams({ id: comicId, title, author });
  return `/media/cover.svg?${q.toString()}`;
}

export function buildBannerUrl(comicId: string, title: string): string {
  const q = new URLSearchParams({ id: `banner-${comicId}`, title, author: '编辑推荐' });
  return `/media/cover.svg?${q.toString()}`;
}

export function buildPageUrl(
  comicId: string,
  chapterIndex: number,
  page: number,
  title: string,
  w: number,
  h: number,
): string {
  const q = new URLSearchParams({
    id: comicId,
    ch: String(chapterIndex),
    p: String(page),
    title,
    w: String(w),
    h: String(h),
  });
  return `/media/page.svg?${q.toString()}`;
}

export { coverSvg, pageSvg, SVG_HEADERS };
