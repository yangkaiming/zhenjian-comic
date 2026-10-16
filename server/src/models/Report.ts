import mongoose, { Schema, Document } from 'mongoose';

export type ReportType = 'comic' | 'chapter' | 'comment' | 'other';
export type ReportStatus = 'pending' | 'resolved';

export interface IReport extends Document {
  type: ReportType;
  /** 被举报对象 id（漫画/章节/评论），other 时可空 */
  targetId: string;
  comicId: string;
  comicTitle: string;
  chapterId: string;
  chapterTitle: string;
  reporter: mongoose.Types.ObjectId;
  reporterName: string;
  reason: string;
  detail: string;
  status: ReportStatus;
  resolvedAt: Date | null;
  createdAt: Date;
}

const ReportSchema = new Schema<IReport>(
  {
    type: { type: String, enum: ['comic', 'chapter', 'comment', 'other'], default: 'other' },
    targetId: { type: String, default: '' },
    comicId: { type: String, default: '' },
    comicTitle: { type: String, default: '' },
    chapterId: { type: String, default: '' },
    chapterTitle: { type: String, default: '' },
    reporter: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reporterName: { type: String, default: '' },
    reason: { type: String, required: true },
    detail: { type: String, default: '' },
    status: { type: String, enum: ['pending', 'resolved'], default: 'pending' },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

ReportSchema.index({ status: 1, createdAt: -1 });

export const Report = mongoose.model<IReport>('Report', ReportSchema);
