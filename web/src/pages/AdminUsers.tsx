import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import type { UserItem } from '../types';
import { Empty, Loading } from '../components/States';
import { useAuth } from '../store/auth';
import { toast } from '../store/toast';
import { formatDateTime } from '../utils/format';

export default function AdminUsers() {
  const user = useAuth((s) => s.user);
  const isAdmin = user?.role === 'admin';
  const ready = useAuth((s) => s.ready);

  const [items, setItems] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [adminCount, setAdminCount] = useState(0);
  const [busyId, setBusyId] = useState('');
  const [confirm, setConfirm] = useState<UserItem | null>(null);
  const [onlineOnly, setOnlineOnly] = useState(false);

  const load = useCallback(() => {
    if (!isAdmin) return;
    setLoading(true);
    api
      .users({ q, page, limit: 20, online: onlineOnly })
      .then((r) => {
        setItems(r.items);
        setTotalPages(r.totalPages);
        setTotal(r.total);
        setAdminCount(r.items.filter((u) => u.role === 'admin').length);
      })
      .catch(() => toast.error('加载用户失败'))
      .finally(() => setLoading(false));
  }, [isAdmin, q, page, onlineOnly]);

  useEffect(load, [load]);

  // 在线状态随时间变化，定时静默刷新（不闪 loading），让「在线」保持实时
  const refreshSilent = useCallback(() => {
    if (!isAdmin) return;
    api
      .users({ q, page, limit: 20, online: onlineOnly })
      .then((r) => {
        setItems(r.items);
        setTotalPages(r.totalPages);
        setTotal(r.total);
        setAdminCount(r.items.filter((u) => u.role === 'admin').length);
      })
      .catch(() => {});
  }, [isAdmin, q, page, onlineOnly]);

  useEffect(() => {
    const t = window.setInterval(refreshSilent, 30000);
    return () => window.clearInterval(t);
  }, [refreshSilent]);

  if (!ready) return <Loading />;
  if (!isAdmin) {
    return <Empty text="无权限访问（仅管理员可见）" icon="🔒" />;
  }

  const act = async (id: string, fn: () => Promise<unknown>, msg: string) => {
    setBusyId(id);
    try {
      await fn();
      toast.success(msg);
      load();
    } catch (e) {
      toast.error((e as Error).message || '操作失败');
    } finally {
      setBusyId('');
    }
  };

  const toggleRole = (u: UserItem) => {
    const next: 'admin' | 'user' = u.role === 'admin' ? 'user' : 'admin';
    act(u.id, () => api.setUserRole(u.id, next), next === 'admin' ? `已将 ${u.username} 设为管理员` : `已取消 ${u.username} 的管理员`);
  };

  const doDelete = (u: UserItem) => {
    act(u.id, () => api.deleteUser(u.id), `已删除用户 ${u.username}`).finally(() => setConfirm(null));
  };

  return (
    <div className="page">
      <div className="panel users-head">
        <div className="users-title-row">
          <div>
            <div className="page-title users-title" style={{ margin: 0 }}>
              用户管理
            </div>
            <div className="reports-sub">查看、设置管理员权限与清理用户</div>
          </div>
          <div className="users-search">
            <input
              className="input"
              placeholder="搜索用户名 / 昵称"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
            <div className="users-filter">
              <button
                className={`seg${!onlineOnly ? ' active' : ''}`}
                onClick={() => {
                  setOnlineOnly(false);
                  setPage(1);
                }}
              >
                全部
              </button>
              <button
                className={`seg${onlineOnly ? ' active' : ''}`}
                onClick={() => {
                  setOnlineOnly(true);
                  setPage(1);
                }}
              >
                仅在线
              </button>
            </div>
          </div>
        </div>
        <div className="users-stats">
          <div className="ustat">
            <b>{total}</b>
            <span>用户总数</span>
          </div>
          <div className="ustat is-admin">
            <b>{adminCount}</b>
            <span>本页管理员</span>
          </div>
        </div>
      </div>

      {loading ? (
        <Loading />
      ) : items.length === 0 ? (
        <Empty text={q ? '没有匹配的用户' : '暂无用户'} icon="👥" />
      ) : (
        <div className="panel users-table">
          <div className="users-row users-row-head">
            <span className="col-user">用户</span>
            <span className="col-role">角色</span>
            <span className="col-online">在线</span>
            <span className="col-login">上次登录</span>
            <span className="col-time">注册时间</span>
            <span className="col-act">操作</span>
          </div>
          {items.map((u) => {
            const isSelf = u.id === user?.id;
            return (
              <div key={u.id} className="users-row">
                <span className="col-user">
                  <span className="avatar" style={{ width: 30, height: 30, flex: '0 0 30px', fontSize: 13 }}>
                    {(u.nickname || u.username).slice(0, 1)}
                  </span>
                  <span className="users-name">
                    <b>{u.nickname || u.username}</b>
                    <span className="muted" style={{ fontSize: 12 }}>
                      @{u.username}
                    </span>
                  </span>
                </span>
                <span className="col-role">
                  <span className={`role-badge ${u.role}`}>{u.role === 'admin' ? '管理员' : '普通用户'}</span>
                </span>
                <span className="col-online">
                  <span className={`online-dot${u.online ? ' on' : ''}`} />
                  <span
                    className="muted"
                    title={u.lastActiveAt ? `最近活跃：${formatDateTime(u.lastActiveAt)}` : '暂无活跃记录'}
                  >
                    {u.online ? '在线' : '离线'}
                  </span>
                </span>
                <span className="col-login muted">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : '从未登录'}</span>
                <span className="col-time muted">{formatDateTime(u.createdAt)}</span>
                <span className="col-act">
                  <button
                    className="btn"
                    disabled={busyId === u.id || isSelf}
                    title={isSelf ? '不能修改当前账号' : u.role === 'admin' ? '取消管理员' : '设为管理员'}
                    onClick={() => toggleRole(u)}
                  >
                    {u.role === 'admin' ? '取消管理员' : '设为管理员'}
                  </button>
                  <button
                    className="btn btn-danger"
                    disabled={busyId === u.id || isSelf}
                    title={isSelf ? '不能删除当前账号' : '删除用户'}
                    onClick={() => setConfirm(u)}
                  >
                    删除
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {!loading && totalPages > 1 && (
        <div className="row" style={{ justifyContent: 'center', gap: 12, marginTop: 8 }}>
          <button className="btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            上一页
          </button>
          <span className="muted" style={{ alignSelf: 'center', fontVariantNumeric: 'tabular-nums' }}>
            {page} / {totalPages}
          </span>
          <button className="btn" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            下一页
          </button>
        </div>
      )}

      {confirm && (
        <div className="modal-mask" onClick={() => busyId !== confirm.id && setConfirm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">删除用户</div>
            <div className="modal-body">
              确定要删除用户「{confirm.nickname || confirm.username}」吗？将同时删除其全部评论、书架与阅读记录，且<b>不可恢复</b>。
            </div>
            <div className="row" style={{ justifyContent: 'flex-end', gap: 8, padding: '0 20px 18px' }}>
              <button className="btn" onClick={() => setConfirm(null)} disabled={busyId === confirm.id}>
                取消
              </button>
              <button className="btn btn-danger" disabled={busyId === confirm.id} onClick={() => doDelete(confirm)}>
                {busyId === confirm.id ? '删除中…' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
