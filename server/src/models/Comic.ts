import mongoose, { Schema, Document } from 'mongoose';

export interface IComic extends Document {
  title: string;
  author: string;
  cover: string;
  banner: string;
  description: string;
  region: string;
  status: string;
  categories: string[];
  tags: string[];
  rating: number;
  ratingCount: number;
  views: number;
  favorites: number;
  chapterCount: number;
  latestChapter: string;
  recommend: number;
  /** MangaDex 漫画 ID（有值表示可刷新章节/抓取更新） */
  sourceId: string;
  /** 软删除：管理员删除后置 true，浏览列表不再出现，但书架/历史等记录仍保留并显示「已被删除」蒙层 */
  deleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ComicSchema = new Schema<IComic>(
  {
    title: { type: String, required: true, index: true },
    author: { type: String, default: '佚名' },
    cover: { type: String, default: '' },
    banner: { type: String, default: '' },
    description: { type: String, default: '' },
    region: { type: String, default: '国漫', index: true },
    status: { type: String, default: '连载', index: true },
    categories: { type: [String], default: [], index: true },
    tags: { type: [String], default: [] },
    rating: { type: Number, default: 8 },
    ratingCount: { type: Number, default: 0 },
    views: { type: Number, default: 0 },
    favorites: { type: Number, default: 0 },
    chapterCount: { type: Number, default: 0 },
    latestChapter: { type: String, default: '' },
    recommend: { type: Number, default: 0 },
    sourceId: { type: String, default: '', index: true },
    deleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

ComicSchema.index({ title: 'text', author: 'text', description: 'text', tags: 'text' });

export const Comic = mongoose.model<IComic>('Comic', ComicSchema);
