import './../env';
import mongoose from 'mongoose';
import { config } from '../config';
import { seedDatabase } from '../seed';

async function main() {
  const force = process.argv.includes('--force');
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
  await seedDatabase({ force });
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('[seed] 失败:', err);
  process.exit(1);
});
