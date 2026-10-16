/**
 * 数据迁移：把本地测试库的数据整体搬到线上云库（腾讯云 MongoDB）。
 *
 * 走 Node 原生驱动实现，无需安装 mongodump/mongorestore：
 *逐集合复制文档（保留原 _id，保证漫画/章节/评论等关联不失效），并把源库的索引
 * （含 unique 唯一索引）在目标库重建一遍。
 *
 * 连接串来源：
 *   - 源库：--src 参数 >本地测试库连接串（MONGODB_URI）
 *   - 目标库：--dst 参数 > .env.prod 的 MONGODB_URI_PROD
 *
 * 用法：
 *   npm run migrate:cloud -- --dry          # 只统计各集合文档数，不写目标库
 *   npm run migrate:cloud                    # 复制前需输入 yes 确认（会先清空目标库同名集合）
 *   npm run migrate:cloud -- --yes          # 跳过确认
 *   npm run migrate:cloud -- --src <uri> --dst <uri>
 */
import mongoose from 'mongoose';
import { createInterface } from 'node:readline/promises';

// 显式副作用导入：config虽被使用，但 env 必须先加载，
// 否则打包器会把未使用的导入连同 env 一起 tree-shake 掉
import '../env';
import { config } from '../config';

/** 单批最大条数（云库有单批 16MB 上限，故同时按体积提前切批） */
const BATCH = 500;

/** 读取命令行参数，同时支持 --name=value 与 --name value 两种写法 */
function arg(name: string): string {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const i = process.argv.indexOf(`--${name}`);
  const next = i >= 0 ? process.argv[i + 1] : undefined;
  if (next && !next.startsWith('--')) return next;
  return '';
}

function mask(uri: string): string {
  return uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@');
}

async function main() {
  const dry = process.argv.includes('--dry');
  const skipConfirm = process.argv.includes('--yes');

  const srcUri = arg('src') || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/zhenjian-comic';
  const dstUri = arg('dst') || process.env.MONGODB_URI_PROD || '';
  if (!dstUri) {
    throw new Error('缺少目标库连接串。请在 .env.prod 中配置 MONGODB_URI_PROD，或用 --dst 传入。');
  }
  if (srcUri === dstUri) {
    throw new Error('源库与目标库连接串相同，无需迁移。');
  }

  console.log(`[migrate] 源库  : ${mask(srcUri)}`);
  console.log(`[migrate] 目标库: ${mask(dstUri)}`);
  console.log(`[migrate] 当前默认数据环境：${config.dataEnv}`);

  const srcConn = await mongoose.createConnection(srcUri, { serverSelectionTimeoutMS: 20000 }).asPromise();
  const dstConn = await mongoose.createConnection(dstUri, { serverSelectionTimeoutMS: 20000 }).asPromise();
  const srcDb = srcConn.db;
  const dstDb = dstConn.db;
  if (!srcDb || !dstDb) throw new Error('无法获取数据库实例');

  const collections = (await srcDb.listCollections().toArray())
    .map((c) => c.name)
    .filter((name) => !name.startsWith('system.'));
  if (collections.length === 0) {
    console.log('[migrate] 源库没有任何集合，无需迁移');
    await srcConn.close();
    await dstConn.close();
    return;
  }

  // 先统计，方便确认规模
  const stats: Array<{ name: string; count: number }> = [];
  for (const name of collections) {
    const count = await srcDb.collection(name).countDocuments();
    stats.push({ name, count });
  }
  console.log(`[migrate] 源库共 ${collections.length} 个集合：`);
  stats.forEach((s) => console.log(`    -${s.name}: ${s.count} 条`));
  const total = stats.reduce((sum, s) => sum + s.count, 0);
  console.log(`[migrate] 合计${total} 条文档`);

  if (dry) {
    console.log('[migrate] dry-run 完成，未写入目标库');
    await srcConn.close();
    await dstConn.close();
    return;
  }

  if (!skipConfirm) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(
      `确认把以上 ${total} 条文档写入目标库？\n注意：目标库中的同名集合会被清空后重建。输入 yes 继续：`,
    );
    rl.close();
    if (answer.trim().toLowerCase() !== 'yes') {
      console.log('[migrate] 已取消，未写入任何数据');
      await srcConn.close();
      await dstConn.close();
      return;
    }
  }

  const startedAt = Date.now();
  for (const { name, count } of stats) {
    const srcCol = srcDb.collection(name);
    const dstCol = dstDb.collection(name);

    // 目标集合清空后重建，保证脚本可重复执行
    await dstCol.deleteMany({});

    let copied = 0;
    let ops: mongoose.mongo.AnyBulkWriteOperation<Record<string, unknown>>[] = [];
    const flush = async () => {
      if (!ops.length) return;
      await dstCol.bulkWrite(ops, { ordered: false });
      copied += ops.length;
      ops = [];
      console.log(`[migrate]   ${name}: ${copied}/${count}`);
    };

    const cursor = srcCol.find({});
    for await (const doc of cursor) {
      ops.push({ insertOne: { document: doc as Record<string, unknown> } });
      // 按条数与体积双阈值分批，兼顾速度与云库单批 16MB 限制
      if (ops.length >= BATCH || JSON.stringify(doc).length > 256 * 1024) {
        await flush();
      }
    }
    await flush();

    // 复制索引（含 unique），_id_ 索引目标库自带
    try {
      const indexes = await srcCol.indexes();
      const specs = indexes.filter((i) => i.name !== '_id_');
      if (specs.length) await dstCol.createIndexes(specs);
    } catch (err) {
      console.warn(`[migrate]   ${name} 索引重建失败（可稍后手动处理）：${(err as Error).message}`);
    }

    console.log(`[migrate] ${name}: 已复制 ${copied}/${count} 条`);
  }

  console.log(`[migrate] 完成，用时 ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
  await srcConn.close();
  await dstConn.close();
}

main().catch((e) => {
  console.error('[migrate] 失败:', (e as Error).message);
  process.exit(1);
});