import { useCallback, useEffect, useRef, useState, Fragment } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, assetUrl } from '../api';
import type { CommentItem, Comic } from '../types';
import { Empty, Loading } from '../components/States';
import ComicCard from '../components/ComicCard';
import ReportModal, { type ReportContext } from '../components/ReportModal';
import { useAuth } from '../store/auth';
import { toast } from '../store/toast';
import { formatCount, formatCommentTime } from '../utils/format';

interface ChapterLite {
  _id: string;
  index: number;
  title: string;
  pageCount: number;
}

/** 漫画来源名（sourceId 前缀：dm5: / baozimh: / 无前缀=MangaDex） */
function sourceLabel(sourceId?: string): string {
  const sid = sourceId || '';
  if (sid.startsWith('dm5:')) return '动漫屋';
  if (sid.startsWith('baozimh:')) return '包子漫画';
  if (sid) return 'MangaDex';
  return '本地';
}

/** 连载状态色调：ongoing=连载(绿) / done=完结(蓝) */
function statusTone(status?: string): string {
  const s = status || '';
  if (s.includes('完结') || s.includes('完結')) return 'done';
  if (s.includes('连载') || s.includes('連載')) return 'ongoing';
  return '';
}

/** 单条评论（楼中楼：isReply=回复，显示被回复者） */
function CommentNode({
  c,
  isReply,
  canDelete,
  onLike,
  onReply,
  onDelete,
}: {
  c: CommentItem;
  isReply?: boolean;
  canDelete?: boolean;
  onLike: (c: CommentItem) => void;
  onReply: (c: CommentItem) => void;
  onDelete: (c: CommentItem) => void;
}) {
  return (
    <div className={`comment${isReply ? ' comment-reply' : ''}`}>
      <div className="avatar">{c.nickname.slice(0, 1)}</div>
      <div className="comment-body">
        <div className="comment-head">
          <div className="comment-head-left">
            <span className="comment-name">{c.nickname}</span>
            {isReply && c.replyToName && <span className="comment-reply-to">回复 @{c.replyToName}</span>}
            {!isReply && <span>{c.score.toFixed(1)} 分</span>}
            <span>{formatCommentTime(c.createdAt)}</span>
          </div>
          <div className="comment-actions">
            <span
              className={`comment-like${c.liked ? ' liked' : ''}`}
              style={{ cursor: 'pointer' }}
              onClick={() => onLike(c)}
            >
              👍 {c.likes}
            </span>
            <span className="comment-reply-btn" onClick={() => onReply(c)}>
              回复
            </span>
            {canDelete && (
              <span className="comment-del-btn" onClick={() => onDelete(c)}>
                删除
              </span>
            )}
          </div>
        </div>
        <div className="comment-text">{c.content}</div>
      </div>
    </div>
  );
}

/** 内联回复框：出现在被回复的那条评论正下方（大众交互） */
function ReplyBox({
  name,
  indent,
  value,
  onChange,
  onCancel,
  onSubmit,
  busy,
}: {
  name: string;
  indent?: boolean;
  value: string;
  onChange: (v: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
  busy?: boolean;
}) {
  return (
    <div className="panel reply-box" style={indent ? { marginLeft: 38 } : undefined}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <span className="muted" style={{ fontSize: 13 }}>
          回复 @{name}
        </span>
        <button className="link-more" style={{ fontSize: 12 }} onClick={onCancel} disabled={busy}>
          取消
        </button>
      </div>
      <textarea
        className="input"
        rows={2}
        placeholder={`回复 @${name}…（Ctrl+Enter 发送）`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !busy) onSubmit();
        }}
      />
      <div className="row" style={{ marginTop: 10, justifyContent: 'flex-end' }}>
        <button className="btn btn-primary" onClick={onSubmit} disabled={busy}>
          {busy ? '发送中…' : '发送回复'}
        </button>
      </div>
    </div>
  );
}

export default function Detail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);

  const goBack = () => {
    const idx = Number((window.history.state as { idx?: number } | null)?.idx ?? 0);
    if (idx > 0) navigate(-1);
    else navigate('/');
  };

  const [comic, setComic] = useState<Comic | null>(null);
  const [chapters, setChapters] = useState<ChapterLite[]>([]);
  const [inShelf, setInShelf] = useState(false);
  const [shelfStatus, setShelfStatus] = useState<string | null>(null);
  const [lastIndex, setLastIndex] = useState(0);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [commentCount, setCommentCount] = useState(0);
  const [related, setRelated] = useState<Comic[]>([]);
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  const [loading, setLoading] = useState(true);
  const [allChapters, setAllChapters] = useState(false);
  const [descOpen, setDescOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{ id: string; parent: string; name: string } | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const descRef = useRef<HTMLDivElement>(null);
  const [descOverflow, setDescOverflow] = useState(false);
  const [draft, setDraft] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDel, setConfirmDel] = useState<CommentItem | null>(null);
  const [delBusy, setDelBusy] = useState(false);
  const [posting, setPosting] = useState(false);
  const [likingId, setLikingId] = useState('');
  const [refreshProg, setRefreshProg] = useState<{
    phase: 'fetching' | 'saving' | 'done';
    fetched: number;
    added: number;
    total: number;
    error?: string;
  } | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    api
      .detail(id)
      .then((d) => {
        setComic(d.comic);
        setChapters(d.chapters);
        setInShelf(d.inShelf);
        setShelfStatus(d.shelfStatus);
        setLastIndex(d.shelfProgress?.lastChapterIndex || 0);
        setCommentCount(d.commentCount);
      })
      .catch(() => toast.error('加载漫画详情失败'))
      .finally(() => setLoading(false));
    api
      .comments(id)
      .then((r) => setComments(r.items))
      .catch(() => setComments([]));
    api
      .related(id)
      .then((r) => setRelated(r.items))
      .catch(() => setRelated([]));
  }, [id]);

  useEffect(load, [load]);

  // 简介折叠：仅当折叠态下内容确实超出 3 行时才显示「展开/收起」
  useEffect(() => {
    const measure = () => {
      const el = descRef.current;
      if (!el) return;
      if (descOpen) {
        setDescOverflow(true); // 展开态保留按钮以便收起
        return;
      }
      setDescOverflow(el.scrollHeight > el.clientHeight + 1);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [comic?.description, descOpen]);

  if (loading) return <Loading />;
  if (!comic) {
    // 有历史记录时回到上一层；直接打开详情（无历史）则回首页，避免退到空白页
    const goBack = () => {
      if (window.history.length > 1) navigate(-1);
      else navigate('/');
    };
    return (
      <Empty
        text="漫画不存在或加载失败"
        icon="⚠️"
        action={
          <button className="btn btn-primary" onClick={goBack}>
            返回上一层
          </button>
        }
      />
    );
  }

  const sorted = order === 'asc' ? chapters : [...chapters].reverse();
  const source = sourceLabel(comic.sourceId);
  // 章节折叠：默认只展示前 60 话，避免长目录一次渲染过多
  const CHAPTER_PREVIEW = 60;
  const visibleChapters = allChapters ? sorted : sorted.slice(0, CHAPTER_PREVIEW);
  const reportCtx: ReportContext = {
    type: 'comic',
    comicId: comic._id,
    comicTitle: comic.title,
    targetId: comic._id,
  };
  // 评论楼中楼：顶层评论 + 按 parent 分组的回复
  const topComments = comments.filter((c) => !c.parent);
  const repliesByParent: Record<string, CommentItem[]> = {};
  for (const c of comments) {
    if (c.parent) (repliesByParent[c.parent] = repliesByParent[c.parent] || []).push(c);
  }

  const startReading = async () => {
    if (!user) {
      navigate('/login');
      return;
    }
    try {
      const r = await api.resume(comic._id);
      if (r.chapterId) {
        navigate(`/read/${r.chapterId}?p=${r.page + 1}`, { state: { from: 'detail' } });
        return;
      }
    } catch {
      /* 忽略，直接读第一话 */
    }
    if (chapters.length) navigate(`/read/${chapters[0]._id}`, { state: { from: 'detail' } });
  };

  const toggleShelf = async () => {
    if (!user) {
      navigate('/login');
      return;
    }
    try {
      if (inShelf) {
        await api.removeShelf(comic._id);
        setInShelf(false);
        setShelfStatus(null);
        toast.success('已移出书架');
      } else {
        await api.addShelf(comic._id, 'following');
        setInShelf(true);
        setShelfStatus('following');
        toast.success('已加入书架，开始追更');
      }
    } catch (e) {
      toast.error((e as Error).message || '操作失败');
    }
  };

  const deleteComic = async () => {
    if (!user) {
      navigate('/login');
      return;
    }
    setDeleting(true);
    try {
      await api.deleteComic(comic._id);
      toast.success('已删除该漫画');
      setConfirmDelete(false);
      goBack();
    } catch (e) {
      toast.error((e as Error).message || '删除失败');
      setDeleting(false);
    }
  };

  const postComment = async (asReply = false) => {
    if (!user) {
      navigate('/login');
      return;
    }
    const text = (asReply ? replyDraft : draft).trim();
    if (!text) return;
    if (posting) return; // 防连点：发布中忽略重复点击
    setPosting(true);
    try {
      await api.addComment(
        comic._id,
        text,
        9,
        asReply && replyingTo ? { parent: replyingTo.parent, replyToName: replyingTo.name } : {},
      );
      if (asReply) {
        setReplyDraft('');
        setReplyingTo(null);
      } else {
        setDraft('');
      }
      const r = await api.comments(comic._id);
      setComments(r.items);
      setCommentCount((c) => c + 1);
      toast.success(asReply ? '回复成功' : '评论已发布');
    } catch (e) {
      toast.error((e as Error).message || (asReply ? '回复失败' : '评论失败'));
    } finally {
      setPosting(false);
    }
  };

  const handleLike = async (c: CommentItem) => {
    if (!user) {
      navigate('/login');
      return;
    }
    if (likingId === c._id) return; // 防连点：同一条点赞请求未结束前忽略
    setLikingId(c._id);
    try {
      const r = await api.likeComment(c._id);
      setComments((list) =>
        list.map((x) => (x._id === c._id ? { ...x, likes: r.likes, liked: r.liked } : x)),
      );
    } catch {
      /* 忽略 */
    } finally {
      setLikingId('');
    }
  };

  const isAdmin = user?.role === 'admin';
  const canDeleteComment = (c: CommentItem) => isAdmin || (!!user && c.user === user.id);
  const askDeleteComment = (c: CommentItem) => setConfirmDel(c);
  const doDeleteComment = async () => {
    const c = confirmDel;
    if (!c) return;
    setDelBusy(true);
    try {
      await api.deleteComment(c._id);
      const r = await api.comments(comic._id);
      setComments(r.items);
      setCommentCount((n) => Math.max(0, n - 1));
      toast.success('已删除');
      setConfirmDel(null);
    } catch (e) {
      toast.error((e as Error).message || '删除失败');
    } finally {
      setDelBusy(false);
    }
  };

  const startReply = (c: CommentItem) => {
    if (!user) {
      navigate('/login');
      return;
    }
    setReplyingTo({ id: c._id, parent: c.parent || c._id, name: c.nickname });
  };

  const refreshChapters = async () => {
    setRefreshing(true);
    setRefreshProg(null);
    try {
      await api.refreshChapters(id);
    } catch (e) {
      toast.error((e as Error).message || '刷新失败');
      setRefreshing(false);
      return;
    }
    // 后台刷新，轮询进度
    const timer = window.setInterval(async () => {
      try {
        const st = await api.refreshStatus();
        setRefreshProg(st);
        if (!st.running && st.phase === 'done') {
          window.clearInterval(timer);
          setRefreshing(false);
          if (st.error) toast.error(`刷新失败：${st.error}`);
          else toast.success(st.added > 0 ? `新增 ${st.added} 话，共 ${st.total} 话` : '已是最新，暂无新章节');
          load();
          setRefreshProg(null);
        }
      } catch {
        window.clearInterval(timer);
        setRefreshing(false);
        toast.error('获取刷新进度失败');
      }
    }, 800);
  };

  return (
    <div className="page">
      <div className="crumb">
        <button className="crumb-back" onClick={goBack}>
          ← 返回上一层
        </button>
        <span className="crumb-sep">/</span>
        <button className="crumb-link" onClick={() => navigate('/')}>
          首页
        </button>
        {comic.categories[0] && (
          <>
            <span className="crumb-sep">/</span>
            <button
              className="crumb-link"
              onClick={() => navigate(`/category?category=${encodeURIComponent(comic.categories[0])}`)}
            >
              {comic.categories[0]}
            </button>
          </>
        )}
        <span className="crumb-sep">/</span>
        <span className="crumb-current">{comic.title}</span>
      </div>

      {comic.deleted && (
        <div
          className="panel"
          style={{ marginBottom: 14, borderColor: 'var(--accent)', background: 'var(--accent-soft)', fontSize: 13 }}
        >
          ⚠️ 该漫画已被管理员删除，书源内容已下架；你在书架/历史中的记录仍会显示，可到书架移出。
        </div>
      )}

      <div className="detail-hero">
        <div className="detail-cover">
          <img src={assetUrl(comic.cover)} alt={comic.title} />
        </div>
        <div className="detail-info">
          <h1 className="detail-title">{comic.title}</h1>
          <div className="meta-row">
            <span className="meta-pill">
              作者 <b>{comic.author}</b>
            </span>
            <span className="meta-pill">
              地区 <b>{comic.region}</b>
            </span>
            <span className="meta-pill">
              状态 <b><i className={`status-dot ${statusTone(comic.status)}`} />{comic.status}</b>
            </span>
            <span className="meta-pill">
              评分 <b style={{ color: 'var(--accent-2)' }}>{comic.rating.toFixed(1)}</b>
            </span>
            <span className="meta-pill">
              人气 <b>{formatCount(comic.views)}</b>
            </span>
            <span className="meta-pill">
              章节 <b>{comic.chapterCount} 话</b>
            </span>
            <span className="meta-pill">
              来源 <b>{source}</b>
            </span>
          </div>
          <div className="chip-row" style={{ marginBottom: 12 }}>
            {comic.categories.map((c) => (
              <span key={c} className="tag">
                {c}
              </span>
            ))}
            {comic.tags.map((t) => (
              <span key={t} className="tag">
                #{t}
              </span>
            ))}
          </div>
          <div className={`detail-desc${descOpen ? '' : ' clamped'}`} ref={descRef}>
            {comic.description}
          </div>
          {descOverflow && (
            <button className="desc-toggle" onClick={() => setDescOpen((v) => !v)}>
              {descOpen ? '收起 ▲' : '展开全部 ▼'}
            </button>
          )}
          <div className="detail-actions">
            <button className="btn btn-primary" onClick={startReading}>
              {lastIndex > 0 ? `继续阅读 第${lastIndex}话` : '开始阅读'}
            </button>
            <button className="btn" onClick={toggleShelf}>
              {inShelf ? '移出书架' : '加入书架'}
            </button>
            <div className="spacer" />
            {user?.role === 'admin' && (
              <button className="btn btn-danger" onClick={() => setConfirmDelete(true)} title="删除该漫画（仅管理员）">
                删除
              </button>
            )}
            <button className="btn" onClick={() => setReportOpen(true)} title="举报该漫画">
              举报
            </button>
          </div>
        </div>
      </div>

      <div className="section" style={{ marginTop: 24 }}>
        <div className="section-head">
          <div className="section-title">目录（{chapters.length} 话）</div>
          <div className="row" style={{ gap: 8 }}>
            {user?.role === 'admin' && (
              <button className="chip" onClick={refreshChapters} disabled={refreshing} title={`从「${source}」刷新最新章节（只刷新当前来源，仅管理员）`}>
                {refreshing ? '刷新中…' : '⟳ 刷新章节'}
              </button>
            )}
            <button className={`chip${order === 'asc' ? ' active' : ''}`} onClick={() => setOrder('asc')}>
              正序
            </button>
            <button className={`chip${order === 'desc' ? ' active' : ''}`} onClick={() => setOrder('desc')}>
              倒序
            </button>
          </div>
        </div>
        {refreshing && (
          <div className="muted" style={{ fontSize: 13, margin: '2px 0 12px' }}>
            {refreshProg?.phase === 'saving'
              ? '正在更新目录…'
              : `正在获取章节…${refreshProg?.fetched ? `（已获取 ${refreshProg.fetched} 话）` : ''}`}
          </div>
        )}
        <div className="chapter-grid">
          {visibleChapters.map((c) => {
            const isRead = lastIndex > 0 && c.index < lastIndex; // 已读：早于最近阅读章节
            return (
              <button
                key={c._id}
                className={`chapter-item${c.index === lastIndex ? ' reading' : ''}${isRead ? ' read' : ''}`}
                onClick={() => navigate(`/read/${c._id}`, { state: { from: 'detail' } })}
                title={isRead ? `${c.title}（已读）` : c.title}
              >
                {isRead && <span className="chapter-read">✓</span>}
                <span className="chapter-item-label">{c.title}</span>
              </button>
            );
          })}
        </div>
        {chapters.length > CHAPTER_PREVIEW && (
          <div className="row" style={{ justifyContent: 'center', marginTop: 14 }}>
            <button className="btn" onClick={() => setAllChapters((v) => !v)}>
              {allChapters ? '收起目录' : `展开全部 ${chapters.length} 话`}
            </button>
          </div>
        )}
      </div>

      {related.length > 0 && (
        <div className="section">
          <div className="section-head">
            <div className="section-title">相关推荐</div>
            <span className="muted" style={{ fontSize: 12 }}>
              左右滑动查看更多
            </span>
          </div>
          <div className="hscroll">
            {related.map((c) => (
              <div className="hscroll-item" key={c._id}>
                <ComicCard comic={c} latest={c.latestChapter} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="section">
        <div className="section-head">
          <div className="section-title">评论（{commentCount}）</div>
        </div>
        <div className="panel comment-composer">
          <textarea
            className="input"
            rows={2}
            placeholder={user ? '说点什么吧…' : '登录后即可参与评论'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="row" style={{ marginTop: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" onClick={() => postComment(false)} disabled={posting}>
              {posting ? '发布中…' : '发布评论'}
            </button>
          </div>
        </div>

        {comments.length ? (
          topComments.map((c) => (
            <div className="comment-thread" key={c._id}>
              <CommentNode c={c} onLike={handleLike} onReply={startReply} canDelete={canDeleteComment(c)} onDelete={askDeleteComment} />
              {replyingTo?.id === c._id && (
                <ReplyBox
                  name={replyingTo.name}
                  value={replyDraft}
                  onChange={setReplyDraft}
                  onCancel={() => {
                    setReplyingTo(null);
                    setReplyDraft('');
                  }}
                  onSubmit={() => postComment(true)}
                  busy={posting}
                />
              )}
              {(repliesByParent[c._id] || []).map((r) => (
                <Fragment key={r._id}>
                  <CommentNode c={r} isReply onLike={handleLike} onReply={startReply} canDelete={canDeleteComment(r)} onDelete={askDeleteComment} />
                  {replyingTo?.id === r._id && (
                    <ReplyBox
                      indent
                      name={replyingTo.name}
                      value={replyDraft}
                      onChange={setReplyDraft}
                      onCancel={() => {
                        setReplyingTo(null);
                        setReplyDraft('');
                      }}
                      onSubmit={() => postComment(true)}
                  busy={posting}
                    />
                  )}
                </Fragment>
              ))}
            </div>
          ))
        ) : (
          <Empty text="还没有评论，来做第一个吧" icon="💬" />
        )}
      </div>

      {confirmDelete && (
        <div className="modal-mask" onClick={() => !deleting && setConfirmDelete(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">删除漫画</div>
            <div className="modal-body">
              确定要删除《{comic.title}》吗？将同时删除其全部章节且不可恢复。
            </div>
            <div className="row" style={{ justifyContent: 'flex-end', gap: 8, padding: '0 20px 18px' }}>
              <button className="btn" onClick={() => setConfirmDelete(false)} disabled={deleting}>
                取消
              </button>
              <button className="btn btn-danger" onClick={deleteComic} disabled={deleting}>
                {deleting ? '删除中…' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ReportModal open={reportOpen} context={reportCtx} onClose={() => setReportOpen(false)} />

      {confirmDel && (
        <div className="modal-mask" onClick={() => !delBusy && setConfirmDel(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">删除评论</div>
            <div className="modal-body">
              确定要删除这条评论吗？删除后不可恢复
              {confirmDel.content ? `：「${confirmDel.content.slice(0, 30)}${confirmDel.content.length > 30 ? '…' : ''}」` : ''}
              。
            </div>
            <div className="row" style={{ justifyContent: 'flex-end', gap: 8, padding: '0 20px 18px' }}>
              <button className="btn" onClick={() => setConfirmDel(null)} disabled={delBusy}>
                取消
              </button>
              <button className="btn btn-danger" onClick={doDeleteComment} disabled={delBusy}>
                {delBusy ? '删除中…' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
