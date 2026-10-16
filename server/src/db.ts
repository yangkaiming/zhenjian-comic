import mongoose from 'mongoose';
import { config } from './config';

type MemoryServer = { stop: (runCleanup?: boolean) => Promise<boolean> };

let memoryServer: MemoryServer | null = null;

/** 是否运行在内存数据库上（供健康检查对外暴露） */
export function isMemoryDB(): boolean {
  return memoryServer !== null;
}

export async function connectDB(): Promise<void> {
  mongoose.set('strictQuery', true);
  try {
    // 云库（Atlas）走公网 + TLS 握手，给足连接时间；
// maxPoolSize 收紧：Atlas 免费版(M0)连接数上限较低，多人同时使用时
// 每个客户端默认 100 个连接会迅速耗尽配额，桌面端 10 条足够。
    await mongoose.connect(config.mongoUri, {
      serverSelectionTimeoutMS: 15000,
      maxPoolSize: 10,
    });
    console.log(`[db] MongoDB 已连接（${config.isProdData ? '线上库' : '测试库'}）`);
    return;
  } catch (err) {
    // 线上环境绝不回落内存库：否则重启即丢数据，且问题会被掩盖
    if (config.isProdData || process.env.AUTO_MEMORY_DB === 'false') {
      throw err;
    }
    console.warn(`[db] 无法连接 ${config.mongoUri}，正在启动内存数据库兜底（首次会下载 mongod，请稍候）…`);
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const server = await MongoMemoryServer.create({ instance: { dbName: 'zhenjian-comic' } });
    memoryServer = server as unknown as MemoryServer;
    await mongoose.connect(server.getUri(), { dbName: 'zhenjian-comic' });
    console.warn('[db] 已切换到内存数据库：功能完整，但进程退出后数据不会保留');
  }
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
}