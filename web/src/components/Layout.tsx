import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { bridge } from '../api';
import { useAuth } from '../store/auth';
import { useSettings } from '../store/settings';

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

  useEffect(() => {
    if (!bridge) return;
    void bridge.getWinState().then(setWinState);
    return bridge.onWinStateChange(setWinState);
  }, []);

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
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-logo">帧</div>
            <div className="brand-name">帧间漫画</div>
          </div>
          <nav className="nav">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === '/'}
                className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
              >
                <span className="icon">{n.icon}</span>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-foot">
            {user ? (
              <div>已登录：{user.nickname || user.username}</div>
            ) : (
              <div>
                <NavLink to="/login" style={{ color: 'var(--accent-2)', textDecoration: 'none' }}>
                  登录 / 注册
                </NavLink>
              </div>
            )}
          </div>
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
