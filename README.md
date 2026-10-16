# 帧间漫画（桌面版）

一款桌面端漫画阅读应用。名字取自「帧与帧之间」——漫画的故事，正是发生在画格与画格之间的留白里。

- **客户端**：Electron（无边框窗口 + 自定义标题栏）
- **前端**：React 18 + TypeScript + Vite + React Router + Zustand
- **服务端**：Node.js + TypeScript + Express + MongoDB(Mongoose)
- **数据库**：开发用本地 MongoDB（测试库），打包后自动切换到 MongoDB Atlas 云库（线上库），详见 [2.1](#21-双数据环境测试库-vs-线上库)
- **封面**：Python 爬虫从 **AniList 公共 API** 抓取真实漫画封面（`crawler/`），本地离线可用
- **内页**：章节页面图由服务端动态生成 SVG（占位分镜），可随时替换为真实图源

---

## 0. 图片全部走网络，不落盘

封面和阅读内容都**不在本地保存任何图片文件**，全部由 Python 爬虫从网上读取元数据后，前端直接从原站加载。

```bash
# 抓取约 120 部真实漫画（元数据 + 封面 URL + 章节 ID），纯标准库无需 pip install
npm run crawl
npm run seed -- --force   # 灌入数据库
```

数据源是 [MangaDex](https://mangadex.org) 的公共 API（`https://api.mangadex.org`，无需 Key）。它同时提供真实封面**和**真实章节页图。

```
crawler/
├─ crawl_mangadex.py   # 爬虫（仅用 Python 标准库，只记录 URL 不下载图片）
└─ output/
   └─ comics.json      # 元数据 + 远程封面 URL + MangaDex 章节 ID
```

### 加载方式

| 内容 | 来源 | 说明 |
| --- | --- | --- |
| 封面 | `https://uploads.mangadex.org/covers/...` | `.256.jpg`（约 20KB）用于列表，`.512.jpg` 用于 Banner |
| 章节目录 | 爬虫预抓，存 MangaDex 章节 ID | |
| 章节页图 | `https://*.mangadex.network/data-saver/...` | **按需**由服务端调 at-home 接口取 URL，结果缓存进 MongoDB |

页图默认用 MangaDex 的 **data-saver** 压缩版（单页约 200KB，约为原图的 1/4）；要原图画质可在 `.env` 设置 `MANGADEX_QUALITY=data`。

前端对远程图片做了懒加载 + 加载占位，滚动阅读时只下载可见页。

> 常用参数：`--limit 240` 抓更多、`--chapters 80` 每部多存话数、`--delay 0.8` 放慢请求（被限流时用）。
> MangaDex 上带中文章节的作品以日漫/韩漫为主，因此目录偏日韩向，这是数据源本身的分布。
> **没有爬虫数据时**会回退到内置演示数据 + 动态生成的 SVG 封面/页图，不跑爬虫也能启动。

---

## 0.5 无需安装 MongoDB 也能直接运行（仅测试环境）

项目会自动检测 `.env` 中配置的 MongoDB 是否可连。如果本地没有 MongoDB，首次启动时会自动下载并启动 **内存版 MongoDB**（`mongodb-memory-server`）作为兜底，功能完全可用，只是进程退出后数据不保留。

- 想使用真实数据库：启动本地/远程 MongoDB，或 `docker compose up -d`。
- 想禁用内存兜底：在 `.env` 中加入 `AUTO_MEMORY_DB=false`，未连接真实 MongoDB 时直接报错退出。

> ⚠️ **内存兜底只在测试环境生效**。线上环境（`COMIC_DATA_ENV=prod`）下严禁回落内存库——否则重启即丢数据且故障被掩盖，连不上会直接报错退出。

---

## 1. 功能清单

| 模块 | 功能 |
| --- | --- |
| 首页 | Banner 轮播、继续阅读、分类速览、热门连载、编辑精选、最近更新 |
| 分类 | 地区（国漫/日漫/韩漫/美漫）× 题材 × 状态（连载/完结）× 排序（人气/更新/评分/新作），完整分页 |
| 分页 | 上一页/下一页、可点击页码（带省略号）、输入页码跳转（回车或点「跳转」），超出范围自动收敛到首/末页 |
| 分类布局 | 筛选栏固定在顶部不随滚动移动，只有漫画列表区域滚动 |
| 排行 | 人气榜 / 更新榜 / 评分榜 / 新作榜，支持按地区筛选 |
| 搜索 | 关键词搜索、联想建议、热搜词、本地搜索历史 |
| 详情 | 封面信息、题材标签、目录（正序/倒序）、加入书架、开始/继续阅读、评论与点赞 |
| 书架 | 想读 / 追更中 / 已看完 / 搁置 四种状态，阅读进度条，状态一键切换，续读直达上次进度 |
| 阅读器 | 卷轴（条漫）/ 翻页 / 日漫（右→左）三种模式；适应宽度/高度/原始尺寸；亮度调节；页间距；目录抽屉；上一话/下一话；键盘快捷键；全屏 |
| 主题 | 深色 / 浅色一键切换，作用于整个 Electron 窗口（含窗口底色同步），记忆用户选择 |
| 账号 | 注册 / 登录 / JWT / 昵称修改，书架与阅读进度按账号同步，用户名全局唯一 |
| 意见反馈 | 「我的」页入口打开独立二级窗口，分为「提交反馈 / 我的反馈」两个页签，可查看官方回复 |
| 后台管理 | 漫画增删改查、章节抓取刷新、反馈处理、用户管理（管理员角色） |

### 阅读器快捷键

| 按键 | 作用 |
| --- | --- |
| `←` `→` | 翻页（日漫模式下方向相反） |
| `空格` / `↓` | 下一页 |
| `↑` | 上一页 |
| `M` | 打开/关闭目录 |
| `S` | 打开/关闭设置 |
| `F` / `F11` | 切换全屏（进出都可以） |
| `Esc` | 全屏时先退出全屏，否则返回漫画详情 |

### 窗口控制

- **最小化 / 最大化 / 关闭**：标题栏右侧三个按钮
- **最大化 ⇄ 还原**：再点一次即还原到之前大小；图标与提示文案（`最大化` / `还原窗口大小`）实时同步；**双击标题栏空白处**也可切换
- **全屏**：阅读器顶栏的「全屏 / 退出全屏」是同一个开关，`F`、`F11`、`Esc` 均可退出，全屏时右下角有常驻提示
- 窗口状态由主进程统一广播，渲染层只负责显示，避免状态不同步

### 返回上一层

返回按钮只加在**漫画详情页**：页面顶部有 `← 返回上一层 / 首页 / 分类 / 漫画名` 面包屑，其中「返回上一层」执行浏览器后退（没有可退历史时回到首页），「首页」「分类」可点击跳转。其它页面保持原有布局，不额外加返回按钮。

### 主题切换

应用内置深色 / 浅色两套主题，切换入口有三处：

- 标题栏右侧的 ☀️ / 🌙 按钮（最快）
- 阅读器「设置 → 应用主题」
- 「我的 → 阅读设置 → 应用主题」

实现方式：主题变量挂在 `html[data-theme]` 上（`web/src/styles/global.css`），切换时同时通过 IPC 调用 `win.setBackgroundColor()` 同步 Electron 窗口底色，避免缩放/加载时出现颜色撕裂。选择会写入 localStorage，下次启动自动恢复。

阅读器画布背景跟随主题（深色主题 → 深色阅读底，浅色主题 → 米白阅读底），不再提供独立的阅读背景色。

---

## 2. 环境准备

- Node.js 18+（建议 20 LTS）
- MongoDB（本地或远程）

### 2.1 双数据环境：测试库 vs 线上库

项目通过 `COMIC_DATA_ENV` 标记区分两套数据，**同一份代码自动切换**：

| 场景 | `COMIC_DATA_ENV` | 读取的配置 | 实际连接的数据库 |
| --- | --- | --- | --- |
| `npm run dev`（开发） | `test` | `.env` 的 `MONGODB_URI` | 本地 MongoDB（测试库） |
| `npm start` / `npm run dist`（打包后） | `prod` | `.env.prod` 的 `MONGODB_URI_PROD` | MongoDB Atlas（线上库） |

判定逻辑：

- 开发态由 `.env` 的 `COMIC_DATA_ENV=test` 决定；
- 打包后 Electron 主进程检测到 `app.isPackaged`，自动把 `COMIC_DATA_ENV` 置为 `prod`（仅在未显式指定时）；
- `env.ts` 按环境决定加载顺序：测试态 `.env → .env.prod`，线上态 `.env.prod → .env`，两套配置可共存互不覆盖。

启动日志与健康检查都会标明当前环境，便于确认没连错库：

```
[config] 数据环境=prod（线上库） MongoDB=mongodb://appuser:****@xxx.mongodb.net:27017,...
$ curl http://127.0.0.1:9527/api/health
{"ok":true,"memoryDB":false,"dataEnv":"prod",...}
```

安全兜底：线上环境若缺少 `MONGODB_URI_PROD`，或连接失败，**直接抛错退出**，绝不静默回落到本地库或内存库。

### 2.2 测试库（开发用）

启动 MongoDB 最简单的方式（项目内已提供）：

```bash
docker compose up -d
```

或本地安装 MongoDB 后默认 `mongodb://127.0.0.1:27017`。根目录 `.env`：

```env
# 数据环境：test = 走下面的本地测试库
COMIC_DATA_ENV=test
PORT=9527
MONGODB_URI=mongodb://127.0.0.1:27017/zhenjian-comic
JWT_SECRET=zhenjian-comic-dev-secret
```

### 2.3 线上库（打包后使用）

根目录 `.env.prod`（**已加入 `.gitignore`，且会被打进安装包**）：

```env
# 数据环境：prod = 连接线上库
COMIC_DATA_ENV=prod
MONGODB_URI_PROD=mongodb://<用户>:<密码>@<节点1>:27017,<节点2>:27017,<节点3>:27017/zhenjian-comic?authSource=admin&tls=true&retryWrites=true&w=majority
JWT_SECRET=<随机长字符串>
PORT=9527
```

以 **MongoDB Atlas**（免费版 M0 即可，本项目数据量约 4MB）为例：

1. 建集群（免费 M0）
2. **Database Access** → Add New Database User：Authentication Database 选 `admin`，角色选 `Read and Write to any database`，密码点 `Autogenerate Secure Password` 并**立即复制**
3. **Network Access → IP Access List** 添加放行来源（本机公网 IP；需多人使用时填 `0.0.0.0/0`）
4. 集群卡片 **Connect → Drivers** 复制连接串

> **国内网络请务必用「标准(非 SRV)」连接串**，即上面显式写全节点地址的形式。
> Atlas 默认给的 `mongodb+srv://` 依赖 DNS SRV 记录查询，部分运营商/本地 DNS 解析器会直接拒绝（报 `querySrv ECONNREFUSED`）导致连不上。SRV 记录可在 Connect 弹窗的 SRV 响应里查到全部节点地址。

### 2.4 让别人也能用（方案 A：直连云库）

当前架构是**每台电脑运行一个内嵌服务端、直连同一个云数据库**。因此：

1. Atlas 白名单放开到 `0.0.0.0/0`（Atlas 不接受 `::/0`，IPv6 用户通常为双栈、仍走 IPv4 出口，无需单独放行）
2. `npm run dist` 打包后分发给使用者
3. 所有人共享同一个线上库

⚠️ 已知代价：

- **凭据随安装包分发**，拿到包的人可提取数据库账号密码，等价于库被开放；建议在 Atlas 把应用账号权限收窄为仅 `zhenjian-comic` 库读写
- Atlas 免费版**无备份**、共享集群有连接数与限流限制（桌面端已把连接池收紧为 10），适合小范围使用
- 部分企业网/校园网封禁 27017 端口，这批用户会连不上（需改用后端 API 代理方案）

---

## 3. 安装与运行

```bash
# 一次性安装三处依赖（根 / server / web）
npm run install:all
```

### 开发模式（前端热更新 + 服务端热重载）

```bash
npm run dev
```

该命令会并行启动：

- `server`：http://127.0.0.1:9527 （tsx watch）
- `web`：http://localhost:5173 （vite）
- Electron 窗口（自动连接 dev server）

### 生产模式（编译后单进程运行）

```bash
npm start
```

服务端会被编译为 `server/dist`，并由 Electron **主进程内直接加载**，无需额外 Node 进程；前端由同一服务端以 `http://127.0.0.1:<port>/` 同源提供（避免 `file://` 的 CSP/CORS 限制）。

### 重新灌入数据

```bash
npm run crawl           # 重新爬封面（有缓存则跳过下载）
npm run seed -- --force # 用最新爬虫数据清空重建数据库
```

演示账号：**demo / 123456**（首次启动自动创建）。默认爬虫数据约 120 部漫画（国漫/韩漫/日漫各 40）。

### 数据迁移与运维命令

所有脚本统一走 `config.mongoUri`，即**在哪个数据环境下运行就作用于哪个库**（线上环境跑破坏性脚本需显式加 `--yes`）。

```bash
# 本地测试库 -> 线上云库（保留原 _id，关联不失效；自动复制索引含唯一索引）
npm run migrate:cloud -- --dry              # 只统计各集合条数，不写库
npm run migrate:cloud                        # 确认后迁移（会先清空线上同名集合）
npm run migrate:cloud -- --src <uri> --dst <uri>   # 自定义源/目标

# 清理「只有一章」的漫画：删除漫画 + 其章节，并级联清理评论/历史/书架
npm run purge:single -- --dry               # 预览清单
npm run purge:single                         # 确认后删除
npm run purge:single -- --yes               # 跳过确认

# 存量数据英译中（漫画标题/简介）
npm run localize:db -- --dry                # 只统计
npm run localize:db                          # 执行
```

### 打包

```bash
npm run dist           # 产出免安装目录 release/win-unpacked/（最快，日常试用）
npm run dist:installer # 产出 Windows 安装包（推荐，约 1 分钟，图标正确）
npm run refresh:icon   # 刷新 Windows 图标缓存（打包后让新图标立刻显示）

npm run dist:sfx       # 可选：更小的自解压包（约 3 分钟 / 83MB，但安装包文件本身用 NSIS 默认图标）
```

> 打包产物会自动使用**线上库**（`.env.prod` 的 `MONGODB_URI_PROD`，随包分发），无需再改任何配置。

**推荐用 `npm run dist:installer`**：安装包图标正确（走 electron-builder 官方设图标流程），且已通过 `ELECTRON_BUILDER_COMPRESSION_LEVEL=1` 把默认的「7z 最高压缩（十几分钟）」提速到**约 1 分钟**，体积约 97MB。安装时**自选安装位置**（默认 `C:\Program Files\帧间漫画`，可改成 D 盘等任意目录，会记住上次选择）、桌面/开始菜单快捷方式，并附带卸载程序。

> 若更在意体积，可用 `npm run dist:sfx`（约 83MB）；但它自制的 NSIS 安装包文件图标为默认图标（**安装后应用本身的图标不受影响**），故正式分发建议用 `dist:installer`。

> 打包**不会修改** `server/node_modules`（体积优化由拷贝时过滤 devDeps 实现），开发环境不受影响。

#### 打包产物在哪里

所有产物都在项目根目录的 **`release/`**：

| 命令 | 产物位置 | 说明 |
| --- | --- | --- |
| `npm run dist` | `release/win-unpacked/` | **免安装目录**，里面有 `帧间漫画.exe`，双击即可运行，适合自己试用/分发给熟人 |
| `npm run dist:installer` | `release/帧间漫画 Setup <版本号>.exe` | **推荐分发**：Windows 安装包（图标正确，约 1 分钟 / 97MB），双击走安装向导，可自选安装位置 |
| `npm run dist:sfx` | `release/帧间漫画 Setup <版本号>.exe` | 更小的自解压包（83MB），安装包文件图标为默认图标；与 `dist:installer` 同名会互相覆盖 |
| 都会生成 | `release/builder-debug.yml`、`*.blockmap` | 打包元数据 |

安装包内包含的内容（安装后在 `resources/` 下）：

```
resources/
├─ .env.prod          # 线上库连接串（随包分发，注意凭据安全）
├─ server/dist/       # 编译后的服务端（由 Electron 主进程内嵌加载）
├─ server/node_modules/
└─ web-dist/          # 前端产物
```

其余编译中间产物不在 `release/` 里，注意区分：

| 目录 | 内容 |
| --- | --- |
| `dist-electron/` | Electron 主进程 / preload 的编译产物 |
| `server/dist/` | 服务端 TypeScript 编译产物 |
| `web/dist/` | 前端 Vite 打包产物 |
| `release/` | **最终可分发的应用**（上面第一张表） |

> 想重新打包前先清干净：直接删除 `release/` 目录即可（已在 `.gitignore` 中）。

### 发布检查清单

1. `.env.prod` 的 `MONGODB_URI_PROD`、`JWT_SECRET` 已填好（`JWT_SECRET` 为随机长字符串）
2. Atlas 应用账号权限已收窄为仅 `zhenjian-comic` 库读写
3. Atlas IP Access List 按需设置（多人使用填 `0.0.0.0/0`）
4. `npm run build` 通过、`npm run dist:installer` 产出安装包（打包后可用 `npm run refresh:icon` 让新图标立即显示）
5. 在干净机器上装包验证：启动日志显示 `数据环境=prod（线上库）`，`/api/health` 返回 `"dataEnv":"prod"`

> 当前为「客户端直连云数据库」方案，数据库凭据随包分发。若要正式对外大规模发布，建议改为后端 API 代理模式：部署服务端到公网服务器，桌面端只连 API，Atlas 白名单仅放行该服务器 IP，从而避免凭据外泄并可做限流/备份。

---

## 4. 目录结构

```
comic/
├─ electron/            # Electron 主进程 & 预加载（TS -> dist-electron）
│  ├─ main.ts           # 窗口、服务端托管、IPC
│  ├─ main.ts           # 窗口、服务端托管、IPC
│  └─ preload.ts        # contextBridge 暴露 API
├─ crawler/              # Python 爬虫（MangaDex，只取 URL 不下载图片）
│  ├─ crawl_mangadex.py
│  └─ output/           # comics.json
├─ server/              # Node.js + TypeScript 服务端
│  └─ src/
│     ├─ index.ts       # Express 入口，导出 startServer() 供主进程内嵌
│     ├─ config.ts      # 数据环境判定 + 数据库连接串选择
│     ├─ env.ts         # 按环境加载 .env / .env.prod
│     ├─ db.ts          # 连接 MongoDB（线上环境禁止回落内存库）
│     ├─ seed.ts        # 数据初始化（优先使用爬虫数据）
│     ├─ models/        # Comic / Chapter / User / BookShelf / History / Comment
│     ├─ routes/        # auth / comics / bookshelf / history / comments / media
│     ├─ scripts/       # 运维脚本（见 3.x 命令）
│     │  ├─ seed.ts                 # 灌入演示/爬虫数据
│     │  ├─ migrate-to-cloud.ts     # 本地库 -> 云库迁移
│     │  ├─ purge-single-chapter.ts # 清理只有一章的漫画
│     │  └─ localize-db.ts          # 标题/简介英译中
│     ├─ utils/art.ts   # 动态生成漫画内页 SVG（封面兜底）
│     ├─ data/crawled.ts# 读取爬虫输出
│     └─ data/comics.ts # 内置演示漫画（无爬虫数据时回退）
├─ web/                 # React + TS 前端
│  └─ src/
│     ├─ pages/         # Home/Category/Rank/Bookshelf/Search/Detail/Reader/Login/Mine/Feedback
│     ├─ components/    # Layout / ComicCard / States / Toaster
│     ├─ store/         # auth / settings / toast
│     └─ styles/        # global.css / reader.css / feedback-override.css
├─ docker-compose.yml
├─ .env                 # 测试环境配置（开发用）
├─ .env.prod            # 线上环境配置（Atlas 连接串，已 gitignore，会打进安装包）
├─ dist-electron/       # Electron 主进程编译产物（npm run build:electron）
├─ server/dist/         # 服务端编译产物（npm run build:server）
├─ web/dist/            # 前端产物（npm run build:web）
└─ release/             # 打包产物（npm run dist / dist:sfx / dist:installer）
```

---

## 5. 接口一览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 |
| GET | `/api/comics/home` | 首页聚合数据 |
| GET | `/api/comics` | 列表（q/category/region/status/sort/page/limit） |
| GET | `/api/comics/meta` | 分类、地区、热搜词 |
| GET | `/api/comics/suggest?q=` | 搜索联想 |
| GET | `/api/comics/rank?type=&region=` | 排行榜 |
| GET | `/api/comics/:id` | 详情（含目录） |
| GET | `/api/comics/:id/chapters` | 目录分页 |
| GET | `/api/comics/chapter/:chapterId` | 章节页面图 |
| POST | `/api/auth/register` `/api/auth/login` | 注册 / 登录 |
| GET/PATCH | `/api/auth/me` `/api/auth/profile` | 用户信息 |
| GET/POST/PATCH/DELETE | `/api/bookshelf` | 书架 CRUD、进度上报 |
| GET | `/api/bookshelf/:comicId/resume` | 续读定位 |
| GET/POST | `/api/history` | 阅读历史 |
| GET/POST | `/api/comments` | 评论列表 / 发布 |
| GET | `/media/cover.svg` `/media/page.svg` | 动态生成封面 / 内页（无爬虫数据时的兜底） |
| GET | `/api/comics/chapter/:chapterId` | 返回 `remote:true` 时为 MangaDex 远程页图 URL |

---

## 6. 常见问题

**窗口提示"服务端启动失败"**

- 开发态：MongoDB 未连上。确认已 `docker compose up -d`，或修改 `.env` 的 `MONGODB_URI`。
- 打包态（线上环境）：检查 ①本机能否访问 Atlas（`Test-NetConnection <节点>:27017`）；②`.env.prod` 的 `MONGODB_URI_PROD` 是否正确；③Atlas **IP Access List** 是否已放行本机公网出口 IP（[https://ip.cn](https://ip.cn) 可查）。

**报错 `querySrv ECONNREFUSED _mongodb._tcp.xxx.mongodb.net`**

DNS 解析器拒绝 SRV 记录查询（国内常见）。把连接串换成**标准(非 SRV) 形式**，显式写全三个节点地址即可绕开（格式见 2.3）。

**报错 `Could not connect to any servers in your MongoDB Atlas cluster`**

本机公网 IP 不在 Atlas 白名单。注意运营商的公网 IP 会变，手机热点/换网络后需要重新添加。

**报错 `Authentication failed`**

确认连接串里的用户名/密码与 Atlas **Database Access** 中的一致，且密码里的 `@ : / #` 已做 URL 编码（`#`→`%23`、`@`→`%40`）。

**如何确认当前连的是哪个库？**

- 启动日志首行：`[config] 数据环境=prod（线上库）` 或 `=test（测试库）`
- `curl http://127.0.0.1:9527/api/health` 看 `dataEnv` 字段
- Compass 里对比 `localhost:27017`（本地测试库）与 Atlas 连接（线上库）两个连接下的数据

**端口被占用**
修改 `.env` 中的 `PORT`（默认 9527），前端 dev server 端口在 `web/vite.config.ts`（默认 5173）。

**为什么有些漫画的页图还是程序生成的？**
MangaDex 拿不到该章页图（节点超时/被限流）时会回退到服务端动态生成的 SVG 占位页，重进一次通常会恢复为真实页图。

**图片加载慢？**
1. 默认用 data-saver 压缩版，想看原图在 `.env` 设置 `MANGADEX_QUALITY=data`；
2. 阅读器对远程页图做了懒加载，只下载可见页；
3. MangaDex 节点在国内访问可能较慢，必要时可自建反代。
