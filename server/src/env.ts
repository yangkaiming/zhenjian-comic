import path from 'node:path';
import dotenv from 'dotenv';

const root = path.resolve(__dirname, '../..');

/** 是否按线上环境加载（.env.prod 优先） */
const isProdEnv = ['prod', 'production'].includes(
  String(process.env.COMIC_DATA_ENV || process.env.NODE_ENV || '').trim().toLowerCase(),
);

/**
 * 环境文件候选顺序（override:false，先定义者生效）：
 *   - 开发/测试：.env -> .env.prod
 *   - 线上：.env.prod -> .env
 * 两套配置共存于同一份代码，互不覆盖。
 *
 * 注意 root 取决于脚本入口（dev 下解析到 server/，打包后解析到 resources/），
 * 因此项目根目录下的文件还需通过 cwd 候选兜底查找。
 */
const files = isProdEnv ? ['.env.prod', '.env'] : ['.env', '.env.prod'];

const candidates = [
  process.env.COMIC_ENV_FILE,
  ...files.map((f) => path.resolve(root, f)),
  ...files.map((f) => path.resolve(process.cwd(), f)),
  path.resolve(process.cwd(), '.env'),
].filter(Boolean) as string[];

for (const file of candidates) {
  dotenv.config({ path: file, override: false });
}