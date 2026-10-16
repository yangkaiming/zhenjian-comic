import mongoose, { Schema, Document } from 'mongoose';

export interface ISetting extends Document {
  key: string;
  value: unknown;
}

const SettingSchema = new Schema<ISetting>({
  key: { type: String, unique: true, required: true },
  value: { type: Schema.Types.Mixed },
});

export const Setting = mongoose.model<ISetting>('Setting', SettingSchema);
