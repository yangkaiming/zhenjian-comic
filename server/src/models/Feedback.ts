import mongoose, { Schema, Document } from 'mongoose';

export type FeedbackCategory = 'bug' | 'suggest' | 'praise' | 'other';
export type FeedbackStatus = 'pending' | 'replied' | 'resolved';

export interface IFeedback extends Document {
  user: mongoose.Types.ObjectId;
  username: string;
  category: FeedbackCategory;
  content: string;
  contact: string;
  status: FeedbackStatus;
  reply: string;
  repliedAt: Date | null;
  createdAt: Date;
}

const FeedbackSchema = new Schema<IFeedback>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    username: { type: String, default: '' },
    category: { type: String, enum: ['bug', 'suggest', 'praise', 'other'], default: 'other' },
    content: { type: String, required: true, trim: true, maxlength: 1000 },
    contact: { type: String, default: '', trim: true, maxlength: 120 },
    status: { type: String, enum: ['pending', 'replied', 'resolved'], default: 'pending' },
    reply: { type: String, default: '', trim: true, maxlength: 1000 },
    repliedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

FeedbackSchema.index({ status: 1, createdAt: -1 });
FeedbackSchema.index({ user: 1, createdAt: -1 });

export const Feedback = mongoose.model<IFeedback>('Feedback', FeedbackSchema);
