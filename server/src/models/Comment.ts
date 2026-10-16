import mongoose, { Schema, Document } from 'mongoose';

export interface IComment extends Document {
  comic: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  nickname: string;
  avatar: string;
  content: string;
  score: number;
  likes: number;
  /** 点赞用户 id 列表（用于「一人一次、再次取消」） */
  likedBy: mongoose.Types.ObjectId[];
  /** 楼中楼：所属顶层评论 id（顶级评论为 null） */
  parent: mongoose.Types.ObjectId | null;
  /** 被回复者昵称（@某人），顶级评论为空 */
  replyToName: string;
  createdAt: Date;
}

const CommentSchema = new Schema<IComment>(
  {
    comic: { type: Schema.Types.ObjectId, ref: 'Comic', required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    nickname: { type: String, default: '匿名漫迷' },
    avatar: { type: String, default: '' },
    content: { type: String, required: true },
    score: { type: Number, default: 8 },
    likes: { type: Number, default: 0 },
    likedBy: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: [] },
    parent: { type: Schema.Types.ObjectId, ref: 'Comment', default: null, index: true },
    replyToName: { type: String, default: '' },
  },
  { timestamps: true },
);

export const Comment = mongoose.model<IComment>('Comment', CommentSchema);
