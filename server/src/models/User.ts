import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  username: string;
  password: string;
  nickname: string;
  avatar: string;
  role: 'user' | 'admin';
  lastActiveAt: Date;
  /** 上次登录时间（登录成功时更新） */
  lastLoginAt?: Date;
  createdAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    username: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true },
    nickname: { type: String, default: '' },
    avatar: { type: String, default: '' },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    lastActiveAt: { type: Date, default: Date.now },
    lastLoginAt: { type: Date },
  },
  { timestamps: true },
);

export const User = mongoose.model<IUser>('User', UserSchema);
