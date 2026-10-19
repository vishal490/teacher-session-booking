import mongoose from 'mongoose';
import { app } from './app';
import { environment } from './config/environment';
import { connectDatabase, ensureIndexes } from './config/database';
async function main() {
  await connectDatabase(environment.MONGODB_URI);
  await ensureIndexes();
  const server = app.listen(environment.PORT, () => console.log(`API listening on port ${environment.PORT}`));
  let stopping = false;
  const shutdown = async () => {
    if (stopping) return; stopping = true;
    const deadline = setTimeout(() => process.exit(1), 10000); deadline.unref();
    server.close(async () => { await mongoose.disconnect(); clearTimeout(deadline); process.exit(0); });
  };
  process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
}
async function start() { try { await main(); } catch (error) { console.error(error); await mongoose.disconnect(); process.exitCode = 1; } }
void start();
