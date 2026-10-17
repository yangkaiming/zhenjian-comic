import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { bridge } from '../api';
import { useAuth } from '../store/auth';
import { useSettings } from '../store/settings';
import { useUpdate } from '../store/update';
import { versionLabel } from '../version';

const NAV = [
  { to: '/', icon: '🏠', label: '首页' },
  { to: '/category', icon: '🗂', label: '分类' },
  { to: '/rank', icon: '🔥', label: '排行' },
  { to: '/bookshelf', icon: '📚', label: '书架' },
  { to: '/search', icon: '🔍', label: '搜索' },
  { to: '/mine', icon: '👤', label: '我的' },
];

const TITLES: Record<string, string> = {
  '/': '首页推荐',
  '/category': '分类找书',
  '/rank': '排行榜',
  '/bookshelf': '我的书架',
  '/search': '搜索漫画',
  '/mine': '个人中心',
  '/admin/reports': '反馈处理',
  '/admin/users': '用户管理',
  '/admin/fetch': '漫画导入',
  '/admin/recommend': '编辑推荐',
  '/admin/feedback': '用户反馈',
  '/feedback': '意见反馈',
};

export default function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [winState, setWinState] = useState<{ maximized: boolean; fullscreen: boolean }>({
    maximized: false,
    fullscreen: false,
  });
  const user = useAuth((s) => s.user);
  const isAdmin = user?.role === 'admin';
  const hasUpdate = useUpdate((s) => s.hasUpdate);
  // 侧边栏收缩状态（记住用户选择，刷新/重启后保持）
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sidebar-collapsed') === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('sidebar-collapsed', collapsed ? '1' : '0');
    } catch {
      /* 忽略 */
    }
  }, [collapsed]);

  useEffect(() => {
    if (!bridge) return;
    void bridge.getWinState().then(setWinState);
    return bridge.onWinStateChange(setWinState);
  }, []);

  // 应用启动时统一检查一次更新（侧边栏角标 / 首页弹窗 / 版本信息共用）
  useEffect(() => {
    void useUpdate.getState().check();
  }, []);

  const currentVersion = versionLabel(bridge?.appVersion);
  const title = TITLES[location.pathname] || '漫画详情';
  // 分类页：筛选栏固定在顶部，只有列表滚动
  const fixedLayout = location.pathname === '/category';
  // 独立弹窗（新窗口打开的管理页）隐藏侧边栏，仅保留标题栏与内容
  const popup = new URLSearchParams(location.search).has('popup');
  const win = bridge;
  const theme = useSettings((s) => s.theme);
  const toggleTheme = useSettings((s) => s.toggleTheme);

  return (
    <div className="app">
      {!popup && (
        <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
          <div className="brand">
            <div className="brand-logo">帧</div>
            <div className="brand-name">帧间漫画</div>
            <span className="brand-version">v{currentVersion}</span>
          </div>
          <nav className="nav">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === '/'}
                className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                title={collapsed ? n.label : undefined}
              >
                <span className="icon">{n.icon}</span>
                <span className="nav-label">{n.label}</span>
                {n.to === '/mine' && hasUpdate && <span className="nav-dot" title="有新版本" />}
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-foot">
            <div className="foot-user">
              {user ? (
                <div>{user.nickname || user.username}</div>
              ) : (
                <NavLink to="/login" style={{ color: 'var(--accent-2)', textDecoration: 'none' }}>
                  登录 / 注册
                </NavLink>
              )}
            </div>
          </div>
          <button
            className="sidebar-toggle"
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? '展开侧边栏' : '收缩侧边栏'}
            aria-label={collapsed ? '展开侧边栏' : '收缩侧边栏'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </aside>
      )}

      <div className="main">
        <div className="titlebar" onDoubleClick={() => win?.winMaximize()}>
          <div className="titlebar-title">{title}</div>
          <div className="titlebar-spacer" />
          {!popup && (
            <button
              className="win-btn theme-btn"
              onClick={() => toggleTheme()}
              title={theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'}
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
          )}
          {win && (
            <>
              {!popup && (
                <button className="win-btn" onClick={() => win.winMinimize()} title="最小化">
                  ─
                </button>
              )}
              {!popup && (
                <button
                  className="win-btn"
                  onClick={() => win.winMaximize()}
                  title={winState.maximized ? '还原窗口大小' : '最大化'}
                >
                  {winState.maximized ? '❐' : '□'}
                </button>
              )}
              <button className="win-btn close" onClick={() => win.winClose()} title="关闭">
                ✕
              </button>
            </>
          )}
        </div>
        <div className={`content${fixedLayout ? ' content-fixed' : ''}`}>{children}</div>
      </div>
    </div>
  );
}
