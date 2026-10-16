import './env';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { config, logDataEnv } from './config';
import { connectDB, isMemoryDB } from './db';
import { seedDatabase } from './seed';
import { trackActivity } from './middleware/auth';
import mediaRouter from './routes/media';
import authRouter from './routes/auth';
import comicsRouter from './routes/comics';
import bookshelfRouter from './routes/bookshelf';
import historyRouter from './routes/history';
import commentsRouter from './routes/comments';
import reportsRouter from './routes/reports';
import feedbackRouter from './routes/feedback';
import usersRouter from './routes/users';
import adminRouter from './routes/admin';
import appRouter from './routes/app';

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '2mb' }));
// 全局活动埋点：刷新 lastActiveAt，支撑「用户管理」在线状态展示
app.use(trackActivity);

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'zhenjian-comic-server',
    memoryDB: isMemoryDB(),
    // 当前数据环境：test = 测试库，prod = 线上库
    dataEnv: config.dataEnv,
    time: Date.now(),
  });
});

app.use('/media', mediaRouter);
app.use('/api/auth', authRouter);
app.use('/api/comics', comicsRouter);
app.use('/api/bookshelf', bookshelfRouter);
app.use('/api/history', historyRouter);
app.use('/api/comments', commentsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/feedback', feedbackRouter);
app.use('/api/users', usersRouter);
app.use('/api/admin', adminRouter);
app.use('/api/app', appRouter);

// 同源托管前端打包产物（Electron 直接访问 http://127.0.0.1:<port>/ ，避免 file:// 的 CSP/CORS 问题）
const webCandidates = [
  process.env.WEB_DIST,
  path.resolve(__dirname, '../../web/dist'),
  path.resolve(__dirname, '../../web-dist'),
].filter(Boolean) as string[];

const webDist = webCandidates.find((p) => fs.existsSync(path.join(p, 'index.html')));
if (webDist) {
  app.use(express.static(webDist, { index: false, maxAge: '1h' }));
  app.get(/^\/(?!api\/|media\/).*/, (_req, res) => {
    res.sendFile(path.join(webDist, 'index.html'));
  });
  console.log(`[server] 前端资源目录: ${webDist}`);
}

app.use('/api', (_req, res) => {
  res.status(404).json({ message: '接口不存在' });
});

app.use((_req, res) => {
  res.status(404).json({ message: '资源不存在' });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[server] 错误:', err);
  res.status(500).json({ message: err.message || '服务端异常' });
});

export function startServer(): Promise<{ port: number }> {
  return new Promise((resolve, reject) => {
    logDataEnv();
    connectDB()
      .then(() => seedDatabase())
      .then(() => {
        const server = app.listen(config.port, '127.0.0.1', () => {
          console.log(`[server] 已启动: http://127.0.0.1:${config.port}`);
          resolve({ port: config.port });
        });
        server.on('error', reject);
      })
      .catch(reject);
  });
}

/** 直接以进程方式运行（被 Electron 主进程 require 时不会自动启动） */
if (require.main === module) {
  startServer().catch((err) => {
    console.error('[server] 启动失败:', err?.message || err);
    process.exit(1);
  });
}
