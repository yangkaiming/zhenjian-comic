import { NavLink } from 'react-router-dom';

const ADMIN_NAV = [
  { to: '/admin/reports', icon: '📋', label: '反馈处理' },
  { to: '/admin/feedback', icon: '💬', label: '用户反馈' },
  { to: '/admin/users', icon: '👥', label: '用户管理' },
  { to: '/admin/fetch', icon: '📥', label: '漫画导入' },
  { to: '/admin/recommend', icon: '⭐', label: '编辑推荐' },
];

export default function AdminSidebar() {
  return (
    <aside className="admin-sidebar">
      <div className="admin-brand">
        <div className="admin-brand-logo">🛠️</div>
        <div className="admin-brand-text">
          <div className="admin-brand-name">管理后台</div>
          <div className="admin-brand-sub">帧间漫画</div>
        </div>
      </div>
      <nav className="admin-nav">
        {ADMIN_NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === '/admin/reports'}
            className={({ isActive }) => `admin-nav-item${isActive ? ' active' : ''}`}
          >
            <span className="admin-nav-icon">{n.icon}</span>
            <span className="admin-nav-label">{n.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="admin-side-foot">
        <NavLink to="/mine" className="admin-nav-item">
          <span className="admin-nav-icon">↩️</span>
          <span className="admin-nav-label">返回个人中心</span>
        </NavLink>
      </div>
    </aside>
  );
}
