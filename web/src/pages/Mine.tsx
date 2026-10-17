import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, bridge } from '../api';
import { useAuth } from '../store/auth';
import { toast } from '../store/toast';
import { READER_BG_LABELS, useSettings, type ReaderFit, type ReaderMode } from '../store/settings';
import { useUpdate } from '../store/update';
import { versionLabel, RELEASE_HIGHLIGHTS } from '../version';
import ReleaseNotes, { toSections, type NoteSection } from '../components/ReleaseNotes';
import { Loading } from '../components/States';


/** 后台管理工具（新增工具只需在此追加一项） */
const ADMIN_TOOLS: Array<{
  route: string;
  icon: string;
  title: string;
  desc: string;
  color: string;
  badge?: 'reports' | 'feedback';
}> = [
  {
    route: '/admin/reports',
    icon: '📋',
    title: '举报与反馈',
    desc: '查看并处理用户的反馈与举报',
    color: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    badge: 'reports',
  },
  {
    route: '/admin/users',
    icon: '👥',
    title: '用户管理',
    desc: '管理账号、角色与权限',
    color: 'linear-gradient(135deg, #10b981, #059669)',
  },
  {
    route: '/admin/fetch',
    icon: '📥',
    title: '漫画导入',
    desc: '从数据源批量导入漫画与章节',
    color: 'linear-gradient(135deg, #0ea5e9, #22d3ee)',
  },
  {
    route: '/admin/recommend',
    icon: '⭐',
    title: '编辑推荐',
    desc: '配置首页轮播的推荐漫画',
    color: 'linear-gradient(135deg, #f59e0b, #ef4444)',
  },
  {
    route: '/admin/feedback',
    icon: '💬',
    title: '功能反馈',
    desc: '查看并回复用户提交的功能反馈',
    color: 'linear-gradient(135deg, #ec4899, #f43f5e)',
    badge: 'feedback',
  },
];

/** 只取日期部分（YYYY-MM-DD），去掉时分秒；非标准格式则原样返回 */
function dateOnly(t?: string): string {
  if (!t) return '';
  const m = t.match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : t;
}

/** 是否是合法的 http(s) 下载地址（过滤「请填写…」等占位文案） */
function isHttpUrl(u?: string): u is string {
  return !!u && /^https?:\/\//i.test(u);
}

export default function Mine() {
  const user = useAuth((s) => s.user);
  const ready = useAuth((s) => s.ready);
  const logout = useAuth((s) => s.logout);
  const navigate = useNavigate();

  const mode = useSettings((s) => s.mode);
  const fit = useSettings((s) => s.fit);
  const customScale = useSettings((s) => s.customScale);
  const theme = useSettings((s) => s.theme);
  const gap = useSettings((s) => s.gap);
  const readerBg = useSettings((s) => s.readerBg);
  const update = useSettings((s) => s.update);

  const [nickname, setNickname] = useState(user?.nickname || '');
  const currentVersion = versionLabel(bridge?.appVersion);
  const latest = useUpdate((s) => s.latest);
  const checking = useUpdate((s) => s.checking);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [verSel, setVerSel] = useState('');

  // 版本信息弹窗：只展示「最新」与「当前」两个版本，供切换查看各自描述
  type VerEntry = {
    version: string;
    buildTime: string;
    notes: string | NoteSection[];
    url: string;
    isCurrent: boolean;
    isLatest: boolean;
  };
  const versionList: VerEntry[] = (() => {
    const list: VerEntry[] = [];
    const seen = new Set<string>();
    const push = (v: Omit<VerEntry, 'isCurrent' | 'isLatest'>) => {
      if (!v.version || seen.has(v.version)) return;
      seen.add(v.version);
      list.push({ ...v, isCurrent: v.version === currentVersion, isLatest: false });
    };
    const cosVersions = latest?.versions || [];
    const latestVer = latest?.version || cosVersions[0]?.version || '';
    // 1) 最新版本（COS 第一条）
    const latestEntry = cosVersions.find((v) => v.version === latestVer) || cosVersions[0];
    if (latestEntry) {
      push({ version: latestEntry.version, buildTime: latestEntry.buildTime || '', notes: latestEntry.notes, url: latestEntry.url || '' });
    } else if (latestVer) {
      push({ version: latestVer, buildTime: latest?.buildTime || '', notes: latest?.notes || '', url: latest?.url || '' });
    }
    // 2) 当前版本（与最新不同才加入；优先用 COS 说明，没有则用内置功能清单兜底）
    if (currentVersion && currentVersion !== latestVer) {
      const cur = cosVersions.find((v) => v.version === currentVersion);
      if (cur) {
        push({ version: cur.version, buildTime: cur.buildTime || '', notes: cur.notes, url: cur.url || '' });
      } else {
        push({
          version: currentVersion,
          buildTime: '',
          notes: [{ title: '重要功能', items: RELEASE_HIGHLIGHTS.map((h) => `${h.title}：${h.desc}`) }],
          url: '',
        });
      }
    }
    list.forEach((e) => (e.isLatest = e.version === latestVer));
    return list;
  })();
  const activeVer = versionList.find((v) => v.version === verSel) || versionList.find((v) => v.isCurrent) || versionList[0];
  const isAdminUser = user?.role === 'admin';
  const [adminBadges, setAdminBadges] = useState({ reports: 0, feedback: 0 });
  // 后台管理：超过 3 条默认折叠，仅展示前 3 项 + 展开按钮
  const [adminCollapsed, setAdminCollapsed] = useState(true);
  const ADMIN_VISIBLE = adminCollapsed ? ADMIN_TOOLS.slice(0, 3) : ADMIN_TOOLS;

  // 后台管理：拉取未处理的举报 / 反馈数量，用于卡片图标角标（仅管理员，每 60s 刷新）
  useEffect(() => {
    if (!isAdminUser) return;
    let stop = false;
    const load = () => {
      Promise.all([
        api.reports({ limit: 1 }).then((r) => r.pending).catch(() => 0),
        api.feedbackList({ limit: 1 }).then((r) => r.pending).catch(() => 0),
      ]).then(([reports, feedback]) => {
        if (!stop) setAdminBadges({ reports, feedback });
      });
    };
    load();
    const t = window.setInterval(load, 60000);
    return () => {
      stop = true;
      window.clearInterval(t);
    };
  }, [isAdminUser]);

  const checkUpdate = async () => {
    await useUpdate.getState().check();
    const s = useUpdate.getState();
    // 有新版本：直接打开版本信息弹窗（内含说明与更新按钮）；否则提示已是最新
    if (s.latest?.version && s.hasUpdate) setAboutOpen(true);
    else toast.success('已是最新版本');
  };

  // 查看版本信息：打开即刷新一次更新说明（失败也不影响看版本号）
  const openAbout = async () => {
    setAboutOpen(true);
    await useUpdate.getState().check();
  };

  // 后台管理页：优先在独立二级窗口打开；若 IPC 不可用则回退为站内导航
  const openAdmin = (route: string) => openPopup(route);

  // 意见反馈：与后台工具一致，在独立二级窗口打开；IPC 不可用时回退站内导航
  const openFeedback = () => openPopup('/feedback');

  // 通用：优先用 Electron 独立窗口打开指定路由，失败则站内导航
  const openPopup = (route: string) => {
    if (bridge?.openWindow) {
      Promise.resolve(bridge.openWindow(route)).catch(() => navigate(route));
    } else {
      navigate(route);
    }
  };

  // ---------- 意见反馈：点击在独立二级窗口打开（见 openFeedback） ----------

  if (!ready) return <Loading />;

  if (!user) {
    return (
      <div className="empty" style={{ paddingTop: 80 }}>
        <div className="empty-icon">🔐</div>
        <div>登录后可使用完整功能</div>
        <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate('/login')}>
          去登录
        </button>
      </div>
    );
  }

  return (
    <div className="page">
      <h1 className="page-title">个人中心</h1>

      <div className="panel profile-card">
        <div className="row">
          <div className="avatar profile-avatar" style={{ width: 52, height: 52, flex: '0 0 52px', fontSize: 20 }}>
            {(user.nickname || user.username).slice(0, 1)}
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700 }}>{user.nickname || user.username}</div>
            <div className="muted" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
              <span>@{user.username}</span>
              {user.role === 'admin' && <span className="role-badge admin">管理员</span>}
            </div>
          </div>
          <div className="spacer" />
          <button
            className="btn"
            onClick={() => {
              logout();
              toast.success('已退出登录');
            }}
          >
            退出登录
          </button>
        </div>
        <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
          <input
            className="input"
            style={{ maxWidth: 240 }}
            value={nickname}
            placeholder="修改昵称"
            onChange={(e) => setNickname(e.target.value)}
          />
          <button
            className="btn"
            onClick={async () => {
              try {
                const r = await api.updateProfile({ nickname });
                useAuth.getState().patch(r.user);
                toast.success('昵称已更新');
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          >
            保存
          </button>
        </div>
      </div>

      <div
        className="panel feedback-panel feedback-entry"
        onClick={openFeedback}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openFeedback();
          }
        }}
      >
        <div className="panel-title">
          <span>💬 意见反馈</span>
          <span className="panel-tag">官方直收</span>
        </div>
        <div className="muted" style={{ marginBottom: 14, fontSize: 13 }}>
          遇到问题或有好点子？点击在新窗口告诉我们，帮助我们把产品做得更好。
        </div>
        <span className="btn btn-primary feedback-open-btn">✏️ 我要反馈</span>
      </div>

      <div className="panel mine-settings">
        <div className="panel-title">📖 阅读设置</div>
        <div className="setting-group">
          <div className="setting-label">阅读模式</div>
          <div className="setting-options">
            {(
              [
                ['scroll', '卷轴（条漫）'],
                ['page', '翻页'],
                ['manga', '日漫（右→左）'],
              ] as Array<[ReaderMode, string]>
            ).map(([k, label]) => (
              <button key={k} className={`setting-opt${mode === k ? ' active' : ''}`} onClick={() => update({ mode: k })}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="setting-group">
          <div className="setting-label">页面适配</div>
          <div className="setting-options">
            {(
              [
                ['width', '适应宽度'],
                ['height', '适应高度'],
                ['origin', '原始尺寸'],
                ['custom', '自定义'],
              ] as Array<[ReaderFit, string]>
            ).map(([k, label]) => (
              <button key={k} className={`setting-opt${fit === k ? ' active' : ''}`} onClick={() => update({ fit: k })}>
                {label}
              </button>
            ))}
          </div>
          {fit === 'custom' && (
            <div className="setting-extra">
              <div className="setting-label" style={{ marginBottom: 8 }}>图片尺寸 {customScale}%</div>
              <input
                className="setting-slider"
                type="range"
                min={20}
                max={300}
                step={5}
                value={customScale}
                onChange={(e) => update({ customScale: Number(e.target.value) })}
              />
              <div className="setting-hint">
                按百分比缩放图片宽度（50%–300%），阅读器生效
              </div>
            </div>
          )}
        </div>
        <div className="setting-group">
          <div className="setting-label">阅读器背景</div>
          <div className="setting-options">
            {READER_BG_LABELS.map(([k, label]) => (
              <button
                key={k}
                className={`setting-opt${readerBg === k ? ' active' : ''}`}
                onClick={() => update({ readerBg: k })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="setting-group" style={{ marginBottom: 0 }}>
          <div className="setting-label">页间距</div>
          <button className={`setting-opt${gap ? ' active' : ''}`} onClick={() => update({ gap: !gap })}>
            {gap ? '已开启' : '已关闭'}
          </button>
        </div>
      </div>

      <div className="panel mine-settings">
        <div className="panel-title">🌗 主题与外观</div>
        <div className="setting-group" style={{ marginBottom: 0 }}>
          <div className="setting-label">主题模式</div>
          <div className="setting-options">
            <button
              className={`setting-opt${theme === 'dark' ? ' active' : ''}`}
              onClick={() => update({ theme: 'dark' })}
            >
              🌙 深色
            </button>
            <button
              className={`setting-opt${theme === 'light' ? ' active' : ''}`}
              onClick={() => update({ theme: 'light' })}
            >
              ☀️ 浅色
            </button>
          </div>
        </div>
      </div>

      {user?.role === 'admin' && (
        <div className="panel">
          <div className="panel-title">
            <span>🛠️ 后台管理</span>
            <span className="panel-tag">仅管理员</span>
          </div>
          <div className="muted" style={{ marginBottom: 14 }}>
            以下工具在独立窗口打开，便于对照主窗口操作。
          </div>
          <div className="admin-grid">
            {ADMIN_VISIBLE.map((t) => (
              <button
                className="admin-card"
                key={t.route}
                onClick={() => openAdmin(t.route)}
              >
                <span className="admin-card-icon" style={{ background: t.color }}>
                  {t.icon}
                  {t.badge && adminBadges[t.badge] > 0 && (
                    <span className="admin-badge">{adminBadges[t.badge] > 99 ? '99+' : adminBadges[t.badge]}</span>
                  )}
                </span>
                <span className="admin-card-body">
                  <span className="admin-card-title">{t.title}</span>
                  <span className="admin-card-desc">{t.desc}</span>
                </span>
                <span className="admin-card-go">打开 →</span>
              </button>
            ))}
          </div>
          {ADMIN_TOOLS.length > 3 && (
            <button className="admin-toggle" onClick={() => setAdminCollapsed((v) => !v)}>
              {adminCollapsed ? `展开全部（${ADMIN_TOOLS.length}）` : '收起'}
              <span className="admin-toggle-arrow">{adminCollapsed ? '▾' : '▴'}</span>
            </button>
          )}
        </div>
      )}

      <div className="panel">
        <div className="panel-title">ℹ️ 关于</div>
        <div className="kv">
          <span>应用版本</span>
          <b>v{currentVersion}</b>
        </div>
        {bridge?.platform && (
          <div className="kv">
            <span>运行平台</span>
            <span>{bridge.platform}</span>
          </div>
        )}
        <div className="row" style={{ marginTop: 14, gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={openAbout}>
            查看版本信息
          </button>
          <button className="btn" onClick={checkUpdate} disabled={checking}>
            {checking ? '检查中…' : '检查更新'}
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">📜 免责声明</div>
        <div className="muted" style={{ fontSize: 13, lineHeight: 1.8 }}>
          本应用为个人开源的漫画阅读工具，所有漫画元数据、封面与章节图片均来自第三方公开数据源，
          本站不存储、不篡改任何图片文件，仅按需从网络加载。相关内容版权归原作者及出版方所有，
          仅供学习与交流使用，请于获取后 24 小时内删除并支持正版。若内容涉及侵权，请联系我们及时处理。
        </div>
      </div>

      {aboutOpen && (
        <div className="modal-mask" onClick={() => setAboutOpen(false)}>
          <div className="modal about-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">版本信息</div>
            <div className="modal-body">
              <div className="about-hero">
                <div className="about-logo">帧</div>
                <div className="about-hero-info">
                  <div className="about-name">帧间漫画</div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    版本 v{currentVersion}
                    {bridge?.platform ? ` · ${bridge.platform}` : ''}
                  </div>
                </div>
              </div>
              <div className="about-desc">
                帧间漫画是一款基于 Electron 的漫画阅读器，聚合多个公开数据源，支持在线阅读、书架与进度同步、评论互动与后台管理。
              </div>
              <div className="about-highlights">
                {versionList.length > 1 && (
                  <div className="ver-switch">
                    {versionList.map((v) => (
                      <button
                        key={v.version}
                        className={`ver-pill${v.version === activeVer?.version ? ' active' : ''}`}
                        onClick={() => setVerSel(v.version)}
                      >
                        <span className="ver-pill-v">v{v.version}</span>
                        {v.isCurrent && <span className="ver-tag cur">当前</span>}
                        {v.isLatest && !v.isCurrent && <span className="ver-tag new">最新</span>}
                      </button>
                    ))}
                  </div>
                )}
                <div className="about-notes-title">
                  <span>v{activeVer?.version || currentVersion} 更新说明</span>
                  {activeVer?.buildTime && <span className="ver-time">🕒 {dateOnly(activeVer.buildTime)}</span>}
                </div>
                <div className="about-notes-scroll">
                  {activeVer && toSections(activeVer.notes).length > 0 ? (
                    <ReleaseNotes notes={activeVer.notes} />
                  ) : (
                    <div className="muted">暂无更新说明</div>
                  )}
                </div>
              </div>
            </div>
            <div className="row" style={{ justifyContent: 'flex-end', gap: 8, padding: '0 20px 18px' }}>
              <button className="btn" onClick={() => setAboutOpen(false)}>
                关闭
              </button>
              {/* 仅当正在查看「最新（且非当前）」版本时才显示更新按钮；看当前版本只显示关闭 */}
              {activeVer?.isLatest && !activeVer?.isCurrent && (
                <button
                  className="btn btn-primary"
                  disabled={!isHttpUrl(latest?.url)}
                  onClick={() => {
                    const url = latest?.url;
                    if (isHttpUrl(url)) {
                      bridge?.openExternal?.(url);
                      bridge?.quitApp?.();
                    }
                  }}
                >
                  {isHttpUrl(latest?.url) ? `更新到 v${latest?.version}` : '暂未提供下载地址'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
