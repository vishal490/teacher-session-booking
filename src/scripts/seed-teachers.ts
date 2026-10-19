import mongoose from 'mongoose';
import { environment } from '../config/environment';
import { connectDatabase, ensureIndexes } from '../config/database';
import { Teacher } from '../models';
async function seed() {
  try {
    await connectDatabase(environment.MONGODB_URI); await ensureIndexes();
    for (const teacher of [
      { fullName: 'Asha Sharma', email: 'asha@example.com', specialization: 'Mathematics', experience: 8 },
      { fullName: 'David Lee', email: 'david@example.com', specialization: 'Computer Science', experience: 6 },
    ]) {
      const result = await Teacher.findOneAndUpdate({ email: teacher.email }, { $setOnInsert: teacher }, { upsert: true, new: true, runValidators: true });
      console.log(JSON.stringify(result));
    }
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally { await mongoose.disconnect(); }
}
void seed();
