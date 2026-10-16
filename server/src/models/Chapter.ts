import mongoose, { Schema, Document } from 'mongoose';

export interface IChapter extends Document {
  comic: mongoose.Types.ObjectId;
  index: number;
  title: string;
  pageCount: number;
  /** MangaDex 章节 ID（有值表示页图走网络） */
  sourceId?: string;
  /** 已解析过的页图 URL 列表 */
  sourcePages?: string[];
  releasedAt: Date;
}

const ChapterSchema = new Schema<IChapter>({
  comic: { type: Schema.Types.ObjectId, ref: 'Comic', required: true, index: true },
  index: { type: Number, required: true },
  title: { type: String, required: true },
  pageCount: { type: Number, default: 12 },
  sourceId: { type: String, default: '', index: true },
  sourcePages: { type: [String], default: [] },
  releasedAt: { type: Date, default: Date.now },
});

ChapterSchema.index({ comic: 1, index: 1 }, { unique: true });

export const Chapter = mongoose.model<IChapter>('Chapter', ChapterSchema);
