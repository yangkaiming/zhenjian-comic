import mongoose, { Schema, Document } from 'mongoose';

export interface IBookShelf extends Document {
  user: mongoose.Types.ObjectId;
  comic: mongoose.Types.ObjectId;
  /** 漫画被硬删除时留存的标题/封面快照，用于书架展示「已被删除」卡片 */
  comicTitle: string;
  comicCover: string;
  status: string;
  lastChapterId: mongoose.Types.ObjectId | null;
  lastChapterIndex: number;
  lastPage: number;
  progress: number;
  createdAt: Date;
  updatedAt: Date;
}

const BookShelfSchema = new Schema<IBookShelf>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    comic: { type: Schema.Types.ObjectId, ref: 'Comic', required: true },
    comicTitle: { type: String, default: '' },
    comicCover: { type: String, default: '' },
    status: { type: String, default: 'want' },
    lastChapterId: { type: Schema.Types.ObjectId, ref: 'Chapter', default: null },
    lastChapterIndex: { type: Number, default: 0 },
    lastPage: { type: Number, default: 0 },
    progress: { type: Number, default: 0 },
  },
  { timestamps: true },
);

BookShelfSchema.index({ user: 1, comic: 1 }, { unique: true });

export const BookShelf = mongoose.model<IBookShelf>('BookShelf', BookShelfSchema);
