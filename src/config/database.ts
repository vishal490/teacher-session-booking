import mongoose from 'mongoose';
import { User, Teacher, Session } from '../models';

export async function connectDatabase(uri: string): Promise<void> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000, maxPoolSize: 20, autoIndex: false });
}

// Explicit provisioning: run before accepting requests; never drop existing indexes.
export async function ensureIndexes(): Promise<void> {
  await Promise.all([User.createIndexes(), Teacher.createIndexes(), Session.createIndexes()]);
}
