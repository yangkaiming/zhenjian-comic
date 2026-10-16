import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../store/auth';
import { Loading } from '../components/States';
import { toast } from '../store/toast';
import type { FeedbackCategory, FeedbackItem } from '../types';
import { formatDate } from '../utils/format';

const FEEDBACK_CATS: Array<[FeedbackCategory, string, string]> = [
  ['bug', '问题反馈', '🐞'],
  ['suggest', '功能建议', '💡'],
  ['praise', '夸夸我们', '👍'],
  ['other', '其他', '💬'],
];
const FEEDBACK_CAT_LABEL: Record<FeedbackCategory, string> = {
  bug: '问题反馈',
  suggest: '功能建议',
  praise: '夸夸我们',
  other: '其他',
};

type Tab = 'submit' | 'mine';

export default function Feedback() {
  const user = useAuth((s) => s.user);
  const ready = useAuth((s) => s.ready);
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('submit');
  const [cat, setCat] = useState<FeedbackCategory>('bug');
  const [content, setContent] = useState('');
  const [contact, setContact] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [mine, setMine] = useState<FeedbackItem[]>([]);

  const loadMine = (silent = true) => {
    if (!user) return;
    api
      .myFeedback()
      .then((r) => setMine(r.items))
      .catch(() => {
        if (!silent) toast.error('加载我的反馈失败');
      });
  };

  useEffect(() => {
    loadMine();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async () => {
    if (!content.trim()) {
      toast.error('请填写反馈内容');
      return;
    }
    setSubmitting(true);
    try {
      await api.createFeedback({ category: cat, content: content.trim(), contact: contact.trim() });
      toast.success('感谢反馈，已提交');
      setContent('');
      setContact('');
      loadMine(false);
      setTab('mine');
    } catch (e) {
      toast.error((e as Error).message || '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  if (!ready) return <Loading />;

  if (!user) {
    return (
      <div className="page">
        <div className="empty" style={{ paddingTop: 80 }}>
          <div className="empty-icon">🔐</div>
          <div>登录后才可以提交反馈</div>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate('/login')}>
            去登录
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="panel feedback-page">
        <div className="page-title" style={{ margin: 0 }}>
          💬 意见反馈
        </div>
        <div className="muted" style={{ marginTop: 6, marginBottom: 18, fontSize: 13 }}>
          遇到问题或有好点子？告诉我们，帮助我们把产品做得更好。
        </div>

        <div className="fb-tabs">
          <button className={`fb-tab${tab === 'submit' ? ' active' : ''}`} onClick={() => setTab('submit')}>
            提交反馈
          </button>
          <button className={`fb-tab${tab === 'mine' ? ' active' : ''}`} onClick={() => setTab('mine')}>
            我的反馈{mine.length > 0 ? `（${mine.length}）` : ''}
          </button>
        </div>

        {tab === 'submit' ? (
          <>
            <div className="feedback-cats">
              {FEEDBACK_CATS.map(([k, label, icon]) => (
                <button
                  key={k}
                  type="button"
                  className={`feedback-cat${cat === k ? ' active' : ''}`}
                  onClick={() => setCat(k)}
                >
                  <span className="feedback-cat-icon">{icon}</span>
                  {label}
                </button>
              ))}
            </div>

            <textarea
              className="input feedback-input"
              value={content}
              placeholder="说说你的想法…（最多 1000 字）"
              onChange={(e) => setContent(e.target.value.slice(0, 1000))}
              rows={6}
            />
            <input
              className="input"
              style={{ marginTop: 10 }}
              value={contact}
              placeholder="联系方式（选填，方便我们回复你）"
              onChange={(e) => setContact(e.target.value)}
            />
            <div
              className="row"
              style={{ marginTop: 12, justifyContent: 'space-between', alignItems: 'center' }}
            >
              <span className="muted" style={{ fontSize: 12 }}>
                {content.length}/1000
              </span>
              <button className="btn btn-primary" disabled={submitting} onClick={submit}>
                {submitting ? '提交中…' : '提交反馈'}
              </button>
            </div>
          </>
        ) : (
          <div className="feedback-history">
            {mine.length === 0 ? (
              <div className="empty" style={{ padding: '40px 0' }}>
                <div className="empty-icon">📭</div>
                <div>还没有提交过反馈</div>
                <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={() => setTab('submit')}>
                  去提交一条
                </button>
              </div>
            ) : (
              mine.map((f) => (
                <div key={f._id} className="feedback-history-item">
                  <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <span className="feedback-tag">{FEEDBACK_CAT_LABEL[f.category]}</span>
                    <span className={`feedback-status ${f.status}`}>
                      {f.status === 'pending' ? '待回复' : f.status === 'replied' ? '已回复' : '已解决'}
                    </span>
                    <span className="muted" style={{ fontSize: 12 }}>
                      {formatDate(f.createdAt)}
                    </span>
                  </div>
                  <div className="feedback-history-content">{f.content}</div>
                  {f.reply && (
                    <div className="feedback-history-reply">
                      <span className="feedback-reply-k">官方回复</span>
                      {f.reply}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
