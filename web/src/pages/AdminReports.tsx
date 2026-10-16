import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import type { ReportItem } from '../types';
import { Empty, Loading } from '../components/States';
import { useAuth } from '../store/auth';
import { toast } from '../store/toast';
import { formatDate } from '../utils/format';

const TYPE_LABEL: Record<string, string> = {
  comic: '漫画',
  chapter: '章节',
  comment: '评论',
  other: '其他',
};

function targetText(r: ReportItem): string {
  if (r.comicTitle && r.chapterTitle) return `${r.comicTitle} · ${r.chapterTitle}`;
  return r.comicTitle || r.chapterTitle || r.targetId || '未指定对象';
}

const FILTERS: Array<[string, string]> = [
  ['', '全部'],
  ['pending', '待处理'],
  ['resolved', '已处理'],
];

export default function AdminReports() {
  const user = useAuth((s) => s.user);
  const isAdmin = user?.role === 'admin';
  const ready = useAuth((s) => s.ready);

  const [items, setItems] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [pending, setPending] = useState(0);
  const [resolved, setResolved] = useState(0);
  const [busyId, setBusyId] = useState('');
  const [confirm, setConfirm] = useState<{ reportId: string; comicId: string; comicTitle: string } | null>(null);

  const load = useCallback(() => {
    if (!isAdmin) return;
    setLoading(true);
    api
      .reports({ status, page, limit: 20 })
      .then((r) => {
        setItems(r.items);
        setTotalPages(r.totalPages);
        setTotal(r.total);
        setPending(r.pending);
        setResolved(r.resolved);
      })
      .catch(() => toast.error('加载举报失败'))
      .finally(() => setLoading(false));
  }, [isAdmin, status, page]);

  useEffect(load, [load]);

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

  // 删除被举报的漫画（连同章节/书架/记录），随后把该举报标记为已处理
  const deleteComicFromReport = async (reportId: string, comicId: string, comicTitle: string) => {
    setBusyId(reportId);
    let existed = true;
    try {
      await api.deleteComic(comicId);
    } catch {
      existed = false; // 漫画很可能已被删除
    }
    try {
      await api.setReportStatus(reportId, 'resolved');
      toast.success(existed ? `已删除漫画《${comicTitle}》并处理该举报` : `漫画《${comicTitle}》已不存在，已处理该举报`);
      load();
    } catch (e) {
      toast.error((e as Error).message || '处理举报失败');
    } finally {
      setBusyId('');
      setConfirm(null);
    }
  };

  return (
    <div className="page">
      <div className="panel reports-head">
        <div className="reports-title-row">
          <div>
            <div className="page-title" style={{ margin: 0 }}>
              反馈处理
            </div>
            <div className="reports-sub">集中查看与处理用户提交的举报与反馈</div>
          </div>
          <div className="reports-filters">
            {FILTERS.map(([k, label]) => (
              <button
                key={k || 'all'}
                className={`chip${status === k ? ' active' : ''}`}
                onClick={() => {
                  setStatus(k);
                  setPage(1);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="reports-stats">
          <div className="report-stat is-pending">
            <b>{pending}</b>
            <span>待处理</span>
          </div>
          <div className="report-stat is-resolved">
            <b>{resolved}</b>
            <span>已处理</span>
          </div>
          <div className="report-stat">
            <b>{total}</b>
            <span>{status ? '当前筛选' : '全部举报'}</span>
          </div>
        </div>
      </div>

      {loading ? (
        <Loading />
      ) : items.length === 0 ? (
        <Empty text={status ? '该状态下暂无举报' : '暂无举报，太棒了'} icon="🛡" />
      ) : (
        <div className="reports-list">
          {items.map((r) => (
            <div key={r._id} className={`panel report-card ${r.status}`}>
              <div className="report-card-main">
                <div className="report-card-top">
                  <span className="report-type">{TYPE_LABEL[r.type] || r.type}</span>
                  <span className={`report-status ${r.status}`}>{r.status === 'pending' ? '待处理' : '已处理'}</span>
                </div>
                <div className="report-target" title={targetText(r)}>
                  {targetText(r)}
                </div>
                <div className="report-row">
                  <span className="report-k">理由</span>
                  {r.reason}
                </div>
                {r.detail && (
                  <div className="report-row report-detail">
                    <span className="report-k">详情</span>
                    {r.detail}
                  </div>
                )}
                <div className="report-meta">
                  👤 {r.reporterName} · 🕒 {formatDate(r.createdAt)}
                  {r.resolvedAt ? ` · ✅ 处理于 ${formatDate(r.resolvedAt)}` : ''}
                </div>
              </div>
              <div className="report-actions">
                {r.status === 'pending' ? (
                  <button
                    className="btn btn-primary"
                    disabled={busyId === r._id}
                    onClick={() => act(r._id, () => api.setReportStatus(r._id, 'resolved'), '已标记为处理完成')}
                  >
                    标记已处理
                  </button>
                ) : (
                  <button
                    className="btn"
                    disabled={busyId === r._id}
                    onClick={() => act(r._id, () => api.setReportStatus(r._id, 'pending'), '已重新打开')}
                  >
                    重新打开
                  </button>
                )}
                {r.comicId && (
                  <button
                    className="btn btn-danger"
                    disabled={busyId === r._id}
                    title="删除被举报的漫画（连同章节/书架/阅读记录）"
                    onClick={() =>
                      setConfirm({ reportId: r._id, comicId: r.comicId, comicTitle: r.comicTitle || targetText(r) })
                    }
                  >
                    删除漫画
                  </button>
                )}
                <button
                  className="btn"
                  disabled={busyId === r._id}
                  onClick={() => act(r._id, () => api.deleteReport(r._id), '已删除该举报记录')}
                >
                  删除记录
                </button>
              </div>
            </div>
          ))}

          {totalPages > 1 && (
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
        </div>
      )}

      {confirm && (
        <div className="modal-mask" onClick={() => busyId !== confirm.reportId && setConfirm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">删除漫画</div>
            <div className="modal-body">
              确定要删除被举报的漫画《{confirm.comicTitle}》吗？将同时删除其全部章节，且<b>不可恢复</b>。该举报会被标记为已处理。
            </div>
            <div className="row" style={{ justifyContent: 'flex-end', gap: 8, padding: '0 20px 18px' }}>
              <button className="btn" onClick={() => setConfirm(null)} disabled={busyId === confirm.reportId}>
                取消
              </button>
              <button
                className="btn btn-danger"
                disabled={busyId === confirm.reportId}
                onClick={() => deleteComicFromReport(confirm.reportId, confirm.comicId, confirm.comicTitle)}
              >
                {busyId === confirm.reportId ? '删除中…' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
