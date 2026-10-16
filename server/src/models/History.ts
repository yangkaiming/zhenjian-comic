import mongoose, { Schema, Document } from 'mongoose';

export interface IHistory extends Document {
  user: mongoose.Types.ObjectId;
  comic: mongoose.Types.ObjectId;
  chapter: mongoose.Types.ObjectId | null;
  chapterIndex: number;
  page: number;
  updatedAt: Date;
}

const HistorySchema = new Schema<IHistory>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    comic: { type: Schema.Types.ObjectId, ref: 'Comic', required: true },
    chapter: { type: Schema.Types.ObjectId, ref: 'Chapter', default: null },
    chapterIndex: { type: Number, default: 0 },
    page: { type: Number, default: 0 },
  },
  { timestamps: true },
);

HistorySchema.index({ user: 1, comic: 1 }, { unique: true });

export const History = mongoose.model<IHistory>('History', HistorySchema);
