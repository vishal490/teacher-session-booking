import { Schema, model } from 'mongoose';

const name = { type: String, required: true, trim: true, maxlength: 150 };
const email = { type: String, required: true, trim: true, lowercase: true, maxlength: 254 };
const userSchema = new Schema({ fullName: name, email, phone: { type: String, required: true, trim: true, maxlength: 30 } }, { timestamps: true });
userSchema.index({ email: 1 }, { unique: true });
export const User = model('User', userSchema);

const teacherSchema = new Schema({ fullName: name, email, specialization: { type: String, required: true, trim: true }, experience: { type: Number, required: true, min: 0 } }, { timestamps: true });
teacherSchema.index({ email: 1 }, { unique: true });
export const Teacher = model('Teacher', teacherSchema);

const sessionSchema = new Schema({
  teacherId: { type: Schema.Types.ObjectId, ref: 'Teacher', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  startTime: { type: Date, required: true }, endTime: { type: Date, required: true },
  status: { type: String, enum: ['AVAILABLE', 'BOOKED', 'COMPLETED'], default: 'AVAILABLE', required: true },
  completedAt: { type: Date, default: null },
}, { timestamps: true });
sessionSchema.index({ status: 1, startTime: 1, _id: 1 });
sessionSchema.index({ userId: 1, status: 1, startTime: 1, _id: 1 });
sessionSchema.index({ userId: 1, status: 1, completedAt: -1, _id: -1 });
export const Session = model('Session', sessionSchema);
