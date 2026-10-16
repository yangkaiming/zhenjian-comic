import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import type { FeedbackCategory, FeedbackItem } from '../types';
import { Empty, Loading } from '../components/States';
import { useAuth } from '../store/auth';
import { toast } from '../store/toast';
import { formatDate } from '../utils/format';

const CAT_LABEL: Record<FeedbackCategory, string> = {
  bug: '问题反馈',
  suggest: '功能建议',
  praise: '夸夸我们',
  other: '其他',
};
const CAT_ICON: Record<FeedbackCategory, string> = {
  bug: '🐞',
  suggest: '💡',
  praise: '👍',
  other: '💬',
};

const STATUS_FILTERS: Array<[string, string]> = [
  ['', '全部'],
  ['pending', '待回复'],
  ['replied', '已回复'],
  ['resolved', '已解决'],
];
const CAT_FILTERS: Array<[string, string]> = [
  ['', '全部类型'],
  ['bug', '问题反馈'],
  ['suggest', '功能建议'],
  ['praise', '夸夸我们'],
  ['other', '其他'],
];

export default function AdminFeedback() {
  const user = useAuth((s) => s.user);
  const isAdmin = user?.role === 'admin';
  const ready = useAuth((s) => s.ready);

  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pending, setPending] = useState(0);
  const [replied, setReplied] = useState(0);
  const [resolved, setResolved] = useState(0);
  const [busyId, setBusyId] = useState('');
  const [replyFor, setReplyFor] = useState<FeedbackItem | null>(null);
  const [replyText, setReplyText] = useState('');
  const [expandedId, setExpandedId] = useState('');

  const load = useCallback(() => {
    if (!isAdmin) return;
    setLoading(true);
    api
      .feedbackList({ status, category, page, limit: 20 })
      .then((r) => {
        setItems(r.items);
        setTotalPages(r.totalPages);
        setPending(r.pending);
        setReplied(r.replied);
        setResolved(r.resolved);
      })
      .catch(() => toast.error('加载反馈失败'))
      .finally(() => setLoading(false));
  }, [isAdmin, status, category, page]);

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

  const openReply = (f: FeedbackItem) => {
    setReplyFor(f);
    setReplyText(f.reply || '');
  };

  const sendReply = async () => {
    if (!replyFor) return;
    const id = replyFor._id;
    const text = replyText.trim();
    if (!text) {
      toast.error('请填写回复内容');
      return;
    }
    setBusyId(id);
    try {
      await api.replyFeedback(id, { reply: text, status: 'replied' });
      toast.success('已回复用户');
      setReplyFor(null);
      setReplyText('');
      load();
    } catch (e) {
      toast.error((e as Error).message || '回复失败');
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="page">
      <div className="panel reports-head">
        <div className="reports-title-row">
          <div>
            <div className="page-title" style={{ margin: 0 }}>
              用户反馈
            </div>
            <div className="reports-sub">查看与回复用户提交的功能反馈、问题建议</div>
          </div>
          <div className="reports-filters">
            {STATUS_FILTERS.map(([k, label]) => (
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
            <span>待回复</span>
          </div>
          <div className="report-stat is-replied">
            <b>{replied}</b>
            <span>已回复</span>
          </div>
          <div className="report-stat is-resolved">
            <b>{resolved}</b>
            <span>已解决</span>
          </div>
        </div>
      </div>

      <div className="row" style={{ gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {CAT_FILTERS.map(([k, label]) => (
          <button
            key={k || 'all'}
            className={`chip${category === k ? ' active' : ''}`}
            onClick={() => {
              setCategory(k);
              setPage(1);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <Loading />
      ) : items.length === 0 ? (
        <Empty text={status || category ? '该筛选下暂无反馈' : '暂无用户反馈'} icon="💌" />
      ) : (
        <div className="reports-list">
          {items.map((f) => {
            const open = expandedId === f._id;
            return (
              <div key={f._id} className={`panel report-card feedback-card ${f.status}${open ? ' is-open' : ''}`}>
                <button className="feedback-summary" onClick={() => setExpandedId(open ? '' : f._id)}>
                  <span className="feedback-summary-left">
                    <span className="feedback-type">
                      <span className="feedback-type-icon">{CAT_ICON[f.category]}</span>
                      {CAT_LABEL[f.category] || f.category}
                    </span>
                    <span className="feedback-summary-user">@{f.username}</span>
                    <span className="feedback-summary-preview">{f.content}</span>
                  </span>
                  <span className="feedback-summary-right">
                    <span className={`report-status ${f.status}`}>
                      {f.status === 'pending' ? '待回复' : f.status === 'replied' ? '已回复' : '已解决'}
                    </span>
                    <span className="feedback-chevron">{open ? '▾' : '▸'}</span>
                  </span>
                </button>
                {open && (
                  <div className="feedback-detail">
                    <div className="report-row report-detail">
                      <span className="report-k">内容</span>
                      {f.content}
                    </div>
                    {f.contact && (
                      <div className="report-row">
                        <span className="report-k">联系方式</span>
                        {f.contact}
                      </div>
                    )}
                    {f.reply && (
                      <div className="report-row feedback-reply-box">
                        <span className="report-k">官方回复</span>
                        {f.reply}
                      </div>
                    )}
                    <div className="report-meta">
                      👤 {f.username} · 🕒 {formatDate(f.createdAt)}
                      {f.repliedAt ? ` · ✅ 回复于 ${formatDate(f.repliedAt)}` : ''}
                    </div>
                    <div className="report-actions">
                      <button
                        className="btn btn-primary"
                        disabled={busyId === f._id}
                        onClick={() => openReply(f)}
                      >
                        {f.reply ? '修改回复' : '回复'}
                      </button>
                      {f.status !== 'resolved' && (
                        <button
                          className="btn"
                          disabled={busyId === f._id}
                          onClick={() => act(f._id, () => api.replyFeedback(f._id, { status: 'resolved' }), '已标记为已解决')}
                        >
                          标记已解决
                        </button>
                      )}
                      <button
                        className="btn"
                        disabled={busyId === f._id}
                        onClick={() => act(f._id, () => api.replyFeedback(f._id, { status: 'pending' }), '已重新打开')}
                      >
                        重新打开
                      </button>
                      <button
                        className="btn btn-danger"
                        disabled={busyId === f._id}
                        onClick={() => act(f._id, () => api.deleteFeedback(f._id), '已删除该反馈')}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

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

      {replyFor && (
        <div className="modal-mask" onClick={() => busyId !== replyFor._id && setReplyFor(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              回复 {replyFor.username} 的反馈
              <div className="spacer" />
              <button className="btn btn-ghost" onClick={() => setReplyFor(null)}>
                关闭
              </button>
            </div>
            <div className="modal-body">
              <div className="muted" style={{ fontSize: 13, marginBottom: 10, lineHeight: 1.6 }}>
                <b>{CAT_LABEL[replyFor.category]}</b>：{replyFor.content}
              </div>
              <textarea
                className="input feedback-input"
                value={replyText}
                placeholder="输入你的回复…"
                onChange={(e) => setReplyText(e.target.value.slice(0, 1000))}
                rows={5}
                autoFocus
              />
            </div>
            <div className="row" style={{ justifyContent: 'flex-end', gap: 8, padding: '0 20px 18px' }}>
              <button className="btn" onClick={() => setReplyFor(null)} disabled={busyId === replyFor._id}>
                取消
              </button>
              <button className="btn btn-primary" disabled={busyId === replyFor._id} onClick={sendReply}>
                {busyId === replyFor._id ? '发送中…' : '发送回复'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
