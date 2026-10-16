import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, bridge } from '../api';
import { useAuth } from '../store/auth';
import { toast } from '../store/toast';
import { READER_BG_LABELS, useSettings, type ReaderFit, type ReaderMode } from '../store/settings';
import { versionLabel, isNewer, RELEASE_HIGHLIGHTS } from '../version';
import { Loading } from '../components/States';


/** 后台管理工具（新增工具只需在此追加一项） */
const ADMIN_TOOLS = [
  {
    route: '/admin/reports',
    icon: '📋',
    title: '反馈处理',
    desc: '查看并处理用户的反馈与举报',
    color: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
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
    title: '用户反馈',
    desc: '查看并回复用户提交的功能反馈',
    color: 'linear-gradient(135deg, #ec4899, #f43f5e)',
  },
];

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
  const [checking, setChecking] = useState(false);
  const [latest, setLatest] = useState<{ version: string; url: string; notes: string } | null>(null);
  const [hasUpdate, setHasUpdate] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  const checkUpdate = async () => {
    setChecking(true);
    try {
      const info = await api.appLatest();
      setLatest(info);
      if (info.version && isNewer(info.version, currentVersion)) {
        setHasUpdate(true);
        toast.success(`发现新版本 v${info.version}`);
      } else {
        setHasUpdate(false);
        toast.success('已是最新版本');
      }
    } catch {
      toast.error('检查更新失败');
    } finally {
      setChecking(false);
    }
  };

  // 查看版本信息：打开即尽力拉取一次更新说明（失败也不影响看版本号）
  const openAbout = async () => {
    setAboutOpen(true);
    if (!latest) {
      try {
        setLatest(await api.appLatest());
      } catch {
        /* 忽略 */
      }
    }
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
                min={50}
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
            {ADMIN_TOOLS.map((t) => (
              <button
                className="admin-card"
                key={t.route}
                onClick={() => openAdmin(t.route)}
              >
                <span className="admin-card-icon" style={{ background: t.color }}>
                  {t.icon}
                </span>
                <span className="admin-card-body">
                  <span className="admin-card-title">{t.title}</span>
                  <span className="admin-card-desc">{t.desc}</span>
                </span>
                <span className="admin-card-go">打开 →</span>
              </button>
            ))}
          </div>
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
          {hasUpdate && latest && (
            <button
              className="btn btn-primary"
              onClick={() => {
                if (latest.url) window.open(latest.url, '_blank');
                else toast.info('暂未配置更新地址');
              }}
            >
              更新到 v{latest.version}
            </button>
          )}
        </div>
        {hasUpdate && latest?.notes && (
          <div className="muted" style={{ marginTop: 10, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {latest.notes}
          </div>
        )}
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
            <div className="modal-head">
              版本信息
              <div className="spacer" />
              <button className="btn btn-ghost" onClick={() => setAboutOpen(false)}>
                关闭
              </button>
            </div>
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
                <div className="about-notes-title">
                  本版本重要功能
                  <span className="about-count">共 {RELEASE_HIGHLIGHTS.length} 项</span>
                </div>
                <ul className="about-highlight-list">
                  {RELEASE_HIGHLIGHTS.map((h) => (
                    <li key={h.title} className="about-highlight-item">
                      <span className="about-highlight-title">{h.title}</span>
                      <span className="muted about-highlight-desc">{h.desc}</span>
                    </li>
                  ))}
                </ul>
              </div>
              {latest?.notes && (
                <div className="about-notes">
                  <div className="about-notes-title">更新说明{latest.version ? `（v${latest.version}）` : ''}</div>
                  <div className="muted about-notes-body">{latest.notes}</div>
                </div>
              )}
            </div>
            <div className="row" style={{ justifyContent: 'flex-end', gap: 8, padding: '0 20px 18px' }}>
              <button className="btn" onClick={() => setAboutOpen(false)}>
                关闭
              </button>
              <button className="btn btn-primary" onClick={checkUpdate} disabled={checking}>
                {checking ? '检查中…' : '检查更新'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
