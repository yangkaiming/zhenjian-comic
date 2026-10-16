import './env';

/** 数据环境：test = 本地测试库（dev），prod = 线上云库（打包后的正式包） */
export type DataEnv = 'test' | 'prod';

function resolveDataEnv(): DataEnv {
  const raw = String(process.env.COMIC_DATA_ENV || '').trim().toLowerCase();
  if (raw === 'prod' || raw === 'production') return 'prod';
  //未显式声明时按 NODE_ENV 兜底
  if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') return 'prod';
  return 'test';
}

const dataEnv = resolveDataEnv();

/** 本地测试库默认连接串 */
const DEFAULT_TEST_URI = 'mongodb://127.0.0.1:27017/zhenjian-comic';

/**
 * 线上连接串：prod 环境只认MONGODB_URI_PROD，缺失时直接抛错，
 * 避免线上包静默回落到本地库造成「数据写错库」的严重问题。
 */
function resolveMongoUri(env: DataEnv): string {
  if (env === 'prod') {
    const uri = String(process.env.MONGODB_URI_PROD || '').trim();
    if (!uri) {
      throw new Error(
        '缺少线上数据库连接串 MONGODB_URI_PROD。' +
          '请在项目根目录 .env.prod 中配置腾讯云 MongoDB 连接串后重试。',
      );
    }
    return uri;
  }
  return process.env.MONGODB_URI || DEFAULT_TEST_URI;
}

export const config = {
  port: Number(process.env.PORT || 9527),
  /** 当前数据环境 */
  dataEnv,
  /** 是否为线上数据环境（判断依据与 dataEnv 一致） */
  isProdData: dataEnv === 'prod',
  mongoUri: resolveMongoUri(dataEnv),
  jwtSecret: process.env.JWT_SECRET || 'zhenjian-comic-dev-secret',
  isProd: process.env.NODE_ENV === 'production',
  // 应用更新（“我的”页检查更新用）。均可用环境变量覆盖。
  latestVersion: process.env.APP_LATEST_VERSION || '',
  updateUrl: process.env.APP_UPDATE_URL || '',
  updateNotes: process.env.APP_UPDATE_NOTES || '',
  // 远程 manifest（JSON: {version,url,notes}）——推荐用于跨版本检测，优先级高于上面的静态值
  updateManifestUrl: process.env.APP_UPDATE_MANIFEST_URL || '',
};

/** 启动时打印一行，明确当前连的是测试库还是线上库（避免误操作线上数据） */
export function logDataEnv(): void {
  const kind = config.isProdData ? '线上库' : '测试库';
  const masked = config.mongoUri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@');
  console.log(`[config] 数据环境=${config.dataEnv}（${kind}） MongoDB=${masked}`);
}