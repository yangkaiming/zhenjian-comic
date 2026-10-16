import { importByTitle, importComics } from '../importer';
import type { ComicSource } from './types';

/**
 * MangaDex 数据源（内置）。
 * 抓取时自动只收有中文版的条目（见 importer：搜索层 availableTranslatedLanguage=zh，
 * 取章层 translatedLanguage=zh/zh-hk），避免阅读器里出现英文页图。
 */
export const mangadexSource: ComicSource = {
  info: {
    key: 'mangadex',
    name: 'MangaDex',
    desc: '国际漫画库，自动只收中文版',
    supportsSearch: true,
  },
  fetchByCount: (count, opts) => importComics(count, opts || {}),
  fetchByTitle: (title, limit) => importByTitle(title, limit),
};
